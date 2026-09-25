import { z } from "zod";
import type { MoodleClient } from "../moodle-client.js";
import { MoodleApiError } from "../moodle-errors.js";

export const readStates = [
  "available",
  "not_advertised",
  "unknown",
  "forbidden",
  "unauthenticated",
  "not_configured",
  "not_supported",
  "not_requested",
  "invalid_response",
  "unavailable",
] as const;
export type ReadState = (typeof readStates)[number];
export interface ReadWarning {
  code: string;
  message: string;
  api?: string;
  cmid?: number;
}
export interface PageOptions {
  offset?: number;
  limit?: number;
}
export interface Pagination {
  mode: "local";
  offset: number;
  limit: number;
  total: number;
  nextOffset: number | null;
}
export interface ReadPacket<T> {
  schemaVersion: 1;
  data: T;
  capabilities: Record<string, ReadState>;
  pagination: Pagination | null;
  warnings: ReadWarning[];
  text: string;
}
export const idSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export const pageShape = {
  offset: z.number().int().min(0).max(1000000).optional(),
  limit: z.number().int().min(1).max(250).optional(),
};
export const readOutputSchema = z.object({
  schemaVersion: z.literal(1),
  data: z.record(z.string(), z.unknown()),
  capabilities: z.record(z.string(), z.enum(readStates)),
  pagination: z
    .object({
      mode: z.literal("local"),
      offset: z.number(),
      limit: z.number(),
      total: z.number(),
      nextOffset: z.number().nullable(),
    })
    .nullable(),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      api: z.string().optional(),
      cmid: z.number().optional(),
    }),
  ),
  text: z.string(),
});
export function pageOf<T>(items: T[], options: PageOptions = {}) {
  const offset = options.offset ?? 0,
    limit = options.limit ?? 100;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 250
  )
    throw new Error("Invalid pagination.");
  return {
    items: items.slice(offset, offset + limit),
    pagination: {
      mode: "local" as const,
      offset,
      limit,
      total: items.length,
      nextOffset: offset + limit < items.length ? offset + limit : null,
    },
  };
}
export function packet<T>(
  data: T,
  text: string,
  capabilities: Record<string, ReadState> = {},
  warnings: ReadWarning[] = [],
  pagination: Pagination | null = null,
): ReadPacket<T> {
  return { schemaVersion: 1, data, capabilities, pagination, warnings, text };
}
export function toolResult<T>(result: ReadPacket<T>) {
  return {
    structuredContent: { ...result },
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}
export const flagSchema = z.union([z.boolean(), z.literal(0), z.literal(1)]);
export function flag(value: unknown): boolean | null {
  return value === true || value === 1
    ? true
    : value === false || value === 0
      ? false
      : null;
}
export function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}
export function unix(value: unknown): number | null {
  const n = integer(value);
  return n !== null && n > 0 && n <= 8640000000000 ? n : null;
}
export function iso(value: unknown): string | null {
  const n = unix(value);
  return n === null ? null : new Date(n * 1000).toISOString();
}
export function singleLine(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}
export function warning(
  code: string,
  message: string,
  api?: string,
  cmid?: number,
): ReadWarning {
  return { code, message, ...(api ? { api } : {}), ...(cmid ? { cmid } : {}) };
}
const statesByCode: Record<string, ReadState> = {
  invalidtoken: "unauthenticated",
  expiredtoken: "unauthenticated",
  nopermissions: "forbidden",
  required_capability_exception: "forbidden",
  accessexception: "forbidden",
  accessdenied: "forbidden",
  cannotviewreport: "forbidden",
  notenroled: "forbidden",
  usernotenroled: "forbidden",
  nocriteriaset: "not_configured",
  completionnotenabled: "not_configured",
  webservicesnotenabled: "not_supported",
  wsfunctionnotavailable: "not_supported",
  servicenotavailable: "not_supported",
};
export function failureState(error: unknown): ReadState {
  return error instanceof MoodleApiError
    ? (statesByCode[error.code] ?? "unavailable")
    : "unavailable";
}
export function reportedState(client: MoodleClient, api: string): ReadState {
  return client.supports(api)
    ? "available"
    : client.profile?.functions === undefined
      ? "unknown"
      : "not_advertised";
}
export function upstreamWarnings(raw: unknown, api: string): ReadWarning[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("warnings" in raw) ||
    !Array.isArray(raw.warnings) ||
    raw.warnings.length === 0
  )
    return [];
  // Plugin error messages can contain credentials or other users' data. Do not reflect them.
  return [
    warning(
      "UPSTREAM_WARNING",
      `Moodle returned ${raw.warnings.length} warning(s); the result may be incomplete.`,
      api,
    ),
  ];
}
export async function readApi<T>(
  client: MoodleClient,
  api: string,
  params: Record<string, string | number | boolean>,
  schema: z.ZodType<T>,
): Promise<{ state: ReadState; value: T | null; warnings: ReadWarning[] }> {
  const advertised = reportedState(client, api);
  if (advertised !== "available")
    return {
      state: advertised,
      value: null,
      warnings: [
        warning(
          "API_NOT_ADVERTISED",
          advertised === "unknown"
            ? "Moodle did not report this API; it was not called."
            : "The current token does not advertise this API; it was not called.",
          api,
        ),
      ],
    };
  try {
    const raw: unknown = await client.call(api, params);
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      return {
        state: "invalid_response",
        value: null,
        warnings: [
          warning(
            "INVALID_RESPONSE",
            "Moodle returned an unexpected response shape. No missing values were converted into success or zero.",
            api,
          ),
        ],
      };
    return {
      state: "available",
      value: parsed.data,
      warnings: upstreamWarnings(raw, api),
    };
  } catch (error) {
    const state = failureState(error);
    return {
      state,
      value: null,
      warnings: [
        warning(
          "READ_" + state.toUpperCase(),
          "Moodle could not provide this read result (" +
            state +
            "). Permission, configuration, or connectivity may need attention.",
          api,
        ),
      ],
    };
  }
}
