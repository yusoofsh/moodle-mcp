import type { MoodleClient } from "./moodle-client.js";
import { MoodleApiError } from "./moodle-errors.js";
import {
  packet,
  upstreamWarnings,
  type ReadWarning,
} from "./student/result.js";

type Params = Record<string, string | number | boolean>;

/** OAuth scope that unlocks `moodle_call_api`. Read access is a separate, lower tier. */
export const WRITE_SCOPE = "moodle:write";

/**
 * Functions that mint or reveal a Moodle credential. Everything else the token
 * advertises is callable; these would hand the credential itself to the MCP
 * client, so they stay blocked. `tool_mobile_call_external_functions` is a batch
 * wrapper that would otherwise sidestep this list.
 */
export const BLOCKED_WRITE_FUNCTIONS: ReadonlySet<string> = new Set([
  "tool_mobile_get_autologin_key",
  "tool_mobile_get_tokens_for_qr_login",
  "tool_mobile_call_external_functions",
  "core_calendar_get_calendar_export_token",
]);

const RESERVED = new Set(["wstoken", "wsfunction", "moodlewsrestformat"]);
const NAME = /^[A-Za-z0-9_]{1,64}$/;
const FUNCTION_NAME = /^[a-z][a-z0-9_]{2,149}$/;
const MAX_DEPTH = 8;
const MAX_FIELDS = 2000;
const MAX_PREVIEW_CHARS = 200_000;

/**
 * Moodle's REST server reads nested values as `a[0][b]=1`. Callers send plain
 * JSON; this flattens it and refuses anything that could smuggle a key.
 */
export function flattenParameters(input: Record<string, unknown>): Params {
  const out: Params = {};
  const add = (key: string, value: unknown, depth: number): void => {
    if (value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Invalid number for ${key}`);
      out[key] = value;
    } else if (typeof value === "object") {
      if (depth >= MAX_DEPTH)
        throw new Error("Parameters are nested too deeply");
      const entries: [string, unknown][] = Array.isArray(value)
        ? value.map((item, index) => [String(index), item])
        : Object.entries(value);
      // An empty list or object sends nothing, which Moodle reads as "not given".
      for (const [name, item] of entries) {
        if (!NAME.test(name))
          throw new Error(`Invalid parameter name "${name.slice(0, 40)}"`);
        add(`${key}[${name}]`, item, depth + 1);
      }
    } else {
      throw new Error(`Unsupported value type for ${key}`);
    }
    if (Object.keys(out).length > MAX_FIELDS)
      throw new Error("Too many parameter fields");
  };
  for (const [name, value] of Object.entries(input)) {
    if (!NAME.test(name) || RESERVED.has(name.toLowerCase()))
      throw new Error(`Invalid parameter name "${name.slice(0, 40)}"`);
    add(name, value, 0);
  }
  return out;
}

export interface WriteResult {
  functionName: string;
  result: unknown;
  truncated: boolean;
  preview?: string;
}

/** Calls any Web Service function the token advertises, apart from the blocked credential functions. */
export async function invokeWriteOperation(
  client: MoodleClient,
  functionName: string,
  parameters: Record<string, unknown> = {},
) {
  if (!FUNCTION_NAME.test(functionName))
    throw new Error("Invalid Moodle function name");
  if (BLOCKED_WRITE_FUNCTIONS.has(functionName))
    throw new Error(
      `${functionName} is blocked because it issues or reveals a Moodle credential.`,
    );
  if (!client.supports(functionName))
    throw new Error(
      `${functionName} is not advertised for this Moodle token. Use moodle_get_api_coverage to list the available functions.`,
    );
  const params = flattenParameters(parameters);
  let raw: unknown;
  try {
    raw = await client.call<unknown>(functionName, params);
  } catch (error) {
    if (error instanceof MoodleApiError)
      throw new Error(
        `Moodle rejected ${functionName} (${error.code}): ${client
          .redact(error.message)
          .slice(0, 500)}`,
      );
    throw new Error(
      `Moodle could not run ${functionName}. The change may not have been applied; check before retrying.`,
    );
  }
  const json = client.redact(JSON.stringify(raw ?? null));
  const truncated = json.length > MAX_PREVIEW_CHARS;
  const data: WriteResult = {
    functionName,
    result: truncated ? null : (JSON.parse(json) as unknown),
    truncated,
    ...(truncated ? { preview: json.slice(0, MAX_PREVIEW_CHARS) } : {}),
  };
  const warnings: ReadWarning[] = upstreamWarnings(raw, functionName);
  if (truncated)
    warnings.push({
      code: "RESULT_TRUNCATED",
      message: `The result exceeded ${MAX_PREVIEW_CHARS} characters; only a preview is returned. The call itself completed.`,
      api: functionName,
    });
  return packet(
    data,
    `Moodle accepted ${functionName}. Check "result" and any warnings for what changed.`,
    {},
    warnings,
  );
}
