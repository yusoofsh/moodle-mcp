# Moodle MCP — private OAuth fork

Read-only Moodle tools for local MCP clients and an OAuth-protected Cloudflare Worker for ChatGPT. Forked from [1alexandrer/moodle-mcp](https://github.com/1alexandrer/moodle-mcp), with the original MIT license retained.

**Hosted mode is single-owner and requires OAuth.** There is no public, unauthenticated Moodle gateway. GitHub identifies the allowed owner; the Worker uses a separate Moodle web-service token that is never supplied to ChatGPT.

## Build this fork

Requires Bun 1.4.2 and Node.js 22 or newer.

```bash
git clone https://github.com/yusoofsh/moodle-mcp.git
cd moodle-mcp
bun install --frozen-lockfile
bun run check
bun run bundle:check
```

Use this fork's checkout and built files. `npx moodle-mcp` installs the upstream published package and does **not** select this fork.

## Remote ChatGPT connection

Follow [ChatGPT OAuth deployment](docs/CHATGPT-OAUTH.md) to configure the canonical HTTPS origin, KV, GitHub OAuth application, owner ID, Moodle credentials, and rate limits. The endpoint is:

```text
https://YOUR-CANONICAL-HOST/mcp
```

The flow uses authorization code + S256 PKCE, GitHub owner verification, explicit consent, scoped MCP access tokens, refresh tokens, and discovery metadata. The checked-in example domain and KV ID must be replaced. CI never deploys or uses production secrets.

## Local stdio

```bash
bun run build
# Set MOODLE_URL and MOODLE_TOKEN securely in your environment.
node dist/server.js
```

Configure an MCP client to run `node` with the absolute path to this checkout's `dist/server.js`. Local stdio uses process environment credentials and does not need the hosted OAuth layer. A regular non-SSO Moodle account can alternatively use `MOODLE_USERNAME` and `MOODLE_PASSWORD`, where its Moodle service permits this.

Obtain an authorized token through your Moodle site's supported token/mobile-service flow or administrator. Access is limited by that token's service and Moodle permissions. This release expects Moodle at a domain root and a final HTTPS hostname without redirects.

## Existing tools

| Tool                           | Function                                               |
| ------------------------------ | ------------------------------------------------------ |
| `moodle_get_site_info`         | Account/site information and reported API capabilities |
| `moodle_list_courses`          | Enrolled courses                                       |
| `moodle_get_course`            | Course sections and activities                         |
| `moodle_list_resources`        | Course file listings with opaque file IDs              |
| `moodle_download_file`         | Reauthorized, bounded server-side file download        |
| `moodle_list_assignments`      | Course assignments and deadlines                       |
| `moodle_get_assignment`        | Submission status and feedback                         |
| `moodle_get_grades`            | Course grade report                                    |
| `moodle_get_calendar_events`   | Upcoming events                                        |
| `moodle_list_quizzes`          | Quiz metadata                                          |
| `moodle_get_quiz_attempts`     | Past attempt metadata/results                          |
| `moodle_list_forums`           | Course forums                                          |
| `moodle_get_forum_discussions` | Forum discussion summaries                             |
| `moodle_get_notifications`     | Recent notifications                                   |

All 14 tools are annotated read-only. Moodle still determines whether each operation is available to the configured account. No write tools were added.

The original five prompts (`summarize-course`, `whats-due`, `build-study-notes`, `exam-prep`, `search-notes`) and opaque-file MCP resource template are preserved. Client support for prompts/resources varies. Study prompts do not add a filesystem writer or PDF parser to this server.

File IDs are sealed, user-bound, expire after 24 hours, and become invalid when the Moodle token changes. Downloads recheck course access, restrict the origin and file path, refuse redirects, and enforce a streaming byte cap (default 25 MiB). Text files return text; supported binary paths return embedded bytes, subject to client limits.

## Development and scope

```bash
bun run typecheck     # source and tests
bun run test          # Bun tests; real provider/SDK with mocked services
bun run format:check
bun run build
bun run bundle:check  # no deployment
bun audit
```

The suite does not replace a real ChatGPT/GitHub/Moodle authorization test. Review [triage and deferred work](docs/TRIAGE.md) and the deployment guide's limitations before exposing an endpoint. SDK v2 and additional student features are separate follow-up work.
