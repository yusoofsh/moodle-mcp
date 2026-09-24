export const CONNECT_PATH = "/connect/moodle";
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function connectionPage(
  site: string,
  loginNonce?: string,
  message = "",
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="same-origin"><title>Connect university Moodle</title><script src="${CONNECT_PATH}/client.js"></script><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f6f7f9;color:#202735}main{max-width:640px;margin:8vh auto;padding:2rem;background:white;border:1px solid #dce0e7;border-radius:12px}button,input,a{font:inherit}button{padding:.6rem 1rem;cursor:pointer;margin:.3rem .3rem .3rem 0}input{padding:.6rem;display:block;width:90%;margin:.5rem 0}code{overflow-wrap:anywhere}#status{white-space:pre-line}a{color:#164ba0}[hidden]{display:none!important}</style></head><body><main><h1>Connect university Moodle</h1><p>Site: <code>${escape(site)}</code></p><p id="notice" role="status">${escape(message)}</p>${loginNonce ? `<form method="post" action="${CONNECT_PATH}/login"><input type="hidden" name="csrf" value="${loginNonce}"><label for="owner-password">Bridge owner passphrase</label><input id="owner-password" name="password" type="password" autocomplete="current-password" required maxlength="1024"><button type="submit">Sign in</button></form><p>This is the password you created for this MCP server, not your Google or university password.</p>` : `<section id="connection-app"><p id="status">Loading connection status…</p><div id="manage" hidden><p>Desktop Firefox or Chrome is required for this browser handoff. Your official Android Moodle app remains unchanged.</p><button id="register-handler" type="button">1. Enable browser return</button><p id="handler-status">Browser return has not been tested.</p><p><a id="handler-test" hidden>Test browser return</a></p><button id="connect" type="button" disabled>2. Connect using university Google SSO</button><p id="launch-container" hidden><a id="launch" target="_blank" rel="noopener noreferrer">3. Open university sign-in</a></p><section id="recovery" hidden><p id="pairing-status" role="status"></p><p><a id="finish" target="_blank" rel="noopener noreferrer">Already signed in? Finish Moodle return</a></p><p>Keep this setup tab open. After university sign-in, click the Moodle page’s <strong>Click here to launch the app</strong> link if shown. If Google sign-in completed but nothing returned, use the recovery link above within 10 minutes.</p></section><p id="next-step">First enable and test browser return. A successful test says <strong>Browser return verified</strong>. Until then, do not start Google sign-in.</p><details><summary>Why am I still on this page?</summary><p>Creating a sign-in link does not open it. Open step 3 in this browser, complete university login, then approve the return to this site. If the return test itself fails, check the browser’s protocol-handler permission. No password or token change fixes a rejected browser handler.</p><p>If university login opens the official Moodle app instead, its required return scheme is incompatible with this browser handoff. If you remain on accounts.google.com, the Google sign-in step has not finished. Do not paste full callback URLs into chat.</p></details><details id="manual-import"><summary>Import copied Moodle link</summary><p>Use this when your own university login returned a <code>moodlemobile://token=…</code> link and the browser did not return here. This explicitly imports a credential; it does not repair or skip an SSO pairing check.</p><p>Paste only a link from your own authorized Moodle login. It contains a secret: do not send it in chat or put it in an address bar.</p><form id="import-form" autocomplete="off"><label for="copied-link">Moodle app return link</label><input id="copied-link" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="2048" required><label for="import-password">Bridge owner passphrase</label><input id="import-password" type="password" autocomplete="current-password" maxlength="1024" required><label><input id="import-ack" type="checkbox" style="width:auto;display:inline" required> This is my own Moodle credential, and I authorize this bridge to use it.</label><p>The credential will be checked only against the configured university above. You must then confirm the returned account before anything is saved.</p><button id="import-submit" type="submit">Validate copied link</button></form></details><button id="check" type="button">Check connection</button><button id="disconnect" type="button">Disconnect Moodle</button><button id="fallback" type="button" hidden>Use configured token instead</button><button id="logout" type="button">Sign out of setup</button></div><section id="confirmation" hidden><h2>Confirm your Moodle account</h2><p id="identity"></p><p>Only approve your own account. Your existing connection remains unchanged until you confirm.</p><button id="approve" type="button">Confirm this Moodle account</button><button id="cancel" type="button">Cancel</button></section></section><noscript>JavaScript is required for the browser SSO return. Existing token configuration remains available.</noscript>`}<p><a href="${CONNECT_PATH}">Restart connection setup</a></p></main></body></html>`;
}

/** No Google password, token persistence, third-party resources, or credential-bearing query URLs. */
export const connectionScript = String.raw`(() => {
  'use strict';
  let returned = location.hash.slice(1);
  if (returned) history.replaceState(null, '', location.pathname);
  let callback;
  try { if (returned) callback = decodeURIComponent(returned); } catch { callback = ''; }
  returned = '';
  document.addEventListener('DOMContentLoaded', async () => {
    if (!document.getElementById('connection-app')) { callback = undefined; return; }
    const at = id => document.getElementById(id);
    let csrf, confirmation, verified = false, expiryTimer, probeTimer, refreshing = false;
    const notice = text => { at('notice').textContent = text; };
    const read = async response => {
      let result; try { result = await response.json(); } catch { throw new Error('Setup request returned HTTP ' + response.status + '. Wait briefly, then reload this page.'); }
      if (!response.ok) throw new Error(result.error || ('Setup request failed (HTTP ' + response.status + ').'));
      return result;
    };
    const api = async (action, data = {}) => read(await fetch('/connect/moodle/' + action, {
      method:'POST', credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(25000),
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrf}, body:JSON.stringify(data)
    }));
    const displayError = e => notice(e.name === 'TimeoutError' ? 'The request timed out. Reload setup to recover the pending attempt; do not change your password or token.' : e.message);
    const showPending = (pending, site) => {
      clearTimeout(expiryTimer);
      at('launch-container').hidden = true; at('recovery').hidden = true;
      at('launch').removeAttribute('href'); at('finish').removeAttribute('href');
      if (!pending) return;
      const root = new URL(site), launch = new URL(pending.launchUrl), finish = new URL(pending.finishUrl);
      const expected = root.pathname.replace(/\/$/, '') + '/admin/tool/mobile/launch.php';
      if ([launch,finish].some(u => u.origin !== root.origin || u.pathname !== expected)) throw new Error('Unexpected university URL');
      const remaining = pending.expiresAt - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) return;
      at('launch').href = launch.href; at('finish').href = finish.href;
      at('launch-container').hidden = false; at('recovery').hidden = false;
      at('pairing-status').textContent = 'Sign-in attempt ready. Open step 3; this page cannot complete Google sign-in for you.';
      expiryTimer = setTimeout(() => {
        at('launch-container').hidden = true; at('finish').removeAttribute('href');
        at('pairing-status').textContent = 'This sign-in attempt expired. Start a new attempt; do not reuse the old Google tab.';
      }, Math.min(remaining, 600000));
    };
    const refresh = async () => {
      const result = await read(await fetch('/connect/moodle/status', {credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000)}));
      csrf = result.csrf; verified = result.returnVerified === true;
      const s = result.connection;
      at('status').textContent = 'Connection: ' + s.status +
        (s.credentialSource === 'copied-link' ? ' — owner-imported Moodle credential.' : '') +
        (s.status === 'configured-token' ? ' — fallback token only; Google SSO is not connected yet. This does not verify that token works.' : '') +
        (s.userId ? '\nMoodle user ID: ' + s.userId : '') + (s.fullname ? '\nAccount: ' + s.fullname : '');
      at('fallback').hidden = !s.hasFallback;
      at('manage').hidden = Boolean(confirmation);
      at('connect').disabled = !verified;
      at('handler-status').textContent = verified ? 'Browser return verified. You can start university sign-in.' : 'Browser return has not been verified. Enable it, then click Test browser return.';
      showPending(result.pending, s.site);
      if (s.status === 'connected' && !result.pending && !confirmation) notice('A Moodle account is saved. Use Check connection, then return to ChatGPT.');
    };
    const run = (id, action) => at(id).addEventListener('click', async () => {
      at(id).disabled = true;
      try { await action(); } catch(e) { displayError(e); }
      finally { at(id).disabled = id === 'connect' ? !verified : false; }
    });
    const showCandidate = result => {
      confirmation = result.confirmation;
      at('identity').textContent = result.fullname + ' — Moodle user ID ' + result.userId + ' — ' + result.siteName;
      at('confirmation').hidden = false; at('manage').hidden = true;
      notice('The Moodle credential was validated but is not active until you confirm.');
    };
    // No fragment auto-import, no browser credential persistence, no form URL payloads.
    at('import-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!at('import-ack').checked) { notice('Only import your own authorized Moodle credential.'); return; }
      let raw = at('copied-link').value, password = at('import-password').value;
      at('copied-link').value = ''; at('import-password').value = ''; at('import-ack').checked = false;
      at('import-submit').disabled = true;
      try {
        const data = {callback:raw,password,acknowledge:true}; raw = password = undefined;
        let result; try { result = await api('import',data); } finally { delete data.callback; delete data.password; }
        showCandidate(result);
      } catch(e) { displayError(e); }
      finally { raw = password = undefined; at('import-submit').disabled = false; }
    });
    run('register-handler', async () => {
      if (typeof navigator.registerProtocolHandler !== 'function') throw new Error('Use desktop Firefox or Chrome. This browser cannot register a Moodle return handler.');
      navigator.registerProtocolHandler('web+moodlemcp', location.origin + '/connect/moodle/return#%s');
      verified = false; at('connect').disabled = true; at('handler-test').hidden = true;
      const result = await api('probe');
      if (!/^web\+moodlemcp:\/\/probe=[A-Za-z0-9_-]{43}$/.test(result.probeUrl)) throw new Error('Invalid browser-return test');
      at('handler-test').href = result.probeUrl; at('handler-test').hidden = false;
      at('handler-status').textContent = 'Accept your browser’s handler permission, then click Test browser return below. Registration alone is not a successful test.';
      notice('The test contains no Moodle token and does not sign in to Google.');
    });
    at('handler-test').addEventListener('click', () => {
      notice('Waiting for browser return. Accept the browser prompt to open this site.');
      clearTimeout(probeTimer);
      probeTimer = setTimeout(() => {
        if (!verified) notice('Browser return has not arrived. Enable this site as the web+moodlemcp handler in your browser and retry the test. Do not start Google sign-in yet.');
      }, 8000);
    });
    run('connect', async () => {
      if (!verified) throw new Error('Test browser return first.');
      await api('start'); await refresh();
      notice('Next: click 3. Open university sign-in below. It opens a new tab; keep this setup tab open.');
    });
    at('launch').addEventListener('click', () => notice('University sign-in opened in another tab. Complete it there; if it finishes without returning, use Already signed in? Finish Moodle return.'));
    at('finish').addEventListener('click', () => notice('Reopening the same Moodle return without forcing Google login. Click the university page’s launch-app link if shown.'));
    run('approve', async () => { await api('confirm',{confirmation}); confirmation=undefined; at('confirmation').hidden=true; await refresh(); notice('Moodle connected. Return to ChatGPT and run moodle_get_site_info.'); });
    run('cancel', async () => { await api('cancel'); confirmation=undefined; at('confirmation').hidden=true; await refresh(); notice('Pending connection discarded.'); });
    run('disconnect', async () => { if (!window.confirm('Disconnect Moodle from this bridge? The official Moodle app token will not be revoked.')) return; await api('disconnect'); await refresh(); notice('Disconnected. The configured token fallback stays disabled until explicitly selected.'); });
    run('fallback', async () => { if (!window.confirm('Use the configured credential instead of the stored SSO connection?')) return; await api('fallback'); await refresh(); notice('Configured fallback selected. Use Check connection to validate it.'); });
    run('check', async () => { await api('check'); await refresh(); notice('Moodle accepted the connection.'); });
    run('logout', async () => { await api('logout'); location.replace('/connect/moodle'); });
    // Refresh only when the user returns to setup; no continuous polling of free quotas.
    window.addEventListener('focus', async () => {
      if (!csrf || refreshing || confirmation) return;
      refreshing = true; try { await refresh(); } catch(e) { displayError(e); } finally { refreshing = false; }
    });
    try {
      await refresh();
      if (callback !== undefined) {
        let raw = callback; callback = undefined;
        if (/^web\+moodlemcp:\/\/probe=[A-Za-z0-9_-]{43}$/.test(raw)) {
          await api('probe-complete',{callback:raw}); raw = undefined; await refresh();
          notice('Browser return verified. Now use step 2, then open the university sign-in link.');
          return;
        }
        if (!raw || !raw.startsWith('web+moodlemcp://token=') || raw.length > 2048) throw new Error('Invalid browser return. Restart connection setup.');
        const result = await api('complete',{callback:raw}); raw = undefined;
        showCandidate(result);
      }
    } catch(e) { callback=undefined; displayError(e); }
  });
})();`;
