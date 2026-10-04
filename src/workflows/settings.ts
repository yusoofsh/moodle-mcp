import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { SqlAuthStore } from "../auth/sql-store.js";
import { AUTH_META } from "../tool-policy.js";

export const preferenceDefaults = { daysAhead: 7, minutesPerDay: 45, courseId: 0 };
const fields = z.object({
  daysAhead: z.number().int().min(1).max(30),
  minutesPerDay: z.number().int().min(15).max(240),
  courseId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();
const patchSchema = z.object({ set: fields.partial().refine(value => Object.keys(value).length > 0) }).strict();
export type StudyPreferences = z.infer<typeof fields>;
export type StudyPreferenceStore = ReturnType<typeof studyPreferenceStore>;
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    daysAhead: { type: "integer", title: "Default study window in days", minimum: 1, maximum: 30 },
    minutesPerDay: { type: "integer", title: "Default available minutes per day", minimum: 15, maximum: 240 },
    courseId: { type: "integer", title: "Default course ID", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, description: "0 means a bounded page of enrolled courses. Selecting an ID never grants course access." },
  },
  required: ["daysAhead", "minutesPerDay", "courseId"],
};
function effective(raw: unknown): StudyPreferences {
  if (raw === undefined) return { ...preferenceDefaults };
  if (typeof raw !== "string") throw new Error("Invalid preference storage");
  return fields.parse({ ...preferenceDefaults, ...fields.partial().parse(JSON.parse(raw)) });
}
/** Only the authenticated single-owner HTTP runtime creates this service. */
export function studyPreferenceStore(store: SqlAuthStore, owner: string) {
  if (!owner.trim() || owner.length > 200) throw new Error("Authenticated owner is required");
  const id = store.hash(owner);
  return {
    read(): StudyPreferences {
      try {
        return effective(store.db.prepare("SELECT values_json FROM mcp_study_preferences WHERE owner_id=?").get(id)?.values_json);
      } catch (error) {
        if (error instanceof Error && /no such table: (?:main\.)?mcp_study_preferences\b/.test(error.message)) return { ...preferenceDefaults };
        throw new Error("Study preferences could not be read");
      }
    },
    update(input: unknown): StudyPreferences {
      const patch = patchSchema.parse(input).set;
      store.db.exec("CREATE TABLE IF NOT EXISTS mcp_study_preferences (owner_id TEXT PRIMARY KEY, values_json TEXT NOT NULL DEFAULT '{}')");
      // One synchronous SQLite statement preserves omitted keys across concurrent requests.
      const row = store.db.prepare(`INSERT INTO mcp_study_preferences (owner_id, values_json) VALUES (?, ?)
        ON CONFLICT(owner_id) DO UPDATE SET values_json=json_patch(mcp_study_preferences.values_json, excluded.values_json)
        RETURNING values_json`).get(id, JSON.stringify(patch));
      if (!row) throw new Error("Study preferences could not be saved");
      return effective(row.values_json);
    },
  };
}
export function registerStudySettings(server: McpServer, store: StudyPreferenceStore) {
  const readTool = "moodle_settings_read", updateTool = "moodle_settings_update";
  const before = server.server.getCapabilities();
  server.server.registerCapabilities({ extensions: { ...before.extensions, "openai/settings": { readTool, updateTool } } });
  server.registerTool(readTool, {
    title: "Study preferences", description: "Read local non-secret study preferences. These prefill guided planning choices without accepting them or reading Moodle data.",
    inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ...AUTH_META, ui: { visibility: ["app"] } },
  }, () => {
    try {
      const data = { schema, layout: [{ kind: "group", title: "Guided study planning", items: Object.keys(preferenceDefaults).map(property => ({ kind: "property", property })) }], values: store.read() };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    } catch { return { isError: true, content: [{ type: "text", text: "Preferences are unavailable. Read the current preferences before retrying." }] }; }
  });
  server.registerTool(updateTool, {
    title: "Save study preferences", description: "Persist the supplied local study defaults for the authenticated owner. Omitted fields stay unchanged. This does not submit work, update completion, change Moodle data, or grant access to a course.",
    inputSchema: patchSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ...AUTH_META, ui: { visibility: ["app"] } },
  }, (args) => {
    try {
      const data = { values: store.update(args) };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    } catch { return { isError: true, content: [{ type: "text", text: "Preferences could not be saved. Read the current values before retrying." }] }; }
  });
}
