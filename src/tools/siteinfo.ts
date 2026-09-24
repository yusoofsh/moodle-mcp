import type { MoodleClientSource } from "../moodle-source.js";
import { z } from "zod";
import {
  canRegister,
  getToolClient,
  TOOL_FUNCTIONS,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import type { McpServer } from "@modelcontextprotocol/server";

export function registerSiteInfoTool(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_get_site_info"))
    server.registerTool(
      "moodle_get_site_info",
      {
        description:
          "Get information about your Moodle server and your account: school name, Moodle version, your name, and which APIs are enabled.",
        inputSchema: z.object({}),
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async () => {
        const client = await getToolClient(source, "moodle_get_site_info");

        const enabledCount = client.supportedFunctions.size;
        const lines = [
          `## Moodle Site Info`,
          ``,
          `**School:** ${client.siteName}`,
          `**Version:** ${client.release}`,
          `**Your user ID:** ${client.userId}`,
          `**Enabled WS functions:** ${client.profile?.functions === undefined ? "Unknown (server did not report)" : enabledCount}`,
        ];

        lines.push("", "**Tool availability for this Moodle token:**");
        for (const name of Object.keys(TOOL_FUNCTIONS)) {
          lines.push(
            `- ${canRegister(client, name) ? "Available" : "Not advertised by token"}: ${name}`,
          );
        }
        lines.push(
          "",
          "The MCP catalog is stable; Moodle permissions are checked when each tool runs.",
        );

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      },
    );
}
