# SiberMu live acceptance — 0.10.1

Checked 2026-09-25 against the authorized student connection through Composio.
This is a sanitized test record: no credentials, opaque file IDs, document bodies,
student names, private messages or actual grade values are included.

## Release and gates

- Deployed code: `7f0e834056bef92e24037d61ef2b0b79c05849e5` on master.
- Reviewed feature head: `ee7b809f199ee4eadb068d6a32764a5bff8d3726`.
- Read-only verification run: 36171962441 — successful.
- Production Worker deployment: 36172216964 — successful.
- OCI test/publication: 36172200062 — successful, including container smoke tests
  and multi-platform image publication. The deployed code is independently pinned
  by the commit even if later documentation commits advance master.
- 503 Node/SDK tests in 31 files passed. TypeScript and formatting passed.
- Three dedicated workerd document-parser cases passed: PDF, DOCX and PPTX.
- 26 authenticated workerd/browser groups passed, including Chromium/Firefox login,
  OAuth persistence/replay controls, document continuation and numeric booleans.
- Four isolated SSO/copied-link browser groups passed with synthetic upstream data.
- Dependency audit reported no advisories among 298 checked packages at test time;
  this is not an independent security audit.
- Worker bundle: approximately 3987.90 KiB uncompressed / 1174.21 KiB gzip.

Local TypeScript runs were killed in the constrained remote build environment.
The unchanged CI TypeScript/build gates subsequently passed on the final revision;
no gate was weakened or bypassed to obtain a successful code deployment.
Temporary source-rewriting/pushing CI scripts were removed from the development
workflow; verification now checks committed source without modifying it.

## Actual API coverage reported by SiberMu

The deployed site-info action returned Moodle 4.5.6+ and backend catalog 0.10.1
with 31 tools, plus this inventory derived from the current account's token:

| Measurement | Result |
| --- | ---: |
| Advertised function names | 450 |
| Names inventoried in the report | 450 / 450 (100%) |
| Functions with at least one implemented invocation route | 117 / 450 (26%) |
| Upstream-declared read functions | 228 |
| Declared read functions with a route | 111 / 228 (48.68%) |
| Upstream-declared write functions | 155 |
| Functions without a mapped upstream declaration | 67 |
| Functions with no implemented route | 333 |

Declaration reference revision: `89ae02d0007418c50f0911148137f4cb3bd67f4a`.
A route means at least one implemented high-level invocation or reviewed adapter;
it is not full parameter, role, permission, result-field or workflow coverage.
The 67 unmapped declarations are not asserted to be 67 custom plugins. A function
name beginning with get/read is not automatically side-effect-free.

Functional-workflow coverage and a live-verified API count remain null rather
than being equated with inventory or registration. This release is NOT 100% API
coverage or student-complete. The report exposes the remaining gap explicitly.

## Live document delivery and pagination

The existing cached Composio download action accepts only fileId. Its response
now contains actual extracted text and `data.nextFileId`, allowing subsequent
windows without adding unsupported arguments or forwarding credentials.

| Authorized test document | Pages/slides traversed | Calls/windows | Characters returned |
| --- | ---: | ---: | ---: |
| AIK1 RPS PDF | 25 / 25 | 9 | 27347 |
| AIK1 introductory presentation | 15 / 15 | 5 | 4030 |

Every page/slide number was returned in order with no skipped numbers, every
window reported extracted status, and each final nextFileId was null. This is
text-layer extraction, not OCR, image interpretation, rendered table fidelity,
or a claim that all visual content was understood. A final window is not a full
document by itself; the consumer must retain the preceding windows.

The PDF and PPTX were tested through the actual authenticated university path.
DOCX was verified by synthetic Node/workerd tests, not by a live university DOCX
in this run. Large/scanned files remain constrained by the documented limits.

Continuation IDs are encrypted/authenticated, bound to account/token/expiry and
the source-byte hash. Every window rechecks current file visibility. Changed
bytes, wrong users, expired/tampered IDs or conflicting explicit page controls
fail closed. No server-side cursor is advanced, so retrying the same ID is safe.

## Other actual student reads

- Enrolment listing returned seven courses.
- Assignment listing was exercised for all seven. Twelve visible assignment
  records were returned in total. Four course responses contained upstream
  warnings, which were preserved as partial/uncertain data, not silently treated
  as exhaustive zero-assignment results.
- A current-student assignment-status read succeeded. No draft or submission was
  saved, submitted, reopened or otherwise changed.
- AIK1 quiz listing returned 15 quiz records. One quiz's own-attempt history read
  succeeded with an empty result. No attempt was started or completed to create
  a test fixture, and the new finished-attempt review was not live-validated.
- AIK1 forum inventory returned 12 visible forums with separate instance/cmid IDs.
- Course-scoped action timeline returned an accepted, empty next-30-day result.
  This is not proof that the university has no academic deadlines or calendar data.
- The final grade reader returned 72 released-report items with unknown maximums
  represented as null. The earlier undefined maximum formatting is no longer used.
- Popup notifications initially failed with invalidparameter. The central form
  serializer was corrected from true/false strings to 1/0 for Moodle PARAM_BOOL.
  The final live call succeeded with an empty notification result and no warnings;
  read receipts and preferences were not changed.
- The current token still advertises no mod_attendance_* functions. Attendance
  inventory is not proof of readable attendance history, and the mobile view
  handler was not used because it can auto-mark presence.
- Health returned HTTP 200; unauthenticated MCP requests remained HTTP 401.

## Connector and verification limitations

The existing Composio action schemas remain cached at the older tool set. New
backend tool names such as moodle_read_api, moodle_get_tasks and
moodle_get_quiz_review were not independently called live through those cached
actions. Their contracts, policy checks and fixtures were tested in Node/workerd.
Refresh the connector's tool schemas before requiring those new actions.

A proposed generic scripted JSON-RPC dispatcher was blocked by the conversation's
safety checks. It was not used for the subsequent live acceptance. The successful
checks used the existing explicitly discovered Composio actions; no university
credential was forwarded through an unsupported host or public proxy. Document
nextFileId is ordinary pagination for the same authorized file, not API dispatch.

The adapter inventory and site-info route counts do not substitute for a future
per-function live acceptance matrix. No claim is made that all 117 routes or all
31 high-level tools were exercised against SiberMu in this run.

## Unchanged and still outstanding

No Moodle submission, quiz answer, message, grade, read receipt, attendance mark,
completion flag, university setting, credential, OAuth scope, Cloudflare secret,
Durable Object migration/binding or billing setting was changed during live tests.
The code changes and Worker deployment are the intended external modifications.

Still outstanding: controlled write workflows, teacher/admin parity, additional
reviewed read functions and full parameter coverage, unreviewed custom plugins,
large/scanned-document support and broader live validation after schema refresh.
The configured download limit remains 2 MiB; the parser's separate 4 MiB ceiling
cannot override a smaller download limit. OCR is not implemented.
