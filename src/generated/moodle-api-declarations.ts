// Function names/types are reference metadata, not an execution allowlist.
// Source: https://github.com/moodle/moodle/tree/89ae02d0007418c50f0911148137f4cb3bd67f4a (Moodle 4.5 stable).
export const SOURCE_REVISION = "89ae02d0007418c50f0911148137f4cb3bd67f4a";
export const MOODLE_DECLARATIONS: Record<
  string,
  { type: "read" | "write" | "unknown"; source: string }
> = {
  core_admin_set_block_protection: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_admin_set_plugin_order: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_admin_set_plugin_state: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_ai_get_policy_status: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_ai_set_action: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_ai_set_policy_status: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_auth_confirm_user: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_auth_is_age_digital_consent_verification_enabled: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_auth_is_minor: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_auth_request_password_reset: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_auth_resend_confirmation_email: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_backup_get_async_backup_links_backup: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_backup_get_async_backup_links_restore: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_backup_get_async_backup_progress: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_backup_get_copy_progress: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_backup_submit_copy_form: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_badges_disable_badges: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_badges_enable_badges: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_badges_get_badge: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_badges_get_user_badge_by_hash: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_badges_get_user_badges: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_block_fetch_addable_blocks: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_block_get_course_blocks: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_block_get_dashboard_blocks: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_blog_add_entry: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_blog_delete_entry: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_blog_get_access_information: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_blog_get_entries: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_blog_prepare_entry_for_edition: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_blog_update_entry: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_blog_view_entries: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_create_calendar_events: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_calendar_delete_calendar_events: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_calendar_delete_subscription: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_calendar_get_action_events_by_course: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_action_events_by_courses: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_action_events_by_timesort: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_allowed_event_types: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_calendar_access_information: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_calendar_day_view: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_calendar_event_by_id: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_calendar_events: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_calendar_export_token: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_calendar_monthly_view: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_calendar_upcoming_view: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_get_timestamps: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_calendar_submit_create_update_form: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_calendar_update_event_start_day: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_change_editmode: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_check_get_result_admintree: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_cohort_add_cohort_members: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_cohort_create_cohorts: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_cohort_delete_cohort_members: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_cohort_delete_cohorts: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_cohort_get_cohort_members: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_cohort_get_cohorts: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_cohort_search_cohorts: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_cohort_update_cohorts: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_comment_add_comments: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_comment_delete_comments: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_comment_get_comments: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_add_competency_to_course: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_add_competency_to_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_add_competency_to_template: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_add_related_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_approve_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_competency_framework_viewed: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_competency_viewed: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_complete_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_count_competencies: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_count_competencies_in_course: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_count_competencies_in_template: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_count_competency_frameworks: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_count_course_module_competencies: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_count_courses_using_competency: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_count_templates: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_count_templates_using_competency: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_create_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_create_competency_framework: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_create_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_create_template: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_create_user_evidence_competency: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_delete_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_delete_competency_framework: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_delete_evidence: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_delete_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_delete_template: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_delete_user_evidence: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_delete_user_evidence_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_duplicate_competency_framework: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_duplicate_template: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_get_scale_values: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_grade_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_grade_competency_in_course: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_grade_competency_in_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_list_competencies: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_list_competencies_in_template: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_list_competency_frameworks: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_list_course_competencies: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_list_course_module_competencies: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_list_plan_competencies: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_list_templates: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_list_templates_using_competency: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_list_user_plans: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_move_down_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_move_up_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_plan_cancel_review_request: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_plan_request_review: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_plan_start_review: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_plan_stop_review: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_read_competency: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_read_competency_framework: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_read_plan: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_read_template: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_read_user_evidence: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_remove_competency_from_course: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_remove_competency_from_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_remove_competency_from_template: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_remove_related_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_reopen_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_reorder_course_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_reorder_plan_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_reorder_template_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_request_review_of_user_evidence_linked_competencies: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_search_competencies: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_set_course_competency_ruleoutcome: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_set_parent_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_template_has_related_data: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_template_viewed: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_unapprove_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_unlink_plan_from_template: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_update_competency: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_update_competency_framework: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_update_course_competency_settings: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_update_plan: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_update_template: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_user_competency_cancel_review_request: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_user_competency_plan_viewed: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_user_competency_request_review: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_user_competency_start_review: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_user_competency_stop_review: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_competency_user_competency_viewed: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_user_competency_viewed_in_course: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_competency_user_competency_viewed_in_plan: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_completion_get_activities_completion_status: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_completion_get_course_completion_status: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_completion_mark_course_self_completed: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_completion_override_activity_completion_status: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_completion_update_activity_completion_status_manually: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_contentbank_copy_content: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_contentbank_delete_content: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_contentbank_rename_content: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_contentbank_set_content_visibility: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_add_content_item_to_user_favourites: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_check_updates: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_create_categories: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_create_courses: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_delete_categories: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_delete_courses: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_delete_modules: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_duplicate_course: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_edit_module: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_edit_section: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_get_activity_chooser_footer: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_categories: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_contents: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_course_content_items: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_course_module: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_course_module_by_instance: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_courses: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_courses_by_field: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_enrolled_courses_by_timeline_classification: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_enrolled_courses_with_action_events_by_timeline_classification:
    {
      type: "read",
      source: "lib/db/services.php",
    },
  core_course_get_enrolled_users_by_cmid: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_module: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_recent_courses: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_updates_since: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_user_administration_options: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_get_user_navigation_options: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_import_course: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_remove_content_item_from_user_favourites: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_search_courses: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_set_favourite_courses: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_course_toggle_activity_recommendation: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_update_categories: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_update_courses: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_course_view_course: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_courseformat_create_module: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_courseformat_file_handlers: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_courseformat_get_state: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_courseformat_new_module: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_courseformat_update_course: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_create_userfeedback_action_record: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_customfield_create_category: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_customfield_delete_category: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_customfield_delete_field: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_customfield_move_category: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_customfield_move_field: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_customfield_reload_template: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_dynamic_tabs_get_content: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_enrol_get_course_enrolment_methods: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_enrol_get_enrolled_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_enrol_get_enrolled_users_with_capability: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_enrol_get_potential_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_enrol_get_users_courses: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_enrol_search_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_enrol_submit_user_enrolment_form: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_enrol_unenrol_user_enrolment: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_fetch_notifications: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_files_delete_draft_files: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_files_get_files: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_files_get_unused_draft_itemid: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_files_upload: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_filters_get_all_states: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_filters_get_available_in_context: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_form_dynamic_form: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_form_get_filetypes_browser_data: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_get_component_strings: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_get_fragment: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_get_string: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_get_strings: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_get_user_dates: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grades_get_feedback: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grades_get_gradable_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grades_get_grade_tree: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grades_get_gradeitems: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grades_get_groups_for_search_widget: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grades_get_groups_for_selector: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grades_grader_gradingpanel_point_fetch: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_grades_grader_gradingpanel_point_store: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_grades_grader_gradingpanel_scale_fetch: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_grades_grader_gradingpanel_scale_store: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_grades_update_grades: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_grading_get_definitions: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grading_get_gradingform_instances: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_grading_save_definitions: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_add_group_members: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_assign_grouping: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_create_groupings: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_create_groups: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_delete_group_members: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_delete_groupings: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_delete_groups: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_get_activity_allowed_groups: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_get_activity_groupmode: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_get_course_groupings: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_get_course_groups: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_get_course_user_groups: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_get_group_members: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_get_groupings: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_get_groups: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_get_groups_for_selector: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_group_unassign_grouping: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_update_groupings: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_group_update_groups: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_h5p_get_trusted_h5p_file: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_block_user: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_confirm_contact_request: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_create_contact_request: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_data_for_messagearea_search_messages: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_decline_contact_request: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_delete_contacts: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_delete_conversations_by_id: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_delete_message: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_delete_message_for_all_users: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_get_blocked_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_contact_requests: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_conversation: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_conversation_between_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_conversation_counts: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_conversation_members: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_conversation_messages: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_conversations: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_member_info: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_message_processor: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_messages: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_received_contact_requests_count: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_self_conversation: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_unread_conversation_counts: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_unread_conversations_count: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_unread_notification_count: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_user_contacts: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_user_message_preferences: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_get_user_notification_preferences: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_mark_all_conversation_messages_as_read: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_mark_all_notifications_as_read: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_mark_message_read: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_mark_notification_read: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_message_processor_config_form: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_message_search_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_mute_conversations: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_search_contacts: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_message_send_instant_messages: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_send_messages_to_conversation: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_set_favourite_conversations: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_unblock_user: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_unmute_conversations: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_message_unset_favourite_conversations: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_moodlenet_auth_check: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_moodlenet_get_share_info_activity: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_moodlenet_get_shared_course_info: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_moodlenet_send_activity: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_moodlenet_send_course: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_my_view_page: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_notes_create_notes: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_notes_delete_notes: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_notes_get_course_notes: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_notes_get_notes: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_notes_update_notes: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_notes_view_notes: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_output_load_fontawesome_icon_map: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_output_load_fontawesome_icon_system_map: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_output_load_template: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_output_load_template_with_dependencies: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_output_poll_stored_progress: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_payment_get_available_gateways: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_question_get_random_question_summaries: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_question_update_flag: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_rating_add_rating: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_rating_get_item_ratings: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_reportbuilder_audiences_delete: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_can_view_system_report: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_reportbuilder_columns_add: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_columns_delete: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_columns_reorder: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_columns_sort_get: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_reportbuilder_columns_sort_reorder: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_columns_sort_toggle: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_conditions_add: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_conditions_delete: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_conditions_reorder: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_conditions_reset: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_filters_add: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_filters_delete: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_filters_reorder: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_filters_reset: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_list_reports: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_reportbuilder_reports_delete: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_reports_get: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_reportbuilder_retrieve_report: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_reportbuilder_retrieve_system_report: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_reportbuilder_schedules_delete: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_schedules_send: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_schedules_toggle: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_set_filters: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_reportbuilder_view_report: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_role_assign_roles: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_role_unassign_roles: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_search_get_relevant_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_search_get_results: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_search_get_search_areas_list: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_search_get_top_results: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_search_view_results: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_session_time_remaining: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_session_touch: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_sms_set_gateway_status: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_table_get_dynamic_table_content: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_tag_get_tag_areas: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_tag_get_tag_cloud: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_tag_get_tag_collections: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_tag_get_tagindex: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_tag_get_tagindex_per_area: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_tag_get_tags: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_tag_update_tags: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_update_inplace_editable: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_add_user_device: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_add_user_private_files: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_agree_site_policy: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_create_users: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_delete_users: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_get_course_user_profiles: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_user_get_private_files_info: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_user_get_user_preferences: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_user_get_users: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_user_get_users_by_field: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_user_prepare_private_files_for_edition: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_remove_user_device: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_search_identity: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_user_set_user_preferences: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_update_picture: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_update_private_files: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_update_user_device_public_key: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_update_user_preferences: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_update_users: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_view_user_list: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_user_view_user_profile: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_webservice_get_site_info: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_xapi_delete_state: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_xapi_delete_states: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_xapi_get_state: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_xapi_get_states: {
    type: "read",
    source: "lib/db/services.php",
  },
  core_xapi_post_state: {
    type: "write",
    source: "lib/db/services.php",
  },
  core_xapi_statement_post: {
    type: "write",
    source: "lib/db/services.php",
  },
  mod_assign_copy_previous_attempt: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_get_assignments: {
    type: "read",
    source: "mod/assign/db/services.php",
  },
  mod_assign_get_grades: {
    type: "read",
    source: "mod/assign/db/services.php",
  },
  mod_assign_get_participant: {
    type: "read",
    source: "mod/assign/db/services.php",
  },
  mod_assign_get_submission_status: {
    type: "read",
    source: "mod/assign/db/services.php",
  },
  mod_assign_get_submissions: {
    type: "read",
    source: "mod/assign/db/services.php",
  },
  mod_assign_get_user_flags: {
    type: "read",
    source: "mod/assign/db/services.php",
  },
  mod_assign_get_user_mappings: {
    type: "read",
    source: "mod/assign/db/services.php",
  },
  mod_assign_list_participants: {
    type: "read",
    source: "mod/assign/db/services.php",
  },
  mod_assign_lock_submissions: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_remove_submission: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_reveal_identities: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_revert_submissions_to_draft: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_save_grade: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_save_grades: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_save_submission: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_save_user_extensions: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_set_user_flags: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_start_submission: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_submit_for_grading: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_submit_grading_form: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_unlock_submissions: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_view_assign: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_view_grading_table: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_assign_view_submission_status: {
    type: "write",
    source: "mod/assign/db/services.php",
  },
  mod_bigbluebuttonbn_can_join: {
    type: "read",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_completion_validate: {
    type: "write",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_end_meeting: {
    type: "write",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses: {
    type: "read",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_get_join_url: {
    type: "write",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_get_recordings: {
    type: "read",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_get_recordings_to_import: {
    type: "read",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_meeting_info: {
    type: "read",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_update_recording: {
    type: "write",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_bigbluebuttonbn_view_bigbluebuttonbn: {
    type: "write",
    source: "mod/bigbluebuttonbn/db/services.php",
  },
  mod_book_get_books_by_courses: {
    type: "read",
    source: "mod/book/db/services.php",
  },
  mod_book_view_book: {
    type: "write",
    source: "mod/book/db/services.php",
  },
  mod_chat_get_chat_latest_messages: {
    type: "read",
    source: "mod/chat/db/services.php",
  },
  mod_chat_get_chat_users: {
    type: "read",
    source: "mod/chat/db/services.php",
  },
  mod_chat_get_chats_by_courses: {
    type: "read",
    source: "mod/chat/db/services.php",
  },
  mod_chat_get_session_messages: {
    type: "read",
    source: "mod/chat/db/services.php",
  },
  mod_chat_get_sessions: {
    type: "read",
    source: "mod/chat/db/services.php",
  },
  mod_chat_login_user: {
    type: "write",
    source: "mod/chat/db/services.php",
  },
  mod_chat_send_chat_message: {
    type: "write",
    source: "mod/chat/db/services.php",
  },
  mod_chat_view_chat: {
    type: "write",
    source: "mod/chat/db/services.php",
  },
  mod_chat_view_sessions: {
    type: "write",
    source: "mod/chat/db/services.php",
  },
  mod_choice_delete_choice_responses: {
    type: "write",
    source: "mod/choice/db/services.php",
  },
  mod_choice_get_choice_options: {
    type: "read",
    source: "mod/choice/db/services.php",
  },
  mod_choice_get_choice_results: {
    type: "read",
    source: "mod/choice/db/services.php",
  },
  mod_choice_get_choices_by_courses: {
    type: "read",
    source: "mod/choice/db/services.php",
  },
  mod_choice_submit_choice_response: {
    type: "write",
    source: "mod/choice/db/services.php",
  },
  mod_choice_view_choice: {
    type: "write",
    source: "mod/choice/db/services.php",
  },
  mod_data_add_entry: {
    type: "write",
    source: "mod/data/db/services.php",
  },
  mod_data_approve_entry: {
    type: "write",
    source: "mod/data/db/services.php",
  },
  mod_data_delete_entry: {
    type: "write",
    source: "mod/data/db/services.php",
  },
  mod_data_delete_saved_preset: {
    type: "write",
    source: "mod/data/db/services.php",
  },
  mod_data_get_data_access_information: {
    type: "read",
    source: "mod/data/db/services.php",
  },
  mod_data_get_databases_by_courses: {
    type: "read",
    source: "mod/data/db/services.php",
  },
  mod_data_get_entries: {
    type: "read",
    source: "mod/data/db/services.php",
  },
  mod_data_get_entry: {
    type: "read",
    source: "mod/data/db/services.php",
  },
  mod_data_get_fields: {
    type: "read",
    source: "mod/data/db/services.php",
  },
  mod_data_get_mapping_information: {
    type: "read",
    source: "mod/data/db/services.php",
  },
  mod_data_search_entries: {
    type: "read",
    source: "mod/data/db/services.php",
  },
  mod_data_update_entry: {
    type: "write",
    source: "mod/data/db/services.php",
  },
  mod_data_view_database: {
    type: "write",
    source: "mod/data/db/services.php",
  },
  mod_feedback_get_analysis: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_current_completed_tmp: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_feedback_access_information: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_feedbacks_by_courses: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_finished_responses: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_items: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_last_completed: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_non_respondents: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_page_items: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_responses_analysis: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_get_unfinished_responses: {
    type: "read",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_launch_feedback: {
    type: "write",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_process_page: {
    type: "write",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_questions_reorder: {
    type: "write",
    source: "mod/feedback/db/services.php",
  },
  mod_feedback_view_feedback: {
    type: "write",
    source: "mod/feedback/db/services.php",
  },
  mod_folder_get_folders_by_courses: {
    type: "read",
    source: "mod/folder/db/services.php",
  },
  mod_folder_view_folder: {
    type: "write",
    source: "mod/folder/db/services.php",
  },
  mod_forum_add_discussion: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_add_discussion_post: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_can_add_discussion: {
    type: "read",
    source: "mod/forum/db/services.php",
  },
  mod_forum_delete_post: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_get_discussion_post: {
    type: "read",
    source: "mod/forum/db/services.php",
  },
  mod_forum_get_discussion_posts: {
    type: "read",
    source: "mod/forum/db/services.php",
  },
  mod_forum_get_discussion_posts_by_userid: {
    type: "read",
    source: "mod/forum/db/services.php",
  },
  mod_forum_get_forum_access_information: {
    type: "read",
    source: "mod/forum/db/services.php",
  },
  mod_forum_get_forum_discussions: {
    type: "read",
    source: "mod/forum/db/services.php",
  },
  mod_forum_get_forums_by_courses: {
    type: "read",
    source: "mod/forum/db/services.php",
  },
  mod_forum_prepare_draft_area_for_post: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_set_lock_state: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_set_pin_state: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_set_subscription_state: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_toggle_favourite_state: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_update_discussion_post: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_view_forum: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_forum_view_forum_discussion: {
    type: "write",
    source: "mod/forum/db/services.php",
  },
  mod_glossary_add_entry: {
    type: "write",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_delete_entry: {
    type: "write",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_authors: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_categories: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entries_by_author: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entries_by_author_id: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entries_by_category: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entries_by_date: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entries_by_letter: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entries_by_search: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entries_by_term: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entries_to_approve: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_entry_by_id: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_get_glossaries_by_courses: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_prepare_entry_for_edition: {
    type: "read",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_update_entry: {
    type: "write",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_view_entry: {
    type: "write",
    source: "mod/glossary/db/services.php",
  },
  mod_glossary_view_glossary: {
    type: "write",
    source: "mod/glossary/db/services.php",
  },
  mod_h5pactivity_get_attempts: {
    type: "read",
    source: "mod/h5pactivity/db/services.php",
  },
  mod_h5pactivity_get_h5pactivities_by_courses: {
    type: "read",
    source: "mod/h5pactivity/db/services.php",
  },
  mod_h5pactivity_get_h5pactivity_access_information: {
    type: "read",
    source: "mod/h5pactivity/db/services.php",
  },
  mod_h5pactivity_get_results: {
    type: "read",
    source: "mod/h5pactivity/db/services.php",
  },
  mod_h5pactivity_get_user_attempts: {
    type: "read",
    source: "mod/h5pactivity/db/services.php",
  },
  mod_h5pactivity_log_report_viewed: {
    type: "write",
    source: "mod/h5pactivity/db/services.php",
  },
  mod_h5pactivity_view_h5pactivity: {
    type: "write",
    source: "mod/h5pactivity/db/services.php",
  },
  mod_imscp_get_imscps_by_courses: {
    type: "read",
    source: "mod/imscp/db/services.php",
  },
  mod_imscp_view_imscp: {
    type: "write",
    source: "mod/imscp/db/services.php",
  },
  mod_label_get_labels_by_courses: {
    type: "read",
    source: "mod/label/db/services.php",
  },
  mod_lesson_finish_attempt: {
    type: "write",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_attempts_overview: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_content_pages_viewed: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_lesson: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_lesson_access_information: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_lessons_by_courses: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_page_data: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_pages: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_pages_possible_jumps: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_questions_attempts: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_user_attempt: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_user_attempt_grade: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_user_grade: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_get_user_timers: {
    type: "read",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_launch_attempt: {
    type: "write",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_process_page: {
    type: "write",
    source: "mod/lesson/db/services.php",
  },
  mod_lesson_view_lesson: {
    type: "write",
    source: "mod/lesson/db/services.php",
  },
  mod_lti_create_tool_proxy: {
    type: "write",
    source: "mod/lti/db/services.php",
  },
  mod_lti_create_tool_type: {
    type: "write",
    source: "mod/lti/db/services.php",
  },
  mod_lti_delete_course_tool_type: {
    type: "write",
    source: "mod/lti/db/services.php",
  },
  mod_lti_delete_tool_proxy: {
    type: "write",
    source: "mod/lti/db/services.php",
  },
  mod_lti_delete_tool_type: {
    type: "write",
    source: "mod/lti/db/services.php",
  },
  mod_lti_get_ltis_by_courses: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_lti_get_tool_launch_data: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_lti_get_tool_proxies: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_lti_get_tool_proxy_registration_request: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_lti_get_tool_types: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_lti_get_tool_types_and_proxies: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_lti_get_tool_types_and_proxies_count: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_lti_is_cartridge: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_lti_toggle_showinactivitychooser: {
    type: "write",
    source: "mod/lti/db/services.php",
  },
  mod_lti_update_tool_type: {
    type: "write",
    source: "mod/lti/db/services.php",
  },
  mod_lti_view_lti: {
    type: "read",
    source: "mod/lti/db/services.php",
  },
  mod_page_get_pages_by_courses: {
    type: "read",
    source: "mod/page/db/services.php",
  },
  mod_page_view_page: {
    type: "write",
    source: "mod/page/db/services.php",
  },
  mod_quiz_add_random_questions: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_create_grade_item_per_section: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_create_grade_items: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_delete_grade_items: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_delete_overrides: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_attempt_access_information: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_attempt_data: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_attempt_review: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_attempt_summary: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_combined_review_options: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_edit_grading_page_data: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_overrides: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_quiz_access_information: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_quiz_feedback_for_grade: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_quiz_required_qtypes: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_quizzes_by_courses: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_reopen_attempt_confirmation: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_user_attempts: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_get_user_best_grade: {
    type: "read",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_process_attempt: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_reopen_attempt: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_save_attempt: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_save_overrides: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_set_question_version: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_start_attempt: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_update_filter_condition: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_update_grade_items: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_update_slots: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_view_attempt: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_view_attempt_review: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_view_attempt_summary: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_quiz_view_quiz: {
    type: "write",
    source: "mod/quiz/db/services.php",
  },
  mod_resource_get_resources_by_courses: {
    type: "read",
    source: "mod/resource/db/services.php",
  },
  mod_resource_view_resource: {
    type: "write",
    source: "mod/resource/db/services.php",
  },
  mod_scorm_get_scorm_access_information: {
    type: "read",
    source: "mod/scorm/db/services.php",
  },
  mod_scorm_get_scorm_attempt_count: {
    type: "read",
    source: "mod/scorm/db/services.php",
  },
  mod_scorm_get_scorm_sco_tracks: {
    type: "read",
    source: "mod/scorm/db/services.php",
  },
  mod_scorm_get_scorm_scoes: {
    type: "read",
    source: "mod/scorm/db/services.php",
  },
  mod_scorm_get_scorm_user_data: {
    type: "read",
    source: "mod/scorm/db/services.php",
  },
  mod_scorm_get_scorms_by_courses: {
    type: "read",
    source: "mod/scorm/db/services.php",
  },
  mod_scorm_insert_scorm_tracks: {
    type: "write",
    source: "mod/scorm/db/services.php",
  },
  mod_scorm_launch_sco: {
    type: "write",
    source: "mod/scorm/db/services.php",
  },
  mod_scorm_view_scorm: {
    type: "write",
    source: "mod/scorm/db/services.php",
  },
  mod_survey_get_questions: {
    type: "read",
    source: "mod/survey/db/services.php",
  },
  mod_survey_get_surveys_by_courses: {
    type: "read",
    source: "mod/survey/db/services.php",
  },
  mod_survey_submit_answers: {
    type: "write",
    source: "mod/survey/db/services.php",
  },
  mod_survey_view_survey: {
    type: "write",
    source: "mod/survey/db/services.php",
  },
  mod_url_get_urls_by_courses: {
    type: "read",
    source: "mod/url/db/services.php",
  },
  mod_url_view_url: {
    type: "write",
    source: "mod/url/db/services.php",
  },
  mod_wiki_edit_page: {
    type: "write",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_get_page_contents: {
    type: "read",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_get_page_for_editing: {
    type: "write",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_get_subwiki_files: {
    type: "read",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_get_subwiki_pages: {
    type: "read",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_get_subwikis: {
    type: "read",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_get_wikis_by_courses: {
    type: "read",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_new_page: {
    type: "write",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_view_page: {
    type: "write",
    source: "mod/wiki/db/services.php",
  },
  mod_wiki_view_wiki: {
    type: "write",
    source: "mod/wiki/db/services.php",
  },
  mod_workshop_add_submission: {
    type: "write",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_delete_submission: {
    type: "write",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_evaluate_assessment: {
    type: "write",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_evaluate_submission: {
    type: "write",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_assessment: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_assessment_form_definition: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_grades: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_grades_report: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_reviewer_assessments: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_submission: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_submission_assessments: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_submissions: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_user_plan: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_workshop_access_information: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_get_workshops_by_courses: {
    type: "read",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_update_assessment: {
    type: "write",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_update_submission: {
    type: "write",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_view_submission: {
    type: "write",
    source: "mod/workshop/db/services.php",
  },
  mod_workshop_view_workshop: {
    type: "write",
    source: "mod/workshop/db/services.php",
  },
};
