import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalAction, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import OpenAI from "openai";

// --- ADD THESE NEW FUNCTIONS FOR DATABASE-MEDIATED STREAMING ---

/**
 * Creates an empty message placeholder for the assistant's response.
 * This is called by the client immediately after sending a user message.
 * It returns the ID of the new message, which is then passed to the
 * streaming AI action.
 */
export const createEmptyAssistantMessage = mutation({
  args: {
    chatId: v.id("chats"),
    // Model info for the first version of the assistant's response
    metadata: v.object({
      model: v.string(),
      provider: v.string(),
      // Add other relevant initial metadata fields if needed, e.g., tokens, cost (likely 0 initially)
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      chatId: args.chatId,
      role: "assistant",
      content: "", // Mirrors current version's content, starts empty
      // attachments: undefined, // Top-level attachments not used for assistant messages with versions
      responseVersions: [{
        content: "",
        timestamp: now,
        metadata: args.metadata, // Metadata for this specific version
        isError: false,
        attachments: [], // Attachments for this specific version
      }],
      currentVersionIndex: 0,
      isStreaming: true, // Mark as streaming initially
      // isAborted: false, // Default
      // streamPosition: 0, // Default
      // legacyMetadata: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return messageId;
  },
});

/**
 * Appends a content chunk to an assistant's message.
 * This is only callable from other backend functions (internal) and is
 * used by the streaming AI action to update the message in real-time.
 */
export const updateAssistantMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    contentChunk: v.string(),
    targetVersionIndex: v.optional(v.number()), // Optional: specify which version index to update
    initialVersionMetadata: v.optional(v.object({ // Used when appending a new version (e.g. first chunk of a retry)
      model: v.string(),
      provider: v.string(),
    })),
    // Optionally, pass metadata updates if they change during streaming (e.g., final token count)
    // finalVersionMetadata: v.optional(v.object({ tokens: v.optional(v.number()), cost: v.optional(v.number()) })),
    // isStreamEnding: v.optional(v.boolean()) // Flag to mark stream end and finalize version
  },
  handler: async (ctx, { messageId, contentChunk, targetVersionIndex, initialVersionMetadata /*, finalVersionMetadata, isStreamEnding */ }) => {
    const message = await ctx.db.get(messageId);
    if (!message) {
      console.warn(`Message ${messageId} not found, skipping update.`);
      return;
    }

    if (message.role !== "assistant" || !message.responseVersions || typeof message.currentVersionIndex !== 'number') {
      console.warn(`Message ${messageId} is not a valid versioned assistant message, skipping update.`);
      if (message.role === "assistant") {
         await ctx.db.patch(messageId, { content: (message.content || "") + contentChunk, updatedAt: Date.now() });
      }
      return;
    }

    const versionIdxToUpdate = typeof targetVersionIndex === 'number'
      ? targetVersionIndex
      : message.currentVersionIndex;

    let newContent = "";
    let updatedResponseVersions = [...message.responseVersions]; // Clone for modification
    let newCurrentVersionIndex = message.currentVersionIndex;

    if (versionIdxToUpdate < 0) {
      console.warn(`Invalid negative versionIndexToUpdate (${versionIdxToUpdate}) for message ${messageId}. Skipping update.`);
      return;
    }

    if (versionIdxToUpdate === updatedResponseVersions.length) {
      // This is an append operation for a new version (e.g., retry)
      // The initial contentChunk is the first part of the new version.
      newContent = contentChunk;
      const newVersion = {
        content: newContent,
        timestamp: Date.now(),
        // TODO: Determine how to get metadata for a new version. 
        // Use initialVersionMetadata if provided (for new versions), otherwise fallback.
        metadata: initialVersionMetadata 
          ? { model: initialVersionMetadata.model, provider: initialVersionMetadata.provider } 
          : updatedResponseVersions[updatedResponseVersions.length -1]?.metadata || { model: "unknown", provider: "unknown" },
        isError: false,
        attachments: [], // New versions start with no attachments
      };
      updatedResponseVersions.push(newVersion);
      newCurrentVersionIndex = updatedResponseVersions.length - 1; // Update current index to the new version
    } else if (versionIdxToUpdate < updatedResponseVersions.length) {
      // This is an update to an existing version's content
      const versionToUpdate = updatedResponseVersions[versionIdxToUpdate];
      if (!versionToUpdate) {
        console.warn(`Target version at index ${versionIdxToUpdate} not found for message ${messageId}, skipping update.`);
        return;
      }
      newContent = versionToUpdate.content + contentChunk;
      versionToUpdate.content = newContent;
      // versionToUpdate.timestamp = Date.now(); // Optionally update version timestamp on each chunk
      newCurrentVersionIndex = versionIdxToUpdate; // Ensure current index reflects the version being updated if it changed
    } else {
      // Index is out of bounds (too high)
      console.warn(`Invalid versionIndexToUpdate (${versionIdxToUpdate}) for message ${messageId}. Max allowed index for append: ${updatedResponseVersions.length}, for update: ${updatedResponseVersions.length -1}. Skipping update.`);
      return;
    }

    // if (isStreamEnding && finalVersionMetadata && updatedResponseVersions[newCurrentVersionIndex]) { 
    //   updatedResponseVersions[newCurrentVersionIndex].metadata = { 
    //     ...updatedResponseVersions[newCurrentVersionIndex].metadata, 
    //     ...finalVersionMetadata 
    //   };
    // }

    await ctx.db.patch(messageId, {
      content: newContent, // Update top-level content to mirror current version being streamed/updated
      responseVersions: updatedResponseVersions, // Persist updated versions array
      currentVersionIndex: newCurrentVersionIndex, // Update the current version index
      // isStreaming: !isStreamEnding, // Update streaming status if flag is used
      updatedAt: Date.now(),
    });
  },
});

// --- YOUR EXISTING CODE (UNCHANGED) ---

const openai = new OpenAI({
  // baseURL: process.env.CONVEX_OPENAI_BASE_URL,
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

export const addMessage = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    attachments: v.optional(v.array(v.id("_storage"))), // Used for user messages, or initial for assistant (versioned)
    metadata: v.optional(v.object({ // For user/system: legacy. For assistant: version[0] metadata.
      model: v.optional(v.string()),
      provider: v.optional(v.string()),
      tokens: v.optional(v.number()),
      cost: v.optional(v.number()),
      errorDetails: v.optional(v.string()), // For potential errors in non-streamed assistant messages
    })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    const now = Date.now();
    let messageData: any = {
      chatId: args.chatId,
      role: args.role,
      content: args.content,
      createdAt: now,
      updatedAt: now,
    };

    if (args.role === "assistant") {
      messageData.responseVersions = [{
        content: args.content,
        timestamp: now,
        metadata: args.metadata, // This is the metadata for the first version
        isError: !!args.metadata?.errorDetails, // Set error flag if errorDetails present
        attachments: args.attachments || [],
      }];
      messageData.currentVersionIndex = 0;
      // For assistant messages, top-level attachments and legacyMetadata are not primary
      messageData.attachments = undefined; 
      messageData.legacyMetadata = undefined;
    } else {
      // For user or system messages
      messageData.attachments = args.attachments;
      messageData.legacyMetadata = args.metadata;
      // responseVersions and currentVersionIndex remain undefined
    }

    const messageId = await ctx.db.insert("messages", messageData);
    return messageId;
  },
});

export const updateMessage = mutation({
  // ... your existing code ...
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    isStreaming: v.optional(v.boolean()),
    streamPosition: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const chat = await ctx.db.get(message.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.messageId, {
      content: args.content,
      isStreaming: args.isStreaming,
      streamPosition: args.streamPosition,
    });
  },
});

export const generateUploadUrl = mutation({
  // ... your existing code ...
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveAttachment = mutation({
  // ... your existing code ...
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const attachmentId = await ctx.db.insert("attachments", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      uploadedBy: userId,
    });

    // If it's a PDF, extract text
    if (args.fileType === "application/pdf") {
      await ctx.scheduler.runAfter(0, internal.ai.extractPdfText, {
        attachmentId,
        storageId: args.storageId,
      });
    }

    return attachmentId;
  },
});

export const updateAttachmentText = internalMutation({
  // ... your existing code ...
  args: {
    attachmentId: v.id("attachments"),
    extractedText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.attachmentId, {
      extractedText: args.extractedText,
    });
  },
});

// Internal query to fetch a message by its ID
export const getMessageById = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }: { messageId: Id<"messages"> }) => {
    return await ctx.db.get(messageId);
  },
});

export const searchMessages = query({
  // ... your existing code ...
  args: {
    query: v.string(),
    chatId: v.optional(v.id("chats")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let searchQuery = ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) => q.search("content", args.query));

    if (args.chatId) {
      searchQuery = searchQuery.filter((q) => q.eq(q.field("chatId"), args.chatId));
    }

    const results = await searchQuery.take(20);

    // Filter to only messages from user's chats
    const filteredResults = [];
    for (const message of results) {
      const chat = await ctx.db.get(message.chatId);
      if (chat && chat.userId === userId) {
        filteredResults.push({
          ...message,
          chatTitle: chat.title,
        });
      }
    }

    return filteredResults;
  },
});

export const getMessageCount = query({
  // ... your existing code ...
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", args.chatId))
      .collect();

    return messages.length;
  },
});

export const generateChatTitle = internalAction({
  // ... your existing code ...
  args: {
    chatId: v.id("chats"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [
          {
            role: "system",
            content: "Generate a short, descriptive title (max 6 words) for a chat that starts with this message. Return only the title, no quotes or extra text."
          },
          {
            role: "user",
            content: args.content
          }
        ],
        temperature: 0.7,
        max_tokens: 50,
      });
      console.log("response", response);
      const title = response.choices[0]?.message?.content?.trim() || "New Chat";
      await ctx.runMutation(internal.messages.updateChatTitle, {
        chatId: args.chatId,
        title,
      });
    } catch (error) {
      console.error("Failed to generate title:", error);
      // Fallback to a simple title if AI generation fails
      const title = args.content.length > 50 
        ? args.content.substring(0, 47) + "..."
        : args.content;
      await ctx.runMutation(internal.messages.updateChatTitle, {
        chatId: args.chatId,
        title,
      });
    }
    return null;
  },
});

export const updateChatTitle = internalMutation({
  // ... your existing code ...
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chatId, { title: args.title });
  },
});

export const addMessageAndUpdateTitle = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    attachments: v.optional(v.array(v.id("_storage"))),
    metadata: v.optional(v.object({
      model: v.optional(v.string()),
      provider: v.optional(v.string()),
      tokens: v.optional(v.number()),
      cost: v.optional(v.number()),
      errorDetails: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    // Check if this is the first message (using the new index)
    const existingMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", args.chatId))
      .order("asc") // Ensure we check for any message
      .first(); // Efficiently check if any message exists

    const now = Date.now();
    let messageData: any = {
      chatId: args.chatId,
      role: args.role,
      content: args.content,
      createdAt: now,
      updatedAt: now,
    };

    if (args.role === "assistant") {
      messageData.responseVersions = [{
        content: args.content,
        timestamp: now,
        metadata: args.metadata,
        isError: !!args.metadata?.errorDetails,
        attachments: args.attachments || [],
      }];
      messageData.currentVersionIndex = 0;
      messageData.attachments = undefined;
      messageData.legacyMetadata = undefined;
    } else {
      messageData.attachments = args.attachments;
      messageData.legacyMetadata = args.metadata;
    }

    const messageId = await ctx.db.insert("messages", messageData);

    // If this is the first message and it's a user message, schedule the title update
    if (!existingMessages && args.role === "user") {
      await ctx.scheduler.runAfter(0, internal.messages.generateChatTitle, {
        chatId: args.chatId,
        content: args.content,
      });
    }

    return messageId;
  },
});

export const isMessageAborted = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return false;

    // Check if the message has been marked as aborted
    return message.isAborted || false;
  },
});

export const markMessageAborted = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const chat = await ctx.db.get(message.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.messageId, {
      isAborted: true,
    });
  },
});