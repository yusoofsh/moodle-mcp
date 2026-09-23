# Implementation review record

Date: 2026-09-23. Scope: OAuth/HTTP access, Moodle file access, dependency migration, OCI packaging and CI publication. This is an implementation review, not an independent penetration test or security certification.

## Review outcomes

- Replaced unauthenticated remote access with an established OAuth provider, not a custom authorization-code implementation.
- Restricted authorization to a configured numeric GitHub owner ID and required explicit client consent. GitHub sign-in credentials and Moodle credentials are different from MCP access tokens.
- Checked exact MCP resource/audience, token expiry, owner identity and a live authorization grant before creating a Moodle client.
- Persisted encrypted provider records and signing keys; tested restart persistence, one-use state and credential consumption, refresh rotation and replay revocation.
- Corrected an initial implementation bug where invalid/revoked tokens produced HTTP 500: the verifier now raises the SDK's OAuth `invalid_token` error and returns 401.
- Corrected constant-time consent comparison to use byte lengths, so non-ASCII adversarial input cannot raise a buffer-length exception.
- Added exact Moodle origin/path restrictions, disabled redirects and bounded file streams. MCP resource reads now use the same live permission check as tool downloads.
- Confirmed all 14 advertised tools are read-only and capability-gated. No Moodle write API was added.
- Reviewed image inputs: the Docker context is allowlisted; runtime credentials, local databases, tests, Git history and large upstream media are not copied into the image.
- Limited workflow permissions and pinned third-party actions by commit. Registry authentication uses the workflow's GITHUB_TOKEN, not a committed personal token.

## Executed checks before commit

- Original baseline: 19 unit tests and TypeScript build passed.
- Updated implementation: 59 tests passed across six test files, including real-provider OAuth integration flows with mocked GitHub/Moodle endpoints.
- Strict TypeScript compilation passed after SDK v2 migration.
- Dependency audit returned no reported advisories at the time of review. This is point-in-time advisory data, not proof of absence of vulnerabilities.
- `git diff --check` passed.

The final Actions run is the source of truth for container build, container smoke checks and GHCR publication. This document does not claim a successful image push before that run completes.

## Remaining acceptance limitations

No production Moodle credential, GitHub OAuth App credential or public deployment hostname was supplied. Therefore live account sign-in, actual Moodle data retrieval, HTTPS proxy configuration and the ChatGPT connection must be validated after configuration. GitHub test responses are simulated, not a live login. The current database adapter is intended for one process/replica. CIMD, full Moodle coverage and general-purpose binary text extraction are not implemented.

## Password increment review — 0.4.0

Reviewed against `c1a286f4b9cf6fbad474d3a22e5ae61d1e0d32d2`. Kept the existing TypeScript SDK v2, Express, oidc-provider and SQLite implementation. No authentication framework migration or Moodle write tools.

- Password mode defaults on; missing/malformed hashes fail closed. GitHub requires explicit AUTH_MODE=github, preserving the code path rather than silently falling back.
- Salted scrypt uses Node crypto, no additional runtime package. Fixed parameters prevent a tampered hash from selecting an unbounded work factor. Local passwords are never OAuth bearer credentials.
- Login nonces are atomically consumed and bound to provider interaction cookies. CSRF, foreign Origin, duplicate/malformed fields, replay and oversized bodies are tested. Consent remains separate.
- SQLite-backed IP/global attempt limits survive restarts. One in-flight verification caps hash memory. Global throttling can temporarily block legitimate sign-in; this tradeoff is documented.
- A real-provider regression restarts against the same database and proves unchanged-hash token persistence, then verifies old access, refresh and browser sessions are rejected after hash rotation.
- The hidden-prompt helper was exercised through a pseudo-terminal: both prompts appeared and the test password was not echoed. Stdin mode, too-short and oversized inputs, missing TTY and invalid argument failures were also exercised.
- The expanded suite contains 92 tests, including the retained GitHub OAuth tests. Final CI is the source of truth for the full suite, type/build checks, dependency audit, container smoke checks and registry publication.

This is an implementation self-review, not an independent audit. The public HTTPS endpoint and actual ChatGPT/Moodle accounts still require live acceptance after deployment; no user password was requested or generated for deployment.
