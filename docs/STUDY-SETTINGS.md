# Study preferences

The authenticated HTTP runtime exposes native settings for a preferred study window, available minutes and course ID. These settings prefill the guided planner's next form. They never accept a form, read a course or submit coursework automatically. Cancellation does not read preferences or Moodle data. Explicit arguments take precedence over saved suggestions.

The local update tool changes only plugin preferences. It retains the existing authentication middleware and does not add Moodle write permission. A configured course ID does not grant access: the existing task adapter checks access when the user accepts the plan. The stdio catalog is unchanged because it has no authenticated preference store.

Preferences persist in the existing SQLite storage domain for the configured owner. The owner is hashed, never accepted from input. Reads create no table or default record. Each update atomically applies only the provided scalar fields through SQLite JSON merge and returns the committed values. Rollback leaves an additive preference table without changing OAuth records or Moodle data.

The OpenAI native settings schema returns every effective value and accepts only a bounded nonempty patch. No credentials, URLs or callback settings are exposed. Hosts without this UI retain ordinary settings tools and the guided planner. Real host rendering remains distinct from fixture and Worker build checks.
