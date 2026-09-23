import type { MoodleClient } from "./moodle-client.js";
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
export function canRegister(client: MoodleClient, name: string): boolean {
  const required = TOOL_FUNCTIONS[name];
  return required !== undefined && required.every((fn) => client.supports(fn));
}
