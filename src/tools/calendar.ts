import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import type { MoodleClient } from "../moodle-client.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { idSchema, toolResult } from "../student/result.js";
import { readCalendar } from "../student/dashboard.js";
import { contentOutputs } from "../student/content-output.js";
export async function getCalendarEvents(
  client: MoodleClient,
  courseId?: number,
  daysAhead = 30,
): Promise<string> {
  return (await readCalendar(client, { courseId, daysAhead })).text;
}
export function registerCalendarTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (!canRegister(source, "moodle_get_calendar_events")) return;
  server.registerTool(
    "moodle_get_calendar_events",
    {
      description:
        "Read current-user Moodle action events in a bounded window (default next 30 days), with ISO UTC dates, course IDs, past/upcoming distinction and upstream pagination. Optional courseId uses course-specific API pagination. Reuse returned from/to and afterEventId for next page. This is an action timeline, not all personal/group/site calendar entries; past opening events are not automatically overdue tasks. Never creates or edits events.",
      inputSchema: z
        .object({
          courseId: idSchema.optional(),
          daysAhead: z.number().int().min(1).max(90).optional(),
          lookbackDays: z.number().int().min(0).max(90).optional(),
          limit: z.number().int().min(1).max(100).optional(),
          afterEventId: idSchema.optional(),
          from: z.number().int().min(0).optional(),
          to: z.number().int().positive().optional(),
        })
        .strict(),
      outputSchema: contentOutputs.moodle_get_calendar_events,
      annotations: READ_ONLY,
      _meta: AUTH_META,
    },
    async (options) =>
      toolResult(
        await readCalendar(
          await getToolClient(source, "moodle_get_calendar_events"),
          options,
        ),
      ),
  );
}
