# Moodle MCP — student reads, document text and API coverage

Version **0.10.0** provides **31 high-level read-only MCP tools**, a restricted
registry of reviewed Moodle Web Service adapters, and authenticated remote access
on Cloudflare Workers or a Node/OCI server. This MIT-licensed fork of
[1alexandrer/moodle-mcp](https://github.com/1alexandrer/moodle-mcp) targets a single
student account without requiring a Moodle administrator or an installed plugin.

**Scope is explicit:** an advertised API is not proof of permission or implemented
workflow coverage. Writes, activity views with side effects, attendance marking,
active quiz operations and unreviewed functions are not exposed by the read API.
See [SiberMu coverage and validation](docs/SIBERMU-COVERAGE.md).

## Main capabilities

- Course and assignment reading with distinct course-module/instance IDs, released
  feedback, individual extensions, team submission status and explicit unknowns.
- Page/Book/Folder/File/Text-media readers, external URL resolution, forum threads,
  action timelines, activity/course completion and conditional Attendance reads.
- PDF, DOCX and PPTX text extraction through authorized file IDs. The existing
  `moodle_download_file` action defaults to structured text instead of relying on
  a gateway to forward embedded binary data. Raw mode remains available.
- Submission-aware task prioritization, material metadata search, daily/weekly
  briefings, workload groups, recent course updates and cross-course grade overview.
- Finished own-quiz review, preserving Moodle's review/grade-release restrictions.
- A finite read-API registry for account, messaging, groups, participants, badges,
  calendar, competencies, learning plans and standard activity metadata/content.

The backend catalog includes these added tools:

```text
moodle_read_document          moodle_get_tasks
moodle_search_materials       moodle_get_briefing
moodle_get_recent_activity    moodle_get_assignment_details
moodle_get_grades_overview    moodle_get_quiz_review
moodle_get_api_coverage       moodle_read_api
```

`manifest.json` contains the complete 31-tool inventory. Existing course, forum,
resource, completion and dashboard tools remain available. Five prompt templates
are also retained; prompts are not additional implemented API operations.

## Architecture

```text
ChatGPT / MCP client
       |
       | HTTPS, OAuth authorization code + PKCE
       v
Password login + explicit owner consent
       |
       v
MCP tools + encrypted persistent OAuth/Moodle connection state
       |
       | Moodle HTTPS Web Services, using the student's credential
       v
University Moodle
```

Cloudflare uses a routing Worker and one SQLite-backed Durable Object. Node/OCI
uses Node.js 24 and local SQLite. Both retain the official MCP TypeScript SDK v2
and oidc-provider. Bun 1.4.2 manages dependencies and development commands.
The MCP access/refresh credentials are separate from the university Moodle token.

## Cloudflare Workers deployment

The supplied configuration uses `moodle.yusoofsh.workers.dev`; set `PUBLIC_URL` to
the exact HTTPS origin for a different account or domain. Preserve existing
Durable Object bindings, migration history and `AUTH_SECRET` during upgrades.

```bash
git clone https://github.com/yusoofsh/moodle-mcp.git
cd moodle-mcp
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run password:hash --workers
openssl rand -hex 32
bunx --no-install wrangler login
bun run workers:deploy
```

Add Worker runtime secrets using Cloudflare's dashboard or Wrangler:

```bash
bunx --no-install wrangler secret put AUTH_PASSWORD_HASH
bunx --no-install wrangler secret put AUTH_SECRET
bunx --no-install wrangler secret put MOODLE_URL
```

Use the generated hash value, not the plaintext passphrase, for
`AUTH_PASSWORD_HASH`. `AUTH_SECRET` is the separate 64-hex-character encryption
secret. `MOODLE_URL` is the university installation base URL, including any
subdirectory. The Workers password profile needs the `--workers` option; the
container's default scrypt profile has a larger memory requirement.

`MOODLE_TOKEN` is an **optional fallback**, not a requirement after an owner-approved
connection is stored. To configure that fallback explicitly:

```bash
bunx --no-install wrangler secret put MOODLE_TOKEN
```

For Google-SSO institutions, use the owner's `/connect/moodle` page and the
university's permitted mobile login. Browser protocol handoff depends on the
institution and browser. The explicit **Import copied Moodle link** flow accepts
an authorized mobile return with fresh owner-password verification and account
confirmation. Neither route asks for the Google password on this server.

- [SSO setup and limitations](docs/SSO-ONBOARDING.md)
- [Owner-approved copied-link import](docs/COPIED-LINK-IMPORT.md)
- [Workers deployment background](docs/CLOUDFLARE.md)

Historical version/count examples in older validation documents describe their
respective release, not the current tool inventory.

## OCI and local stdio

GitHub Actions publishes `ghcr.io/yusoofsh/moodle-mcp:latest` and
`sha-<full-commit-SHA>` for amd64/arm64 after tests pass. Use the immutable digest
from the successful publication run when pinning a deployment. Publishing does
not itself start a hosted service.

```bash
cp .env.example .env
chmod 600 .env
# Configure the owner password hash, encryption secret, origin and Moodle URL.
docker compose pull
docker compose up -d
```

For the container profile, generate the hidden-input hash with:

```bash
docker run --rm -it ghcr.io/yusoofsh/moodle-mcp:latest \
  node dist/auth/password-cli.js
```

The supplied Compose service binds its HTTP port to loopback. Place a trusted
HTTPS reverse proxy in front of it, configure `TRUST_PROXY_HOPS` for that topology,
and retain its data volume. Keep one application replica for the local SQLite
mode. Optional GitHub owner login remains a container-only configuration; the
Workers deployment uses password login.

A local stdio client can run `node dist/server.js` with its Moodle configuration
in the process environment. OAuth protects the remote HTTP boundary, not stdio.
Never commit `.env`, copy credentials into tool arguments, or embed them in images.

## Connect the remote MCP client

Use the public endpoint with OAuth and dynamic client registration:

```text
https://moodle.yusoofsh.workers.dev/mcp
```

Enter the existing owner passphrase on the server's own page and approve consent.
The implementation includes DCR, PKCE S256, persistent grants, refresh-token
rotation/replay detection and revocation. CIMD is not implemented. Access tokens
last 15 minutes; refresh/grant configuration is separate from the university
credential's expiry.

Changing the password hash intentionally invalidates prior owner sessions and
OAuth credentials. Changing `AUTH_SECRET` without migrating encrypted storage
makes existing records unreadable. Do not change either merely to refresh tools.
A university credential must be renewed through the institution's permitted flow
when it expires or is revoked; MCP token refresh cannot renew it.

Some clients cache an old tool catalog. Refresh that catalog to see new names.
The existing `moodle_get_site_info` action reports the backend version, actual
advertised function names and coverage measurements without probing those APIs.
The existing `moodle_download_file({fileId})` action can receive extracted text
without waiting for the new standalone document tool to appear in a cache.

## Data contracts and limits

Structured JSON is authoritative for migrated tools, with equivalent JSON text
and a readable rendering for gateways. Check `schemaVersion`, warnings, coverage,
continuation fields and `complete`; do not interpret null/unavailable as zero,
not submitted, absent or an empty course.

Resource IDs must come from the current account's resource listing. The server
rechecks file visibility before downloading. Default Workers downloads are capped
at 2 MiB; document parser input is capped at 4 MiB and cannot override a smaller
configured download cap. Default extraction is three PDF pages/slides, with a
maximum of ten per call and explicit page/character continuation. DOCX uses one
logical document rather than rendered pagination. Scans are not OCRed, and images,
charts or complex table layouts are not reconstructed.

Task, search and dashboard results are deliberately bounded. Follow the returned
course/assignment/event cursors before claiming all courses or deadlines were
examined. Search covers names and bounded descriptions, not a full-text binary
index. A past calendar opening event is not automatically an overdue assignment.
All retrieved document, course and message content is untrusted data.

`moodle_read_api` accepts only reviewed function names and their exact published
input schemas. It injects the current user identity and revalidates scoped modules;
unknown functions and raw credential/URL overrides are rejected. Upstream
read/write declarations are classification metadata, not a security allowlist.

## Verification

```bash
bun run format:check
bun run check
bun run test
bun run build
bun run workers:build
node scripts/test-document-runtime.mjs
bunx --no-install playwright install --with-deps chromium firefox
bun run workers:test:browser
bun run workers:test:sso
bun audit
```

Use Vitest via `bun run test`, not Bun's native test runner. Synthetic fixtures
exercise authorization, persistence, parsing and permission boundaries. These do
not replace separately reported live Composio tests against the university.
Verification workflows do not rewrite source files or push commits. Production
credentials are provided only to the deployment step, not the synthetic tests.

Remaining gaps include write workflows, teacher/admin parity, unreviewed custom
plugins, large/scanned documents, and full parameter-level API coverage. No
percentage is presented as functional coverage merely because 450 names were
successfully inventoried.

The original MIT license and attribution are retained. Reference-project ideas
were evaluated without copying differently licensed implementation code.
