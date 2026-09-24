import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getHttpConfig } from "../src/auth/config.js";
import { hashPassword } from "../src/auth/password.js";
import { mobileSiteId } from "../src/connect/protocol.js";
import type { MoodleClient } from "../src/moodle-client.js";
const origin = "http://localhost:3000",
  host = "localhost:3000",
  site = "https://solusi.sibermu.ac.id",
  path = "/connect/moodle";
const password = "a synthetic setup passphrase",
  secret = "a".repeat(64),
  token = "b".repeat(32);
let hash: string,
  runtime: ReturnType<typeof createApp>,
  factory: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  hash = await hashPassword(password, true);
});
beforeEach(() => {
  factory = vi.fn().mockResolvedValue({
    userId: 42,
    siteName: "SiberMu",
    profile: { fullname: "Student" },
    supports: () => true,
  } as unknown as MoodleClient);
  runtime = createApp(
    getHttpConfig({
      PUBLIC_URL: origin,
      ALLOW_INSECURE_HTTP: "true",
      AUTH_SECRET: secret,
      AUTH_PASSWORD_HASH: hash,
      OAUTH_DATABASE_PATH: ":memory:",
    }),
    {
      moodleConfig: { baseUrl: site, maxFileBytes: 1024 },
      moodleFactory: factory,
    },
  );
  vi.spyOn(runtime.connection!, "publicConfig").mockResolvedValue({
    wwwroot: site,
    enablewebservices: 1,
    enablemobilewebservice: 1,
    launchurl: site + "/admin/tool/mobile/launch.php",
    identityproviders: [
      { name: "Google", url: site + "/auth/oauth2/login.php?id=3" },
    ],
  });
});
afterEach(() => {
  runtime.close();
  vi.useRealTimers();
});
async function owner() {
  const agent = request.agent(runtime.app);
  const page = await agent.get(path).set("Host", host);
  const csrf = /name="csrf" value="([^"]+)"/.exec(page.text)![1];
  const signed = await agent
    .post(path + "/login")
    .set("Host", host)
    .set("Origin", origin)
    .type("form")
    .send({ csrf, password });
  expect(signed.status, signed.text).toBe(303);
  const status = await agent.get(path + "/status").set("Host", host);
  expect(status.status).toBe(200);
  return { agent, csrf: status.body.csrf, formCsrf: csrf };
}
async function action(
  auth: Awaited<ReturnType<typeof owner>>,
  name: string,
  data = {},
) {
  return auth.agent
    .post(path + "/" + name)
    .set("Host", host)
    .set("Origin", origin)
    .set("X-CSRF-Token", auth.csrf)
    .send(data);
}
describe("owner-only Moodle onboarding routes", () => {
  it("serves login without Moodle credentials but never exposes status without owner authentication", async () => {
    const page = await request(runtime.app).get(path).set("Host", host);
    expect(page.status).toBe(200);
    expect(page.headers["referrer-policy"]).toBe("same-origin");
    expect(page.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(
      (
        await request(runtime.app)
          .get(path + "/status")
          .set("Host", host)
      ).status,
    ).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });
  it("does not grant setup access for absent, null, or cross-origin login requests", async () => {
    const agent = request.agent(runtime.app);
    const page = await agent.get(path).set("Host", host);
    const csrf = /name="csrf" value="([^"]+)"/.exec(page.text)![1];
    for (const value of [undefined, "null", "https://evil.example"]) {
      const post = agent
        .post(path + "/login")
        .set("Host", host)
        .type("form");
      if (value) post.set("Origin", value);
      expect((await post.send({ csrf, password })).status).toBe(403);
    }
  });
  it("uses a one-time login nonce and refuses incorrect passwords", async () => {
    const agent = request.agent(runtime.app);
    const page = await agent.get(path).set("Host", host);
    const csrf = /name="csrf" value="([^"]+)"/.exec(page.text)![1];
    const post = () =>
      agent
        .post(path + "/login")
        .set("Host", host)
        .set("Origin", origin)
        .type("form");
    expect((await post().send({ csrf, password: "wrong" })).status).toBe(401);
    expect((await post().send({ csrf, password })).status).toBe(403);
  });
  it("rejects every management mutation without exact origin and session CSRF", async () => {
    const auth = await owner();
    for (const action of [
      "start",
      "probe",
      "probe-complete",
      "complete",
      "confirm",
      "cancel",
      "disconnect",
      "fallback",
      "check",
      "logout",
    ]) {
      expect(
        (
          await auth.agent
            .post(path + "/" + action)
            .set("Host", host)
            .send({})
        ).status,
      ).toBe(403);
      expect(
        (
          await auth.agent
            .post(path + "/" + action)
            .set("Host", host)
            .set("Origin", "null")
            .set("X-CSRF-Token", auth.csrf)
            .send({})
        ).status,
      ).toBe(403);
    }
    expect(factory).not.toHaveBeenCalled();
  });
  it("completes browser pairing, requires confirmation and never returns a credential", async () => {
    const auth = await owner();
    const begin = await action(auth, "start");
    expect(begin.status, begin.text).toBe(200);
    const launch = new URL(begin.body.launchUrl);
    expect(launch.searchParams.get("oauthsso")).toBe("3");
    const callback =
      "web+moodlemcp://token=" +
      Buffer.from(
        mobileSiteId(site, launch.searchParams.get("passport")!) +
          ":::" +
          token +
          ":::private-mobile-credential",
      ).toString("base64");
    const completed = await action(auth, "complete", { callback });
    expect(completed.status, completed.text).toBe(200);
    expect(completed.text).not.toContain(token);
    expect(completed.text).not.toContain("private-mobile-credential");
    expect(runtime.connection!.state().status).toBe("disconnected");
    expect(
      (
        await action(auth, "confirm", {
          confirmation: completed.body.confirmation,
        })
      ).status,
    ).toBe(200);
    expect(runtime.connection!.state().status).toBe("connected");
    expect(
      (
        await action(auth, "confirm", {
          confirmation: completed.body.confirmation,
        })
      ).status,
    ).toBe(400);
    expect((await action(auth, "complete", { callback })).status).toBe(400);
    expect((await action(auth, "disconnect")).status).toBe(200);
    expect(runtime.connection!.state().status).toBe("disconnected");
  });
  it("rejects callback query credentials and clears return fragments with a same-origin script", async () => {
    expect(
      (
        await request(runtime.app)
          .get(path + "/return?token=not-a-real-token")
          .set("Host", host)
      ).status,
    ).toBe(400);
    const html = await request(runtime.app)
      .get(path + "/return")
      .set("Host", host);
    expect(html.status).toBe(200);
    expect(html.text).toContain(path + "/client.js");
    const script = await request(runtime.app)
      .get(path + "/client.js")
      .set("Host", host);
    expect(script.text).toContain(
      "history.replaceState(null, '', location.pathname)",
    );
    expect(script.text).toContain("/connect/moodle/return#%s");
    expect(script.text).not.toContain("localStorage");
  });
  it("expires owner sessions and logs out without revoking Moodle API credentials", async () => {
    const auth = await owner();
    expect((await action(auth, "logout")).status).toBe(200);
    expect(
      (await auth.agent.get(path + "/status").set("Host", host)).status,
    ).toBe(401);
    const another = await owner();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 1201000);
    expect(
      (await another.agent.get(path + "/status").set("Host", host)).status,
    ).toBe(401);
  });
});

describe("browser return diagnostics", () => {
  it("requires an actual matching one-use probe return before marking the handler verified", async () => {
    const auth = await owner();
    const getStatus = () => auth.agent.get(path + "/status").set("Host", host);
    expect((await getStatus()).body.returnVerified).toBe(false);
    const probe = await action(auth, "probe");
    expect(probe.status, probe.text).toBe(200);
    expect(probe.body.probeUrl).toMatch(
      /^web\+moodlemcp:\/\/probe=[A-Za-z0-9_-]{43}$/,
    );
    expect((await getStatus()).body.returnVerified).toBe(false);
    expect(
      (await action(auth, "probe-complete", { callback: probe.body.probeUrl }))
        .status,
    ).toBe(200);
    expect((await getStatus()).body.returnVerified).toBe(true);
    expect(
      (await action(auth, "probe-complete", { callback: probe.body.probeUrl }))
        .status,
    ).toBe(400);
    expect(factory).not.toHaveBeenCalled();
  });
  it("binds probe returns to the setup browser without exposing Moodle credentials", async () => {
    const first = await owner(),
      second = await owner();
    const probe = await action(first, "probe");
    expect(
      (
        await action(second, "probe-complete", {
          callback: probe.body.probeUrl,
        })
      ).status,
    ).toBe(400);
    expect(
      (await action(first, "probe-complete", { callback: probe.body.probeUrl }))
        .status,
    ).toBe(200);
    expect(factory).not.toHaveBeenCalled();
    expect(probe.text).not.toContain(token);
  });
  it("expires probe results and does not make a probe a Moodle token callback", async () => {
    const auth = await owner();
    const probe = await action(auth, "probe");
    expect(
      (await action(auth, "complete", { callback: probe.body.probeUrl }))
        .status,
    ).toBe(400);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 601000);
    expect(
      (await action(auth, "probe-complete", { callback: probe.body.probeUrl }))
        .status,
    ).toBe(400);
    expect(factory).not.toHaveBeenCalled();
  });
  it("returns a recovery link for the same pending attempt without forcing Google login again", async () => {
    const auth = await owner();
    const begin = await action(auth, "start");
    const launch = new URL(begin.body.launchUrl);
    const status = await auth.agent.get(path + "/status").set("Host", host);
    const pending = status.body.pending;
    expect(pending.expiresAt).toBeGreaterThan(Date.now());
    const finish = new URL(pending.finishUrl);
    expect(finish.origin).toBe(site);
    expect(finish.pathname).toBe("/admin/tool/mobile/launch.php");
    expect(finish.searchParams.get("passport")).toBe(
      launch.searchParams.get("passport"),
    );
    expect(finish.searchParams.get("confirmed")).toBe("1");
    expect(finish.searchParams.has("oauthsso")).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect((await action(auth, "cancel")).status).toBe(200);
    expect(
      (await auth.agent.get(path + "/status").set("Host", host)).body.pending,
    ).toBeNull();
  });
});
