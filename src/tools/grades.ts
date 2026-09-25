import { z } from "zod";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClient } from "../moodle-client.js";
import { readGrades, releasedOutputs } from "../student/released-info.js";
import { idSchema, pageShape, toolResult } from "../student/result.js";
export async function getGrades(
  client: MoodleClient,
  courseId: number,
): Promise<string> {
  return (await readGrades(client, courseId)).text;
}
export function registerGradeTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (!canRegister(source, "moodle_get_grades")) return;
  server.registerTool(
    "moodle_get_grades",
    {
      description:
        "Read the current student’s released course grade report with explicit item/course IDs, category IDs, raw/displayed values and feedback. Missing maximum/range stays null, never undefined or assumed 100; hidden values are withheld. This is not a projected final grade. Optional local offset/limit pagination. Never changes grades or emits a view event.",
      inputSchema: z.object({ courseId: idSchema, ...pageShape }).strict(),
      outputSchema: releasedOutputs.moodle_get_grades,
      annotations: READ_ONLY,
      _meta: AUTH_META,
    },
    async ({ courseId, ...options }) =>
      toolResult(
        await readGrades(
          await getToolClient(source, "moodle_get_grades"),
          courseId,
          options,
        ),
      ),
  );
}
