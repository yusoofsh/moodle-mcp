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

const smallPage = z
  .object({
    offset: z.number().int().min(0).max(100000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
const visibleCourse = z.object({ courseId: idSchema }).strict();

const timelineClassification = z.enum([
  "all",
  "past",
  "inprogress",
  "future",
  "favourites",
]);
const timelineInput = z
  .object({
    classification: timelineClassification.optional(),
    offset: z.number().int().min(0).max(100000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
const scopedSearchInput = z
  .object({
    courseId: idSchema,
    query: z.string().trim().min(2).max(200),
    areaIds: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z0-9_.-]+$/)
          .max(100),
      )
      .max(10)
      .optional(),
    page: z.number().int().min(0).max(1000).optional(),
  })
  .strict();
const timelineParams = (a: Record<string, unknown>) => ({
  classification:
    typeof a.classification === "string" ? a.classification : "all",
  limit: get(a, "limit", 20),
  offset: get(a, "offset", 0),
  sort: "fullname ASC",
});
const scopedSearchParams = (
  a: Record<string, unknown>,
  includePage: boolean,
) => {
  const params: Record<string, string | number | boolean> = {
    query: a.query as string,
    "filters[courseids][0]": a.courseId as number,
    "filters[mycoursesonly]": true,
  };
  for (const [index, area] of (
    (a.areaIds as string[] | undefined) ?? []
  ).entries())
    params["filters[areaids][" + index + "]"] = area;
  if (includePage) params.page = get(a, "page", 0);
  return params;
};

export const ACCOUNT_READS: Record<string, ReadOperation> = {
  core_ai_get_policy_status: {
    input: z.object({}).strict(),
    scope: "self",
    purpose:
      "Read only the current student's AI policy acceptance status; never accepts policy or selects another user",
    params: (c) => ({ userid: c.userId }),
  },
  block_recentlyaccesseditems_get_recent_items: {
    input: z
      .object({ limit: z.number().int().min(1).max(50).optional() })
      .strict(),
    scope: "self",
    purpose:
      "Read a bounded list of activities/resources already recorded as recently accessed by the current student; does not record a new access",
    params: (_c, a) => ({ limit: get(a, "limit", 20) }),
  },
  block_starredcourses_get_starred_courses: {
    input: smallPage,
    scope: "self",
    purpose:
      "Read the current student's starred enrolled courses without changing favourites",
    params: (_c, a) => ({
      limit: get(a, "limit", 20),
      offset: get(a, "offset", 0),
    }),
  },
  core_block_get_dashboard_blocks: {
    input: z.object({}).strict(),
    scope: "self",
    purpose:
      "Read current-student dashboard block metadata only; block HTML/content is intentionally omitted",
    params: (c) => ({ userid: c.userId, returncontents: false }),
  },
  core_calendar_get_allowed_event_types: {
    input: visibleCourse,
    scope: "course",
    purpose:
      "Read which calendar event types the current student may create in one visible course; does not create or edit an event",
    params: (_c, a) => ({ courseid: a.courseId as number }),
  },

  core_message_get_unread_notification_count: {
    input: z.object({}).strict(),
    scope: "self",
    purpose:
      "Read the current student's unread notification count without marking anything read",
    params: (c) => ({ useridto: c.userId }),
  },
  core_course_get_enrolled_courses_by_timeline_classification: {
    input: timelineInput,
    scope: "self",
    purpose:
      "Read a bounded timeline classification of the current student's enrolled courses without changing favourites or course views",
    params: (_c, a) => timelineParams(a),
  },
  core_course_get_enrolled_courses_with_action_events_by_timeline_classification:
    {
      input: timelineInput,
      scope: "self",
      purpose:
        "Read a bounded timeline classification of the current student's enrolled courses that already have action events; does not create or modify events",
      params: (_c, a) => timelineParams(a),
    },
  core_search_get_search_areas_list: {
    input: z
      .object({
        category: z.string().trim().max(100).optional(),
      })
      .strict(),
    scope: "self",
    purpose:
      "List enabled global-search areas visible to the current account; no search/view event is recorded",
    params: (_c, a) => ({
      cat: typeof a.category === "string" ? a.category : "",
    }),
  },
  core_search_get_results: {
    input: scopedSearchInput,
    scope: "self",
    purpose:
      "Search only within one currently visible course using Moodle global search; no result/view event or external search is invoked",
    params: (_c, a) => scopedSearchParams(a, true),
  },
  core_search_get_top_results: {
    input: scopedSearchInput.omit({ page: true }),
    scope: "self",
    purpose:
      "Read top Moodle global-search results only within one currently visible course; no result/view event is recorded",
    params: (_c, a) => scopedSearchParams(a, false),
  },

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
