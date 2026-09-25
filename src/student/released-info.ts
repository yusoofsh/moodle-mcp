import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import {
  idSchema,
  flagSchema,
  flag,
  packet,
  pageOf,
  readApi,
  warning,
  iso,
  unix,
  readOutputSchema,
  type PageOptions,
} from "./result.js";
import {
  readableContent,
  safeContentUrl,
  contentSchema,
} from "./content-text.js";
const nullableNumber = z.number().finite().nullish(),
  nullableString = z.string().nullish();
const gradeItem = z.object({
  id: idSchema,
  itemtype: z.string(),
  itemname: nullableString,
  itemmodule: nullableString,
  iteminstance: z.number().int().nullish(),
  cmid: z.number().int().nullish(),
  categoryid: z.number().int().nullish(),
  graderaw: nullableNumber,
  grademin: nullableNumber,
  grademax: nullableNumber,
  gradeformatted: nullableString,
  rangeformatted: nullableString,
  percentageformatted: nullableString,
  lettergradeformatted: nullableString,
  feedback: nullableString,
  feedbackformat: z.number().int().nullish(),
  gradeishidden: flagSchema.nullish(),
  gradehiddenbydate: flagSchema.nullish(),
});
const gradeReport = z.object({
  usergrades: z.array(
    z.object({
      userid: idSchema,
      courseid: idSchema,
      gradeitems: z.array(gradeItem),
    }),
  ),
});
const itemOutput = z.object({
  id: idSchema,
  itemType: z.string(),
  name: z.string(),
  module: z.string().nullable(),
  instanceId: z.number().nullable(),
  cmid: z.number().nullable(),
  categoryId: z.number().nullable(),
  hidden: z.boolean(),
  raw: z.number().nullable(),
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
  formatted: z.string().nullable(),
  rangeFormatted: z.string().nullable(),
  percentageFormatted: z.string().nullable(),
  letterGrade: z.string().nullable(),
  feedback: contentSchema.nullable(),
});
const notificationSchema = z.object({
  id: z.number().int(),
  useridto: idSchema,
  useridfrom: z.number().int(),
  subject: z.string(),
  text: z.string(),
  fullmessageformat: z.number().int().optional(),
  timecreated: z.number().int(),
  timeread: z.number().int().nullish(),
  read: flagSchema,
  deleted: flagSchema,
  contexturl: nullableString,
});
const notificationReport = z.object({
  notifications: z.array(notificationSchema),
  unreadcount: z.number().int().nonnegative(),
});
export const notificationInput = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).max(1000000).optional(),
  })
  .strict();
export const releasedOutputs = {
  moodle_get_grades: readOutputSchema.extend({
    data: z.object({
      courseId: idSchema,
      userId: idSchema,
      items: z.array(itemOutput).nullable(),
      courseTotal: itemOutput.nullable(),
    }),
  }),
  moodle_get_notifications: readOutputSchema.extend({
    data: z.object({
      userId: idSchema,
      items: z
        .array(
          z.object({
            id: z.number(),
            senderId: z.number(),
            subject: z.string(),
            created: z.number().nullable(),
            createdIso: z.string().nullable(),
            read: z.boolean(),
            readAt: z.number().nullable(),
            contextUrl: z.string().nullable(),
            content: contentSchema,
          }),
        )
        .nullable(),
      unreadCount: z.number().nullable(),
      cursor: z.object({
        offset: z.number(),
        limit: z.number(),
        nextOffset: z.number().nullable(),
        mayHaveMore: z.boolean().nullable(),
      }),
      complete: z.boolean(),
      readReceiptsChanged: z.literal(false),
    }),
  }),
};
export async function readGrades(
  client: MoodleClient,
  courseId: number,
  options: PageOptions = {},
) {
  idSchema.parse(courseId);
  const r = await readApi(
    client,
    "gradereport_user_get_grade_items",
    { courseid: courseId, userid: client.userId },
    gradeReport,
  );
  const reports =
    r.value?.usergrades.filter(
      (g) => g.userid === client.userId && g.courseid === courseId,
    ) ?? [];
  if (r.state === "available" && reports.length !== 1) {
    r.state = "invalid_response";
    r.warnings.push(
      warning(
        "GRADE_CONTEXT_UNAVAILABLE",
        "The requested student/course report was missing or ambiguous. No empty or zero gradebook was inferred.",
        "gradereport_user_get_grade_items",
      ),
    );
  }
  const items =
    reports.length === 1
      ? reports[0].gradeitems.map((item) => {
          const hidden =
            flag(item.gradeishidden) === true ||
            flag(item.gradehiddenbydate) === true;
          const name =
            item.itemname?.trim() ||
            item.itemmodule ||
            (item.itemtype === "course"
              ? "Course total"
              : item.itemtype === "category"
                ? "Category total (name not returned)"
                : "Unnamed grade item");
          return {
            id: item.id,
            itemType: item.itemtype,
            name: readableContent(name, 1, client.siteUrl, 1000).text,
            module: item.itemmodule ?? null,
            instanceId: item.iteminstance ?? null,
            cmid: item.cmid ?? null,
            categoryId: item.categoryid ?? null,
            hidden,
            raw: hidden ? null : (item.graderaw ?? null),
            minimum: item.grademin ?? null,
            maximum: item.grademax ?? null,
            formatted: hidden ? null : (item.gradeformatted ?? null),
            rangeFormatted: item.rangeformatted ?? null,
            percentageFormatted: hidden
              ? null
              : (item.percentageformatted ?? null),
            letterGrade: hidden ? null : (item.lettergradeformatted ?? null),
            feedback:
              !hidden && typeof item.feedback === "string"
                ? readableContent(
                    item.feedback,
                    item.feedbackformat ?? 1,
                    client.siteUrl,
                    4000,
                  )
                : null,
          };
        })
      : null;
  const page = items ? pageOf(items, options) : null;
  const totals = items?.filter((item) => item.itemType === "course") ?? [];
  const courseTotal = totals.length === 1 ? totals[0] : null;
  const text =
    items === null
      ? "Grade report unavailable (" + r.state + "); no grades were inferred."
      : `## Grades — Course ${courseId}\n` +
        page!.items
          .map(
            (item) =>
              `- ${item.name}: ${item.hidden ? "withheld" : (item.formatted ?? "not returned")}; maximum: ${item.maximum ?? "not returned"}`,
          )
          .join("\n") +
        (courseTotal
          ? `\nCourse total: ${courseTotal.formatted ?? "not returned"}; maximum: ${courseTotal.maximum ?? "not returned"}. This is the current released report, not a projected final result.`
          : "");
  return packet(
    {
      courseId,
      userId: client.userId,
      items: page?.items ?? null,
      courseTotal,
    },
    text,
    { grades: r.state },
    r.warnings,
    page?.pagination ?? null,
  );
}
export async function readNotifications(
  client: MoodleClient,
  raw: z.infer<typeof notificationInput> = {},
) {
  const options = notificationInput.parse(raw),
    limit = options.limit ?? 20,
    offset = options.offset ?? 0;
  const r = await readApi(
    client,
    "message_popup_get_popup_notifications",
    { useridto: client.userId, newestfirst: true, limit, offset },
    notificationReport,
  );
  const all = r.value?.notifications ?? null;
  const selected =
    all?.filter(
      (n) => n.useridto === client.userId && flag(n.deleted) === false,
    ) ?? null;
  if (all && selected && all.length !== selected.length)
    r.warnings.push(
      warning(
        "NOTIFICATIONS_WITHHELD",
        "Deleted or other-recipient notifications were excluded.",
        "message_popup_get_popup_notifications",
      ),
    );
  const items =
    selected?.map((n) => ({
      id: n.id,
      senderId: n.useridfrom,
      subject: n.subject,
      created: unix(n.timecreated),
      createdIso: iso(n.timecreated),
      read: flag(n.read) === true,
      readAt: unix(n.timeread),
      contextUrl: safeContentUrl(n.contexturl, client.siteUrl),
      content: readableContent(n.text, 1, client.siteUrl, 4000),
    })) ?? null;
  const mayHaveMore = all === null ? null : all.length >= limit;
  const data = {
    userId: client.userId,
    items,
    unreadCount: r.value?.unreadcount ?? null,
    cursor: {
      offset,
      limit,
      nextOffset: mayHaveMore ? offset + limit : null,
      mayHaveMore,
    },
    complete:
      items !== null &&
      offset === 0 &&
      mayHaveMore === false &&
      r.warnings.length === 0,
    readReceiptsChanged: false as const,
  };
  return packet(
    data,
    `## Notifications\n` +
      (items === null
        ? "Notifications unavailable (" +
          r.state +
          "); unread state was not changed."
        : items
            .map(
              (n) =>
                `- ${n.subject} (${n.read ? "read" : "unread"})\n${n.content.text}`,
            )
            .join("\n")),
    { notifications: r.state },
    r.warnings,
  );
}
