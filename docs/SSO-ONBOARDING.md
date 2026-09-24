# Student SSO onboarding (0.6.1)

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
   `web+moodlemcp` links to open this Worker. Then click **Test browser return**.
   Continue only when the returned page says **Browser return verified**. Merely
   calling the browser registration API no longer enables the sign-in button.
4. Click **2. Connect using university Google SSO**, then the displayed
   **3. Open university sign-in** link. Keep setup open; sign-in opens a new tab. Confirm that it opens your configured
   university host. For this deployment that should be `solusi.sibermu.ac.id`.
5. Sign in on the real Google/university pages. Our page does not collect your
   Google password. Click **Click here to launch the app** on Moodle if shown,
   then accept the return-handler prompt. If university login finishes without
   returning, use **Already signed in? Finish Moodle return** in the setup tab.
   It reuses the live pairing without forcing a new Google login.
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

## When setup appears stuck

- `configured-token` only reports that an environment fallback is configured. It
  does not mean SSO is connected or that the fallback passed a Moodle API check.
- A browser-return test that does not return isolates the web-handler/permission
  step before involving Google. Do not advance to university login until it works.
- Creating a launch URL is not navigation. Click **3. Open university sign-in**.
- A page still at `accounts.google.com` has not finished the Google stage. The
  recovery link is intended for an already authenticated Moodle browser session.
- If Google returns to the university but stops there, the recovery link opens
  the original mobile launch with `confirmed=1` and without `oauthsso`. It does not
  change university settings or skip authentication. The same passport, expiry,
  browser binding and subsequent account confirmation remain required.
- Reloading setup recovers the current attempt's links. After ten minutes, the
  UI disables old links; create a fresh attempt. Focus refreshes status when you
  return from another tab, without continuous polling.
- Older, pre-0.6.1 pairing records have no recovery URL: start a fresh attempt.

The probe is a usability diagnostic, not an authentication factor or proof of
university login. Its endpoints still require the owner session, exact Origin,
CSRF and a matching, single-use nonce. It never handles Moodle credentials.
The existing global/per-address HTTP budgets remain; harmless setup GET/HEAD
page, script and status reads no longer consume the tighter mutation budget.
Password attempt limits and the single scrypt verification slot are unchanged.

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

### 0.6.1 return diagnostics and recovery validation

Baseline: `86da955f6cee0bf927826f57e084de248d56ff0f`. The previous UI enabled
university sign-in as soon as registerProtocolHandler returned, without checking
that the browser would handle the return. Its setup screen also did not distinguish
creating a sign-in link from opening it, and had no same-attempt recovery link.
These are confirmed application defects, not proof of why the user's Google
account chooser stalled or whether their browser permits the custom scheme.

Executed before this patch's commit: 169 Node tests across 17 files, 17 existing
workerd/browser groups, and 2 HTTPS SSO Chromium/Firefox groups passed. Formatting,
TypeScript, frozen-lockfile installation and bundle checks passed; the bundle was
2136.98 KiB / 599.78 KiB gzipped. Dependency audit found no advisories in 290 checked
packages at that time. Browser tests now verify that registration alone does not
unlock sign-in, a simulated one-use probe does, a real clicked link opens a new
university tab, and a second clicked recovery link preserves the same passport
without oauthsso. They also test confirmation and durable restart.

The browser tests supply synthetic university pages and fragment returns. They do
not approve the browser's native permission dialog, authenticate to Google, or
prove SiberMu's final custom-scheme dispatch. The live probe must succeed on the
owner's browser, followed by a real sign-in and account confirmation. Do not report
this patch as verified end-to-end university SSO based only on these tests.

No existing token, password, OAuth grant, binding name, class migration, university
setting or account billing is modified by this code change. Fresh pairings receive
a recoverable launch URL; older incomplete pairings should be restarted.

### 0.6.2: importing an owner-copied app link

When your own permitted Moodle login returns `moodlemobile://token=…`, the setup
page now has **Import copied Moodle link**. This is a separate, explicit import:
it requires your owner session, fresh bridge passphrase, authorization checkbox,
server-side university token validation and final account confirmation. It does
not require an old pairing or browser handler, and it does not relax `/complete`.
See [copied-link import](COPIED-LINK-IMPORT.md) for steps and the security boundary.
Do not change the scheme or put a credential in an HTTPS return URL manually.
