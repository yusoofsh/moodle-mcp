import { studentOutputs } from "../student/output.js";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  TOOL_FUNCTIONS,
  TOOL_OPTIONAL_FUNCTIONS,
  TOOL_CATALOG_VERSION,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { packet, toolResult, reportedState } from "../student/result.js";

export function registerSiteInfoTool(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (!canRegister(source, "moodle_get_site_info")) return;
  server.registerTool(
    "moodle_get_site_info",
    {
      description:
        "Read Moodle site/current account information and the backend tool catalog with required/optional Web Service advertisement. Includes completion and Attendance API diagnostics. Advertised is not proof of role/context authorization; a connector may cache an older catalog. Never returns tokens.",
      inputSchema: z.object({}).strict(),
      outputSchema: studentOutputs.moodle_get_site_info,
      annotations: READ_ONLY,
      _meta: AUTH_META,
    },
    async () => {
      const client = await getToolClient(source, "moodle_get_site_info");
      if (typeof client.refreshSiteInfo === "function") {
        try {
          await client.refreshSiteInfo();
        } catch {
          throw new Error(
            "Could not refresh Moodle site information. Check the connection; no new capability or account identity was assumed.",
          );
        }
      }
      const functions = client.supportedFunctions ?? new Set<string>();
      const tools = Object.entries(TOOL_FUNCTIONS).map(([name, required]) => ({
        name,
        required: required.map((api) => ({
          name: api,
          advertisement: reportedState(client, api),
        })),
        optional: (TOOL_OPTIONAL_FUNCTIONS[name] ?? []).map((api) => ({
          name: api,
          advertisement: reportedState(client, api),
        })),
        permissionChecked: false,
      }));
      const diagnostics = {
        activityCompletion: reportedState(
          client,
          "core_completion_get_activities_completion_status",
        ),
        courseCompletion: reportedState(
          client,
          "core_completion_get_course_completion_status",
        ),
        attendanceSessions: reportedState(
          client,
          "mod_attendance_get_sessions",
        ),
      };
      const data = {
        school: client.siteName,
        version: client.release,
        userId: client.userId,
        advertisedFunctions: [...functions].sort(),
        reportedFunctionCount:
          client.profile?.functions === undefined ? null : functions.size,
        catalog: {
          version: TOOL_CATALOG_VERSION,
          toolCount: tools.length,
          tools,
          registryNote:
            "This is the backend catalog, not proof that a client or Composio cache has refreshed its tool schemas.",
        },
        attendance: {
          advertisedFunctions: [...functions]
            .filter((n) => n.startsWith("mod_attendance_"))
            .sort(),
          sessionReadApi: "mod_attendance_get_sessions",
          sessionsRead: diagnostics.attendanceSessions,
          mobileReadFallback: false,
          reason:
            "The mobile view handler can auto-mark presence and is not invoked by this read-only server.",
        },
      };
      const text = [
        `## Moodle Site Info`,
        `School: ${client.siteName}`,
        `Version: ${client.release}`,
        `Your user ID: ${client.userId}`,
        `Enabled WS functions: ${data.reportedFunctionCount ?? "Unknown"}`,
        `Backend catalog ${TOOL_CATALOG_VERSION}: ${tools.length} tools`,
        ...tools.map(
          (t) =>
            `- ${t.name}: ${t.required.every((f) => f.advertisement === "available") ? "required APIs advertised" : "required APIs missing or unknown"}; role/context permission not verified`,
        ),
        "MCP discovery is stable. Advertisement, actual permission, and cached client tool availability are different checks.",
      ].join("\n");
      return toolResult(packet(data, text, diagnostics));
    },
  );
}
