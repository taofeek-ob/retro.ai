"use node";

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.CONVEX_OPENAI_BASE_URL,
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

export const chatCompletion = action({
  args: {
    messages: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      content: v.string(),
    })),
    model: v.string(),
    provider: v.string(),
    stream: v.optional(v.boolean()),
    enableWebSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    // const userId = await getAuthUserId(ctx);
    // userId will be null for anonymous users
    console.log("User ID:", userId ?? "anonymous");
    let messages = args.messages;

    // Add web search if enabled
    if (args.enableWebSearch && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        try {
          const searchResults = await webSearch(lastMessage.content);
          if (searchResults) {
            messages = [
              ...messages.slice(0, -1),
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

    try {
      const response = await openai.chat.completions.create({
        model: args.model === "gpt-4.1-nano" ? "gpt-4.1-nano" : "gpt-4o-mini",
        messages,
        stream: args.stream,
        temperature: 0.7,
        max_tokens: 4000,
      });
console.log("args.stream", args.stream)
      if (args.stream) {
        // Handle streaming response
        const chunks = [];
        for await (const chunk of response as any) {
          if (chunk.choices[0]?.delta?.content) {
            chunks.push(chunk.choices[0].delta.content);
          }
        }
        return {
          content: chunks.join(""),
          usage: null,
        };
      } else {
        const chatResponse = response as any;
        return {
          content: chatResponse.choices[0].message.content,
          usage: chatResponse.usage,
        };
      }
    } catch (error) {
      console.error("AI completion error:", error);
      throw new Error("Failed to generate AI response");
    }
  },
});

export const generateImage = action({
  args: {
    prompt: v.string(),
    size: v.optional(v.string()),
    quality: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // const userId = await getAuthUserId(ctx);
    // if (!userId) throw new Error("Not authenticated");
    const userId = await getAuthUserId(ctx);
    // userId will be null for anonymous users
    console.log("User ID:", userId ?? "anonymous");
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
      // For now, we'll just mark it as processed
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
  // In a real implementation, you would integrate with a search API like Serper, Bing, or Google
  // For demo purposes, we'll return a mock result
  return `Mock search results for "${query}":
1. Relevant information about ${query}
2. Additional context and details
3. Related topics and insights`;
}
