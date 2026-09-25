import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import { loadSections, activityFor } from "./course-data.js";
import {
  idSchema,
  flagSchema,
  flag,
  iso,
  unix,
  packet,
  pageOf,
  readApi,
  reportedState,
  warning,
  type PageOptions,
  type ReadState,
} from "./result.js";

const sessionSchema = z.object({
  id: idSchema,
  attendanceid: idSchema,
  courseid: idSchema,
  sessdate: z.number().int(),
  duration: z.number().int().min(0),
  description: z.string().optional(),
  studentscanmark: flagSchema.optional(),
  statuses: z.array(
    z.object({
      id: idSchema,
      description: z.string(),
      acronym: z.string().optional(),
      visible: flagSchema.optional(),
      deleted: flagSchema.optional(),
    }),
  ),
  attendance_log: z.array(
    z.object({
      studentid: idSchema,
      statusid: z.union([z.string(), z.number()]),
      remarks: z.string().optional(),
    }),
  ),
  users: z.array(z.object({ id: idSchema })),
});
/** Do not call tool_mobile_get_content/mobile_view_activity: opening it can auto-mark attendance. */
export async function readAttendance(
  client: MoodleClient,
  courseId: number,
  moduleId?: number,
  options: PageOptions = {},
) {
  idSchema.parse(courseId);
  if (moduleId !== undefined) idSchema.parse(moduleId);
  const { sections, warnings } = await loadSections(client, courseId);
  const activities = sections.flatMap((s) =>
    s.modules
      .filter((m) => m.modname === "attendance")
      .map((m) => activityFor(client, courseId, s, m)),
  );
  const advertised = reportedState(client, "mod_attendance_get_sessions");
  const capabilities: Record<string, ReadState> = {
    attendanceSessions:
      advertised === "available" ? "not_requested" : advertised,
    studentMarking: "not_supported",
    mobileHandler: "not_supported",
  };
  const caveat =
    "Attendance completion is not proof of presence. The standard sessions API can require staff capabilities; the mobile view handler is not used because it can auto-mark attendance.";
  const textHeader = `## Attendance — Course ${courseId}\n${caveat}`;
  if (moduleId === undefined) {
    const page = pageOf(activities, options);
    return packet(
      {
        courseId,
        userId: client.userId,
        activities: page.items,
        sessions: null as AttendanceSession[] | null,
      },
      textHeader +
        "\n" +
        page.items
          .map(
            (a) =>
              `- ${a.name} — cmid ${a.cmid}; attendance instance ${a.instanceId ?? "unknown"}; ${a.url}`,
          )
          .join("\n") +
        "\nSelect a moduleId to attempt a permitted session read.",
      capabilities,
      warnings,
      page.pagination,
    );
  }
  const activity = activities.find((a) => a.cmid === moduleId);
  if (!activity)
    throw new Error(
      "The selected module is not a visible Attendance activity in this course.",
    );
  let instanceId = activity.instanceId;
  if (instanceId === null) {
    const lookup = await readApi(
      client,
      "core_course_get_course_module",
      { cmid: moduleId },
      z.object({
        cm: z.object({
          id: idSchema,
          course: idSchema,
          instance: idSchema,
          modname: z.string(),
        }),
      }),
    );
    warnings.push(...lookup.warnings);
    const cm = lookup.value?.cm;
    if (
      cm &&
      cm.id === moduleId &&
      cm.course === courseId &&
      cm.modname === "attendance"
    )
      instanceId = cm.instance;
    else {
      capabilities.attendanceSessions =
        lookup.state === "available" ? "invalid_response" : lookup.state;
      return packet(
        {
          courseId,
          userId: client.userId,
          activities: [activity],
          sessions: null as AttendanceSession[] | null,
        },
        textHeader +
          "\nSession records unavailable: instance could not be verified.",
        capabilities,
        warnings,
      );
    }
  }
  const result = await readApi(
    client,
    "mod_attendance_get_sessions",
    { attendanceid: instanceId },
    z.array(sessionSchema),
  );
  warnings.push(...result.warnings);
  capabilities.attendanceSessions = result.state;
  if (!result.value)
    return packet(
      {
        courseId,
        userId: client.userId,
        activities: [activity],
        sessions: null as AttendanceSession[] | null,
      },
      textHeader +
        "\nSession records unavailable (" +
        result.state +
        "). No attendance status has been inferred.",
      capabilities,
      warnings,
    );
  const rows: AttendanceSession[] = [];
  for (const s of result.value) {
    if (s.courseid !== courseId || s.attendanceid !== instanceId) {
      warnings.push(
        warning(
          "SESSION_CONTEXT_MISMATCH",
          "An Attendance session belonging to another context was excluded.",
          "mod_attendance_get_sessions",
          moduleId,
        ),
      );
      continue;
    }
    const own = s.attendance_log.filter((l) => l.studentid === client.userId),
      log = own.length === 1 ? own[0] : null;
    const statusId =
      log && /^[1-9][0-9]*$/.test(String(log.statusid))
        ? Number(log.statusid)
        : null;
    const statuses = s.statuses.filter(
        (st) =>
          st.id === statusId &&
          flag(st.visible) !== false &&
          flag(st.deleted) !== true,
      ),
      label = statuses.length === 1 ? statuses[0] : null;
    rows.push({
      sessionId: s.id,
      cmid: moduleId,
      instanceId,
      courseId,
      userId: client.userId,
      startDate: unix(s.sessdate),
      startDateIso: iso(s.sessdate),
      durationSeconds: s.duration,
      status: log
        ? "recorded"
        : own.length === 0 && s.users.some((u) => u.id === client.userId)
          ? "not_recorded"
          : "unknown",
      statusId,
      statusLabel: label?.description ?? null,
      acronym: label?.acronym ?? null,
      remarks: log?.remarks ?? null,
      canMarkThroughMcp: false,
    });
  }
  rows.sort(
    (a, b) =>
      (a.startDate ?? 0) - (b.startDate ?? 0) || a.sessionId - b.sessionId,
  );
  const page = pageOf(rows, options);
  return packet(
    {
      courseId,
      userId: client.userId,
      activities: [activity],
      sessions: page.items as AttendanceSession[] | null,
    },
    textHeader +
      "\n" +
      page.items
        .map(
          (s) =>
            `- Session ${s.sessionId} (${s.startDateIso ?? "date unknown"}): ${s.statusLabel ?? s.status}`,
        )
        .join("\n"),
    capabilities,
    warnings,
    page.pagination,
  );
}
interface AttendanceSession {
  sessionId: number;
  cmid: number;
  instanceId: number;
  courseId: number;
  userId: number;
  startDate: number | null;
  startDateIso: string | null;
  durationSeconds: number;
  status: string;
  statusId: number | null;
  statusLabel: string | null;
  acronym: string | null;
  remarks: string | null;
  canMarkThroughMcp: boolean;
}
