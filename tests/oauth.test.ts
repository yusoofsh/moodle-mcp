import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createHash, randomBytes } from "node:crypto";
import { createApp } from "../src/app.js";
import { getHttpConfig } from "../src/auth/config.js";
import { MoodleClient } from "../src/moodle-client.js";
const origin = "http://localhost:3000",
  host = "localhost:3000",
  callback = "https://chatgpt.com/connector_platform_oauth_redirect";
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
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
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
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
      GITHUB_ALLOWED_USER_ID: "18055365",
      AUTH_SECRET: "a".repeat(64),
      OAUTH_DATABASE_PATH: ":memory:",
    }),
    { githubFetch: github, createMoodleClient: moodle },
  );
});
afterEach(() => runtime.close());
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
  expect(response.status, response.text).toBe(302);
  return {
    agent,
    verifier,
    state: new URL(response.headers.location).searchParams.get("state")!,
  };
}
async function consent(clientId: string) {
  const flow = await begin(clientId);
  let response = await flow.agent
    .get("/interaction/github/callback")
    .set("Host", host)
    .query({ state: flow.state, code: "valid-code" });
  expect(response.status, response.text).toBe(303);
  // Resume authorization and reach the explicit consent screen.
  for (let i = 0; i < 5 && response.headers.location; i++) {
    expect(new URL(response.headers.location, origin).origin).toBe(origin);
    response = await flow.agent
      .get(path(response.headers.location))
      .set("Host", host);
  }
  expect(response.status, response.text).toBe(200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(response.text)?.[1];
  expect(csrf).toBeTruthy();
  return { ...flow, csrf: csrf! };
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
describe("OAuth protected MCP", () => {
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
  it("rejects a forged GitHub state", async () => {
    const id = await register(),
      flow = await begin(id);
    const response = await flow.agent
      .get("/interaction/github/callback")
      .set("Host", host)
      .query({ state: "forged", code: "code" });
    expect(response.status).toBe(400);
    expect(github).not.toHaveBeenCalled();
  });
  it("denies another GitHub user", async () => {
    github.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("/access_token")
              ? { access_token: "github-token" }
              : { id: 123 },
          ),
        ),
    );
    const id = await register(),
      flow = await begin(id);
    const response = await flow.agent
      .get("/interaction/github/callback")
      .set("Host", host)
      .query({ state: flow.state, code: "code" });
    expect(response.status, response.text).toBe(403);
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
