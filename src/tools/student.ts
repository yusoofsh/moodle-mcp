import { studentOutputs } from "../student/output.js";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { idSchema, pageShape, toolResult } from "../student/result.js";
import {
  readActivityCompletion,
  readCourseCompletion,
} from "../student/completion.js";
import { readAttendance } from "../student/attendance.js";

export function registerStudentTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_get_activity_completion"))
    server.registerTool(
      "moodle_get_activity_completion",
      {
        description:
          "Read the current student’s activity completion for visible course modules, with manual/automatic/not-tracked/unknown distinctions, completion rules and a scoped progress summary. Attempts the completion read API and falls back to already-authorized course-content completion fields. Never marks completion. Does not accept another userId.",
        inputSchema: z.object({ courseId: idSchema, ...pageShape }).strict(),
        outputSchema: studentOutputs.moodle_get_activity_completion,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ courseId, offset, limit }) =>
        toolResult(
          await readActivityCompletion(
            await getToolClient(source, "moodle_get_activity_completion"),
            courseId,
            { offset, limit },
          ),
        ),
    );
  if (canRegister(source, "moodle_get_course_completion"))
    server.registerTool(
      "moodle_get_course_completion",
      {
        description:
          "Read Moodle’s course-completion decision and criteria for the authenticated student. This is distinct from an activity percentage. Not configured, forbidden, unavailable and incomplete remain different states. Never self-completes a course and never accepts another userId.",
        inputSchema: z.object({ courseId: idSchema }).strict(),
        outputSchema: studentOutputs.moodle_get_course_completion,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ courseId }) =>
        toolResult(
          await readCourseCompletion(
            await getToolClient(source, "moodle_get_course_completion"),
            courseId,
          ),
        ),
    );
  if (canRegister(source, "moodle_get_attendance"))
    server.registerTool(
      "moodle_get_attendance",
      {
        description:
          "Read visible Attendance activity inventory for a course. Supply moduleId (cmid) to attempt the plugin’s advertised session-read API for that one activity; return only the current student’s records when Moodle permits. Missing API or denied permissions are reported explicitly, never as absent. No attendance marking, QR/password processing or mobile-content handler calls (mobile views can auto-mark presence).",
        inputSchema: z
          .object({
            courseId: idSchema,
            moduleId: idSchema.optional(),
            ...pageShape,
          })
          .strict(),
        outputSchema: studentOutputs.moodle_get_attendance,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ courseId, moduleId, offset, limit }) =>
        toolResult(
          await readAttendance(
            await getToolClient(source, "moodle_get_attendance"),
            courseId,
            moduleId,
            { offset, limit },
          ),
        ),
    );
}
