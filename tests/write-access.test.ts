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
import { createHash, randomBytes } from "node:crypto";
import { createApp } from "../src/app.js";
import { getHttpConfig } from "../src/auth/config.js";
import { hashPassword } from "../src/auth/password.js";
import { MoodleClient } from "../src/moodle-client.js";
import { MoodleApiError } from "../src/moodle-errors.js";
import {
  BLOCKED_WRITE_FUNCTIONS,
  flattenParameters,
  invokeWriteOperation,
} from "../src/write-api.js";

const secret = "moodle-private-token";
const fakeClient = (call = vi.fn(), advertised = ["mod_forum_add_post"]) =>
  ({
    supports: (name: string) => advertised.includes(name),
    call,
    redact: (text: string) => text.split(secret).join("[REDACTED]"),
  }) as unknown as MoodleClient;

describe("flattenParameters", () => {
  it("turns nested JSON into Moodle's array parameter format", () => {
    expect(
      flattenParameters({
        assignmentid: 7,
        plugindata: { onlinetext_editor: { text: "hi", format: 1, itemid: 0 } },
        ids: [4, 5],
        notify: true,
        skipped: null,
      }),
    ).toEqual({
      assignmentid: 7,
      "plugindata[onlinetext_editor][text]": "hi",
      "plugindata[onlinetext_editor][format]": 1,
      "plugindata[onlinetext_editor][itemid]": 0,
      "ids[0]": 4,
      "ids[1]": 5,
      notify: true,
    });
  });
  it.each([
    [{ wstoken: "x" }],
    [{ WSFUNCTION: "x" }],
    [{ moodlewsrestformat: "xml" }],
    [{ "a[b]": 1 }],
    [{ a: { "b]=1&wstoken[": "x" } }],
    [{ a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 1 } } } } } } } } } }],
  ])("rejects unsafe parameter shape %j", (input) => {
    expect(() => flattenParameters(input)).toThrow();
  });
});

describe("invokeWriteOperation", () => {
  it("refuses credential-issuing and unadvertised functions without calling Moodle", async () => {
    const call = vi.fn();
    const client = fakeClient(call, [...BLOCKED_WRITE_FUNCTIONS, "x_y_z"]);
    for (const name of BLOCKED_WRITE_FUNCTIONS)
      await expect(invokeWriteOperation(client, name)).rejects.toThrow(
        /credential/,
      );
    await expect(
      invokeWriteOperation(fakeClient(call), "core_user_delete_users"),
    ).rejects.toThrow(/not advertised/);
    await expect(
      invokeWriteOperation(client, "../webservice/upload"),
    ).rejects.toThrow(/Invalid Moodle function name/);
    expect(call).not.toHaveBeenCalled();
  });
  it("calls an advertised write function with flattened parameters", async () => {
    const call = vi.fn().mockResolvedValue({ postid: 9, warnings: [] });
    const result = await invokeWriteOperation(
      fakeClient(call),
      "mod_forum_add_post",
      { postid: 3, options: [{ name: "inlineattachmentsid", value: 0 }] },
    );
    expect(call).toHaveBeenCalledWith("mod_forum_add_post", {
      postid: 3,
      "options[0][name]": "inlineattachmentsid",
      "options[0][value]": 0,
    });
    expect(result.data).toMatchObject({
      functionName: "mod_forum_add_post",
      result: { postid: 9 },
      truncated: false,
    });
  });
  it("redacts the Moodle credential from results and errors", async () => {
    const leaky = vi.fn().mockResolvedValue({ url: `x?token=${secret}` });
    const ok = await invokeWriteOperation(
      fakeClient(leaky),
      "mod_forum_add_post",
    );
    expect(JSON.stringify(ok)).not.toContain(secret);
    const failing = vi
      .fn()
      .mockRejectedValue(
        new MoodleApiError("invalidparameter", `bad ${secret} value`),
      );
    const error = await invokeWriteOperation(
      fakeClient(failing),
      "mod_forum_add_post",
    ).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/invalidparameter/);
    expect((error as Error).message).not.toContain(secret);
  });
  it("redacts credential-named fields such as the private access key", async () => {
    const info = vi.fn().mockResolvedValue({
      userid: 5,
      userprivateaccesskey: "k-123",
      nested: [{ sesskey: "s-456", name: "kept" }],
    });
    const result = await invokeWriteOperation(
      fakeClient(info),
      "mod_forum_add_post",
    );
    expect(JSON.stringify(result)).not.toMatch(/k-123|s-456/);
    expect(result.data.result).toMatchObject({
      userid: 5,
      userprivateaccesskey: "[redacted]",
      nested: [{ sesskey: "[redacted]", name: "kept" }],
    });
  });
  it("returns a preview for very large results and warns that the call completed", async () => {
    const big = vi.fn().mockResolvedValue({ blob: "x".repeat(300_000) });
    const result = await invokeWriteOperation(
      fakeClient(big),
      "mod_forum_add_post",
    );
    expect(result.data.truncated).toBe(true);
    expect(result.data.result).toBeNull();
    expect(result.warnings.map((w) => w.code)).toContain("RESULT_TRUNCATED");
  });
});

const password = "a private Moodle passphrase",
  origin = "http://localhost:3000",
  host = "localhost:3000",
  callback = "https://chatgpt.com/connector_platform_oauth_redirect";
let passwordHash: string;
let runtime: ReturnType<typeof createApp>;
let config: ReturnType<typeof getHttpConfig>;
let upstream: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  passwordHash = await hashPassword(password);
});
beforeEach(() => {
  upstream = vi.fn();
  config = getHttpConfig({
    PUBLIC_URL: origin,
    ALLOW_INSECURE_HTTP: "true",
    AUTH_PASSWORD_HASH: passwordHash,
    AUTH_SECRET: "a".repeat(64),
    OAUTH_DATABASE_PATH: ":memory:",
  });
  runtime = createApp(config, {
    createMoodleClient: async () => {
      const original = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            userid: 42,
            sitename: "Test",
            functions: [{ name: "mod_forum_add_post", version: "1" }],
          }),
        ),
      );
      try {
        const client = await MoodleClient.create({
          baseUrl: "https://school.example",
          token: secret,
          maxFileBytes: 1024,
        });
        vi.spyOn(client, "call").mockImplementation(upstream as never);
        return client;
      } finally {
        globalThis.fetch = original;
      }
    },
  });
});
afterEach(() => runtime.close());

const path = (url: string) => {
  const u = new URL(url, origin);
  return u.pathname + u.search;
};
async function register() {
  const response = await request(runtime.app)
    .post("/oauth/register")
    .set("Host", host)
    .send({
      redirect_uris: [callback],
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      client_name: "Study Assistant",
    });
  return response.body.client_id as string;
}
/** Sign in and stop on the consent page. */
async function reachConsent(clientId: string, scope: string) {
  const agent = request.agent(runtime.app),
    verifier = randomBytes(32).toString("base64url");
  let response = await agent
    .get("/oauth/authorize")
    .set("Host", host)
    .query({
      client_id: clientId,
      redirect_uri: callback,
      response_type: "code",
      scope,
      resource: origin + "/mcp",
      state: "s",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
  response = await agent.get(path(response.headers.location)).set("Host", host);
  const nonce = /name="csrf" value="([^"]+)"/.exec(response.text)![1];
  response = await agent
    .post("/interaction/password")
    .set("Host", host)
    .set("Origin", origin)
    .type("form")
    .send({ csrf: nonce, password });
  for (let i = 0; i < 5 && response.headers.location; i++)
    response = await agent
      .get(path(response.headers.location))
      .set("Host", host);
  return {
    agent,
    verifier,
    page: response.text,
    csrf: /name="csrf" value="([^"]+)"/.exec(response.text)?.[1] ?? "",
  };
}
async function approve(
  flow: Awaited<ReturnType<typeof reachConsent>>,
  clientId: string,
  body: Record<string, string>,
) {
  let response = await flow.agent
    .post("/interaction/confirm")
    .set("Host", host)
    .set("Origin", origin)
    .type("form")
    .send({ csrf: flow.csrf, ...body });
  for (
    let i = 0;
    i < 5 &&
    response.headers.location &&
    new URL(response.headers.location, origin).origin === origin;
    i++
  )
    response = await flow.agent
      .get(path(response.headers.location))
      .set("Host", host);
  const code = new URL(response.headers.location).searchParams.get("code")!;
  return request(runtime.app)
    .post("/oauth/token")
    .set("Host", host)
    .type("form")
    .send({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: flow.verifier,
      redirect_uri: callback,
      resource: origin + "/mcp",
    });
}
const rpc = (token: string, method: string, params: object) =>
  request(runtime.app)
    .post("/mcp")
    .set("Host", host)
    .set("Accept", "application/json, text/event-stream")
    .set("Authorization", "Bearer " + token)
    .send({ jsonrpc: "2.0", id: 1, method, params });
const both = "openid offline_access moodle:read moodle:write";

describe("two-tier OAuth consent", () => {
  it("offers write only when the client asked for it, and shows who is asking", async () => {
    const id = await register();
    const readOnly = await reachConsent(
      id,
      "openid offline_access moodle:read",
    );
    expect(readOnly.page).toContain("Allow read-only access");
    expect(readOnly.page).not.toContain('name="write"');
    const id2 = await register();
    const full = await reachConsent(id2, both);
    expect(full.page).toContain("Study Assistant");
    expect(full.page).toMatch(/Returns to <b>chatgpt\.com<\/b>/);
    expect(full.page).toContain('name="write"');
    expect(full.page).not.toMatch(/name="write"[^>]*checked/);
  });
  it("grants read-only when the write box is left unticked, without re-prompting", async () => {
    const id = await register();
    const flow = await reachConsent(id, both);
    const token = await approve(flow, id, { decision: "allow" });
    expect(token.status, token.text).toBe(200);
    expect(token.body.scope.split(" ")).toContain("moodle:read");
    expect(token.body.scope.split(" ")).not.toContain("moodle:write");
  });
  it("grants read and write only after the explicit tick", async () => {
    const id = await register();
    const flow = await reachConsent(id, both);
    const token = await approve(flow, id, { decision: "allow", write: "1" });
    expect(token.status, token.text).toBe(200);
    expect(token.body.scope.split(" ")).toEqual(
      expect.arrayContaining(["moodle:read", "moodle:write"]),
    );
  });
  it("ignores a forged write field when write was never requested", async () => {
    const id = await register();
    const flow = await reachConsent(id, "openid offline_access moodle:read");
    const token = await approve(flow, id, { decision: "allow", write: "1" });
    expect(token.body.scope.split(" ")).not.toContain("moodle:write");
  });
});

describe("declined write access", () => {
  it("is not re-offered to a live session, and a fresh session can upgrade", async () => {
    const id = await register();
    const first = await reachConsent(id, both);
    const readOnly = await approve(first, id, { decision: "allow" });
    expect(readOnly.body.scope.split(" ")).not.toContain("moodle:write");
    // Same browser session: Moodle's grant already answered the write question.
    const again = await first.agent
      .get("/oauth/authorize")
      .set("Host", host)
      .query({
        client_id: id,
        redirect_uri: callback,
        response_type: "code",
        scope: both,
        resource: origin + "/mcp",
        state: "s",
        code_challenge: createHash("sha256").update("v").digest("base64url"),
        code_challenge_method: "S256",
      });
    expect(new URL(again.headers.location, origin).pathname).not.toBe(
      "/interaction",
    );
    // A new browser session is asked again and can now grant write.
    const fresh = await reachConsent(id, both);
    expect(fresh.page).toContain('name="write"');
    const upgraded = await approve(fresh, id, {
      decision: "allow",
      write: "1",
    });
    expect(upgraded.body.scope.split(" ")).toContain("moodle:write");
  });
});

describe("pages and bearer verification", () => {
  const authorizeQuery = (id: string) => ({
    client_id: id,
    redirect_uri: callback,
    response_type: "code",
    scope: both,
    resource: origin + "/mcp",
    state: "s",
    code_challenge: createHash("sha256").update("v").digest("base64url"),
    code_challenge_method: "S256",
  });
  it("keeps inline styles allowed by the CSP on the login and consent pages", async () => {
    const id = await register();
    const agent = request.agent(runtime.app);
    const start = await agent
      .get("/oauth/authorize")
      .set("Host", host)
      .query(authorizeQuery(id));
    const login = await agent
      .get(path(start.headers.location))
      .set("Host", host);
    expect(login.headers["content-security-policy"]).toMatch(
      /style-src[^;]*'unsafe-inline'/,
    );
    expect(login.text).toContain("<style>");
    const flow = await reachConsent(id, both);
    const consent = await flow.agent.get("/interaction").set("Host", host);
    expect(consent.headers["content-security-policy"]).toMatch(
      /style-src[^;]*'unsafe-inline'/,
    );
    expect(consent.text).toContain("<style>");
  });
  it("rejects a token that lacks moodle:read with 403", async () => {
    const id = await register();
    const grant = new runtime.provider.Grant({
      accountId: config.ownerId,
      clientId: id,
    });
    grant.addResourceScope(origin + "/mcp", "moodle:write");
    const token = new runtime.provider.AccessToken({
      accountId: config.ownerId,
      clientId: id,
      grantId: await grant.save(),
      scope: "moodle:write",
      aud: origin + "/mcp",
    });
    const response = await rpc(await token.save(), "tools/list", {});
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("moodle_call_api enforcement", () => {
  const call = (token: string) =>
    rpc(token, "tools/call", {
      name: "moodle_call_api",
      arguments: {
        functionName: "mod_forum_add_post",
        parameters: { postid: 1, message: "hello" },
      },
    });
  it("refuses a read-only token without touching Moodle", async () => {
    const id = await register();
    const token = await approve(await reachConsent(id, both), id, {
      decision: "allow",
    });
    const result = await call(token.body.access_token);
    expect(result.body.result.isError, result.text).toBe(true);
    expect(result.text).toMatch(/read-only/);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("runs the call for a token the owner approved for writing", async () => {
    upstream.mockResolvedValue({ postid: 5 });
    const id = await register();
    const token = await approve(await reachConsent(id, both), id, {
      decision: "allow",
      write: "1",
    });
    const result = await call(token.body.access_token);
    expect(result.body.result.isError, result.text).toBeFalsy();
    expect(upstream).toHaveBeenCalledWith("mod_forum_add_post", {
      postid: 1,
      message: "hello",
    });
    expect(result.text).not.toContain(secret);
  });
});
