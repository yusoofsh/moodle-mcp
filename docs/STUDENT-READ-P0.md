# Student read correctness, completion and Attendance (0.8.1)

Baseline: `ef150cb69515478a4eb109de023c378aaf121b17`. This release implements the
first P0 student-read increment. It is not student-complete, does not enable any
write operation, and does not claim to solve every gap in the feature audit.

## Assignment correctness

Moodle 4.5 `mod_assign_get_assignments` returns `id`, `cmid`, and `course`; the old
join used `coursemodule`. The reader now selects the requested course by ID, joins
visible modules by `cmid`, and cross-checks instance IDs when available. Duplicate,
wrong-course, malformed, hidden or missing rows cannot become fabricated details.
The visible inventory remains available if the optional assignment API fails.

The list separates `assignmentId` (instance) and `cmid` (course-module), reports
Unix seconds plus ISO UTC dates, and distinguishes `dueDateState` known/none/unknown.
Grades distinguish numeric points, a negative Moodle scale identifier, and no
grade. Moodle's effective course/group dates are preserved; individual extensions
come from the separate status operation, not a made-up list override.

`moodle_get_assignment` calls submission status with the authenticated account's
`userid`. It supports team submissions, keeps missing status and grade unknown,
retains grade zero, and reports released feedback, locks, extension dates and
`canEditInMoodle`/`canSubmitInMoodle`. `bridgeCanSubmit` is always false. Identity
mismatches withhold submission and feedback rather than expose another student.

## New tools and examples

```text
moodle_get_activity_completion({"courseId":5411,"offset":0,"limit":100})
moodle_get_course_completion({"courseId":5411})
moodle_get_attendance({"courseId":5411})
```

Use a `cmid` returned in the Attendance inventory to request one module's sessions:
`moodle_get_attendance({courseId, moduleId: cmid})`. This does not take attendance.
All three tool schemas are strict and reject another `userId` or write parameters.

Activity completion joins current visible modules with the optional
`core_completion_get_activities_completion_status` result for the current student.
It can use completion fields independently returned by authorized course contents
when that API is unavailable. Every item records the source, tracking mode, raw
state (0 incomplete, 1 complete, 2 pass, 3 fail), explicit overall-complete flag
when provided, timestamp, and rules. Not-tracked and unknown are not incomplete.
A failed state is never called a pass. Explicit `isoverallcomplete` overrides the
simple numeric-state fallback.

The activity summary is limited to currently visible tracked modules, including
explicit unknown counters. It returns no percentage when required state/tracking
is unknown, and is NOT the course-completion decision or all hidden activities.
`moodle_get_course_completion` reports Moodle's own criteria/aggregation separately.
Disabled/no-criteria, forbidden, malformed and unavailable results retain null
`completed` and `criteria`, never a false completion decision.

## Attendance feasibility and safety

The upstream Attendance plugin's `MOODLE_405_STABLE` `get_sessions` and `get_session`
require manage/take/change attendance capabilities. Advertisement by a token does
not prove the account can call them in a selected module. Without a selected
module, this tool only inventories current visible Attendance activities and the
session API's advertisement state. With a module, it resolves the instance within
the same course, calls only an advertised `mod_attendance_get_sessions`, validates
returned course/instance context and exposes only the authenticated student's log.

If the current student is missing from both the log and eligible user list, the
status is unknown, not absent. `not_recorded` is not a judgement of absence. The
raw collection of other students is not included in output. `sessions:null` means
unavailable/not requested; an empty array represents a returned empty filtered list,
with warnings if records were excluded. The plugin's ambiguous `invalidparameter`
error is not falsely classified as proof of permission denial or absence.

**Never use the mobile display handler as a read fallback.** In upstream
`classes/output/mobile.php`, `mobile_view_activity` calls `take_from_student` when
an eligible session is configured for auto-assign and no student password is set.
No such handler, `tool_mobile_get_content`, mark/update API, QR scan or attendance
password operation is invoked here. This restriction preserves the read-only
promise even where the official mobile application can access more functionality.
The installed SiberMu plugin version is not inferred from Moodle core version.

## JSON contract and compatibility

Eight migrated tools: site information, course list/detail, assignment list/detail,
activity completion, course completion, and Attendance. Each declares a specific
Zod output schema under the shared envelope:

```json
{
  "schemaVersion": 1,
  "data": {},
  "capabilities": {},
  "pagination": null,
  "warnings": [],
  "text": "Readable rendering of the same data"
}
```

The envelope is `structuredContent`; equivalent JSON is in `content[0].text` for
text-only gateways. The embedded `text` field retains a human-readable rendering
for gateways that prefer structuredContent. Clients that parsed the former Markdown
as a data contract should instead consume `data` and check `schemaVersion`.
Other legacy tools retain their previous output contracts in this increment.

Possible read states: available, not_advertised, unknown, forbidden, unauthenticated,
not_configured, not_supported, not_requested, invalid_response, unavailable.
Site-info advertisement does not prove per-context permission: the tool catalog
explicitly marks permission checks as not performed. Site-info invocation refreshes
the current API list without silently switching Moodle accounts.

List `offset` defaults to 0 and `limit` to 100 (maximum 250). Pagination is labelled
`mode:local`: the bounded upstream response is fetched, then the output is sliced.
`total` and `nextOffset` are returned. This is not a claim of upstream pagination or
a stable snapshot across separate requests. Existing HTTP/download/memory caps remain.

The manifest, runtime registry, policy tool list and version are tested together.
The backend advertises 18 read-only tools. A stale ChatGPT/Composio registry still
needs client-side schema refresh; backend deployment cannot force that cache.
Existing course and site-info tools expose completion fields and diagnostics even
when a cached connector does not yet publish the new standalone tools.

## Tests and remaining scope

Regression coverage includes realistic `cmid` responses, course/instance joins,
deadline/grade zeros, optional fields, team/self identity, API errors, partial
warnings, completion fallbacks, tracking distinctions, hidden modules, pagination,
Attendance self filtering and no-marking calls, strict inputs, output-schema parity,
catalog/manifest version consistency and explicit API-list refresh.

Local verification: 259 Node/SDK tests across 21 files passed. The actual bundled
workerd suite passed 21 groups including Chromium/Firefox OAuth authorization,
assignment mappings, completion states, Attendance denied/permitted fixtures,
SQLite persistence and existing URL resolution. Bundle: 2173.53 KiB / 610.64 KiB
gzip after the final code update. Production deploy also gates on the existing
four isolated SSO/import browser cases. The local combined SSO command reached
the Chromium pass but was terminated at the 115-second execution budget while
Firefox was running; that local invocation is not a complete SSO-suite pass. The
unchanged CI SSO gate must pass before a deployment may be reported successful.
Upstream Moodle responses in these tests
are synthetic; real post-deployment reads are separately required.

Deferred: binary-resource delivery/extraction, deep Page/Book/forum readers,
aggregate dashboard/timeline, comprehensive resource semantics, remaining legacy
JSON migration, write operations, teacher/admin workflows, and student Attendance
parity when no safe authorized API is available. No token, password, stored OAuth
grant, binding name, migration history, university setting or billing is changed.

## Primary source references reviewed

- Moodle `MOODLE_405_STABLE/mod/assign/externallib.php`: assignment `cmid`, effective
  access updates, and self submission status/extension/feedback contracts.
- Moodle `MOODLE_405_STABLE/completion/classes/external.php` and
  `course/externallib.php`: current-user/context checks and completion structures.
- `danmarsden/moodle-mod_attendance`, branch `MOODLE_405_STABLE`:
  `externallib.php`, `db/services.php`, `classes/output/mobile.php`.

### Live acceptance and nullable submission correction (0.8.1)

The first deployed increment returned all five AIK1 assignments with matching
cmid/assignmentId, dates and no warnings, instead of five details-unavailable
entries. Its current-student course read returned 80 visible modules and 15
Attendance activities with structured completion fields. Site info confirmed both
completion APIs are advertised, but no `mod_attendance_` functions are advertised
by the current token. This does not establish the installed plugin version.

A live self-submission read exposed an additional strict-schema failure. Official
Moodle 4.5 `mod/assign/locallib.php`, `get_assign_submission_status_renderable`,
initializes `extensionduedate` to null when no user flags exist; feedback rendering
likewise permits null display/date fields. 0.8.1 accepts those documented nulls
while keeping them unknown in output; invalid strings/identities are not coerced.
Three new regression cases and the workerd self-status fixture cover this shape.
Production workflow for 0.8.0 completed all SSO/import gates successfully; 0.8.1 is
also required to pass the unchanged full test-gated deployment. No auth or secret
changes are involved. Real final submission/attendance state changes are excluded.

Final 0.8.1 local regression run: 262 tests across 21 files passed and 19
non-browser workerd groups passed, including the nullable extension fixture.
