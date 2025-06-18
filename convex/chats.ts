import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listChats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();

    // Get attachment details for messages
    const messagesWithAttachments = await Promise.all(
      messages.map(async (message) => {
        if (!message.attachments || message.attachments.length === 0) {
          return { ...message, attachmentDetails: [] };
        }

        const attachmentDetails = await Promise.all(
          message.attachments.map(async (storageId) => {
            const attachment = await ctx.db
              .query("attachments")
              .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
              .first();

            if (!attachment) return null;

            const url = await ctx.storage.getUrl(storageId);
            return { ...attachment, url };
          })
        );

        return { ...message, attachmentDetails };
      })
    );

    return { ...chat, messages: messagesWithAttachments };
  },
});

export const createChat = mutation({
  args: {
    title: v.string(),
    model: v.string(),
    provider: v.string(),
    parentChatId: v.optional(v.id("chats")),
    branchPoint: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.db.insert("chats", {
      title: args.title,
      userId,
      model: args.model,
      provider: args.provider,
      parentChatId: args.parentChatId,
      branchPoint: args.branchPoint,
    });
  },
});

export const updateChatTitle = mutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    await ctx.db.patch(args.chatId, { title: args.title });
  },
});

export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    // Delete all messages in the chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", args.chatId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    // Delete the chat
    await ctx.db.delete(args.chatId);
  },
});

export const shareChat = mutation({
  args: {
    chatId: v.id("chats"),
    isPublic: v.boolean(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== userId) {
      throw new Error("Chat not found or unauthorized");
    }

    const shareId = Math.random().toString(36).substring(2, 15);

    await ctx.db.insert("sharedChats", {
      chatId: args.chatId,
      shareId,
      title: chat.title,
      description: args.description,
      isPublic: args.isPublic,
      viewCount: 0,
      createdBy: userId,
    });

    await ctx.db.patch(args.chatId, {
      isShared: true,
      shareId,
    });

    return shareId;
  },
});

export const createBranch = mutation({
  args: {
    parentChatId: v.id("chats"),
    branchPoint: v.number(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const parentChat = await ctx.db.get(args.parentChatId);
    if (!parentChat || parentChat.userId !== userId) {
      throw new Error("Parent chat not found or unauthorized");
    }

    // Create new branch chat
    const branchChatId = await ctx.db.insert("chats", {
      title: args.title,
      userId,
      model: parentChat.model,
      provider: parentChat.provider,
      parentChatId: args.parentChatId,
      branchPoint: args.branchPoint,
    });

    // Copy messages up to branch point
    const parentMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", args.parentChatId))
      .order("asc")
      .collect();

    const messagesToCopy = parentMessages.slice(0, args.branchPoint);

    for (const message of messagesToCopy) {
      const now = Date.now();
      await ctx.db.insert("messages", {
        chatId: branchChatId,
        role: message.role,
        content: message.content, // This will be the content of the current version for assistant messages
        attachments: message.attachments, // This is the top-level attachments, primarily for user messages
        // Handle new versioning fields for assistant messages
        responseVersions: message.role === 'assistant' ? message.responseVersions : undefined,
        currentVersionIndex: message.role === 'assistant' ? message.currentVersionIndex : undefined,
        // Handle legacy metadata
        legacyMetadata: message.legacyMetadata, 
        // Add timestamps
        createdAt: message.createdAt || now, // Use original if available, else new timestamp
        updatedAt: now,
        // Fields like isStreaming, isError, isPinned, etc., are not copied by default
        // unless explicitly needed for branched messages.
      });
    }

    return branchChatId;
  },
});
