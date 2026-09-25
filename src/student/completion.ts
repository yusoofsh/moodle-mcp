import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import {
  activityFor,
  completionFor,
  completionSchema,
  loadSections,
  summarizeActivities,
  visible,
} from "./course-data.js";
import {
  idSchema,
  flagSchema,
  flag,
  iso,
  unix,
  packet,
  readApi,
  pageOf,
  warning,
  type PageOptions,
} from "./result.js";
const statusesSchema = z.object({
  statuses: z.array(
    completionSchema.extend({
      cmid: idSchema,
      instance: idSchema.optional(),
      modname: z.string().optional(),
      tracking: z.number().int().optional(),
    }),
  ),
});
export async function readActivityCompletion(
  client: MoodleClient,
  courseId: number,
  options: PageOptions = {},
) {
  idSchema.parse(courseId);
  const { sections, warnings } = await loadSections(client, courseId);
  const r = await readApi(
    client,
    "core_completion_get_activities_completion_status",
    { courseid: courseId, userid: client.userId },
    statusesSchema,
  );
  warnings.push(...r.warnings);
  const items = sections.flatMap((section) =>
    section.modules.map((module) => {
      const item = activityFor(client, courseId, section, module);
      const rows = r.value?.statuses.filter((s) => s.cmid === module.id) ?? [];
      const matching =
        rows.length === 1 &&
        visible(rows[0]) &&
        (rows[0].modname === undefined || rows[0].modname === module.modname) &&
        (rows[0].instance === undefined ||
          module.instance === undefined ||
          rows[0].instance === module.instance);
      if (matching)
        item.completion = completionFor(
          module,
          rows[0],
          rows[0].tracking,
          "core_completion_get_activities_completion_status",
        );
      else if (rows.length)
        warnings.push(
          warning(
            "COMPLETION_ID_MISMATCH",
            "An ambiguous or inaccessible completion row was not used.",
            "core_completion_get_activities_completion_status",
            module.id,
          ),
        );
      return item;
    }),
  );
  const summary = summarizeActivities(items),
    page = pageOf(items, options);
  const text = [
    `## Activity completion — Course ${courseId}`,
    `Visible tracked activities: ${summary.tracked}; completed: ${summary.completed}; incomplete: ${summary.incomplete}; unknown: ${summary.unknown}.`,
    summary.percentComplete === null
      ? "Completion percentage unknown or not applicable."
      : `Visible-activity completion: ${summary.percentComplete}% (not the course completion decision).`,
    ...page.items.map(
      (i) => `- ${i.name} — cmid ${i.cmid}: ${i.completion.status}`,
    ),
  ].join("\n");
  return packet(
    { courseId, userId: client.userId, items: page.items, summary },
    text,
    { activityCompletion: r.state },
    warnings,
    page.pagination,
  );
}
const courseStatusSchema = z.object({
  completionstatus: z.object({
    completed: flagSchema,
    aggregation: z.number().int(),
    completions: z.array(
      z.object({
        type: z.number().int(),
        title: z.string(),
        status: z.string(),
        complete: flagSchema,
        timecompleted: z.number().int().nullable().optional(),
        details: z
          .object({
            type: z.string(),
            criteria: z.string(),
            requirement: z.string(),
            status: z.string(),
          })
          .optional(),
      }),
    ),
  }),
});
export async function readCourseCompletion(
  client: MoodleClient,
  courseId: number,
) {
  idSchema.parse(courseId);
  const { warnings } = await loadSections(client, courseId);
  const r = await readApi(
    client,
    "core_completion_get_course_completion_status",
    { courseid: courseId, userid: client.userId },
    courseStatusSchema,
  );
  warnings.push(...r.warnings);
  const status = r.value?.completionstatus;
  const data = {
    courseId,
    userId: client.userId,
    completed: status ? flag(status.completed) : null,
    aggregation:
      status?.aggregation === 1
        ? "all"
        : status?.aggregation === 2
          ? "any"
          : null,
    criteria: status
      ? status.completions.map((c) => ({
          type: c.type,
          title: c.title,
          displayStatus: c.status,
          completed: flag(c.complete),
          timeCompleted: unix(c.timecompleted),
          timeCompletedIso: iso(c.timecompleted),
          details: c.details ?? null,
        }))
      : null,
  };
  const text = [
    `## Course completion — Course ${courseId}`,
    `State: ${r.state}`,
    data.completed === null
      ? "Course completion is unknown, unavailable, or not configured; it is not being reported as incomplete."
      : `Course completed: ${data.completed ? "Yes" : "No"}`,
    ...(data.criteria ?? []).map((c) => `- ${c.title}: ${c.displayStatus}`),
  ].join("\n");
  return packet(data, text, { courseCompletion: r.state }, warnings);
}
