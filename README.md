# Moodle MCP — OAuth + OCI fork

## Cloudflare Workers Free — 0.5.0

The password/OAuth application can now run in a SQLite-backed Durable Object without Docker or a VPS. See [the Workers deployment and migration guide](docs/CLOUDFLARE.md). All 14 read-only Moodle tools remain, subject to Moodle permissions and Worker-specific limits. Generate a compatible hash with `bun run password:hash --workers`. Container support below is retained.

Read-only access to your Moodle account from ChatGPT or another MCP client, without installing a Moodle plugin. This MIT-licensed fork of [1alexandrer/moodle-mcp](https://github.com/1alexandrer/moodle-mcp) adds a container-hosted OAuth authorization server and hardens remote access.

**Current scope:** single Moodle account, one password-authenticated owner (or an explicitly selected GitHub owner), 14 student-facing tools. This is an OAuth/OCI foundation release, not complete Moodle API coverage. [Triage and follow-up work](docs/TRIAGE.md) · [Review record](docs/REVIEW.md) · [Security model](SECURITY.md).

## Architecture

```text
ChatGPT ── OAuth authorization code + PKCE ──► Moodle MCP /mcp
                         │                         │
                 Local password login          Moodle WS token
                 + explicit consent          (server-side only)
                                                   │
                                                   ▼
                                              Your Moodle
```

The container uses Node.js 24, the official MCP TypeScript SDK v2 and the maintained `oidc-provider` authorization server. Bun manages dependencies and development scripts. Authorization data and signing keys persist in an encrypted SQLite database. OAuth tokens issued to MCP clients are distinct from your Moodle token.

## Deploy the OCI image

Published image name: `ghcr.io/yusoofsh/moodle-mcp`. The publication workflow creates `latest` and `sha-<full-commit-SHA>` tags for `linux/amd64` and `linux/arm64`, plus SBOM and provenance attestations. Use the digest recorded in the successful Actions run for an immutable deployment. Publishing an image does not start a hosted MCP service.

```bash
git clone https://github.com/yusoofsh/moodle-mcp.git
cd moodle-mcp
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
```

Set the generated value as `AUTH_SECRET` in `.env`, then fill the remaining values. Do not commit `.env`.

### Generate your owner password hash

Use the image's hidden-prompt helper. This does not need Moodle credentials, an OAuth App, or a running server:

```bash
docker pull ghcr.io/yusoofsh/moodle-mcp:latest
docker run --rm -it ghcr.io/yusoofsh/moodle-mcp:latest node dist/auth/password-cli.js
```

Enter a unique passphrase of **at least 15 characters**, then confirm it. The helper does not echo the password. Copy its `AUTH_PASSWORD_HASH=...` output into `.env`; keep `AUTH_MODE=password`. There is no username, signup or GitHub OAuth App to configure. The password is for this bridge, **not** your Moodle password.

The hash uses a random salt and Node's built-in scrypt (`N=131072`, `r=8`, `p=1`). The encoded value uses colons, so it does not need dollar-sign escaping in Compose. Passwords preserve spaces and Unicode and are capped at 1024 UTF-8 bytes. The helper also supports `--stdin` for secret-manager pipelines; never pass a password as a command-line argument or put it in shell history.

For a source checkout, first run `bun run build`, then `bun run password:hash`.

| Variable                 | Configuration                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`             | Your externally reachable HTTPS **origin**, e.g. `https://moodle-mcp.example.com`, without `/mcp`               |
| `AUTH_MODE`              | `password` (default); `github` is an explicit alternative                                                       |
| `AUTH_PASSWORD_HASH`     | The generated scrypt hash from the password helper; required in password mode                                   |
| `AUTH_SECRET`            | 32 cryptographically random bytes, represented as 64 hexadecimal characters                                     |
| `MOODLE_URL`             | Moodle base URL; include its installation subdirectory when applicable                                          |
| `MOODLE_TOKEN`           | Your own permitted Moodle mobile/web-service token                                                              |
| `TRUST_PROXY_HOPS`       | `1` for the supplied loopback-bound service behind one reverse proxy; do not expose that upstream port publicly |
| `OAUTH_DATABASE_PATH`    | `/data/oauth.sqlite`; retain the named volume and the same `AUTH_SECRET` across upgrades                        |
| `MOODLE_MCP_MAX_FILE_MB` | Per-file download cap; example configuration uses 10 MB                                                         |

### Optional GitHub mode and upgrades from 0.3.0

**Existing GitHub deployments must add `AUTH_MODE=github` before upgrading**, or startup will fail closed requesting `AUTH_PASSWORD_HASH`. Password mode does not use any GitHub settings. To keep GitHub mode, set `AUTH_MODE=github`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and the numeric `GITHUB_ALLOWED_USER_ID`. Create the GitHub OAuth App with its **authorization callback URL** set to:

```text
https://moodle-mcp.example.com/interaction/github/callback
```

That is the **GitHub login callback**, not ChatGPT's OAuth redirect URI. Replace the domain with `PUBLIC_URL`.

```bash
docker compose pull
docker compose up -d
docker compose logs --tail=50
```

A new GHCR package may be private. Authenticate to GHCR with an appropriately scoped credential when required; never place registry credentials in `.env` or the image.

Configure your reverse proxy to forward the HTTPS origin to `127.0.0.1:3000`, preserve the Host header, and set trusted forwarding headers. The supplied Compose file binds only to loopback, runs as UID 1000, drops capabilities, uses a read-only root filesystem and persists `/data`. Keep one application replica; this SQLite deployment is not a multi-node authorization service.

## Connect ChatGPT

Add your public remote MCP endpoint with **OAuth authentication**:

```text
https://moodle-mcp.example.com/mcp
```

The client discovers the authorization server and dynamically registers itself. Enter your local owner password on **your server's login page**, then inspect and approve the separate consent screen. ChatGPT receives OAuth access/refresh tokens, not the password. In optional GitHub mode, sign in as the allowlisted GitHub owner instead. The server supports DCR; CIMD is not implemented. Whether a particular ChatGPT interface exposes custom MCP configuration depends on the account/workspace configuration.

The discovery chain is:

```text
/mcp → 401 + WWW-Authenticate resource_metadata
/.well-known/oauth-protected-resource/mcp
/.well-known/oauth-authorization-server
/oauth/authorize
/oauth/token
/oauth/register
```

Client registrations, grants, refresh tokens and signing keys survive process restarts when the volume and `AUTH_SECRET` remain intact. Access tokens expire after 15 minutes. Refresh tokens rotate; replay revokes the related grant's credentials. `/oauth/revoke` implements token revocation. The consent flow is restricted to the configured owner.

### Password rotation and login throttling

Generate a new hash with the same helper, replace `AUTH_PASSWORD_HASH`, and recreate the container:

```bash
docker compose up -d --force-recreate
```

Keep `AUTH_SECRET` and the OAuth data volume unchanged. Ordinary restarts preserve sessions. Changing the password hash (even regenerating it for the same password) changes the internal owner identity: old browser sessions must sign in again, old access tokens are rejected, and old refresh tokens cannot renew access. Reconnect your MCP client. Switching between GitHub and password mode also requires reauthorization. No database deletion is necessary.

Password attempts are limited to **5 per IP per 15 minutes** and **30 total per 15 minutes**, stored in SQLite across restarts. Successful attempts also count. Only one expensive password verification runs at a time (approximately 128 MiB scrypt memory); rejected requests receive HTTP 429 and a `Retry-After` header. These budgets can temporarily block the owner during an attack; retain edge rate limits and correct proxy configuration. They are not a multi-replica or DDoS defense.

## Available tools

Authenticated HTTP/Workers discovery returns a stable catalog of 14 read-only tools without contacting Moodle. The connection and required web-service capabilities are checked when each tool runs, so a university outage or invalid Moodle token cannot hide the tool list. `moodle_get_site_info` reports availability for the configured token. Already-connected stdio clients still filter the list by reported capabilities. Advertising a tool never grants Moodle permissions.

| Tool                                                 | Function                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `moodle_get_site_info`                               | Account/site information and advertised Moodle API availability |
| `moodle_list_courses`, `moodle_get_course`           | Enrolled courses, sections and activities                       |
| `moodle_list_resources`, `moodle_download_file`      | Resource listing and authenticated, bounded file downloads      |
| `moodle_list_assignments`, `moodle_get_assignment`   | Assignments, deadlines and submission/grade status              |
| `moodle_get_grades`                                  | Per-course grade report                                         |
| `moodle_get_calendar_events`                         | Upcoming calendar events                                        |
| `moodle_list_quizzes`, `moodle_get_quiz_attempts`    | Quizzes and the user's prior attempts                           |
| `moodle_list_forums`, `moodle_get_forum_discussions` | Forums and recent discussions                                   |
| `moodle_get_notifications`                           | Recent notifications                                            |

Five prompts and opaque file resources are retained. Prompts and binary embedded resources depend on client support. PDF/DOCX bytes are not automatically converted into extracted, searchable text; base64 can exceed client context limits well before the server's download cap. File IDs expire and both the tool and resource paths recheck current Moodle visibility.

There are **no submission, grading, messaging, posting or other write tools** in this release. The existing calendar tool returns a bounded first page; aggregate deadline dashboards and comprehensive pagination are follow-up work, not implied by “all courses.”

## Local development

```bash
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test
bun run build
bun run format:check
bun audit
```

Node.js 24 is required for the HTTP runtime and its built-in SQLite module. The test runner is Vitest (`bun run test`), not Bun's native test runner. OAuth integration tests use the real authorization provider and local-password and simulated GitHub/Moodle responses; they do not authenticate a real university account.

For local HTTP experiments only, use `PUBLIC_URL=http://localhost:3000`, `ALLOW_INSECURE_HTTP=true`, `TRUST_PROXY_HOPS=0` and a writable database path. Non-loopback HTTP is rejected.

For an on-machine stdio MCP client, use `node dist/server.js` with Moodle credentials in its environment. OAuth protects the remote HTTP boundary, not local stdio. The Cloudflare Worker now uses password OAuth and persistent Durable Object SQLite; see docs/CLOUDFLARE.md. MCP_ACCESS_TOKEN no longer applies.

## Verification and references

CI checks formatting, TypeScript, the test suite, dependency advisories, a native container build, unauthenticated HTTP behavior and non-root execution **before** the publish job. The publish job pushes amd64/arm64 OCI images and records their manifest digest.

- [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [oidc-provider](https://github.com/panva/node-oidc-provider)
- [GitHub OAuth web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

The original MIT license and attribution are retained. No code from differently or ambiguously licensed Moodle MCP projects has been copied into this fork.

## University Google SSO (student onboarding)

In password/Workers mode, open `/connect/moodle` to connect through your
university’s existing Moodle mobile SSO. Use desktop Firefox or Chrome, allow
the browser return handler, sign in at the university, and explicitly confirm
the returned Moodle account. No new Google OAuth app is required.
`MOODLE_TOKEN` remains an optional fallback; a confirmed SSO credential is stored
encrypted. See [setup, security boundaries, and browser limitations](docs/SSO-ONBOARDING.md).
The institution’s final custom-scheme handoff requires a live user acceptance test.
