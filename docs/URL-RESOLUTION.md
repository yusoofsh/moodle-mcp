# Authenticated URL activity resolution (0.7.1)

The former resource listing labelled `module.url` as external, but that field is
normally a Moodle `/mod/url/view.php?id=...` activity wrapper. The actual stored
destination is returned by `mod_url_get_urls_by_courses` as `externalurl`.

## Client contract

- `moodle_list_resources({courseId})`: existing readable resource/file listing is
  preserved. Each URL now includes `moduleId`, `externalurl`, and `activityUrl`,
  also available in `structuredContent.links`. Missing targets are explicitly
  unresolved; the wrapper is never presented as a resolved destination.
- `moodle_resolve_url({moduleId, courseId?})`: single-activity resolution. The
  identifier is the course-module ID used in `mod/url/view.php?id=...`, not the
  separate URL instance ID. The optional course ID is verified against the current
  account's course contents; it is an optimization, not permission to access it.
- Both text and structured outputs expose the same URL fields. A connector that
  drops structuredContent can still read the resource text or resolver JSON text.

Example synthetic output:

```json
{
  "moduleId": 201,
  "courseId": 7,
  "name": "Tutor recording",
  "activityUrl": "https://moodle.example/mod/url/view.php?id=201",
  "externalurl": "https://www.youtube.com/watch?v=example1234&t=42",
  "resolved": true,
  "source": "mod_url_get_urls_by_courses",
  "reason": null
}
```

## Permissions and fallback

`core_course_get_contents` is required and is checked at invocation, not discovery.
Only URL modules present in the current account's visible sections/modules are
returned. Explicit `uservisible=false` or `0` entries are excluded. The optional
URL API is requested once for exactly one course (`courseids[0]`); results must
match course, coursemodule and, when provided, the URL instance ID.

The single resolver uses `core_course_get_course_module(cmid)` to find the course
when it is not supplied. A token without that capability must supply `courseId`.

When URL enrichment is unavailable or a row is absent, an independently returned
`contents[type=url].fileurl` may supply the destination. Ambiguous, explicitly
inaccessible, and unsafe API rows do not fall through to another source. If no
safe destination is available, `resolved=false`, `externalurl=null`, and `reason`
explain `api_unavailable`, `not_returned`, `unsafe_target` or `ambiguous_target`.
Resource/file listings still work when the optional URL API fails. Enrolment and
visibility are checked again on subsequent invocations; destinations are not cached.

## Security and scope

Only absolute HTTP(S) URLs without embedded username/password are exposed as
resolved targets. Control characters, backslashes, unsupported schemes and Moodle
URL activity wrappers are rejected. This is metadata resolution only: no requests
are made to external hosts, Moodle wrapper pages, `mod_url_view_url`, or other
view/completion-mutating APIs. Existing token storage, OAuth, file permissions,
Worker limits and login configuration are unchanged.

The configured URL is not necessarily a playable public video: it may be a folder,
private link, redirector, or require site-specific parameters. We do not expand
Moodle's dynamic URL parameters or claim access to downstream services. Preserve
normal query parameters and timestamps. A separate transcription service must
perform its own URL validation and access checks, without Moodle credentials.

## Validation

Unit/SDK tests cover course-module versus instance IDs, per-call permissions,
hidden modules/sections, missing APIs, content fallback, wrong-course records,
duplicate rows, invalid schemes, query preservation, static tool discovery,
structured/text parity, resource file-ID preservation and no destination fetch.
The workerd suite exercises the authenticated resolver and enriched resource list
through actual OAuth, the bundled Worker and SQLite-backed Durable Objects, using
synthetic upstream Moodle responses. Existing SSO and auth tests remain gates.

References: Moodle `public/mod/url/classes/external.php` and
`public/course/externallib.php`, plus the official Moodle app's
`src/addons/mod/url/services/url.ts`.

Release verification before commit: 219 Node tests across 19 files passed; the
workerd suite passed 16 non-browser groups and 18 groups with Chromium/Firefox
authorization tests. Bundle: 2146.34 KiB / 602.57 KiB gzip. Formatting, TypeScript,
build and dependency audit passed (290 packages; no reported advisories at check
time). Synthetic fixtures are not a substitute for post-deployment live checks.

### Structured-only gateway compatibility (0.7.1)

Live Composio validation confirmed all three requested Tutor activities resolve
through the optional Moodle URL API. Composio exposes structuredContent in
preference to text content when both exist. Resource structuredContent therefore
also contains the full `text` listing (including opaque file IDs), alongside
`courseId` and `links`. SDK and workerd checks require text parity. No private
recording links or credentials are included in source fixtures.
