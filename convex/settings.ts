import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUserSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return settings || {
      defaultModel: "gpt-4.1-nano",
      defaultProvider: "openai",
      theme: "system",
      codeTheme: "github-dark",
      enableWebSearch: true,
      enableImageGeneration: true,
    };
  },
});

export const updateUserSettings = mutation({
  args: {
    defaultModel: v.optional(v.string()),
    defaultProvider: v.optional(v.string()),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
    codeTheme: v.optional(v.string()),
    enableWebSearch: v.optional(v.boolean()),
    enableImageGeneration: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existingSettings) {
      await ctx.db.patch(existingSettings._id, args);
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        defaultModel: args.defaultModel || "gpt-4.1-nano",
        defaultProvider: args.defaultProvider || "openai",
        theme: args.theme || "system",
        codeTheme: args.codeTheme || "github-dark",
        enableWebSearch: args.enableWebSearch ?? true,
        enableImageGeneration: args.enableImageGeneration ?? true,
      });
    }
  },
});
