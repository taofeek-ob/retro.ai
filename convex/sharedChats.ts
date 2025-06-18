import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getSharedChat = query({
  args: { shareId: v.string() },
  handler: async (ctx, args) => {
    const sharedChat = await ctx.db
      .query("sharedChats")
      .withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
      .first();

    if (!sharedChat) {
      return null;
    }

    const chat = await ctx.db.get(sharedChat.chatId);
    if (!chat) {
      return null;
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", chat._id))
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

    return {
      ...sharedChat,
      chat: {
        ...chat,
        messages: messagesWithAttachments,
      },
    };
  },
});

export const listPublicChats = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    
    let query = ctx.db
      .query("sharedChats")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .order("desc");

    if (args.cursor) {
      query = query.filter((q) => q.lt(q.field("_creationTime"), parseInt(args.cursor!)));
    }

    const chats = await query.take(limit);
    
    const chatsWithDetails = await Promise.all(
      chats.map(async (sharedChat) => {
        const creator = await ctx.db.get(sharedChat.createdBy);
        return {
          ...sharedChat,
          creatorName: creator?.name || "Anonymous",
        };
      })
    );

    return {
      chats: chatsWithDetails,
      nextCursor: chats.length === limit ? chats[chats.length - 1]._creationTime.toString() : null,
    };
  },
});

export const incrementViewCount = mutation({
  args: { shareId: v.string() },
  handler: async (ctx, args) => {
    const sharedChat = await ctx.db
      .query("sharedChats")
      .withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
      .first();

    if (sharedChat) {
      await ctx.db.patch(sharedChat._id, {
        viewCount: sharedChat.viewCount + 1,
      });
    }
  },
});

export const continueSharedChat = mutation({
  args: {
    shareId: v.string(),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const sharedChat = await ctx.db
      .query("sharedChats")
      .withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
      .first();

    if (!sharedChat) {
      throw new Error("Shared chat not found");
    }

    const originalChat = await ctx.db.get(sharedChat.chatId);
    if (!originalChat) {
      throw new Error("Original chat not found");
    }

    // Create a new chat for the user
    const newChatId = await ctx.db.insert("chats", {
      title: originalChat.title,
      userId,
      model: originalChat.model,
      provider: originalChat.provider,
    });

    // Copy all messages from the original chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", originalChat._id))
      .order("asc")
      .collect();

    for (const message of messages) {
      const now = Date.now();
      await ctx.db.insert("messages", {
        chatId: newChatId,
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
      });
    }

    // Add a system message indicating this is a continued chat
    const now = Date.now();
    await ctx.db.insert("messages", {
      chatId: newChatId,
      role: "system",
      content: "This chat was continued from a shared conversation.",
      createdAt: now,
      updatedAt: now,
    });

    return newChatId;
  },
});
