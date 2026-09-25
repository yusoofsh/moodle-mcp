import type { MoodleClient } from "./moodle-client.js";
import {
  resolveMoodleClient,
  type MoodleClientSource,
} from "./moodle-source.js";
import { READ_OPERATIONS } from "./student/safe-api.js";
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
export const AUTH_META = {
  securitySchemes: [{ type: "oauth2", scopes: ["moodle:read"] }],
};
/** The complete static catalog; importing tool handlers must not be needed to count policies. */
export const TOOL_FUNCTIONS: Record<string, readonly string[]> = {
  moodle_get_site_info: [],
  moodle_list_courses: ["core_enrol_get_users_courses"],
  moodle_get_course: ["core_course_get_contents"],
  moodle_list_resources: ["core_course_get_contents"],
  moodle_resolve_url: ["core_course_get_contents"],
  moodle_read_document: ["core_course_get_contents"],
  moodle_download_file: ["core_course_get_contents"],
  moodle_list_assignments: ["core_course_get_contents"],
  moodle_get_assignment: ["mod_assign_get_submission_status"],
  moodle_get_grades: ["gradereport_user_get_grade_items"],
  moodle_get_calendar_events: [],
  moodle_list_quizzes: [
    "core_course_get_contents",
    "mod_quiz_get_quizzes_by_courses",
  ],
  moodle_get_quiz_attempts: ["mod_quiz_get_user_attempts"],
  moodle_get_quiz_review: ["core_course_get_contents"],
  moodle_list_forums: ["core_course_get_contents"],
  moodle_get_forum_discussions: ["mod_forum_get_forum_discussions"],
  moodle_get_activity_completion: ["core_course_get_contents"],
  moodle_get_course_completion: ["core_course_get_contents"],
  moodle_get_resource: ["core_course_get_contents"],
  moodle_get_forum_thread: ["core_course_get_contents"],
  moodle_get_dashboard: ["core_enrol_get_users_courses"],
  moodle_get_attendance: ["core_course_get_contents"],
  moodle_get_notifications: ["message_popup_get_popup_notifications"],
  moodle_read_api: [],
  moodle_get_api_coverage: [],
  moodle_get_tasks: ["core_course_get_contents"],
  moodle_search_materials: ["core_course_get_contents"],
  moodle_get_briefing: ["core_course_get_contents"],
  moodle_get_recent_activity: ["core_course_get_contents"],
  moodle_get_assignment_details: ["core_course_get_contents"],
  moodle_get_grades_overview: [],
};
export const TOOL_CATALOG_VERSION = "0.10.1";
export const TOOL_OPTIONAL_FUNCTIONS: Record<string, readonly string[]> = {
  moodle_get_resource: ["core_course_get_course_module"],
  moodle_get_forum_thread: [
    "mod_forum_get_discussion_posts",
    "mod_forum_get_forums_by_courses",
  ],
  moodle_list_forums: ["mod_forum_get_forums_by_courses"],
  moodle_get_calendar_events: [
    "core_calendar_get_action_events_by_timesort",
    "core_calendar_get_action_events_by_course",
  ],
  moodle_get_dashboard: [
    "core_course_get_contents",
    "core_calendar_get_action_events_by_timesort",
  ],
  moodle_list_assignments: ["mod_assign_get_assignments"],
  moodle_get_activity_completion: [
    "core_completion_get_activities_completion_status",
  ],
  moodle_get_course_completion: [
    "core_completion_get_course_completion_status",
  ],
  moodle_get_attendance: [
    "mod_attendance_get_sessions",
    "core_course_get_course_module",
  ],
  moodle_resolve_url: [
    "mod_url_get_urls_by_courses",
    "core_course_get_course_module",
  ],
  moodle_list_resources: ["mod_url_get_urls_by_courses"],
  moodle_get_quiz_review: [
    "mod_quiz_get_user_attempts",
    "mod_quiz_get_attempt_review",
  ],
  moodle_read_api: Object.keys(READ_OPERATIONS),
  moodle_get_tasks: [
    "core_enrol_get_users_courses",
    "mod_assign_get_assignments",
    "mod_assign_get_submission_status",
  ],
  moodle_search_materials: ["core_enrol_get_users_courses"],
  moodle_get_briefing: [
    "core_enrol_get_users_courses",
    "mod_assign_get_assignments",
    "mod_assign_get_submission_status",
    "core_calendar_get_action_events_by_timesort",
    "gradereport_overview_get_course_grades",
  ],
  moodle_get_recent_activity: [
    "core_enrol_get_users_courses",
    "core_course_get_updates_since",
  ],
  moodle_get_assignment_details: ["mod_assign_get_assignments"],
  moodle_get_grades_overview: ["gradereport_overview_get_course_grades"],
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
