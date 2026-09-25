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
  readAssignments,
  readAssignmentStatus,
} from "../student/assignments.js";
import { idSchema, pageShape, toolResult } from "../student/result.js";

// Retain the old helper signatures for integrations importing them directly.
export async function listAssignments(
  client: MoodleClient,
  courseId: number,
): Promise<string> {
  return (await readAssignments(client, courseId)).text;
}
export async function getAssignment(
  client: MoodleClient,
  assignmentId: number,
): Promise<string> {
  return (await readAssignmentStatus(client, assignmentId)).text;
}
export function registerAssignmentTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_list_assignments"))
    server.registerTool(
      "moodle_list_assignments",
      {
        description:
          "Read visible course assignments with correct assignmentId/instanceId and cmid, effective due/open/cutoff dates in Unix seconds and ISO UTC, grading type, explicit unknown states and warnings. Structured JSON is authoritative; text is included for gateways. Optional offset/limit paginate the locally fetched visible list. Does not submit or change anything.",
        inputSchema: z
          .object({
            courseId: idSchema.describe("Course ID from moodle_list_courses"),
            ...pageShape,
          })
          .strict(),
        outputSchema: studentOutputs.moodle_list_assignments,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ courseId, offset, limit }) =>
        toolResult(
          await readAssignments(
            await getToolClient(source, "moodle_list_assignments"),
            courseId,
            { offset, limit },
          ),
        ),
    );
  if (canRegister(source, "moodle_get_assignment"))
    server.registerTool(
      "moodle_get_assignment",
      {
        description:
          "Read the authenticated student’s latest assignment submission/team status, individual deadline extension and released grade feedback. Uses assignmentId (not cmid). Missing results stay unknown rather than Not submitted. Returns structured JSON and text; no submission or grading actions.",
        inputSchema: z
          .object({
            assignmentId: idSchema.describe(
              "Assignment instance ID from moodle_list_assignments, not cmid",
            ),
          })
          .strict(),
        outputSchema: studentOutputs.moodle_get_assignment,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ assignmentId }) =>
        toolResult(
          await readAssignmentStatus(
            await getToolClient(source, "moodle_get_assignment"),
            assignmentId,
          ),
        ),
    );
}
