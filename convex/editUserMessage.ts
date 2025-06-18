import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server"; // Changed import path
import { Doc } from "./_generated/dataModel";

export const editUserMessageAndRegenerate = mutation({
  args: {
    messageId: v.id("messages"),
    newContent: v.string(),
    chatId: v.id("chats"),
    // We'll need model, provider, and enableWebSearch for the new AI response
    model: v.string(),
    provider: v.string(),
    enableWebSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, { messageId, newContent, chatId, model, provider, enableWebSearch }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated.");
    }

    // 1. Get the message to be edited and its chat
    const messageToEdit = await ctx.db.get(messageId);
    if (!messageToEdit) {
      throw new Error("Message not found.");
    }
    const chat = await ctx.db.get(chatId);
    if (!chat) {
      throw new Error("Chat not found.");
    }

    // 2. Verify user owns the chat and the message is a user message
    if (chat.userId !== userId || messageToEdit.role !== "user") {
      throw new Error("Permission denied or message is not a user message.");
    }

    // 3. Update the user message content and timestamp
    await ctx.db.patch(messageId, {
      content: newContent,
      updatedAt: Date.now(),
      // Reset any versioning specific to assistant responses if it was somehow on a user message
      responseVersions: undefined,
      currentVersionIndex: undefined,
      legacyMetadata: undefined, // Clear legacy metadata as it might be stale
    });

    // 4. Get all messages in the chat created after the edited message
    const subsequentMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", chatId).gt("createdAt", messageToEdit.createdAt))
      .collect();

    // 5. Delete these subsequent messages
    for (const msg of subsequentMessages) {
      await ctx.db.delete(msg._id);
    }

    // 6. Create a new placeholder assistant message
    const newAssistantMessageId = await ctx.db.insert("messages", {
      chatId,
      role: "assistant",
      content: "", // Placeholder, will be filled by streaming
      isStreaming: true, // Changed from isLoading and aligned with schema
      responseVersions: [{ content: "", timestamp: Date.now(), metadata: { model, provider, enableWebSearch } }],
      currentVersionIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 7. Prepare message history for the AI up to the edited message
    // Ensure messageToEdit has its 'createdAt' field correctly populated for this query
    const messagesForAIQuery = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", chatId).lte("createdAt", messageToEdit.createdAt))
      .order("asc")
      .collect();
    
    const historyForAI = messagesForAIQuery.map((msg: Doc<"messages">) => ({
      role: msg.role,
      content: msg.role === "user" && msg._id === messageId ? newContent : msg.content,
    }));

    // 8. Schedule the AI to generate a new response for the placeholder
    await ctx.scheduler.runAfter(0, internal.ai.internalStreamChat, {
      messages: historyForAI,
      messageId: newAssistantMessageId,
      model,
      // provider is not an argument for internalStreamChat
      enableWebSearch,
      targetVersionIndex: 0, // Streaming into the first (and only) version of the new assistant message
      userId, // Pass authenticated userId
    });

    return { newAssistantMessageId };
  },
});
