import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import { canRegister, getToolClient } from "../tool-policy.js";
import { readOutputSchema, toolResult } from "../student/result.js";
import { invokeWriteOperation, WRITE_SCOPE } from "../write-api.js";

/**
 * How `moodle_call_api` is gated.
 * - `oauth`: the caller's access token must carry `moodle:write` (HTTP default; fails closed).
 * - `local`: no OAuth layer exists (stdio), and the operator opted in with MOODLE_MCP_ALLOW_WRITE=1.
 * - `disabled`: the tool is not registered.
 */
export type WriteAccess = "oauth" | "local" | "disabled";

export const WRITE_TOOL = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
export const WRITE_AUTH_META = {
  securitySchemes: [{ type: "oauth2", scopes: [WRITE_SCOPE] }],
};

export function registerWriteTools(
  server: McpServer,
  source: MoodleClientSource,
  access: WriteAccess = "oauth",
): void {
  if (access === "disabled" || !canRegister(source, "moodle_call_api")) return;
  server.registerTool(
    "moodle_call_api",
    {
      title: "Moodle Call API",
      description:
        "Call ANY Moodle Web Service function the connected token advertises, including functions that change data: submit or save assignments, post to forums, send messages, update the profile, manage enrolments and more. Requires the moodle:write permission granted on the authorization page. Moodle still enforces the account's own roles. " +
        "Pass functionName and a JSON parameters object using the function's documented field names; nested objects and lists are sent in Moodle's array format. Use moodle_get_api_coverage to list available functions and moodle_read_api for reviewed read-only access. " +
        "Changes are real and often irreversible: confirm intent first, read the current state, then check the result. Functions that issue credentials are blocked. File content must be uploaded in small base64 pieces (core_files_upload), then referenced by draft item ID.",
      inputSchema: z
        .object({
          functionName: z.string().min(3).max(150),
          parameters: z.record(z.string(), z.unknown()).optional(),
        })
        .strict(),
      outputSchema: readOutputSchema,
      annotations: WRITE_TOOL,
      _meta: WRITE_AUTH_META,
    },
    async ({ functionName, parameters }, ctx) => {
      if (
        access === "oauth" &&
        !ctx?.http?.authInfo?.scopes.includes(WRITE_SCOPE)
      )
        throw new Error(
          "This connection was approved for read-only access. Disconnect and reconnect the Moodle connector, then tick “Also allow changes” on the authorization page to enable moodle_call_api.",
        );
      return toolResult(
        await invokeWriteOperation(
          await getToolClient(source, "moodle_call_api"),
          functionName,
          parameters ?? {},
        ),
      );
    },
  );
}
