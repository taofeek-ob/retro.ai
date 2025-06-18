import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const retryAssistantMessage = mutation({
  args: {
    originalMessageId: v.id("messages"),
    chatId: v.id("chats"),
    model: v.string(), // Model to use for the retry
    provider: v.string(), // Provider for the model
    enableWebSearch: v.optional(v.boolean()),
  },
  handler: async (ctx, { originalMessageId, chatId, model, provider, enableWebSearch }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const originalMessage = await ctx.db.get(originalMessageId);
    if (!originalMessage) throw new Error("Original message not found.");
    if (originalMessage.role !== "assistant") throw new Error("Can only retry assistant messages.");
    if (originalMessage.chatId !== chatId) throw new Error("Chat ID mismatch.");

    const chat = await ctx.db.get(chatId);
    if (!chat || chat.userId !== userId) throw new Error("Chat not found or unauthorized.");

    // 1. Fetch all messages for the chat to reconstruct history
    const allMessagesInChat = await ctx.db
      .query("messages")
      .withIndex("by_chat_and_timestamp", (q) => q.eq("chatId", chatId))
      .order("asc")
      .collect();

    // 2. Reconstruct history up to the message *before* the original assistant message
    const historyForAI: { role: "user" | "assistant" | "system"; content: string }[] = [];
    for (const msg of allMessagesInChat) {
      if (msg._id === originalMessageId) {
        break; // Stop before including the message we are retrying
      }
      if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") {
        // For assistant messages, use the content of their current version
        let contentToUse = msg.content;
        if (msg.role === "assistant" && msg.responseVersions && typeof msg.currentVersionIndex === 'number') {
          const currentVersion = msg.responseVersions[msg.currentVersionIndex];
          if (currentVersion) {
            contentToUse = currentVersion.content;
          }
        }
        historyForAI.push({ role: msg.role, content: contentToUse });
      }
    }

    if (historyForAI.length === 0 || historyForAI[historyForAI.length -1].role !== 'user'){
        // This can happen if the first message was an assistant message or history is malformed.
        // Or if the message being retried is the very first assistant message after a system prompt.
        // For simplicity, we'll prevent retry if the preceding message isn't a user message.
        // A more robust solution might involve looking further back or handling system prompts.
        console.warn("Cannot retry: No valid user prompt found before the assistant message.", { originalMessageId, historyForAI });
        throw new Error("Cannot retry: No valid user prompt found immediately before this assistant message.");
    }

    // 3. Prepare the new version object
    const now = Date.now();
    const newVersion = {
      content: "", // Will be filled by streamChat
      timestamp: now,
      metadata: { model, provider, tokens: 0, cost: 0 }, // Initial metadata
      isError: false,
      attachments: [],
    };

    // 4. Update the original message with the new version
    const updatedResponseVersions = [...(originalMessage.responseVersions || []), newVersion];
    const newVersionIndex = updatedResponseVersions.length - 1;

    await ctx.db.patch(originalMessageId, {
      responseVersions: updatedResponseVersions,
      currentVersionIndex: newVersionIndex,
      content: "", // Reset top-level content, will be updated by stream
      isStreaming: true,
      isAborted: false, // Reset aborted state for the new attempt
      updatedAt: now,
    });

    // 5. Trigger the AI stream action
    // Note: streamChat expects `messageId` of the message it will be updating.
    // It will update the `currentVersionIndex` we just set.
    await ctx.scheduler.runAfter(0, internal.ai.internalStreamChat, {
      messages: historyForAI,
      messageId: originalMessageId, // streamChat will update this message's new current version
      model,
      enableWebSearch,
      targetVersionIndex: newVersionIndex, // Explicitly pass the new version index
      userId, // Pass the authenticated userId
    });

    return originalMessageId;
  },
});
