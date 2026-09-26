# SiberMu API coverage and document delivery (0.10.1)

This release expands the prior 21-tool reader to 31 high-level read-only tools.
The current authenticated site's advertised API names are the inventory source,
not an assumed list from a different university. Upstream read/write declarations
are pinned reference metadata, never automatic permission to expose a function.

## What is implemented

- Document text: PDF, DOCX, PPTX and plain text from opaque authorized file IDs.
  Existing `moodle_download_file({fileId})` defaults to extracted structured text,
  so a gateway dropping embedded binary resources can still receive the content.
  `moodle_read_document` adds explicit page/slide/character-window controls;
  `mode=raw` retains the previous byte-resource mode for capable clients.
- Study workflows: submission-aware tasks, cross-course material metadata search,
  daily/weekly briefing and workload groups, recent updates, released grades
  overview and the actual assignment instruction body. Unknown submission state,
  team submissions, individual extensions and partial course/status pages remain
  explicit; missing information is never proof of overdue work or no requirements.
- Finished quiz review: only the current account's verified finished non-preview
  attempts, subject to Moodle's released review information. No quiz is started,
  advanced, answered, flagged or submitted by these readers.
- Broader read adapters: current-account profile/preferences, groups, participants,
  badges, messages/conversations/contacts, grades, calendar views, competencies and
  learning plans, plus metadata and reviewed reads for standard activity families.
  `moodle_read_api` dispatches only a finite explicit registry with strict per-API
  inputs and injected account identity. It is NOT arbitrary Moodle REST execution.
- Coverage inventory: `moodle_get_api_coverage` includes exact implemented adapter
  inputs and unexposed operations. The existing site-info tool also includes a
  compact `apiCoverage` summary, making measurements available to old tool caches.

No token, password, scope, Durable Object binding/migration or university setting
is changed. No submission, message, grade, attendance mark, view/read receipt,
policy acceptance or account mutation is used merely as a live test.

## Meaning of coverage

1. Inventory coverage: all function names returned by this particular token have
   an entry in the report. 100% here does NOT mean the integration implements them.
2. Function route coverage: at least one implemented high-level call or reviewed
   adapter exists for that function. It does not prove every parameter combination,
   result field, role or end-user workflow is covered.
3. Declared read route coverage: the above routes intersected with upstream APIs
   declared read-only. Some declared reads still have side effects, require staff
   permissions or expose credentials; these are not automatically allowed.
4. Live coverage: a separately recorded set of actual Composio calls and outcomes.
   Registration, unit fixtures and an advertised function do not count as a live
   success. Functional workflow coverage and live API counts are not fabricated.

The original 450-function SiberMu inventory includes writes, view events, mobile
credential issuance, proctoring/custom plugins and staff-only operations. They
remain visible as gaps, not silently reclassified as implemented. Attendance's
standard session API was not advertised at the last live read. The mobile view
handler is not a substitute: it can automatically record presence.

## Resource and execution boundaries

Parser input is capped at 4 MiB and additionally by the configured download limit
(default 2 MiB). PDF text-layer extraction supports a bounded window (default
3 pages, maximum 10; maximum 500 document pages). Explicit nextPage/nextCharOffset
allow continuation. There is no OCR, image/chart interpretation or rendered table
reconstruction, and no claim to handle every large/scanned document.

OOXML processing rejects encrypted/unsafe/duplicate ZIP paths and external slide
relationships, caps entries and decompressed XML, and reads only relevant text
parts. It never executes macros or document fields. The PDF parser disables remote
assets, font fetching, auto-fetch, streaming and WASM. Extraction is single-flight;
the cooperative time limit is not a preemptive CPU guarantee for arbitrary input.

Read-adapter inputs are strict: callers cannot inject raw URLs, choose another
student's user ID, change function names through extra parameters, or override a
verified instance ID. Course/module visibility is rechecked before scoped reads.
Output metadata is size-bounded, sanitized, marked untrusted and explicitly partial
when paged or truncated. Upstream data must never be treated as agent instructions.

## Reproducible delivery

The recovered development implementation at 408afc7 passed 479 Node tests, three
workerd document-parser cases, 25 authenticated workerd/browser groups and four
SSO/import groups. Those are synthetic tests, not private university acceptance.

Temporary source-rewriting scripts were removed. The verification workflow is now
read-only: it does not generate code, change the lockfile, or push commits during
validation. Production and OCI workflows also require the document runtime gate.
The exact final commit must pass these gates before it is reported deployed.

New tool names may require a client/Composio schema refresh. A stale cached
connector can still call the existing site-info and download tools to verify the
new coverage measurements and extracted content. Live results are recorded after
actual deployment; no assumption is made that all new tool names are callable.

Still outside this release: write workflows and their confirmation/authorization
lifecycle, teacher/admin parity, unreviewed custom plugins, OCR/large-file support,
and complete parameter-level coverage of every exposed Moodle API.

## File-only client pagination (0.10.1)

Live Composio testing confirmed actual PDF and PPTX text arrives using the existing
download action, but its cached schema only accepts fileId. The backend therefore
returns a signed/encrypted `nextFileId` containing a bounded document position and
SHA-256 of the source bytes. Passing that value as fileId continues the same file
without unsupported extra arguments. It grants no new Moodle operation or access.
Every window checks account/token binding, expiry, current course file visibility,
byte identity and parser bounds. Changed documents require a fresh start. No
continuation is issued when parsing does not advance. Text-only clients receive
the same nextFileId in the JSON representation as structured clients.

Regression tests cover complete PDF/character traversal using fileId-only calls,
opaque payloads, tampering, account and token isolation, expiry, changed content,
visibility loss, unsupported formats and exact MCP JSON parity. The authenticated
workerd test also advances a character window through the public download tool.

## Additional real-instance compatibility fixes

Live notification retrieval failed with invalidparameter. Moodle 4.5 external API
validation accepts boolean values as native booleans or 0/1; form-encoded strings
"true"/"false" are not the same. The central REST serializer now encodes booleans
as "1"/"0", with an authenticated transport regression test. This applies to all
reviewed adapters, not just notifications. No permission failure is bypassed.

Live grade output also exposed missing grademax fields as "undefined". Moodle's
released grade report declares ranges and values optional, so the reader now
returns explicit null ranges, does not assume 100, selects the exact student/course
report, and withholds hidden-by-date/hidden values and feedback. Grades and popup
notifications now use strict structured outputs; popup reads exclude other
recipients and do not mark notifications read. Synthetic regressions distinguish
these states from empty lists, completed submissions or zero grades.

## Lightweight read-coverage tranche (0.10.3)

This increment deliberately avoids bulk wrapper generation. It adds nine reviewed
read routes with small strict schemas: current-account unread notification count,
two self-enrolled course timeline queries, course-scoped Moodle global search
(areas/results/top results), forum capability metadata, H5P capability metadata,
and current-student H5P results with caller-supplied attempt IDs disabled.

The global-search result routes require a visible courseId; they do not offer
site-wide user/context filters. Timeline classifications are limited to all, past,
inprogress, future, and favourites with a maximum 50-course page and a fixed safe
sort. Forum/H5P reads resolve the activity instance from a currently visible
course module before invocation.

mod_h5pactivity_get_user_attempts remains intentionally blocked: Moodle 4.5
requires the ability to view all attempts and returns enrolled-user attempt data,
which is a different privacy boundary from current-student results. This release
does not add writes, activity-view endpoints, launches, read receipts, attendance
marking, arbitrary search contexts, or raw REST passthrough.

## Lightweight student-state metadata tranche (0.10.4)

This increment adds eight small reviewed read routes without bulk generation:
current-account AI policy status, recently accessed items, starred courses,
dashboard block metadata without block content, allowed event types for one visible
course, forum can-add-discussion capability, current-student H5P attempt summaries,
and BigBlueButton can-join capability.

Identity is injected for self-scoped APIs. Dashboard block contents are disabled,
recent/starred lists are bounded to 50, calendar capability requires a visible
course, forum/H5P/BigBlueButton calls require a currently visible module of the
correct type, H5P userids cannot be supplied, and the BigBlueButton route never
requests a join URL. No favourite, dashboard, calendar, discussion, H5P attempt or
meeting state is changed.
