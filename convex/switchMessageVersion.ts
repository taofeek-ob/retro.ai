import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

export const switchMessageVersion = mutation({
  args: {
    messageId: v.id("messages"),
    targetVersionIndex: v.number(),
  },
  handler: async (ctx, { messageId, targetVersionIndex }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Message not found.");
    if (message.role !== "assistant") throw new Error("Can only switch versions for assistant messages.");
    
    const chat = await ctx.db.get(message.chatId);
    if (!chat || chat.userId !== userId) throw new Error("Chat not found or unauthorized access to message.");

    if (!message.responseVersions || message.responseVersions.length === 0) {
      throw new Error("Message has no versions to switch to.");
    }

    if (targetVersionIndex < 0 || targetVersionIndex >= message.responseVersions.length) {
      throw new Error("Target version index is out of bounds.");
    }

    const targetVersion = message.responseVersions[targetVersionIndex];
    if (!targetVersion) {
        // Should not happen if index is validated, but as a safeguard.
        throw new Error("Target version data not found.");
    }

    await ctx.db.patch(messageId, {
      currentVersionIndex: targetVersionIndex,
      content: targetVersion.content, // Update top-level content
      // Optionally update top-level attachments if they are meant to mirror the version's attachments
      // attachments: targetVersion.attachments || [], 
      updatedAt: Date.now(),
      isStreaming: false, // Switching version implies streaming is done for that version
    });

    return true;
  },
});
