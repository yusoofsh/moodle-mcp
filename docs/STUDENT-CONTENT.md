# Native course content and student dashboard (0.9.1)

Baseline: `48d0405f9fb9912eced89d685c2d61974e0c4091` (0.8.1). This increment adds
three high-level read-only tools, bringing the backend catalog to 21. The existing
password/OAuth/SQLite deployment, student account, secrets, binding names, migration
history and billing settings are unchanged. No Moodle write flow is enabled.

## Resource reader

```text
moodle_get_resource({"moduleId":101,"courseId":7})
moodle_get_resource({"moduleId":102,"courseId":7,"chapterId":301})
```

Examples use synthetic IDs. Use actual course-module IDs from course/resource
listing; an instance ID is not a module ID. Without courseId, the reader uses the
advertised `core_course_get_course_module` then revalidates the visible course.
Supported modules: Page, Book, Folder, File/resource, Text and media/label.

- Page: read the generated root index.html export with main-file sortorder 1.
  The module introduction is separate; it is never substituted as Page body.
- Book: read Moodle's exported JSON structure and one selected visible chapter's
  generated HTML. Default is the first visible chapter; the table of contents
  returns chapter IDs and levels. The export's `content` field is a chapter title,
  not body text. Hidden, malformed and ambiguous chapter entries are not followed.
- Folder/File: return exported hierarchy and opaque file IDs. No binary file is
  downloaded merely to list the folder. Missing exports are not verified empty.
- Text/media: convert the already-returned description content to readable text.

Each invocation rechecks course/module visibility. HTML fetching is restricted to
Moodle-managed pluginfile URLs from those exports; no user-supplied HTTP URL,
external host, redirect or browser view endpoint is followed. Moodle's Page/Book
pluginfile handlers provide exports without the completion/view calls performed
by interactive activity view endpoints.

The body has a 512 KiB fetch/parse cap, further bounded by the configured file cap;
text maxChars defaults to 64,000, with truncation explicitly reported. Links are
limited to 100 and are metadata only. HTML is parsed with pinned htmlparser2 12.0.0;
script/style/template/form and other active/hidden subtrees are excluded. No DOM,
JavaScript execution, image loading, browser scraping or OCR is performed. Known
credential-bearing query parameters are removed from extracted links. All content
is labelled untrusted. The result is readable text, not a rendered browser page;
embedded videos/images still require a separate permitted downstream operation.

The resource inventory and table of contents use bounded local offset/limit
pagination. Only one chapter body is fetched regardless of the inventory page.
`fileInventoryStatus`, `filesComplete`, content status and chapter pagination make
missing/partial data explicit. `binaryExtraction` is false: this is not PDF/DOCX
extraction or a fix for a gateway dropping embedded binary resources.

The existing moodle_list_resources action now includes Page/Book/label activities,
moduleId and description snippets in structuredContent.activities, while preserving
its full text/file-ID list and resolved external links. It does not download all
activity bodies. A stale connector can read this existing action immediately.

## Forum identifiers and read semantics

The earlier list incorrectly returned cmid for use as forumId. Moodle 4.5 forum
metadata uses id=forum instance, cmid=course module and course=course ID. The new
list joins all three against visible course contents and never guesses a module
ID as a forum instance. Missing mapping stays null with a warning.

`moodle_get_forum_discussions({forumId,page?,limit?,maxChars?})` now uses the documented
integer sortorder=-1, page and perpage parameters. The former sortby/sortdirection
arguments were not this API's contract. Its result separates discussionId from
firstPostId, reads userfullname and includes the first-post message as bounded
plain text with links. Moodle validates forum, group, timing and Q&A restrictions.

`moodle_get_forum_thread({discussionId,offset?,limit?,maxChars?})` calls
mod_forum_get_discussion_posts, validates returned forum/course context against
current visible modules, and includes only posts for that discussion that have
explicit capabilities.view=true and isdeleted=false. It preserves parent IDs,
author and timestamps for thread reconstruction. Null permissions, deleted,
wrong-discussion and duplicate entries do not become readable posts.

Neither tool calls view_forum, view_forum_discussion, mark-post/read-receipt or
subscription endpoints. Those can change read/completion state. No replies or
posts are created. Attachments are metadata only (50 maximum per post), without
Moodle token URLs or a claim that download IDs work for forum attachments.

Discussion pagination is upstream page/perpage (default 20, maximum 50). A full
page means mayHaveMore=true, not proof that another page exists. Thread pagination
is local after a bounded upstream read, default 20/maximum 50. Bodies default to
8,000 characters each, maximum 16,000. Excluded posts, truncation and nonzero pages
prevent the result being labelled a complete thread/list.

## Action timeline and dashboard

`moodle_get_calendar_events` now reads the current-user action timeline with nested
course.id and explicit ISO UTC dates. Optional courseId chooses
core_calendar_get_action_events_by_course BEFORE upstream pagination; it no longer
filters a limited global result and silently loses events. Without courseId it
uses core_calendar_get_action_events_by_timesort with the current user ID.

Defaults: next 30 days, optional lookback, limit 50 (maximum 100); bounded date
window maximum 180 days. Use returned from/to and cursor.afterEventId for the next
page. A full page reports mayHaveMore, not complete coverage. Past opening events
are not automatically called overdue assignments. This is Moodle's action timeline,
NOT all personal/group/site calendar events, and does not claim to know submission
state or individual exceptions beyond what Moodle's event API returned.

`moodle_get_dashboard({courseOffset?,maxCourses?,daysAhead?,lookbackDays?,eventLimit?,afterEventId?})`
combines one enrolment page with visible-activity progress and an independently
paginated action timeline. maxCourses defaults to 3 and is capped at 5; each course
requires at most one contents read. The 20-second course-loop scheduling budget
stops starting additional course reads; in-flight requests and the timeline retain
their existing timeouts, so this is not a hard 20-second total latency guarantee.
Errors produce partial/unknown course summaries rather than a false 0%.

The timeline is for all user courses in the requested window, not only the course
summary page. Progress is visible-activity completion, not the separate course
completion decision. Individual submission states are not queried for every item.
Coverage, next course offset, event cursor and complete=false make this bounded
aggregation explicit. No global polling, external requests or writes are added.

## Structured contract and connector caching

Six additional tools now declare per-tool output schemas under the existing
schemaVersion=1 envelope: resource, forum list/discussions/thread, calendar and
dashboard. structuredContent and the JSON text content carry equivalent data,
with a readable text rendering included for gateways. Existing resource listing
retains its earlier compatible shape with added activities metadata.

Catalog/manifest/runtime versions are tested together. Backend deployment cannot
force a ChatGPT/Composio cached tool registry to refresh. Existing forum/calendar/
resource actions gain their updated output immediately; new standalone tool names
may require connector schema refresh. Do not guess or fabricate function wrappers.

## Verification boundary

Before commit, 309 Node/SDK tests across 22 files passed, including resource access,
Book structure, HTML safety, forum identifiers, Q&A/deleted/permission withholding,
output parity, action-event course filtering, partial pagination and no mutation
calls. The bundled workerd suite passed 22 non-browser groups including actual
OAuth/SQLite and the new Page/Book/forum/dashboard paths against synthetic upstream
responses. Bundle was approximately 2249 KiB / 641 KiB gzip. Dependency audit
reported no advisories across 296 packages at check time.

The local browser suite reached the Chromium authorization pass but timed out in
Firefox's existing native authorization navigation on two attempts. These local
runs are NOT a full browser-gate pass. The unchanged production workflow must pass
both browser authorization and all four SSO/import cases before deployment.

Automated content and university responses are synthetic. Post-deployment live
checks must be reported separately, including any connector catalog limitation.
No claim of PDF/DOCX extraction, full calendar parity or student-complete coverage
is made. Student writes and teacher/admin workflows remain unimplemented.

## Primary source contracts reviewed

Moodle MOODLE_405_STABLE:

- mod/page/lib.php: page_export_contents, page_pluginfile, page_view.
- mod/book/lib.php: book_export_contents, book_pluginfile, book_view.
- mod/forum/externallib.php: get_forums_by_courses, get_forum_discussions,
  get_discussion_posts, view_forum and view_forum_discussion.
- mod/forum/classes/local/exporters/post.php: capabilities.view, deleted content,
  nullable metadata and private-reply export behavior.
- calendar/externallib.php and calendar/classes/external/events_exporter.php:
  course-scoped/time-sorted action events and cursor contracts.

## Live compatibility correction (0.9.1)

The first live course-scoped calendar request succeeded, but forum listing exposed
a course-contents validation error. The official Moodle 4.5 URL module exporter
sets `filepath=null` (it is not a file directory). The new shared content schema
initially allowed missing filepath but not null. 0.9.1 accepts that documented
null value, without relaxing file-origin/visibility checks. Three regression cases
cover forums, Page and dashboard in a course containing this URL descriptor; the
workerd fixture includes it too. Other students' data and arbitrary metadata values
are not accepted as a workaround.

The initial production workflow passed its browser and SSO/import gates. This
nullable-field correction must pass the same unchanged deployment gates. Live
checks are repeated after deployment, rather than treating synthetic tests as
proof of the institution's complete response shapes.

Final 0.9.1 local regression checks: 312 tests across 22 files passed, with 22
non-browser workerd groups passed. Production browser/SSO gates remain required.
