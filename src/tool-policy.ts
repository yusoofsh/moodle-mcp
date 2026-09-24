import type { MoodleClient } from "./moodle-client.js";
import {
  resolveMoodleClient,
  type MoodleClientSource,
} from "./moodle-source.js";
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
export const AUTH_META = {
  securitySchemes: [{ type: "oauth2", scopes: ["moodle:read"] }],
};
export const TOOL_FUNCTIONS: Record<string, readonly string[]> = {
  moodle_get_site_info: [],
  moodle_list_courses: ["core_enrol_get_users_courses"],
  moodle_get_course: ["core_course_get_contents"],
  moodle_list_resources: ["core_course_get_contents"],
  moodle_download_file: ["core_course_get_contents"],
  moodle_list_assignments: [
    "core_course_get_contents",
    "mod_assign_get_assignments",
  ],
  moodle_get_assignment: ["mod_assign_get_submission_status"],
  moodle_get_grades: ["gradereport_user_get_grade_items"],
  moodle_get_calendar_events: ["core_calendar_get_action_events_by_timesort"],
  moodle_list_quizzes: [
    "core_course_get_contents",
    "mod_quiz_get_quizzes_by_courses",
  ],
  moodle_get_quiz_attempts: ["mod_quiz_get_user_attempts"],
  moodle_list_forums: ["core_course_get_contents"],
  moodle_get_forum_discussions: ["mod_forum_get_forum_discussions"],
  moodle_get_notifications: ["message_popup_get_popup_notifications"],
};
export function canRegister(client: MoodleClientSource, name: string): boolean {
  const required = Object.hasOwn(TOOL_FUNCTIONS, name)
    ? TOOL_FUNCTIONS[name]
    : undefined;
  return (
    required !== undefined &&
    (typeof client === "function" ||
      required.every((fn) => client.supports(fn)))
  );
}

/** Catalog entries are static for remote clients; capability checks are per call. */
export async function getToolClient(
  source: MoodleClientSource,
  name: string,
): Promise<MoodleClient> {
  const required = Object.hasOwn(TOOL_FUNCTIONS, name)
    ? TOOL_FUNCTIONS[name]
    : undefined;
  if (!required) throw new Error("Unknown Moodle tool");
  const client = await resolveMoodleClient(source);
  const missing = required.filter((fn) => !client.supports(fn));
  if (missing.length)
    throw new Error(
      `This Moodle token does not advertise the required Web Service functions: ${missing.join(", ")}. Check the token's service permissions; the tool catalog does not grant additional access.`,
    );
  return client;
}
