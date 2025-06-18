import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  chats: defineTable({
    title: v.string(),
    userId: v.id("users"),
    model: v.string(),
    provider: v.string(),
    isShared: v.optional(v.boolean()),
    shareId: v.optional(v.string()),
    parentChatId: v.optional(v.id("chats")),
    branchPoint: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_share_id", ["shareId"])
    .index("by_parent", ["parentChatId"]),

  messages: defineTable({
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    // For 'user'/'system' roles, this is primary content.
    // For 'assistant' role, this stores content of responseVersions[currentVersionIndex].
    content: v.string(), 
    
    // Primarily for 'user' role messages. Assistant attachments are per-version.
    attachments: v.optional(v.array(v.id("_storage"))), 

    // --- Versioning fields for assistant responses ---
    responseVersions: v.optional(v.array(
      v.object({ 
        content: v.string(),
        timestamp: v.number(), // Generation timestamp for this version
        metadata: v.optional(v.object({
          model: v.optional(v.string()),
          provider: v.optional(v.string()),
          enableWebSearch: v.optional(v.boolean()), // Added for consistency
          tokens: v.optional(v.number()),
          cost: v.optional(v.number()),
          errorDetails: v.optional(v.string()), // If isError is true
        })),
        isError: v.optional(v.boolean()), // Did this version generation fail?
        attachments: v.optional(v.array(v.id("_storage"))), // Attachments for this version
      })
    )),
    currentVersionIndex: v.optional(v.number()), // Index in responseVersions for current view
    // --- End versioning fields ---

    // State for the current/last generation attempt of an assistant message
    isStreaming: v.optional(v.boolean()), 
    streamPosition: v.optional(v.number()),
    isAborted: v.optional(v.boolean()), // Was the current/last generation aborted?

    // Original metadata field, renamed to avoid confusion.
    // For assistant messages, prefer per-version metadata.
    legacyMetadata: v.optional(v.object({ 
      model: v.optional(v.string()),
      provider: v.optional(v.string()),
      tokens: v.optional(v.number()),
      cost: v.optional(v.number()),
    })),
    
    createdAt: v.number(), // Timestamp of initial message creation
    updatedAt: v.number(), // Timestamp of last update (e.g., new version)
  })
    .index("by_chat_and_timestamp", ["chatId", "createdAt"]) // New index for ordered fetching
    .searchIndex("search_content", { // Existing search index
      searchField: "content", // Will search current version's content
      filterFields: ["chatId", "role"],
    }),

  attachments: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    uploadedBy: v.id("users"),
    extractedText: v.optional(v.string()),
  })
    .index("by_storage_id", ["storageId"])
    .index("by_user", ["uploadedBy"]),

  sharedChats: defineTable({
    chatId: v.id("chats"),
    shareId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
    viewCount: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_share_id", ["shareId"])
    .index("by_creator", ["createdBy"])
    .index("by_public", ["isPublic"]),

  userSettings: defineTable({
    userId: v.id("users"),
    // userName: v.string(),
    defaultModel: v.string(),
    defaultProvider: v.string(),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    codeTheme: v.string(),
    enableWebSearch: v.boolean(),
    enableImageGeneration: v.boolean(),
  })
    .index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
