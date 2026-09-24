import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { chromium, firefox } from "playwright";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../dist/auth/password.js";
const origin = "https://localhost:3143",
  site = "https://moodle.example",
  base = "/connect/moodle";
const password = "synthetic SSO setup passphrase",
  token = "b".repeat(32);
const storage = await mkdtemp(join(tmpdir(), "moodle-sso-workerd-"));
const bindings = {
  PUBLIC_URL: origin,
  AUTH_SECRET: "ab".repeat(32),
  AUTH_PASSWORD_HASH: await hashPassword(password, true),
  MOODLE_URL: site,
};
let mf,
  calls = 0,
  lastToken;
async function start() {
  const options = convertV4MiniflareOptions({
    name: "moodle-sso",
    port: 3143,
    https: true,
    stripCfConnectingIp: false,
    modules: true,
    scriptPath: ".wrangler/build/worker.js",
    compatibilityDate: "2026-09-23",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    durableObjects: { MOODLE_MCP: { className: "MoodleMcp", useSQLite: true } },
    bindings,
    outboundService: async (request) => {
      assert.equal(new URL(request.url).origin, site);
      if (new URL(request.url).pathname === "/lib/ajax/service.php")
        return Response.json([
          {
            error: false,
            data: {
              wwwroot: site,
              enablewebservices: 1,
              enablemobilewebservice: 1,
              launchurl: site + "/admin/tool/mobile/launch.php",
              identityproviders: [
                {
                  name: "Login SSO Google",
                  url: site + "/auth/oauth2/login.php?id=3",
                },
              ],
            },
          },
        ]);
      assert.equal(
        new URL(request.url).pathname,
        "/webservice/rest/server.php",
      );
      const body = new URLSearchParams(await request.text());
      lastToken = body.get("wstoken");
      assert.equal(lastToken, token);
      calls++;
      return Response.json({
        userid: 42,
        fullname: "Student Fixture",
        sitename: "SSO fixture Moodle",
        release: "4.5",
        functions: [],
      });
    },
  });
  options.isolatedResourcePersistencePath = join(storage, "isolated");
  options.resourcePersistencePath = join(storage, "shared");
  mf = new Miniflare(options);
  await mf.ready;
}
async function exercise(name) {
  const browser = await { chromium, firefox }[name].launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      "CF-Connecting-IP": name === "chromium" ? "192.0.2.90" : "192.0.2.91",
    },
  });
  let page = await context.newPage();
  page.setDefaultTimeout(15000);
  let postedCallback = false;
  try {
    const response = await page.goto(origin + base);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()["referrer-policy"], "same-origin");
    await page.locator("#owner-password").fill(password);
    const posted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === base + "/login" &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const login = await posted;
    assert.equal(login.status(), 303);
    assert.equal((await login.request().allHeaders()).origin, origin);
    await page.locator("#manage").waitFor({ state: "visible" });
    // Call the actual browser API, but do not claim the browser's permission UI or
    // Moodle's custom-scheme dispatch is automated. The fixture supplies the
    // fragment-navigation result that an accepted protocol handler must produce.
    await page
      .getByRole("button", { name: "1. Enable browser return", exact: true })
      .click();
    await page.locator("#handler-test").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#connect").isDisabled(),
      true,
      "Registration alone must not unlock Google sign-in",
    );
    const probe = await page.locator("#handler-test").getAttribute("href");
    assert.match(probe, /^web\+moodlemcp:\/\/probe=[A-Za-z0-9_-]{43}$/);
    // Permission/native scheme dispatch remains manual. Supply only the test return
    // a permitted handler would generate, then verify the real owner-bound POST.
    await page.goto(origin + base + "/return#" + encodeURIComponent(probe));
    await page.locator("#connect:not([disabled])").waitFor();
    assert.match(
      await page.locator("#handler-status").innerText(),
      /Browser return verified/,
    );
    assert.equal(page.url(), origin + base + "/return");
    const startResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === base + "/start",
    );
    await page
      .getByRole("button", {
        name: "2. Connect using university Google SSO",
        exact: true,
      })
      .click();
    const launch = new URL((await (await startResponse).json()).launchUrl);
    assert.equal(launch.origin, site);
    assert.equal(launch.searchParams.get("oauthsso"), "3");
    assert.equal(launch.searchParams.get("urlscheme"), "web+moodlemcp");
    assert.equal(launch.searchParams.get("confirmed"), "1");
    await page.locator("#finish").waitFor({ state: "visible" });
    const finish = new URL(await page.locator("#finish").getAttribute("href"));
    assert.equal(
      finish.searchParams.get("passport"),
      launch.searchParams.get("passport"),
    );
    assert.equal(finish.searchParams.has("oauthsso"), false);
    assert.equal(finish.searchParams.get("confirmed"), "1");
    // Pending link survives reloading the setup page without creating a new login.
    await page.reload();
    await page.locator("#finish").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#finish").getAttribute("href"),
      finish.href,
    );
    const id = createHash("md5")
      .update(site + launch.searchParams.get("passport"))
      .digest("hex");
    const raw =
      "web+moodlemcp://token=" +
      Buffer.from(
        id + ":::" + token + ":::discard-this-private-token",
      ).toString("base64");
    const requests = [];
    context.on("request", (r) => {
      requests.push(r.url());
      if (new URL(r.url()).pathname === base + "/complete")
        postedCallback = true;
    });
    await context.route(site + "/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<h1>University SSO test fixture</h1><a href="${origin + base + "/return#" + encodeURIComponent(raw)}">Return from Moodle fixture</a>`,
      }),
    );
    const setup = page;
    const [university] = await Promise.all([
      context.waitForEvent("page"),
      setup.locator("#launch").click(),
    ]);
    await university.waitForLoadState("domcontentloaded");
    assert.equal(university.url(), launch.href);
    assert.equal(new URL(setup.url()).origin, origin, "Setup tab stays open");
    await university.close();
    const [recovery] = await Promise.all([
      context.waitForEvent("page"),
      setup.locator("#finish").click(),
    ]);
    page = recovery;
    page.setDefaultTimeout(15000);
    await page.waitForLoadState("domcontentloaded");
    assert.equal(page.url(), finish.href);
    await page
      .getByRole("link", { name: "Return from Moodle fixture", exact: true })
      .click();
    await page
      .locator("#confirmation")
      .waitFor({ state: "visible" })
      .catch(async (e) => {
        console.error(name, await page.locator("#notice").innerText());
        throw e;
      });
    assert.equal(page.url(), origin + base + "/return");
    assert.equal(postedCallback, true);
    assert.match(
      await page.locator("#identity").innerText(),
      /Student Fixture/,
    );
    assert.ok(
      requests.every((url) => !url.includes("token=") && !url.includes(token)),
      "No token or callback payload in HTTP request URLs",
    );
    const before = await page.evaluate(async () => {
      const r = await fetch("/connect/moodle/status");
      return r.json();
    });
    if (name === "chromium")
      assert.equal(before.connection.status, "disconnected");
    const confirm = page.waitForResponse(
      (r) => new URL(r.url()).pathname === base + "/confirm",
    );
    await page
      .getByRole("button", { name: "Confirm this Moodle account", exact: true })
      .click();
    assert.equal((await confirm).status(), 200);
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.includes("Connection: connected"),
    );
    assert.equal(lastToken, token);
    const stored = await context.storageState();
    assert.ok(
      stored.cookies.some(
        (c) => c.name === "__Host-moodle-connect" && c.httpOnly && c.secure,
      ),
    );
    assert.ok(!JSON.stringify(stored).includes(token));
    // Reload both runtime and encrypted SQLite while retaining the real browser session.
    await mf.dispose();
    await start();
    await page.goto(origin + base);
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.includes("Connection: connected"),
    );
    const check = page.waitForResponse(
      (r) => new URL(r.url()).pathname === base + "/check",
    );
    await page
      .getByRole("button", { name: "Check connection", exact: true })
      .click();
    assert.equal((await check).status(), 200);
    assert.equal(lastToken, token);
    const result = await page.evaluate(async () => {
      const s = await (await fetch("/connect/moodle/status")).json();
      const r = await fetch("/connect/moodle/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": s.csrf },
        body: "{}",
      });
      return r.status;
    });
    assert.equal(result, 200);
    const unauthorized = await page.evaluate(async () => {
      return (await fetch("/connect/moodle/status")).status;
    });
    assert.equal(unauthorized, 401);
    console.log(
      "PASS " +
        name +
        ": owner login, unverified-return guard, simulated probe, new-tab sign-in, same-attempt recovery, confirmation, durable restart, token selection, logout",
    );
  } finally {
    await browser.close();
  }
}
async function exerciseImport(name) {
  console.log("START " + name + ": copied-link browser integration");
  const browser = await { chromium, firefox }[name].launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      "CF-Connecting-IP": name === "chromium" ? "192.0.2.96" : "192.0.2.97",
    },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const copied =
    "moodlemobile://token=" +
    Buffer.from(
      "a".repeat(32) + ":::" + token + ":::discard-private-credential",
    ).toString("base64");
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  try {
    await page.goto(origin + base);
    await page.locator("#owner-password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.locator("#manage").waitFor({ state: "visible" });
    assert.equal(await page.locator("#connect").isDisabled(), true);
    // A stale automatic return remains rejected; it never becomes an import.
    const automatic = await page.evaluate(
      async (raw) => {
        const status = await (await fetch("/connect/moodle/status")).json();
        const response = await fetch("/connect/moodle/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": status.csrf,
          },
          body: JSON.stringify({ callback: raw }),
        });
        return { status: response.status, data: await response.json() };
      },
      copied.replace("moodlemobile:", "web+moodlemcp:"),
    );
    assert.equal(automatic.status, 400);
    assert.equal(automatic.data.code, "pairing_missing");
    await page.locator("#manual-import > summary").click();
    await page.locator("#copied-link").fill(copied);
    await page.locator("#import-password").fill("wrong-fixture-password");
    await page.locator("#import-ack").check();
    let response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === base + "/import",
    );
    await page
      .getByRole("button", { name: "Validate copied link", exact: true })
      .click();
    assert.equal((await response).status(), 401);
    await page.waitForFunction(() =>
      document
        .getElementById("notice")
        .textContent.includes("Incorrect bridge-owner"),
    );
    assert.equal(await page.locator("#copied-link").inputValue(), "");
    assert.equal(await page.locator("#import-password").inputValue(), "");
    const before = await page.evaluate(
      async () =>
        (await (await fetch("/connect/moodle/status")).json()).connection,
    );
    await page.locator("#copied-link").fill(copied);
    await page.locator("#import-password").fill(password);
    await page.locator("#import-ack").check();
    response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === base + "/import",
    );
    await page
      .getByRole("button", { name: "Validate copied link", exact: true })
      .click();
    const imported = await response;
    assert.equal(imported.status(), 200);
    assert.equal((await imported.request().allHeaders()).origin, origin);
    const json = await imported.json();
    assert.equal(json.credentialSource, "copied-link");
    assert.ok(!JSON.stringify(json).includes(token));
    await page.locator("#confirmation").waitFor({ state: "visible" });
    const staged = await page.evaluate(
      async () =>
        (await (await fetch("/connect/moodle/status")).json()).connection,
    );
    assert.deepEqual(
      staged,
      before,
      "Validation must not activate or overwrite the credential",
    );
    assert.equal(await page.locator("#copied-link").inputValue(), "");
    assert.equal(await page.locator("#import-password").inputValue(), "");
    response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === base + "/confirm",
    );
    await page
      .getByRole("button", { name: "Confirm this Moodle account", exact: true })
      .click();
    assert.equal((await response).status(), 200);
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.includes("owner-imported Moodle credential"),
    );
    assert.ok(!(await page.content()).includes(token));
    assert.ok(!(await page.content()).includes(copied));
    assert.ok(
      urls.every(
        (u) =>
          !u.includes("token=") &&
          !u.includes(token) &&
          !u.includes(encodeURIComponent(copied)),
      ),
    );
    assert.ok(!JSON.stringify(await context.storageState()).includes(token));
    await mf.dispose();
    await start();
    await page.goto(origin + base);
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.includes("owner-imported Moodle credential"),
    );
    response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === base + "/check",
    );
    await page
      .getByRole("button", { name: "Check connection", exact: true })
      .click();
    assert.equal((await response).status(), 200);
    assert.equal(lastToken, token);
    console.log(
      "PASS " +
        name +
        ": explicit native-link import, fresh owner password, no automatic fallback, confirmation, field clearing, durable persistence and upstream verification",
    );
  } finally {
    await browser.close();
  }
}
const [browserName, flow] = process.argv.slice(2);
if (
  !["chromium", "firefox"].includes(browserName) ||
  !["sso", "import"].includes(flow)
)
  throw new Error("Select a supported browser and flow");
try {
  await start();
  if (flow === "sso") await exercise(browserName);
  else await exerciseImport(browserName);
  assert.ok(
    calls >= 2,
    "Expected token validation and a post-restart Moodle check",
  );
} finally {
  await mf?.dispose();
  await rm(storage, { recursive: true, force: true });
}
