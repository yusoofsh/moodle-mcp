# Workflow runtime

`moodle_plan_study` is a read-only guided planner. Missing course/time choices produce a real multi-round elicitation request. Decline/cancel or malformed choices do not read Moodle. Accepted choices use the existing task adapter and permission checks. Suggested focus blocks are not completion-time estimates or a guarantee of meeting deadlines. The result retains observed submission state, partial coverage and returned task-page cursors. Read-only credentials do not gain submission or completion-write permissions.

The Skills extension exposes two bounded manifests through `skills/list`, `skills/get` and exact `resources/read` URIs. Each manifest includes the SHA-256 digest of its UTF-8 SKILL.md bytes. The same content is exported to the repository's `skills/` directories. OpenAI skill imports are submission-time snapshots; deploying a changed manifest is not proof that an installed snapshot refreshed.

Course manifests and individual activity resources use `moodle://study-manifest/{courseId}` and `moodle://activity/{courseId}/{cmid}`. Access and visibility are rechecked on every read. Manifests show at most 50 entries and report omitted counts. Dynamic reads are private with zero freshness lifetime. They are fresh authorized views, not immutable snapshots. Resource lifetime hints never substitute for authorization.

Study Hub accepts validated app-relative `/course/<id>` deep links. It never fetches a supplied external URL. Hosts without deep links retain the ordinary UI. File and deep-link support varies by host; Android must not depend on desktop-only features.

This release does not add durable tasks, service-account credentials, native persistent plugin settings, stream-based resource subscriptions or event replay. Those have separate authorization, storage or runtime acceptance gates. No production callback or machine identity is invented. WAMCP remains out of scope.
