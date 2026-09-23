# Triage — OAuth-first fork

Baseline: upstream commit `96b6fb1a4f3e942fbf9706870e1a39a276cda008`. Scope: protect the hosted endpoint, preserve the existing read-only student tool set, test the authentication boundary, and make deployment reviewable. Repository issues were disabled when this change was prepared, so triage is tracked here.

| Priority | Finding                                                                                                | Disposition in this PR                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | Hosted Worker accepted unauthenticated MCP calls using its configured Moodle token                     | Fixed: OAuth-protected `/mcp`, canonical origin, owner and scope checks, no legacy unauthenticated route                                               |
| P1       | Hosted deployment had no identity/consent or token lifecycle integration                               | Added: GitHub numeric-owner login, browser binding, explicit consent, S256, discovery, DCR/CIMD configuration, provider-managed refresh and revocation |
| P1       | File checks accepted scheme/path near misses, followed redirects, and buffered before enforcing limits | Fixed: exact origin, credential rejection, anchored pluginfile path, no redirects, upstream timeout, streamed size limit                               |
| P1       | Hosted errors could reflect upstream details                                                           | Hardened: generic worker/auth failures and credential-bearing download transport failures; review still treats Moodle content as untrusted             |
| P1       | Inherited dependency lock contained reported advisories                                                | Refreshed compatible transitive packages; retain audit in CI                                                                                           |
| P2       | No HTTP/OAuth/file-ID regression coverage or CI                                                        | Added real-library mocked integration tests, file-ID tests, source/test type-checking, frozen Bun lockfile, pinned CI actions, dry-run bundle check    |
| P2       | Read-only tool semantics were not annotated                                                            | Added annotations to all 14 tools; annotations are not an authorization boundary                                                                       |
| P2       | README directed hosted users to an unprotected URL and marked ChatGPT as future work                   | Replaced with fork-specific build instructions and OAuth deployment guide                                                                              |

## Deliberately separate follow-up work

- SDK v2 migration. The old manifest's `^1.12.0` was a range; its lockfile actually used **1.29.0**. This PR updates to **1.30.0**, not v2. Zod is aligned to a single v4 installation to avoid incompatible duplicate schema types during SDK type-checking.
- Course deadlines, overdue tasks, announcements, completion, dashboards, search, structured output schemas, and capability-aware tool registration. No `loyaniu` implementation was copied.
- Moodle subdirectory base paths, additional file endpoint patterns, controlled redirect support, paginated/bounded API JSON, and full binary-to-text extraction. Current file downloads intentionally fail closed on unsupported redirect/path patterns.
- Multi-user credential storage and isolation. This deployment has one owner and one Moodle credential; do not turn its allowlist into a list of users sharing that secret.
- Strongly consistent interactive state/revocation, abuse controls, and production observability. Rate-limit configuration and real-client authorization tests remain **pre-deployment requirements**, not completed deployment work.
- Optional writes require a separate design, explicit scopes, accurate annotations, confirmation behavior, and runtime Moodle permission checks. No assignment submission, quiz answering, messaging, or grade writes were added.

## Review boundaries

The local suite exercises real token generation/validation, discovery, PKCE, registration, consent, refresh, revocation, HTTP tool discovery, and denial paths with mocked upstream services and an in-memory KV implementation. It is not a security certification, independent human review, production rollout, or proof of feature completeness. See [the deployment guide](CHATGPT-OAUTH.md) for the live validation checklist and KV consistency limitations.
