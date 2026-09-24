# Browser login regression — September 24, 2026

## Reproduced failure

The deployed `fac611e9` version served login HTML with Helmet's default
`Referrer-Policy: no-referrer`. A native Chromium form submission sent
`Origin: null` and received HTTP 403, `Invalid login request`, before password
verification. A diagnostic synthetic password was used; the owner's password
and Moodle credentials were not read or changed.

The previous API/workerd tests explicitly supplied the expected Origin header,
so they did not exercise browser-generated request provenance.

## Fix and security boundaries

- Interaction pages use `Referrer-Policy: same-origin`. OAuth endpoints retain
  `no-referrer`, and external callbacks receive no Referer.
- Login and consent still require the exact canonical Origin. Missing, null,
  and foreign origins remain rejected. Nonces, cookies, password verification,
  attempt limits, scopes, and token persistence are unchanged.
- A real browser exposed a second issue: `form-action 'self'` blocked the
  post-consent redirect chain. Consent pages now permit only self and the
  registered client's verified HTTP(S) callback origin. Password pages remain
  self-only. Wildcards, credentials, opaque schemes, and unregistered callback
  URIs are rejected; the other Helmet CSP directives are retained.
- No production secrets, OAuth database contents, deployment names, bindings,
  or migrations are altered by the fix.

## Executed validation

- The new unit regression failed against the old header.
- Chromium against the old bundled Worker failed with a native `Origin: null`.
- 123 tests across 12 files passed after the fix.
- 14 workerd integration groups passed with `bun run workers:test:browser`,
  including native Chromium and Firefox login, consent, callback navigation,
  PKCE token exchange, and a Moodle read. These tests run real OAuth and Durable
  Object SQLite; only Moodle responses are mocked. Browser headers are not forged.
- Browser callbacks use a local listener: no test authorization code is delivered
  to an external service.
- Formatting, TypeScript, build, bundle, and dependency advisory checks passed.
- Deployment and OCI workflows now install the pinned browser runtimes and gate
  publication on browser/workerd regression tests.

The live owner's authenticated Moodle retrieval is not established by these
fixture tests. Restart an old authorization tab so it receives the corrected
response headers; changing the password hash is unnecessary.
