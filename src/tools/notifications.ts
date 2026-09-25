import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClient } from "../moodle-client.js";
import {
  readNotifications,
  notificationInput,
  releasedOutputs,
} from "../student/released-info.js";
import { toolResult } from "../student/result.js";
export async function getNotifications(
  client: MoodleClient,
  limit = 20,
): Promise<string> {
  return (await readNotifications(client, { limit })).text;
}
export function registerNotificationTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (!canRegister(source, "moodle_get_notifications")) return;
  server.registerTool(
    "moodle_get_notifications",
    {
      description:
        "Read a bounded page of the current account’s popup notifications, unread count, text and safe context links. Does not mark read, emit read receipts or change preferences. limit defaults to 20 (max100); offset supports upstream paging. Missing or denied results are not reported as no notifications.",
      inputSchema: notificationInput,
      outputSchema: releasedOutputs.moodle_get_notifications,
      annotations: READ_ONLY,
      _meta: AUTH_META,
    },
    async (options) =>
      toolResult(
        await readNotifications(
          await getToolClient(source, "moodle_get_notifications"),
          options,
        ),
      ),
  );
}
