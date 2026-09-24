# Triage — OAuth/OCI foundation

Date: 2026-09-23. Baseline: `96b6fb1a4f3e942fbf9706870e1a39a276cda008` on the existing `master` default branch. No branch rename or force push is required. This fork has GitHub Issues disabled, so the initial triage is recorded here.

## Implemented in this change

| Priority | Finding                                                                                               | Resolution                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Hosted Worker accepted requests using the owner's Moodle credential without authenticating the caller | New OAuth-protected container endpoint; inherited Worker separately fails closed behind a distinct static token                     |
| P0       | Student data must not be shared with arbitrary GitHub users                                           | Numeric owner allowlist, account-bound sessions and explicit consent; no auto-approval                                              |
| P1       | Tool download and MCP resource access had different permission checks                                 | Both recheck current course-file visibility; hidden modules are rejected                                                            |
| P1       | Download origin/path validation and redirects were too permissive                                     | Exact origin and installation path, no URL credentials, no redirects, streaming size cap and timeout                                |
| P1       | Static Moodle token was unsuitable as the client-facing OAuth token                                   | Established OAuth provider issues separate opaque access/refresh credentials; Moodle token stays server side                        |
| P1       | OAuth state and grants must survive container restarts                                                | Encrypted persistent SQLite adapter, one-use authorization state, rotating refresh tokens, revocation                               |
| P1       | Dependencies were stale                                                                               | MCP SDK v2, current pinned runtime dependencies and Bun lockfile; initial audit reported 19 advisories, updated audit reported none |
| P1       | No OCI publication path                                                                               | Multi-stage non-root image, Compose file and test-gated multi-architecture GHCR workflow                                            |
| P2       | All hard-coded tools were advertised even when unavailable                                            | Register only tools whose required Moodle APIs are reported; diagnostic site-info remains available                                 |
| P2       | Moodle installations in subdirectories were normalized incorrectly                                    | Preserve installation prefix while tolerating copied course URLs                                                                    |
| P2       | Protocol/auth errors and consent input needed negative tests                                          | Regression coverage for 401 responses, Unicode CSRF, denial, PKCE, resource mismatch, refresh replay and revocation                 |

## Follow-up backlog — not shipped or claimed complete

1. Live acceptance on the owner's Moodle instance and in the owner's ChatGPT interface after supplying deployment URL and credentials.
2. Full pagination and accurate aggregation of deadline overrides, group submissions, overdue work and semester dashboards.
3. Structured output schemas for existing text-oriented tools; course completion, announcements, metadata search and profile improvements.
4. PDF/DOCX text extraction and bounded content retrieval appropriate to the MCP client's response limits.
5. CIMD client metadata support; DCR is implemented for this release.
6. Periodic capability refresh, upstream response-size limits and bounded request concurrency for heavier accounts.
7. Real ARM64 runtime smoke tests in addition to the multi-platform image build.
8. Multi-user isolation, multiple Moodle accounts, multiple replicas and external database support are outside the single-owner design.

No Moodle write tools are introduced. Adding them requires separate scopes, explicit server-side policy, tests and a new review.

## Password-login increment — 0.4.0

Baseline: `c1a286f4b9cf6fbad474d3a22e5ae61d1e0d32d2`, on `master`. This change addresses local owner sign-in, not the Moodle feature backlog above.

| Priority | Finding                                                                   | Resolution                                                                                                                              |
| -------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | GitHub OAuth App setup is unnecessary for a private password-owned bridge | Password login by default; GitHub remains explicit opt-in via AUTH_MODE=github                                                          |
| P1       | Password authentication needs safe storage and brute-force controls       | Salted asynchronous scrypt, fixed validated cost, constant-time comparison, persistent IP/global budgets and one in-flight verification |
| P1       | Login forms must not bypass OAuth identity, PKCE or consent               | Interaction-bound one-use CSRF nonces, exact Origin checks, existing provider and consent retained                                      |
| P1       | Password changes should invalidate existing authorization                 | Hash-bound internal owner identity; restart/rotation regression tests cover access tokens, refresh tokens and browser sessions          |
| P2       | Hash setup should not expose passwords in process arguments/history       | Hidden terminal helper with confirmation, explicit bounded stdin mode, Compose-safe hash encoding                                       |
| P2       | Published container must work without a GitHub application                | Password-mode image smoke test generates its own test hash and checks discovery/non-root/401 behavior                                   |

No live Moodle credentials, deployment origin or user password are stored in the repository. The earlier student-feature backlog remains open.

## Workers migration — 0.5.0

Split Node-only database construction from the encrypted adapter. Reuse Express, oidc-provider and all curated tools inside SQLite Durable Objects. Add fixed 32 MiB scrypt profile, manual redirect rejection, response bounds and persistent HTTP budgets. Keep OCI/stdio support. Live Moodle acceptance, pagination, document extraction and CIMD remain separate follow-up work.

## September 24 tool-discovery regression

Remote initialization previously called Moodle before constructing the MCP server.
A rejected token or upstream failure therefore returned HTTP 500 for discovery;
capability filtering could also hide most tools. Remote registration now accepts a
lazy client source and publishes the curated 14-tool catalog without a Moodle call.
The earlier P2 capability-registration decision is superseded for HTTP/Workers:
capabilities remain enforced at invocation, with a diagnostic error for unavailable
functions. Direct initialized/stdio registration preserves its existing filtering.
Tests cover authenticated outage discovery, missing capabilities, recovery, strict
JSON tool schemas, OAuth enforcement and the official Streamable HTTP client.
