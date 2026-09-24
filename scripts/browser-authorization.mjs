import { chromium, firefox } from "playwright";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";

/** Native navigation/form submissions; never inject an Origin header. */
export async function exerciseBrowserAuthorization(name, fixture) {
  const { origin, password, register, exchange, rpc } = fixture;
  let callbackReferrer;
  const callbackServer = createServer((req, res) => {
    callbackReferrer = req.headers.referer;
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
    res.end("<h1>Connected</h1>");
  });
  callbackServer.listen(0, "127.0.0.1");
  await once(callbackServer, "listening");
  const redirect = `http://127.0.0.1:${callbackServer.address().port}/callback`;
  let browser;
  try {
    const clientId = await register(redirect);
    browser = await { chromium, firefox }[name].launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const verifier = randomBytes(32).toString("base64url");
    const state = randomBytes(16).toString("hex");
    const login = await page.goto(
      origin +
        "/oauth/authorize?" +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirect,
          response_type: "code",
          scope: "openid offline_access moodle:read",
          resource: origin + "/mcp",
          state,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
        }),
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(new URL(page.url()).pathname, "/interaction");
    await page.locator("#password").fill(password);
    const passwordResponse = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/interaction/password" &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const submitted = await passwordResponse;
    const headers = await submitted.request().allHeaders();
    assert.equal(
      headers.origin,
      origin,
      `${name}: browser-generated login Origin`,
    );
    assert.equal(
      submitted.status(),
      303,
      `${name}: correct fixture password must advance to consent`,
    );
    assert.equal(login.headers()["referrer-policy"], "same-origin");
    await page
      .getByRole("heading", { name: "Authorize Moodle MCP", exact: true })
      .waitFor();
    const consentResponse = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/interaction/confirm" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Allow read-only access", exact: true })
      .click();
    const consent = await consentResponse;
    assert.equal(
      (await consent.request().allHeaders()).origin,
      origin,
      `${name}: browser-generated consent Origin`,
    );
    assert.equal(consent.status(), 303);
    await page.waitForURL(redirect + "**");
    const callback = new URL(page.url());
    assert.equal(callback.searchParams.get("state"), state);
    assert.ok(callback.searchParams.get("code"));
    assert.equal(
      callbackReferrer,
      undefined,
      "Do not disclose referrers to the external callback",
    );
    const token = await exchange(
      clientId,
      { code: callback.searchParams.get("code"), verifier },
      { redirect_uri: redirect },
    );
    assert.equal(
      token.status,
      200,
      "Browser authorization code exchanges through PKCE",
    );
    assert.ok(token.json.refresh_token);
    const result = await rpc(token.json.access_token, "tools/call", {
      name: "moodle_list_courses",
      arguments: {},
    });
    assert.equal(result.status, 200);
    assert.match(result.text, /Sample course/);
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) =>
      callbackServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
