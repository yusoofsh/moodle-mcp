/**
 * Server-rendered authorization pages. Plain HTML and inline CSS only: the
 * Helmet CSP blocks inline scripts, and nothing here needs one. Every page
 * follows the system light/dark preference and works down to phone width.
 */
export const escapeHtml = (text: unknown): string =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

const STYLE = `
:root{color-scheme:light dark;--bg:#f4f6fa;--card:#fff;--ink:#172033;--muted:#586277;--line:#d9dee8;--brand:#1d4ed8;--brand-ink:#fff;--soft:#eef3ff;--warn-bg:#fff7e6;--warn-line:#e8b04a;--warn-ink:#6b4400;--bad-bg:#fdecec;--bad-ink:#8a1c1c;--ok:#18794e;--focus:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#0e121b;--card:#171d2a;--ink:#e9edf5;--muted:#a1abbf;--line:#2c3547;--brand:#7aa2ff;--brand-ink:#0b1020;--soft:#1c2740;--warn-bg:#2b2112;--warn-line:#a8741f;--warn-ink:#f3d9a4;--bad-bg:#3a1a1c;--bad-ink:#ffc5c5;--ok:#5fd09b;--focus:#9db8ff}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:30rem;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:clamp(1.25rem,5vw,2rem);box-shadow:0 8px 30px rgba(15,23,42,.08)}
.brand{display:flex;align-items:center;gap:.6rem;color:var(--muted);font-size:.9rem;font-weight:600;margin:0 0 1rem}
.brand svg{width:28px;height:28px;color:var(--brand)}
.steps{display:flex;gap:.4rem;list-style:none;margin:0 0 1.25rem;padding:0;font-size:.8rem;color:var(--muted)}
.steps li{flex:1;padding-top:.45rem;border-top:3px solid var(--line)}
.steps li[aria-current=step]{border-top-color:var(--brand);color:var(--ink);font-weight:600}
h1{font-size:1.5rem;line-height:1.25;margin:0 0 .5rem}
h2{font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:1.5rem 0 .5rem}
p{margin:.5rem 0}
.lead{color:var(--muted)}
.client{background:var(--soft);border-radius:10px;padding:.75rem 1rem;margin:1rem 0}
.client strong{font-size:1.1rem;overflow-wrap:anywhere}
label{display:block;font-weight:600;margin:1rem 0 .35rem}
input[type=password]{width:100%;font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.7rem .85rem}
button{font:inherit;font-weight:600;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:.75rem 1rem;cursor:pointer;min-height:44px}
button.primary{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
button:hover{filter:brightness(.96)}
:is(button,input,summary,a):focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.actions{display:grid;gap:.6rem;margin-top:1.5rem}
@media (min-width:30rem){.actions.row{grid-template-columns:2fr 1fr}}
.perm{list-style:none;margin:0;padding:0;display:grid;gap:.45rem}
.perm li{display:flex;gap:.6rem;align-items:flex-start}
.perm li::before{content:"✓";color:var(--ok);font-weight:700}
.note{font-size:.9rem;color:var(--muted)}
.alert{border-radius:10px;padding:.7rem .9rem;margin:1rem 0;background:var(--bad-bg);color:var(--bad-ink);font-weight:600}
.write{display:flex;gap:.75rem;align-items:flex-start;background:var(--warn-bg);border:1px solid var(--warn-line);color:var(--warn-ink);border-radius:12px;padding:.9rem 1rem;margin:0;font-weight:400;cursor:pointer}
.write input{width:1.25rem;height:1.25rem;margin-top:.2rem;accent-color:var(--brand);flex:none}
.write b{display:block}
details{margin-top:1.25rem;font-size:.9rem;color:var(--muted)}
summary{cursor:pointer;font-weight:600}
code{display:block;margin-top:.25rem;overflow-wrap:anywhere;font-size:.85rem;color:var(--ink)}
@media (prefers-reduced-motion:no-preference){button{transition:filter .15s}}
`;

const MARK = `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3 4 8v8c0 7 5 11 12 13 7-2 12-6 12-13V8z"/><path d="m11 16 4 4 7-8"/></svg>`;

function layout(title: string, step: 1 | 2, body: string, head = ""): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style>${head}<body><main><p class="brand">${MARK}Moodle MCP</p><ol class="steps" aria-label="Progress"><li${step === 1 ? ' aria-current="step"' : ""}>1. Sign in</li><li${step === 2 ? ' aria-current="step"' : ""}>2. Authorize</li></ol>${body}</main></body></html>`;
}

export function passwordPage(nonce: string, invalid = false): string {
  return layout(
    "Sign in to Moodle MCP",
    1,
    `<h1>Sign in to Moodle MCP</h1><p class="lead">Enter this server's owner password. This is not your Moodle password.</p>${invalid ? '<p role="alert" class="alert">Incorrect password. Try again.</p>' : ""}<form method="post" action="/interaction/password"><input type="hidden" name="csrf" value="${nonce}"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024" autofocus><div class="actions"><button class="primary" type="submit">Continue</button></div></form><p class="note">Next you choose what the connecting app may do. Nothing is shared until you approve.</p>`,
  );
}

export interface ConsentView {
  clientName: string;
  clientId: string;
  redirectUri: string;
  csrf: string;
  /** True when the client asked for the write scope. Otherwise only read access exists to grant. */
  offersWrite: boolean;
}

export function consentPage(view: ConsentView): string {
  const write = view.offersWrite
    ? `<h2>Optional: changes</h2><label class="write" for="write"><input id="write" name="write" type="checkbox" value="1"><span><b>Also allow changes (read &amp; write)</b>Lets this app run any write function your Moodle token permits: submit or edit assignments, post in forums, send messages, update your profile and more. Moodle still applies your account's own permissions. Functions that issue login credentials stay blocked. Leave unchecked to stay read-only.</span></label>`
    : "";
  return layout(
    "Authorize Moodle MCP",
    2,
    `<h1>Authorize Moodle MCP</h1><p class="lead">You are signed in as the server owner.</p><div class="client"><span class="note">Connecting app</span><br><strong>${escapeHtml(view.clientName)}</strong></div><h2>Always included: read access</h2><ul class="perm"><li>Courses, files and course content</li><li>Assignments, grades and quiz results</li><li>Calendar, forums and notifications</li></ul><form method="post" action="/interaction/confirm"><input type="hidden" name="csrf" value="${escapeHtml(view.csrf)}">${write}<div class="actions row"><button class="primary" name="decision" value="allow">${view.offersWrite ? "Allow access" : "Allow read-only access"}</button><button name="decision" value="deny">Deny</button></div></form><p class="note">${view.offersWrite ? "You can disconnect this app at any time by removing the connector." : "This app asked for read access only. It cannot submit work or change grades."}</p><details><summary>Technical details</summary><p>Client ID<code>${escapeHtml(view.clientId)}</code></p><p>Redirect URI<code>${escapeHtml(view.redirectUri)}</code></p></details>`,
  );
}
