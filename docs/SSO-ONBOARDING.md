# Student SSO onboarding (0.6.0)

This adds a browser-based connection manager to the existing password-protected
MCP deployment. It uses the institution's **Moodle mobile SSO flow**, not a new
Google OAuth application. No Moodle administrator privileges or university plugin
installation are required by our code. The university must already permit the
mobile service and the custom-scheme return. Its policies remain authoritative.

## Connect SiberMu

1. Open `https://moodle.yusoofsh.workers.dev/connect/moodle` in **desktop Firefox or
   Chrome**, using the same browser for the whole flow.
2. Enter your existing **MCP bridge owner passphrase**, not your Google password.
3. Click **1. Enable browser return**. Accept the browser prompt permitting
   `web+moodlemcp` links to open this Worker. The page cannot read whether the
   browser has granted that permission.
4. Click **2. Connect using university Google SSO**, then the displayed
   **3. Continue to university sign-in** link. Confirm that it opens your configured
   university host. For this deployment that should be `solusi.sibermu.ac.id`.
5. Sign in on the real Google/university pages. Our page does not collect your
   Google password. Accept the return-handler prompt when your browser asks.
6. On the Worker, verify the returned Moodle name and user ID, then click
   **Confirm this Moodle account**. The credential is not activated before this.
7. Return to ChatGPT and call `moodle_get_site_info`, then `moodle_list_courses`.
   The MCP endpoint and existing ChatGPT OAuth configuration do not change.

Pairing lasts 10 minutes; account confirmation lasts 5 minutes; setup login lasts
20 minutes. Restart setup after expiration. If the institution forces the
`moodlemobile` scheme and opens its official app instead, this browser-only path
cannot complete. Do not change the institution's settings or extract another
application's credentials. Retain a permitted token fallback or use an approved
handoff. Safari and Chrome on Android are not supported for this browser method.

## Existing deployment and credential precedence

Keep `PUBLIC_URL`, `AUTH_SECRET`, `AUTH_PASSWORD_HASH`, `MOODLE_URL`, the Worker
name, Durable Object binding/class, and migration history unchanged. **No new
Cloudflare secrets or Google client credentials are required.**

`MOODLE_TOKEN` is now optional in Workers/password-HTTP mode. It remains a fallback
until an SSO connection is explicitly confirmed. The order is:

- A confirmed, encrypted stored SSO token is preferred.
- Without one, the existing environment credential can still be used.
- **Disconnect Moodle** removes the stored token and leaves a durable disabled
  marker. It does not silently reactivate the environment credential.
- **Use configured token instead** explicitly selects that fallback again. When
  an account is already pinned, the fallback must belong to that same Moodle ID.

Disconnect does **not** call a Moodle token-revocation API. Moodle can reuse an
existing mobile token, so revoking it could also log out the official mobile app.
A failed or cancelled onboarding does not overwrite an existing connection.
The first confirmed SSO connection pins the account; reconnecting cannot silently
switch to a different Moodle user. Changing account ownership is not provided by
this UI. Changing the owner password invalidates setup sessions and OAuth access
but does not delete the encrypted Moodle connection.

The setup status is the stored connection state, not a continuous health check.
Use **Check connection** to validate it now. An expired/revoked Moodle token needs
another university sign-in; Google authentication does not produce a general
Moodle refresh token for this bridge.

## Security design

- Exact canonical Origin checks, same-origin JSON requests with session CSRF,
  Secure/HttpOnly/SameSite=Lax cookies, one-use password forms, and shared persistent
  password-attempt limits protect every setup mutation. OAuth bearer tokens alone
  do not grant access to connection management.
- A shared single-password-verification slot bounds concurrent scrypt work across
  OAuth login and setup login. Remote HTTP budgets also cover setup routes.
- The Moodle URL is server-configured, never taken from a callback. Public config
  must agree with that site and its fixed mobile launch endpoint. The Google
  issuer is discovered rather than assuming a permanent provider number.
- Each return must match the one-use passport/site identifier and initiating
  authenticated browser. Moodle's MD5 identifier is a protocol correlation field,
  **not a cryptographic signature**. Real API-token validation and explicit
  account confirmation are separate requirements.
- `navigator.registerProtocolHandler` uses a same-origin HTTPS handler with a
  `#%s` fragment. The local script immediately clears that fragment, then sends a
  bounded CSRF-protected POST. Callback query strings are rejected. No third-party
  scripts, analytics, browser local storage, or credential logging are added.
- The optional mobile `privatetoken` is discarded. Only the necessary web-service
  token is staged, then stored using the existing authenticated encryption and
  Durable Object SQLite adapter. No Google password or Google refresh token is
  handled by the bridge.
- Concurrent cancellation/reconnection, stale confirmations, and disconnects
  invalidate older transactions. Failed initial client connections are retryable.
  Credential changes invalidate the cached Moodle client.
- Setup does not change Moodle permissions. The 14 read-only tools and their
  per-call capability and file-visibility checks remain in place.

## Verification boundary

Tests exercise synthetic university API responses, real OAuth/password checks,
real Durable Object SQLite and full runtime restarts. The new HTTPS workerd browser
suite invokes the actual protocol-registration API in Chromium and Firefox, then
supplies a **simulated fragment return**. It verifies native owner login, callback
cleanup, explicit confirmation, stored-token selection, persistence and logout.
It does not automate the browser's permission dialog, real Google authentication,
or SiberMu's final custom-scheme dispatch. Those are the owner's acceptance test.

References: Moodle `public/admin/tool/mobile/launch.php`, and the HTML/MDN
`Navigator.registerProtocolHandler` documentation. The institution can override
an app scheme; support in its Android app is evidence of mobile-service access,
not proof of this particular web-handler return.

### Executed release checks

Before the 0.6.0 commit: 162 Node tests across 17 files passed, the existing 17
workerd/browser groups passed, and 2 additional HTTPS Chromium/Firefox SSO setup
groups passed. The new browser tests include an external-origin fixture navigation
before the fragment return. TypeScript, formatting, build and bundle checks passed;
`bun audit` reported no advisories in the 290 checked packages at that time.
Both deployment and OCI publication now gate on the SSO browser suite as well.
