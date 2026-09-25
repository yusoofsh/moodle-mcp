import { z } from "zod";
import type { ReadOperation } from "./safe-api.js";
import { idSchema } from "./result.js";
const page = {
  offset: z.number().int().min(0).max(100000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
};
const get = (a: Record<string, unknown>, key: string, fallback: number) =>
  typeof a[key] === "number" ? (a[key] as number) : fallback;
const conversation = z.object({ conversationId: idSchema, ...page }).strict();
export const ACCOUNT_READS: Record<string, ReadOperation> = {
  core_message_get_conversation: {
    input: conversation,
    scope: "self",
    purpose:
      "Read one existing conversation of the current student, without creating it or updating read receipts",
    params: (c, a) => ({
      userid: c.userId,
      conversationid: a.conversationId as number,
      includecontactrequests: false,
      includeprivacyinfo: false,
      memberlimit: 20,
      memberoffset: 0,
      messagelimit: get(a, "limit", 20),
      messageoffset: get(a, "offset", 0),
      newestmessagesfirst: true,
    }),
  },
  core_message_get_conversation_members: {
    input: conversation,
    scope: "self",
    purpose:
      "Read a bounded member list only for a conversation where Moodle authorizes the current student",
    params: (c, a) => ({
      userid: c.userId,
      conversationid: a.conversationId as number,
      includecontactrequests: false,
      includeprivacyinfo: false,
      limitfrom: get(a, "offset", 0),
      limitnum: get(a, "limit", 20),
    }),
  },
  core_message_get_messages: {
    input: z
      .object({
        ...page,
        type: z.enum(["notifications", "conversations", "both"]).optional(),
        read: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
      })
      .strict(),
    scope: "self",
    purpose:
      "Read current student incoming messages/notifications; the read flag is a filter, never a mark-read action",
    params: (c, a) => ({
      useridto: c.userId,
      useridfrom: 0,
      type: typeof a.type === "string" ? a.type : "both",
      read: get(a, "read", 2),
      newestfirst: true,
      limitfrom: get(a, "offset", 0),
      limitnum: get(a, "limit", 20),
    }),
  },
  core_message_data_for_messagearea_search_messages: {
    input: z
      .object({ ...page, query: z.string().trim().min(2).max(200) })
      .strict(),
    scope: "self",
    purpose: "Search the current student’s message history without changing it",
    params: (c, a) => ({
      userid: c.userId,
      search: a.query as string,
      limitfrom: get(a, "offset", 0),
      limitnum: get(a, "limit", 20),
    }),
  },
  core_message_message_search_users: {
    input: z
      .object({ ...page, query: z.string().trim().min(2).max(100) })
      .strict(),
    scope: "self",
    purpose:
      "Find message recipients using the current student’s allowed visibility; no invitations or messages are sent",
    params: (c, a) => ({
      userid: c.userId,
      search: a.query as string,
      limitfrom: get(a, "offset", 0),
      limitnum: get(a, "limit", 20),
    }),
  },
  core_message_search_contacts: {
    input: z.object({ query: z.string().trim().min(2).max(100) }).strict(),
    scope: "self",
    purpose: "Search contacts only within the current student’s courses",
    params: (_c, a) => ({ searchtext: a.query as string, onlymycourses: true }),
  },
  core_message_get_unread_conversations_count: {
    input: z.object({}).strict(),
    scope: "self",
    purpose:
      "Read current student unread conversation count without marking any read",
    params: (c) => ({ useridto: c.userId }),
  },
  core_blog_get_entries: {
    input: z
      .object({
        page: z.number().int().min(0).max(100000).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
    scope: "self",
    purpose:
      "Read the current student’s own blog entries; not a site-wide user data scan or a view event",
    params: (c, a) => ({
      "filters[0][name]": "userid",
      "filters[0][value]": c.userId,
      page: get(a, "page", 0),
      perpage: get(a, "limit", 20),
    }),
  },
};
