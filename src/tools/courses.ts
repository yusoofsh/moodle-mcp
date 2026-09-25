import { studentOutputs } from "../student/output.js";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClient } from "../moodle-client.js";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import {
  loadSections,
  activityFor,
  summarizeActivities,
} from "../student/course-data.js";
import {
  idSchema,
  flagSchema,
  flag,
  iso,
  unix,
  pageShape,
  pageOf,
  packet,
  toolResult,
  readApi,
  reportedState,
  type PageOptions,
} from "../student/result.js";

const coursesSchema = z.array(
  z.object({
    id: idSchema,
    fullname: z.string(),
    shortname: z.string(),
    startdate: z.number().int().optional(),
    enddate: z.number().int().optional(),
    enablecompletion: flagSchema.optional(),
    progress: z.number().nullable().optional(),
    completed: flagSchema.nullable().optional(),
  }),
);
export async function readCourses(
  client: MoodleClient,
  options: PageOptions = {},
) {
  const r = await readApi(
    client,
    "core_enrol_get_users_courses",
    { userid: client.userId },
    coursesSchema,
  );
  const all =
    r.value?.map((c) => ({
      courseId: c.id,
      name: c.fullname,
      shortName: c.shortname,
      url: client.siteUrl + "/course/view.php?id=" + c.id,
      startDate: unix(c.startdate),
      startDateIso: iso(c.startdate),
      endDate: unix(c.enddate),
      endDateIso: iso(c.enddate),
      completionEnabled: flag(c.enablecompletion),
      progressPercent:
        typeof c.progress === "number" && c.progress >= 0 && c.progress <= 100
          ? c.progress
          : null,
      completed: flag(c.completed),
    })) ?? null;
  const page = all ? pageOf(all, options) : null;
  const text =
    all === null
      ? "Course list unavailable (" +
        r.state +
        "); this is not an empty enrolment list."
      : `## Your Courses\n\n${page!.items.map((c) => `- **${c.name}** (${c.shortName}) — ID: \`${c.courseId}\``).join("\n")}${all.length === 0 ? "You are not enrolled in any courses." : ""}`;
  return packet(
    { userId: client.userId, items: page?.items ?? null },
    text,
    { courses: r.state },
    r.warnings,
    page?.pagination ?? null,
  );
}
export async function readCourse(
  client: MoodleClient,
  courseId: number,
  options: PageOptions = {},
) {
  const { sections, warnings } = await loadSections(client, courseId);
  const all = sections.flatMap((s) =>
    s.modules.map((m) => ({
      ...activityFor(client, courseId, s, m),
      descriptionHtml: m.description ?? null,
      dates: (m.dates ?? []).map((d) => ({
        label: d.label,
        unix: unix(d.timestamp),
        iso: iso(d.timestamp),
        dataId: d.dataid ?? null,
      })),
    })),
  );
  const page = pageOf(all, options),
    summary = summarizeActivities(all);
  const text =
    page.items
      .map(
        (m) =>
          `### ${m.sectionName || "General"}\n- \`${m.moduleType}\` **${m.name}** — cmid ${m.cmid}; instance ${m.instanceId ?? "unknown"} — [open](${m.url})`,
      )
      .join("\n") ||
    (all.length === 0
      ? "This course has no visible content."
      : "No further items at this offset.");
  return packet(
    {
      courseId,
      items: page.items,
      activityCompletion: summary,
      attendanceActivityCount: all.filter((m) => m.moduleType === "attendance")
        .length,
    },
    text,
    {
      courseContents: "available",
      activityCompletion: reportedState(
        client,
        "core_completion_get_activities_completion_status",
      ),
      courseCompletion: reportedState(
        client,
        "core_completion_get_course_completion_status",
      ),
      attendanceSessions: reportedState(client, "mod_attendance_get_sessions"),
    },
    warnings,
    page.pagination,
  );
}
export async function listCourses(client: MoodleClient): Promise<string> {
  return (await readCourses(client)).text;
}
export async function getCourse(
  client: MoodleClient,
  courseId: number,
): Promise<string> {
  return (await readCourse(client, courseId)).text;
}
export function registerCourseTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_list_courses"))
    server.registerTool(
      "moodle_list_courses",
      {
        description:
          "List current student enrolments with structured course IDs, dates and reported completion/progress. Missing progress is unknown. Optional offset/limit page the locally fetched enrolment list.",
        inputSchema: z.object(pageShape).strict(),
        outputSchema: studentOutputs.moodle_list_courses,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async (options) =>
        toolResult(
          await readCourses(
            await getToolClient(source, "moodle_list_courses"),
            options,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_course"))
    server.registerTool(
      "moodle_get_course",
      {
        description:
          "Read current visible sections/modules with distinct cmid and instanceId, restrictions, dates and reported activity completion. Includes a visible-activity progress summary and Attendance activity count; no state changes. Returns structured JSON and equivalent text.",
        inputSchema: z.object({ courseId: idSchema, ...pageShape }).strict(),
        outputSchema: studentOutputs.moodle_get_course,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ courseId, offset, limit }) =>
        toolResult(
          await readCourse(
            await getToolClient(source, "moodle_get_course"),
            courseId,
            { offset, limit },
          ),
        ),
    );
}
