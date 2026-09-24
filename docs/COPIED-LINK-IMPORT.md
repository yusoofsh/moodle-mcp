# Owner-approved copied Moodle link import (0.6.2)

## Use when the university returned an app link

Open `https://moodle.yusoofsh.workers.dev/connect/moodle` without a query or
fragment. Sign in using the existing bridge-owner passphrase. Expand **Import
copied Moodle link** and paste the original `moodlemobile://token=…` return from
your own permitted university login. Enter the bridge-owner passphrase again,
check the ownership/authorization acknowledgement and click **Validate copied
link**. Check the returned Moodle identity and click **Confirm this Moodle
account**. Then use **Check connection** and the existing MCP tools.

Do not paste the HTTPS `/return#…` wrapper. Do not edit the app-link scheme, decode
the token yourself, enter a Google password on this site, or put credentials in
an address bar. This path does not require a browser protocol handler or an active
SSO pairing. It does require a live owner session and a fresh password verification.

The pasted link contains an API secret; use only the private input on your bridge.
Never put a real link in GitHub, logs, documentation, screenshots or chat. A token
that has been disclosed should be revoked/reissued through the institution's
permitted process. Moodle may share an existing mobile token across sessions, so
revocation can also affect the official app; this feature never revokes it itself.

## Separate security models, not a weakened callback

Automatic `/complete` still requires the exact `web+moodlemcp` scheme, a live
one-use browser/principal-bound pairing, matching Moodle site/passport correlation,
the configured university API check, pinned user identity and explicit confirmation.
An old or rewritten URL is not silently converted into a manual import. New fixed
error codes distinguish invalid format, missing/used/expired pairing and a
correlation mismatch, without returning credentials or upstream error bodies.

`/import` is an explicit credential-provisioning action. Its authority is the
bridge owner, NOT the mobile payload's MD5 site identifier. It requires all of:

- Existing owner browser session, exact canonical Origin, application/json and
  session CSRF. An MCP bearer token alone does not authorize connection management.
- Fresh bridge-owner password verification using the existing persistent global
  and IP attempt limits, with the shared single scrypt-verification slot.
- Explicit acknowledgement that the credential is the owner's and its use is
  authorized. Only strictly formatted moodlemobile or web+moodlemcp links are
  accepted; arbitrary HTTPS wrapper URLs and bare tokens are rejected.
- Validation against only the server-configured Moodle host, no credential-bearing
  redirects, then explicit account confirmation. The pinned Moodle account cannot
  silently change. Staged credentials expire after five minutes.

Imported candidates use the same encrypted SQLite store and revision/generation
race protections as SSO. Cancel, logout, reconnect and disconnect prevent an older
operation from replacing newer state. Failed validation never overwrites active
credentials. The optional private mobile token is discarded. Confirmed imports
are labelled `credentialSource: copied-link` rather than claiming a successful
browser-SSO pairing.

No real credential is placed into tests, commits or deployment configuration.
The user performs the final import and account approval themselves. This release
changes neither Cloudflare secrets nor university account settings.

## Verification boundary

New tests cover strict input parsing, no automatic fallback, owner authentication,
CSRF and Origin rejection, fresh password and attempt limits, account pinning,
cancellation, race safety, explicit confirmation and encrypted persistence.
The HTTPS workerd browser suite exercises native form interaction in Chromium and
Firefox, using a synthetic Moodle app link and mocked university API responses.
It checks that wrong passwords fail, input fields clear, URLs/browser storage do
not retain the credential, nothing activates before confirmation, and the stored
credential survives a workerd restart and is used for an upstream check.

The actual user's copied token was not used in these tests or automatically
installed. A synthetic successful import does not prove the private university
will accept the user's credential from Cloudflare; the live validation step is
required. This is a manual fallback, not a claim that the institution's automatic
web-handler return has been fixed.
