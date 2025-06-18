/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as editUserMessage from "../editUserMessage.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as retryAssistantMessage from "../retryAssistantMessage.js";
import type * as router from "../router.js";
import type * as settings from "../settings.js";
import type * as sharedChats from "../sharedChats.js";
import type * as switchMessageVersion from "../switchMessageVersion.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  auth: typeof auth;
  chats: typeof chats;
  editUserMessage: typeof editUserMessage;
  http: typeof http;
  messages: typeof messages;
  retryAssistantMessage: typeof retryAssistantMessage;
  router: typeof router;
  settings: typeof settings;
  sharedChats: typeof sharedChats;
  switchMessageVersion: typeof switchMessageVersion;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
