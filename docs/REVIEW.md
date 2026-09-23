# Implementation review — 2026-09-23

This is an assistant-performed source review and automated validation record, not an independent human security audit or production approval. An attempted additional model-review helper returned no output; no independent-review claim is made.

## Findings resolved during implementation

- Public hosted access was replaced by the OAuth provider boundary, with explicit owner/scope checks before Moodle calls.
- GitHub identity is checked by immutable numeric ID, with cookie-bound state and a separate Allow/Deny decision. External client display text is escaped and the consent page has a restrictive CSP.
- Access-token properties follow effective scopes during issuance/refresh rather than blindly retaining a grant's original scope list.
- File fetches reject scheme/host/path mismatches and credentials in URLs, disable redirects, enforce a streamed byte cap, and have timeouts. Both initial network errors and errors while reading response bodies are sanitized so a transport error does not disclose a token-bearing URL.
- Sealed file IDs were regression-tested for tampering, different users, rotation, and expiry.
- Transitive dependency advisories in the inherited lock were removed through compatible updates. Zod was aligned to one v4 installation to avoid duplicate schema-type universes. The MCP SDK remains v1.30.0; v2 is a separate migration.
- The reproducible dependency lock, source/test type checks, read-only tool inventory, and non-deploying CI are included.

## Verification performed in the implementation sandbox

| Check                                 | Result                                       |
| ------------------------------------- | -------------------------------------------- |
| Frozen Bun install                    | Passed                                       |
| Source TypeScript check               | Passed                                       |
| Test TypeScript check                 | Passed                                       |
| Bun unit and mocked integration tests | 75 passed, 0 failed; 6 files, 273 assertions |
| Prettier check                        | Passed                                       |
| TypeScript build                      | Passed                                       |
| Wrangler deployment dry-run           | Passed; did not deploy                       |
| Bun advisory audit                    | Empty advisory result at review time         |
| Git whitespace/diff check             | Passed                                       |

OAuth tests run the real provider and MCP SDK; only upstream GitHub/Moodle, KV, and the Workers entrypoint base class are replaced by test doubles. Tests cover unauthenticated/invalid credentials, discovery, PKCE, redirect/resource validation, owner mismatch, missing browser binding, explicit consent/denial, sequential code/consent replay, refresh, token expiry/revocation, effective scopes, and the 14-tool read-only inventory.

## Remaining gates

Real Cloudflare deployment, browser GitHub login, live CIMD discovery/SSRF behavior, actual Moodle permissions/file delivery, ChatGPT authorization/refresh, and rate-limit configuration remain unverified. The checked-in domain and KV identifier are examples. No live credentials were used.

KV state is eventually consistent, not an atomic distributed replay barrier; production propagation and strict one-use behavior are not proven by the in-memory tests. This is a single-owner read-only fork, not a multi-tenant platform. Consult [triage](TRIAGE.md) and [deployment](CHATGPT-OAUTH.md) before merging or deploying. GitHub-hosted CI results must be read from the PR; this file records sandbox results only.
