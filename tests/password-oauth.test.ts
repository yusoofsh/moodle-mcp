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
import { MoodleClient } from "../src/moodle-client.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../src/auth/password.js";
const password = "a private Moodle passphrase";
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(password);
});
const origin = "http://localhost:3000",
  host = "localhost:3000",
  callback = "https://chatgpt.com/connector_platform_oauth_redirect";
let rotationDir: string | undefined;
let runtime: ReturnType<typeof createApp>;
let github: ReturnType<typeof vi.fn>;
let moodle: ReturnType<typeof vi.fn>;
function path(url: string) {
  const u = new URL(url, origin);
  return u.pathname + u.search;
}
beforeEach(() => {
  github = vi
    .fn()
    .mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("/access_token")
              ? { access_token: "github-token" }
              : { id: 18055365 },
          ),
        ),
    );
  moodle = vi.fn().mockImplementation(async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          userid: 42,
          sitename: "Test",
          fullname: "Student",
          functions: [],
        }),
      ),
    );
    try {
      return await MoodleClient.create({
        baseUrl: "https://school.example",
        token: "moodle-private-token",
        maxFileBytes: 1024,
      });
    } finally {
      globalThis.fetch = original;
    }
  });
  runtime = createApp(
    getHttpConfig({
      PUBLIC_URL: origin,
      ALLOW_INSECURE_HTTP: "true",
      AUTH_PASSWORD_HASH: passwordHash,
      AUTH_SECRET: "a".repeat(64),
      OAUTH_DATABASE_PATH: ":memory:",
    }),
    { githubFetch: github, createMoodleClient: moodle },
  );
});
afterEach(() => {
  runtime.close();
  if (rotationDir) {
    rmSync(rotationDir, { recursive: true, force: true });
    rotationDir = undefined;
  }
});
async function register() {
  const response = await request(runtime.app)
    .post("/oauth/register")
    .set("Host", host)
    .send({
      redirect_uris: [callback],
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      client_name: "Test MCP Client",
    });
  expect(response.status, response.text).toBe(201);
  return response.body.client_id as string;
}
async function begin(clientId: string, extra: Record<string, string> = {}) {
  const agent = request.agent(runtime.app),
    verifier = randomBytes(32).toString("base64url");
  let response = await agent
    .get("/oauth/authorize")
    .set("Host", host)
    .query({
      client_id: clientId,
      redirect_uri: callback,
      response_type: "code",
      scope: "openid offline_access moodle:read",
      resource: origin + "/mcp",
      state: "client-state",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      ...extra,
    });
  expect(response.status, response.text).toBe(303);
  response = await agent.get(path(response.headers.location)).set("Host", host);
  expect(response.status, response.text).toBe(200);
  expect(response.text).toContain('type="password"');
  expect(response.headers["cache-control"]).toBe("no-store");
  return {
    agent,
    verifier,
    state: /name="csrf" value="([^"]+)"/.exec(response.text)![1],
  };
}
async function consent(clientId: string) {
  const flow = await begin(clientId);
  let response = await flow.agent
    .post("/interaction/password")
    .set("Host", host)
    .set("Origin", origin)
    .type("form")
    .send({ csrf: flow.state, password });
  expect(response.status, response.text).toBe(303);
  const sessionCookies = new Map<string, string>();
  const remember = (response: { headers: Record<string, any> }) => {
    for (const value of response.headers["set-cookie"] || []) {
      const cookie = value.split(";")[0];
      if (cookie.startsWith("_session"))
        sessionCookies.set(cookie.split("=")[0], cookie);
    }
  };
  remember(response);
  // Resume authorization and reach the explicit consent screen.
  for (let i = 0; i < 5 && response.headers.location; i++) {
    expect(new URL(response.headers.location, origin).origin).toBe(origin);
    response = await flow.agent
      .get(path(response.headers.location))
      .set("Host", host);
    remember(response);
  }
  expect(response.status, response.text).toBe(200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(response.text)?.[1];
  expect(csrf).toBeTruthy();
  return { ...flow, csrf: csrf!, sessionCookies: [...sessionCookies.values()] };
}
async function authorize(clientId: string) {
  const flow = await consent(clientId);
  let response = await flow.agent
    .post("/interaction/confirm")
    .set("Host", host)
    .set("Origin", origin)
    .type("form")
    .send({ csrf: flow.csrf, decision: "allow" });
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
  const redirect = new URL(response.headers.location);
  expect(redirect.origin).toBe("https://chatgpt.com");
  expect(redirect.searchParams.get("state")).toBe("client-state");
  expect(redirect.searchParams.get("error")).toBeNull();
  return { ...flow, code: redirect.searchParams.get("code")! };
}
async function exchange(clientId: string, code: string, verifier: string) {
  return request(runtime.app)
    .post("/oauth/token")
    .set("Host", host)
    .type("form")
    .send({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: callback,
      resource: origin + "/mcp",
    });
}
describe("Password login with OAuth protected MCP", () => {
  it("uses a browser form referrer policy compatible with strict Origin checks", async () => {
    const id = await register();
    const flow = await begin(id);
    const login = await flow.agent.get("/interaction").set("Host", host);
    expect(login.headers["referrer-policy"]).toBe("same-origin");
    expect(login.headers["content-security-policy"]).toContain(
      "form-action 'self'",
    );
    const invalid = await flow.agent
      .post("/interaction/password")
      .set("Host", host)
      .set("Origin", origin)
      .type("form")
      .send({ csrf: flow.state, password: "not the password" });
    expect(invalid.status).toBe(401);
    expect(invalid.headers["referrer-policy"]).toBe("same-origin");
    const allowed = await consent(id);
    const confirmation = await allowed.agent
      .get("/interaction")
      .set("Host", host);
    expect(confirmation.headers["referrer-policy"]).toBe("same-origin");
    expect(confirmation.headers["content-security-policy"]).toContain(
      "form-action 'self' https://chatgpt.com;",
    );
    expect(login.headers["content-security-policy"]).toContain(
      "form-action 'self';",
    );
    const discovery = await request(runtime.app)
      .get("/.well-known/oauth-authorization-server")
      .set("Host", host);
    expect(discovery.headers["referrer-policy"]).toBe("no-referrer");
  });
  it.each([undefined, "null", "https://evil.example"])(
    "rejects login and consent from untrusted Origin %s",
    async (untrusted) => {
      const id = await register();
      const flow = await begin(id);
      let submission = flow.agent
        .post("/interaction/password")
        .set("Host", host)
        .type("form");
      if (untrusted !== undefined)
        submission = submission.set("Origin", untrusted);
      const result = await submission.send({ csrf: flow.state, password });
      expect(result.status).toBe(403);
      expect(result.text).toBe("Invalid login request");
      const consentFlow = await consent(id);
      let approval = consentFlow.agent
        .post("/interaction/confirm")
        .set("Host", host)
        .type("form");
      if (untrusted !== undefined) approval = approval.set("Origin", untrusted);
      const denied = await approval.send({
        csrf: consentFlow.csrf,
        decision: "allow",
      });
      expect(denied.status).toBe(403);
      expect(denied.text).toBe("Invalid consent request");
    },
  );

  it("publishes RFC 9728 metadata and OAuth discovery with PKCE S256", async () => {
    const resource = await request(runtime.app)
      .get("/.well-known/oauth-protected-resource/mcp")
      .set("Host", host);
    expect(resource.body).toMatchObject({
      resource: origin + "/mcp",
      authorization_servers: [origin],
    });
    const discovery = await request(runtime.app)
      .get("/.well-known/oauth-authorization-server")
      .set("Host", host);
    expect(discovery.status, discovery.text).toBe(200);
    expect(discovery.body.issuer).toBe(origin);
    expect(discovery.body.code_challenge_methods_supported).toContain("S256");
    expect(discovery.body.registration_endpoint).toBe(
      origin + "/oauth/register",
    );
  });
  it("rejects unauthenticated and invalid-token requests before contacting Moodle", async () => {
    for (const token of ["", "Bearer invalid"]) {
      const response = await request(runtime.app)
        .post("/mcp")
        .set("Host", host)
        .set("Authorization", token)
        .send({});
      expect(response.status, response.text).toBe(401);
      expect(response.headers["www-authenticate"]).toContain(
        "oauth-protected-resource/mcp",
      );
    }
    expect(moodle).not.toHaveBeenCalled();
  });
  it("rejects untrusted Host and Origin headers", async () => {
    expect(
      (
        await request(runtime.app)
          .post("/mcp")
          .set("Host", "evil.example")
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(runtime.app)
          .post("/mcp")
          .set("Host", host)
          .set("Origin", "https://evil.example")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("rejects forged login CSRF and does not contact GitHub or Moodle", async () => {
    const flow = await begin(await register());
    const response = await flow.agent
      .post("/interaction/password")
      .set("Host", host)
      .set("Origin", origin)
      .type("form")
      .send({ csrf: "forged", password });
    expect(response.status).toBe(403);
    expect(github).not.toHaveBeenCalled();
    expect(moodle).not.toHaveBeenCalled();
  });
  it("rejects incorrect passwords, never reflects them, and consumes the form nonce", async () => {
    const flow = await begin(await register());
    const submit = (csrf: string, value: unknown) =>
      flow.agent
        .post("/interaction/password")
        .set("Host", host)
        .set("Origin", origin)
        .type("form")
        .send({ csrf, password: value });
    const response = await submit(flow.state, "a wrong secret password");
    expect(response.status).toBe(401);
    expect(response.text).not.toContain("a wrong secret password");
    expect((await submit(flow.state, password)).status).toBe(403);
    const fresh = /name="csrf" value="([^"]+)"/.exec(response.text)![1];
    expect((await submit(fresh, password)).status).toBe(303);
    expect(github).not.toHaveBeenCalled();
    expect(moodle).not.toHaveBeenCalled();
  });
  it("requires a valid same-origin password form and bound browser session", async () => {
    const flow = await begin(await register());
    for (const originValue of ["https://attacker.example", ""]) {
      const response = await flow.agent
        .post("/interaction/password")
        .set("Host", host)
        .set("Origin", originValue)
        .type("form")
        .send({ csrf: flow.state, password });
      expect(response.status).toBe(403);
    }
    const other = await begin(await register());
    expect(
      (
        await other.agent
          .post("/interaction/password")
          .set("Host", host)
          .set("Origin", origin)
          .type("form")
          .send({ csrf: flow.state, password })
      ).status,
    ).toBe(403);
  });
  it("rejects the disabled GitHub callback and HTTP Basic authentication", async () => {
    expect(
      (
        await request(runtime.app)
          .get("/interaction/github/callback")
          .set("Host", host)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(runtime.app)
          .post("/mcp")
          .set("Host", host)
          .auth("owner", password)
          .send({})
      ).status,
    ).toBe(401);
    expect(github).not.toHaveBeenCalled();
    expect(moodle).not.toHaveBeenCalled();
  });
  it("rejects duplicate password fields and oversized form bodies", async () => {
    const flow = await begin(await register());
    const bad = await flow.agent
      .post("/interaction/password")
      .set("Host", host)
      .set("Origin", origin)
      .type("form")
      .send(`csrf=${flow.state}&password=one&password=two`);
    expect(bad.status).toBe(401);
    expect(
      (
        await flow.agent
          .post("/interaction/password")
          .set("Host", host)
          .set("Origin", origin)
          .type("form")
          .send({ csrf: "x", password: "x".repeat(9000) })
      ).status,
    ).toBe(413);
  });
  it("persists a five-attempt budget across fresh login forms", async () => {
    const id = await register();
    for (let i = 0; i < 6; i++) {
      const flow = await begin(id);
      const response = await flow.agent
        .post("/interaction/password")
        .set("Host", host)
        .set("Origin", origin)
        .type("form")
        .send({ csrf: flow.state, password: "wrong" });
      expect(response.status).toBe(i < 5 ? 401 : 429);
      if (i === 5)
        expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    }
    expect(github).not.toHaveBeenCalled();
    expect(moodle).not.toHaveBeenCalled();
  });
  it("permits only one expensive password check at a time", async () => {
    const first = await begin(await register());
    const second = await begin(await register());
    const responses = await Promise.all(
      [first, second].map((flow) =>
        flow.agent
          .post("/interaction/password")
          .set("Host", host)
          .set("Origin", origin)
          .type("form")
          .send({ csrf: flow.state, password }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([303, 429]);
  });
  it("keeps tokens across restart but invalidates access, refresh, and browser sessions on password rotation", async () => {
    rotationDir = mkdtempSync(join(tmpdir(), "moodle-password-rotation-"));
    const env = {
      PUBLIC_URL: origin,
      ALLOW_INSECURE_HTTP: "true",
      AUTH_PASSWORD_HASH: passwordHash,
      AUTH_SECRET: "a".repeat(64),
      OAUTH_DATABASE_PATH: join(rotationDir, "auth.db"),
    };
    const reboot = (hash: string) => {
      runtime.close();
      runtime = createApp(getHttpConfig({ ...env, AUTH_PASSWORD_HASH: hash }), {
        githubFetch: github,
        createMoodleClient: moodle,
      });
    };
    reboot(passwordHash);
    const id = await register(),
      flow = await authorize(id),
      token = await exchange(id, flow.code, flow.verifier);
    expect(token.status).toBe(200);
    expect(flow.sessionCookies.length).toBeGreaterThan(0);
    const invoke = () =>
      request(runtime.app)
        .post("/mcp")
        .set("Host", host)
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", "Bearer " + token.body.access_token)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "rotation-test", version: "1" },
          },
        });
    reboot(passwordHash);
    expect((await invoke()).status).toBe(200);
    reboot(await hashPassword("a completely new passphrase"));
    expect((await invoke()).status).toBe(401);
    const refresh = await request(runtime.app)
      .post("/oauth/token")
      .set("Host", host)
      .type("form")
      .send({
        grant_type: "refresh_token",
        client_id: id,
        refresh_token: token.body.refresh_token,
        resource: origin + "/mcp",
      });
    expect(refresh.status).toBe(400);
    const browser = request.agent(runtime.app);
    let response = await browser
      .get("/oauth/authorize")
      .set("Host", host)
      .set("Cookie", flow.sessionCookies)
      .query({
        client_id: id,
        redirect_uri: callback,
        response_type: "code",
        scope: "openid offline_access moodle:read",
        resource: origin + "/mcp",
        state: "reconnect",
        code_challenge: "x".repeat(43),
        code_challenge_method: "S256",
      });
    for (
      let i = 0;
      i < 5 &&
      response.headers.location &&
      new URL(response.headers.location, origin).origin === origin;
      i++
    )
      response = await browser
        .get(path(response.headers.location))
        .set("Host", host);
    expect(response.status).toBe(200);
    expect(response.text).toContain('type="password"');
    expect(github).not.toHaveBeenCalled();
  });
  it("does not put the password or its hash in provider records or OAuth responses", async () => {
    const id = await register(),
      flow = await authorize(id),
      token = await exchange(id, flow.code, flow.verifier);
    expect(token.status).toBe(200);
    expect(token.text).not.toContain(password);
    expect(token.text).not.toContain(passwordHash);
    for (const row of runtime.store.db
      .prepare("SELECT model,id FROM oauth")
      .all()) {
      // Raw stored rows are encrypted, and the verifier is not persisted there.
      expect(JSON.stringify(row)).not.toContain(passwordHash);
    }
    const dump = JSON.stringify(
      runtime.store.db.prepare("SELECT * FROM oauth").all(),
    );
    expect(dump).not.toContain(password);
    expect(dump).not.toContain(passwordHash);
  });
  it("requires valid CSRF and explicit consent", async () => {
    const id = await register(),
      flow = await consent(id);
    const response = await flow.agent
      .post("/interaction/confirm")
      .set("Host", host)
      .set("Origin", origin)
      .type("form")
      .send({ csrf: "forged", decision: "allow" });
    expect(response.status).toBe(403);
  });
  it("completes authorization code + PKCE, initializes MCP, and rejects code replay", async () => {
    const id = await register(),
      flow = await authorize(id),
      token = await exchange(id, flow.code, flow.verifier);
    expect(token.status, token.text).toBe(200);
    expect(token.body.refresh_token).toBeTruthy();
    expect(token.text).not.toContain("moodle-private-token");
    expect(token.text).not.toContain("github-token");
    const call = await request(runtime.app)
      .post("/mcp")
      .set("Host", host)
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", "Bearer " + token.body.access_token)
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      });
    expect(call.status, call.text).toBe(200);
    expect(call.body.result.serverInfo.name).toBe("moodle-mcp");
    expect((await exchange(id, flow.code, flow.verifier)).status).toBe(400);
  });
  it("rotates refresh tokens, detects replay, and revokes issued access tokens", async () => {
    const id = await register(),
      flow = await authorize(id),
      token = await exchange(id, flow.code, flow.verifier);
    expect(token.status, token.text).toBe(200);
    const refresh = (value: string) =>
      request(runtime.app)
        .post("/oauth/token")
        .set("Host", host)
        .type("form")
        .send({
          grant_type: "refresh_token",
          client_id: id,
          refresh_token: value,
          resource: origin + "/mcp",
        });
    const rotated = await refresh(token.body.refresh_token);
    expect(rotated.status, rotated.text).toBe(200);
    expect(rotated.body.refresh_token).not.toBe(token.body.refresh_token);
    expect((await refresh(token.body.refresh_token)).status).toBe(400);
    const response = await request(runtime.app)
      .post("/mcp")
      .set("Host", host)
      .set("Authorization", "Bearer " + rotated.body.access_token)
      .send({});
    expect(response.status, response.text).toBe(401);
  });
  it("rejects Unicode CSRF values without raising a server error", async () => {
    const id = await register(),
      flow = await consent(id);
    const response = await flow.agent
      .post("/interaction/confirm")
      .set("Host", host)
      .set("Origin", origin)
      .type("form")
      .send({ csrf: "é".repeat(64), decision: "allow" });
    expect(response.status).toBe(403);
  });
  it("revokes an access token through the standard revocation endpoint", async () => {
    const id = await register(),
      flow = await authorize(id),
      token = await exchange(id, flow.code, flow.verifier);
    expect(token.status, token.text).toBe(200);
    const revoked = await request(runtime.app)
      .post("/oauth/revoke")
      .set("Host", host)
      .type("form")
      .send({
        client_id: id,
        token: token.body.access_token,
        token_type_hint: "access_token",
      });
    expect(revoked.status, revoked.text).toBe(200);
    const response = await request(runtime.app)
      .post("/mcp")
      .set("Host", host)
      .set("Authorization", "Bearer " + token.body.access_token)
      .send({});
    expect(response.status).toBe(401);
  });
  it("rejects an authorization request targeting another resource", async () => {
    const id = await register();
    const response = await request(runtime.app)
      .get("/oauth/authorize")
      .set("Host", host)
      .query({
        client_id: id,
        redirect_uri: callback,
        response_type: "code",
        scope: "moodle:read",
        resource: "https://other.example/mcp",
        code_challenge: "x".repeat(43),
        code_challenge_method: "S256",
      });
    expect(response.headers.location).toContain("error=invalid_target");
  });
  it("does not issue a code when consent is denied", async () => {
    const id = await register(),
      flow = await consent(id);
    let response = await flow.agent
      .post("/interaction/confirm")
      .set("Host", host)
      .set("Origin", origin)
      .type("form")
      .send({ csrf: flow.csrf, decision: "deny" });
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
    const redirect = new URL(response.headers.location);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("code")).toBeNull();
  });
  it("rejects wrong PKCE verifier", async () => {
    const id = await register(),
      flow = await authorize(id);
    expect((await exchange(id, flow.code, "x".repeat(43))).status).toBe(400);
  });
});
