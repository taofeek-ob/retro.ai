// convex/ai.ts

"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import OpenAI from "openai";
import { Id } from "./_generated/dataModel";

const openai = new OpenAI({
  // baseURL: process.env.CONVEX_OPENAI_BASE_URL,
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

// --- NEW: The core function for persistent, database-mediated streaming ---
/**
 * This action handles the streaming of AI responses.
 * It is called by the client, which first creates an empty "assistant" message.
 * This action then streams the response from OpenAI, updating the message
 * record in the database chunk by chunk.
 */
export const internalStreamChat = internalAction({
  args: {
    messages: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      content: v.string(),
    })),
    messageId: v.id("messages"), // The ID of the empty assistant message to update
    model: v.string(),
    enableWebSearch: v.optional(v.boolean()),
    targetVersionIndex: v.optional(v.number()), // Optional: specify which version index to update
    userId: v.string(), // Added: The ID of the user initiating the stream
  },
  handler: async (ctx, { messages, messageId, model, enableWebSearch, targetVersionIndex, userId }) => {
    // Authentication is now handled by the calling action or mutation
    let processedMessages = messages;

    // Add web search if enabled (logic remains the same)
    if (enableWebSearch && processedMessages.length > 0) {
      const lastMessage = processedMessages[processedMessages.length - 1];
      if (lastMessage.role === "user") {
        try {
          const searchResults = await webSearch(lastMessage.content);
          if (searchResults) {
            processedMessages = [
              ...processedMessages.slice(0, -1),
              {
                role: "system" as const,
                content: `Web search results for "${lastMessage.content}":\n${searchResults}`,
              },
              lastMessage,
            ];
          }
        } catch (error) {
          console.error("Web search failed:", error);
        }
      }
    }

    // Batch configuration - tune these values based on performance testing
    const BATCH_INTERVAL_MS = 50; // Update every 50ms
    const MIN_CHUNK_SIZE = 50;    // Minimum characters to trigger an update
    let buffer = '';
    let lastUpdateTime = Date.now();
    let pendingUpdate: Promise<void> | null = null;

    // Helper function to flush the buffer to the database
    const flushBuffer = async (final = false) => {
      if (buffer.length === 0) return;

      const chunkToSend = buffer;
      buffer = '';

      try {
        // Wait for any pending update to complete before starting a new one
        if (pendingUpdate) {
          await pendingUpdate;
        }

        
        // Start the update and store the promise
        const updatePromise = ctx.runMutation(internal.messages.updateAssistantMessage, {
          messageId,
          contentChunk: chunkToSend,
          targetVersionIndex,
          initialVersionMetadata: { model, provider: "openai" }
        }).then(() => {
          // Convert the Promise<null> to Promise<void> by not returning anything
        }).catch(error => {
          console.error("Error in update mutation:", error);
          throw error; // Re-throw to maintain error handling
        });
        
        pendingUpdate = updatePromise;
        await updatePromise;
      } catch (error) {
        console.error("Error updating message:", error);
      } finally {
        lastUpdateTime = Date.now();
        if (!final) {
          pendingUpdate = null;
        }
      }
    };

    let abortCheckCounter = 0;
    const ABORT_CHECK_INTERVAL = 5; // Check abort every N chunks

    try {
      // 1. Get the stream from OpenAI
      const stream = await openai.chat.completions.create({
        model: model === "gpt-4.1-nano" ? "gpt-4.1-nano" : "gpt-4o-mini",
        messages: processedMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4000,
      });

      // 2. Process the stream with batching
      for await (const chunk of stream) {
        // Check if the operation was aborted (but not on every chunk to reduce DB load)
        if (++abortCheckCounter % ABORT_CHECK_INTERVAL === 0) {
          const isAborted = await ctx.runQuery(api.messages.isMessageAborted, { messageId });
          if (isAborted) {
            await flushBuffer(true);
            throw new Error("Message generation was aborted");
          }
        }

        const contentChunk = chunk.choices[0]?.delta?.content;
        if (contentChunk) {
          buffer += contentChunk;

          const timeSinceLastUpdate = Date.now() - lastUpdateTime;
          const shouldFlush = buffer.length >= MIN_CHUNK_SIZE || timeSinceLastUpdate >= BATCH_INTERVAL_MS;

          if (shouldFlush) {
            await flushBuffer();
          }
        }
      }


      // 3. Flush any remaining content in the buffer
      if (buffer.length > 0) {
        await flushBuffer(true);
      }
    } catch (error: any) {
      console.error("Streaming chat error:", error);
      // If an error occurs, update the message to reflect it
      if (error.message === "Message generation was aborted") {
        await ctx.runMutation(internal.messages.updateAssistantMessage, {
          messageId,
          contentChunk: "\n\n[Response stopped by user]",
          targetVersionIndex,
          initialVersionMetadata: { model: model, provider: "openai" } // Pass metadata
        });
      } else {
        await ctx.runMutation(internal.messages.updateAssistantMessage, {
          messageId,
          contentChunk: "\n\nI'm sorry, I ran into an error. Please try again.",
          targetVersionIndex,
          initialVersionMetadata: { model: model, provider: "openai" } // Pass metadata
        });
      }
    }
  }
});





// New public action for retrying and streaming a new version of an assistant message
export const streamRetry = action({
  args: {
    originalMessageId: v.id("messages"),
    chatId: v.id("chats"), // For context, though not directly used if internalStreamChat doesn't need it beyond messageId
    model: v.string(),
    enableWebSearch: v.optional(v.boolean()),
    messagesForRetryContext: v.array(v.object({ // History for context
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      content: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx); 
    if (!userId) throw new Error("Not authenticated for streamRetry");

    // 1. Fetch the original message to determine the next version index
    const originalMessage = await ctx.runQuery(internal.messages.getMessageById, { 
      messageId: args.originalMessageId 
    });
    if (!originalMessage) {
      throw new Error("Original message not found for retry.");
    }
    if (originalMessage.role !== 'assistant') {
      throw new Error("Cannot retry a non-assistant message.");
    }

    const targetVersionIndex = originalMessage.responseVersions?.length || 0;

    // 2. Call the internalStreamChat action
    await ctx.runAction(internal.ai.internalStreamChat, {
      messages: args.messagesForRetryContext, 
      messageId: args.originalMessageId,      
      model: args.model,
      enableWebSearch: args.enableWebSearch,
      targetVersionIndex: targetVersionIndex, 
      userId,
    });
  },
});


// New public action that wraps internalStreamChat with authentication
export const streamChat = action({
  args: {
    messages: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      content: v.string(),
    })),
    messageId: v.id("messages"),
    model: v.string(),
    enableWebSearch: v.optional(v.boolean()),
    targetVersionIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Call the internal action, passing the authenticated userId
    await ctx.runAction(internal.ai.internalStreamChat, { ...args, userId });
  },
});

// --- REFACTORED: For non-streaming, single-response use cases ---
/**
 * A standard action for one-shot AI completions.
 * Useful for tasks like generating a chat title where a single, complete
 * response is needed without streaming.
 */
export const chatCompletion = action({
  args: {
    messages: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      content: v.string(),
    })),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    try {
      const response = await openai.chat.completions.create({
        model: args.model === "gpt-4.1-nano" ? "gpt-4.1-nano" : "gpt-4o-mini",
        messages: args.messages,
        stream: false, // Explicitly non-streaming
      });
      
      return {
        content: response.choices[0].message.content,
        usage: response.usage,
      };
    } catch (error) {
      console.error("AI completion error:", error);
      throw new Error("Failed to generate AI response");
    }
  },
});

// --- UNCHANGED: These functions are fine as they are ---

export const generateImage = action({
  args: {
    prompt: v.string(),
    size: v.optional(v.string()),
    quality: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    try {
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: args.prompt,
        size: (args.size as any) || "1024x1024",
        quality: (args.quality as any) || "standard",
        n: 1,
      });

      return {
        url: response.data?.[0]?.url || "",
        revisedPrompt: response.data?.[0]?.revised_prompt || "",
      };
    } catch (error) {
      console.error("Image generation error:", error);
      throw new Error("Failed to generate image");
    }
  },
});

export const extractPdfText = internalAction({
  args: {
    attachmentId: v.id("attachments"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    try {
      // In a real implementation, you would use a PDF parsing library
      await ctx.runMutation(internal.messages.updateAttachmentText, {
        attachmentId: args.attachmentId,
        extractedText: "PDF text extraction not implemented in demo",
      });
    } catch (error) {
      console.error("PDF extraction error:", error);
    }
  },
});

async function webSearch(query: string): Promise<string | null> {
  // Demo mock search
  return `Mock search results for "${query}":
1. Relevant information about ${query}
2. Additional context and details
3. Related topics and insights`;
}

