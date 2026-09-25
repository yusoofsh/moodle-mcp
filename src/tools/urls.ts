import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { resolveUrl } from "../url-resolver.js";

export function registerUrlTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (!canRegister(source, "moodle_resolve_url")) return;
  server.registerTool(
    "moodle_resolve_url",
    {
      description:
        "Resolve a visible Moodle URL activity to its actual HTTP(S) externalurl (for example a YouTube recording), not the mod/url/view.php wrapper. moduleId is the course-module/activity ID, not the URL instance ID. Optional courseId avoids a module-lookup API call. Returns structured data and equivalent JSON text; resolved=false explains missing capabilities or unavailable targets. Does not fetch, transcribe, or follow the external site and never forwards Moodle credentials.",
      inputSchema: z.object({
        moduleId: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .describe(
            "Course-module ID from a Moodle activity URL or moodle_list_resources",
          ),
        courseId: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .optional()
          .describe(
            "Optional course ID from moodle_list_courses; still subject to access checks",
          ),
      }),
      outputSchema: z.object({
        moduleId: z.number(),
        courseId: z.number(),
        name: z.string(),
        activityUrl: z.string(),
        externalurl: z.string().nullable(),
        resolved: z.boolean(),
        source: z
          .enum(["mod_url_get_urls_by_courses", "core_course_get_contents"])
          .nullable(),
        reason: z
          .enum([
            "api_unavailable",
            "not_returned",
            "unsafe_target",
            "ambiguous_target",
          ])
          .nullable(),
      }),
      annotations: READ_ONLY,
      _meta: AUTH_META,
    },
    async ({ moduleId, courseId }) => {
      const client = await getToolClient(source, "moodle_resolve_url");
      const result = await resolveUrl(client, moduleId, courseId);
      return {
        structuredContent: { ...result },
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
