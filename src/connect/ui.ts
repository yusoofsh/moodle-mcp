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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="same-origin"><title>Connect university Moodle</title><script src="${CONNECT_PATH}/client.js"></script><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f6f7f9;color:#202735}main{max-width:640px;margin:8vh auto;padding:2rem;background:white;border:1px solid #dce0e7;border-radius:12px}button,input,a{font:inherit}button{padding:.6rem 1rem;cursor:pointer;margin:.3rem .3rem .3rem 0}input{padding:.6rem;display:block;width:90%;margin:.5rem 0}code{overflow-wrap:anywhere}#status{white-space:pre-line}a{color:#164ba0}[hidden]{display:none!important}</style></head><body><main><h1>Connect university Moodle</h1><p>Site: <code>${escape(site)}</code></p><p id="notice" role="status">${escape(message)}</p>${loginNonce ? `<form method="post" action="${CONNECT_PATH}/login"><input type="hidden" name="csrf" value="${loginNonce}"><label for="owner-password">Bridge owner passphrase</label><input id="owner-password" name="password" type="password" autocomplete="current-password" required maxlength="1024"><button type="submit">Sign in</button></form><p>This is the password you created for this MCP server, not your Google or university password.</p>` : `<section id="connection-app"><p id="status">Loading connection status…</p><div id="manage" hidden><p>Desktop Firefox or Chrome is required for this browser handoff. Your official Android Moodle app remains unchanged.</p><button id="register-handler" type="button">1. Enable browser return</button><p id="handler-status"></p><button id="connect" type="button" disabled>2. Connect using university Google SSO</button><p id="launch-container" hidden><a id="launch" rel="noreferrer">3. Continue to university sign-in</a></p><p>Allow the browser prompt, then sign in on your university’s own page. A forced official-app callback or unsupported browser may prevent the return.</p><button id="check" type="button">Check connection</button><button id="disconnect" type="button">Disconnect Moodle</button><button id="fallback" type="button" hidden>Use configured token instead</button><button id="logout" type="button">Sign out of setup</button></div><section id="confirmation" hidden><h2>Confirm your Moodle account</h2><p id="identity"></p><p>Only approve your own account. Your existing connection remains unchanged until you confirm.</p><button id="approve" type="button">Confirm this Moodle account</button><button id="cancel" type="button">Cancel</button></section></section><noscript>JavaScript is required for the browser SSO return. Existing token configuration remains available.</noscript>`}<p><a href="${CONNECT_PATH}">Restart connection setup</a></p></main></body></html>`;
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
    const root = document.getElementById('connection-app');
    if (!root) { callback = undefined; return; }
    const at = id => document.getElementById(id);
    let csrf, confirmation;
    const notice = text => { at('notice').textContent = text; };
    const api = async (action, data = {}) => {
      const response = await fetch('/connect/moodle/' + action, {method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connection request failed');
      return result;
    };
    const refresh = async () => {
      const response = await fetch('/connect/moodle/status', {credentials:'same-origin',cache:'no-store'});
      if (!response.ok) throw new Error('Setup login expired. Restart connection setup and sign in again.');
      const result = await response.json(); csrf = result.csrf;
      const s = result.connection;
      at('status').textContent = 'Connection: ' + s.status + (s.userId ? '\nMoodle user ID: ' + s.userId : '') + (s.fullname ? '\nAccount: ' + s.fullname : '');
      at('fallback').hidden = !s.hasFallback;
      at('manage').hidden = false;
    };
    const run = (id, action) => { at(id).addEventListener('click', async () => { at(id).disabled=true; try {await action();} catch(e) {notice(e.message);} finally{at(id).disabled=false;} }); };
    run('register-handler', async () => {
      if (typeof navigator.registerProtocolHandler !== 'function') throw new Error('Use desktop Firefox or Chrome. This browser cannot register a Moodle return handler.');
      navigator.registerProtocolHandler('web+moodlemcp', location.origin + '/connect/moodle/return#%s');
      at('handler-status').textContent='Accept the browser prompt to allow Moodle return links. Registration cannot be verified automatically.';
      at('connect').disabled=false;
    });
    run('connect', async () => {
      const result=await api('start');
      const launch=new URL(result.launchUrl);
      const site=new URL(result.site);
      if (launch.origin!==site.origin || !launch.pathname.endsWith('/admin/tool/mobile/launch.php')) throw new Error('Unexpected university URL');
      at('launch').href=launch.href;at('launch-container').hidden=false;
      notice('Continue to the university sign-in using the link below. Keep this browser for the return.');
    });
    run('approve', async () => { await api('confirm',{confirmation});confirmation=undefined;at('confirmation').hidden=true;notice('Moodle connected. Return to ChatGPT and run moodle_get_site_info.');await refresh(); });
    run('cancel', async () => { await api('cancel');confirmation=undefined;at('confirmation').hidden=true;await refresh();notice('Pending connection discarded.'); });
    run('disconnect', async () => { if (!window.confirm('Disconnect Moodle from this bridge? The official Moodle app token will not be revoked.')) return;await api('disconnect');await refresh();notice('Disconnected. The configured token fallback is also disabled until explicitly selected.'); });
    run('fallback', async () => { if (!window.confirm('Use the credential configured on this server instead of the stored SSO connection?')) return;await api('fallback');await refresh();notice('Configured fallback selected. Use Check connection to validate it.'); });
    run('check', async () => { await api('check');await refresh();notice('Moodle accepted the connection.'); });
    run('logout', async () => {await api('logout');location.replace('/connect/moodle');});
    try {
      await refresh();
      if (callback !== undefined) {
        const raw=callback;callback=undefined;
        if (!raw || !raw.startsWith('web+moodlemcp://token=') || raw.length>2048) throw new Error('Invalid browser return. Restart connection setup.');
        const result=await api('complete',{callback:raw});
        confirmation=result.confirmation;
        at('identity').textContent=result.fullname + ' — Moodle user ID ' + result.userId + ' — ' + result.siteName;
        at('confirmation').hidden=false;at('manage').hidden=true;
        notice('The Moodle credential was validated but is not active yet.');
      }
    } catch(e) {callback=undefined;notice(e.message);}
  });
})();`;
