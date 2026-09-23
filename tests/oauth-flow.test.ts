import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import worker, { handleMcp } from "../src/worker.js";
import { randomToken, sha256 } from "../src/auth/security.js";
import type { Env } from "../src/worker-env.js";

class MemoryKV {
  rows = new Map<string, { value: string; expires: number }>();
  async get(key: string, options?: string | { type?: string }) {
    const row = this.rows.get(key);
    if (!row || row.expires <= Date.now()) return null;
    return (typeof options === "string" ? options : options?.type) === "json"
      ? JSON.parse(row.value)
      : row.value;
  }
  async put(key: string, value: string, options?: { expirationTtl?: number }) {
    this.rows.set(key, {
      value,
      expires: options?.expirationTtl
        ? Date.now() + options.expirationTtl * 1000
        : Infinity,
    });
  }
  async delete(key: string) {
    this.rows.delete(key);
  }
  async list(options?: { prefix?: string }) {
    return {
      keys: [...this.rows.keys()]
        .filter((key) => key.startsWith(options?.prefix ?? ""))
        .map((name) => ({ name })),
      list_complete: true,
      cursor: "",
    };
  }
}
const PUBLIC = "https://mcp.example.com";
const REDIRECT = "https://client.example/callback";
const originalFetch = globalThis.fetch;
let env: Env;
let kv: MemoryKV;
let githubUser: number;
let upstream: ReturnType<typeof mock>;
function context(props: unknown = {}): ExecutionContext {
  return {
    props,
    waitUntil() {},
    passThroughOnException() {},
  } as unknown as ExecutionContext;
}
async function request(path: string, init?: RequestInit) {
  return worker.fetch(new Request(`${PUBLIC}${path}`, init), env, context());
}
function form(
  body: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...extraHeaders,
    },
    body: new URLSearchParams(body),
  };
}
function cookie(response: Response): string {
  return response.headers.get("set-cookie")!.split(";")[0];
}
async function register() {
  const res = await request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test <client>",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}
async function start(overrides: Record<string, string | undefined> = {}) {
  const client = await register();
  const verifier = randomToken();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: client,
    redirect_uri: REDIRECT,
    scope: "moodle:read",
    state: "client-csrf-state",
    resource: `${PUBLIC}/mcp`,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
  });
  for (const [key, value] of Object.entries(overrides))
    if (value !== undefined) query.set(key, value);
  const res = await request(`/authorize?${query}`);
  return { res, client, verifier, query };
}
async function login() {
  const flow = await start();
  expect(flow.res.status).toBe(303);
  const location = new URL(flow.res.headers.get("location")!);
  expect(location.origin).toBe("https://github.com");
  expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  const res = await request(
    `/github/callback?${new URLSearchParams({ state: location.searchParams.get("state")!, code: "github-test-code" })}`,
    { headers: { Cookie: cookie(flow.res) } },
  );
  return { ...flow, consent: res };
}
async function approve() {
  const flow = await login();
  expect(flow.consent.status).toBe(200);
  const html = await flow.consent.text();
  expect(html).toContain("Test &lt;client&gt;");
  const state = /name="state" value="([A-Za-z0-9_-]+)"/.exec(html)![1];
  const init = form(
    { state, decision: "allow" },
    { Origin: PUBLIC, Cookie: cookie(flow.consent) },
  );
  const res = await request("/consent", init);
  expect(res.status).toBe(303);
  const redirect = new URL(res.headers.get("location")!);
  expect(redirect.searchParams.get("state")).toBe("client-csrf-state");
  return { ...flow, init, code: redirect.searchParams.get("code")! };
}
async function exchange(
  flow: { client: string; code: string; verifier: string },
  overrides: Record<string, string> = {},
) {
  return request(
    "/oauth/token",
    form({
      grant_type: "authorization_code",
      client_id: flow.client,
      code: flow.code,
      code_verifier: flow.verifier,
      redirect_uri: REDIRECT,
      resource: `${PUBLIC}/mcp`,
      ...overrides,
    }),
  );
}
async function token() {
  const flow = await approve();
  const res = await exchange(flow);
  expect(res.status).toBe(200);
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    scope: string;
  };
  expect(tokens.scope).toBe("moodle:read");
  return { ...flow, ...tokens };
}
function rpc(accessToken?: string, method = "tools/list"): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(method === "initialize"
        ? {
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "test", version: "1" },
            },
          }
        : {}),
    }),
  };
}
beforeEach(() => {
  kv = new MemoryKV();
  env = {
    OAUTH_KV: kv,
    PUBLIC_URL: PUBLIC,
    GITHUB_CLIENT_ID: "test-client",
    GITHUB_CLIENT_SECRET: "test-secret",
    GITHUB_ALLOWED_USER_ID: "18055365",
    MOODLE_URL: "https://moodle.example",
    MOODLE_TOKEN: "test-moodle-token",
  } as unknown as Env;
  githubUser = 18055365;
  upstream = mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token")
      return Response.json({ access_token: "test-github-token" });
    if (url === "https://api.github.com/user")
      return Response.json({ id: githubUser });
    if (url === "https://moodle.example/webservice/rest/server.php")
      return Response.json({
        userid: 42,
        sitename: "Test Moodle",
        release: "4.5",
        functions: [],
      });
    throw new Error("Unexpected outbound request");
  });
  globalThis.fetch = upstream as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("OAuth protocol and application boundary (real provider, in-memory KV)", () => {
  it("rejects absent and arbitrary tokens before reaching Moodle", async () => {
    for (const candidate of [
      undefined,
      "test-moodle-token",
      "test-github-token",
      "wrong",
    ]) {
      const res = await request("/mcp", rpc(candidate));
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain(
        "/.well-known/oauth-protected-resource/mcp",
      );
    }
    expect(upstream).toHaveBeenCalledTimes(0);
  });
  it("publishes canonical resource and S256 authorization metadata", async () => {
    const resource = (await (
      await request("/.well-known/oauth-protected-resource/mcp")
    ).json()) as any;
    expect(resource.resource).toBe(`${PUBLIC}/mcp`);
    expect(resource.authorization_servers).toEqual([PUBLIC]);
    const metadata = (await (
      await request("/.well-known/oauth-authorization-server")
    ).json()) as any;
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.token_endpoint).toBe(`${PUBLIC}/oauth/token`);
    expect(metadata.response_types_supported).not.toContain("token");
  });
  it("does not issue a grant until explicit consent", async () => {
    const flow = await login();
    expect(flow.consent.status).toBe(200);
    expect([...kv.rows.keys()].some((key) => key.startsWith("grant:"))).toBe(
      false,
    );
  });
  it("completes PKCE OAuth and lists all 14 read-only tools", async () => {
    const flow = await token();
    const init = await request("/mcp", rpc(flow.access_token, "initialize"));
    expect(init.status).toBe(200);
    const res = await request("/mcp", rpc(flow.access_token));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.result.tools).toHaveLength(14);
    for (const tool of data.result.tools)
      expect(tool.annotations.readOnlyHint).toBe(true);
    expect(JSON.stringify(data)).not.toContain("test-moodle-token");
  });
  it.each([
    { scope: "moodle:write" },
    { code_challenge_method: "plain" },
    { code_challenge: "" },
    { resource: "https://attacker.example/mcp" },
    { redirect_uri: "https://attacker.example/callback" },
  ])("rejects invalid authorization parameters", async (override) => {
    expect((await start(override)).res.status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(0);
  });
  it("rejects a different GitHub user", async () => {
    githubUser = 456;
    expect((await login()).consent.status).toBe(403);
  });
  it("rejects a callback without the browser binding", async () => {
    const flow = await start();
    const github = new URL(flow.res.headers.get("location")!);
    const res = await request(
      `/github/callback?state=${github.searchParams.get("state")}&code=code`,
    );
    expect(res.status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(0);
  });
  it("requires same-origin consent and rejects sequential replay", async () => {
    const flow = await approve();
    expect((await request("/consent", flow.init)).status).toBe(400);
    const init = {
      ...flow.init,
      headers: { ...flow.init.headers, Origin: "https://attacker.example" },
    };
    expect((await request("/consent", init)).status).toBe(403);
  });
  it("rejects wrong PKCE verifiers and reused authorization codes", async () => {
    const flow = await approve();
    expect(
      (await exchange(flow, { code_verifier: randomToken() })).status,
    ).toBe(400);
    // Use a new grant because failed exchanges may consume a code.
    const valid = await approve();
    expect((await exchange(valid)).status).toBe(200);
    expect((await exchange(valid)).status).toBe(400);
  });
  it("rejects a wrong resource at the token endpoint", async () => {
    const flow = await approve();
    expect(
      (await exchange(flow, { resource: "https://attacker.example/mcp" }))
        .status,
    ).toBe(400);
  });
  it("rotates refresh tokens and binds permissions to the refreshed token", async () => {
    const flow = await token();
    const res = await request(
      "/oauth/token",
      form({
        grant_type: "refresh_token",
        client_id: flow.client,
        refresh_token: flow.refresh_token,
        resource: `${PUBLIC}/mcp`,
      }),
    );
    expect(res.status).toBe(200);
    const refreshed = (await res.json()) as any;
    expect(refreshed.refresh_token).not.toBe(flow.refresh_token);
    expect((await request("/mcp", rpc(refreshed.access_token))).status).toBe(
      200,
    );
  });
  it("revokes an access token through the advertised endpoint", async () => {
    const flow = await token();
    expect(
      (
        await request(
          "/oauth/token",
          form({
            client_id: flow.client,
            token: flow.access_token,
            token_type_hint: "access_token",
          }),
        )
      ).status,
    ).toBe(200);
    expect((await request("/mcp", rpc(flow.access_token))).status).toBe(401);
  });
  it("supports an explicit Deny without issuing a grant", async () => {
    const flow = await login();
    const html = await flow.consent.text();
    const state = /name="state" value="([A-Za-z0-9_-]+)"/.exec(html)![1];
    const res = await request(
      "/consent",
      form(
        { state, decision: "deny" },
        { Origin: PUBLIC, Cookie: cookie(flow.consent) },
      ),
    );
    expect(res.status).toBe(303);
    expect(
      new URL(res.headers.get("location")!).searchParams.get("error"),
    ).toBe("access_denied");
    expect([...kv.rows.keys()].some((key) => key.startsWith("grant:"))).toBe(
      false,
    );
  });
  it("rejects a token after expiry in the token store", async () => {
    const flow = await token();
    for (const [key, row] of kv.rows)
      if (key.startsWith("token:")) row.expires = 0;
    expect((await request("/mcp", rpc(flow.access_token))).status).toBe(401);
  });
  it("does not store Moodle or GitHub access tokens in OAuth state", async () => {
    await token();
    const state = JSON.stringify([...kv.rows.values()]);
    expect(state).not.toContain("test-moodle-token");
    expect(state).not.toContain("test-github-token");
    expect(state).not.toContain("test-secret");
  });
  it("does not preserve read access for a non-granted refresh scope", async () => {
    const flow = await token();
    const res = await request(
      "/oauth/token",
      form({
        grant_type: "refresh_token",
        client_id: flow.client,
        refresh_token: flow.refresh_token,
        resource: `${PUBLIC}/mcp`,
        scope: "moodle:write",
      }),
    );
    expect(res.status).toBe(200);
    const reduced = (await res.json()) as {
      access_token: string;
      scope: string;
    };
    expect(reduced.scope).toBe("");
    expect((await request("/mcp", rpc(reduced.access_token))).status).toBe(403);
  });
  it("enforces the current owner even for previously valid access tokens", async () => {
    const flow = await token();
    env.GITHUB_ALLOWED_USER_ID = "999";
    expect((await request("/mcp", rpc(flow.access_token))).status).toBe(403);
  });
  it("fails closed for a missing secret, wrong host, or untrusted MCP Origin", async () => {
    const bad = await worker.fetch(
      new Request("https://other.example/mcp", rpc()),
      env,
      context(),
    );
    expect(bad.status).toBe(421);
    const origin = rpc();
    origin.headers = { ...origin.headers, Origin: "https://attacker.example" };
    expect((await request("/mcp", origin)).status).toBe(403);
    env.MOODLE_TOKEN = "";
    expect((await request("/mcp", rpc())).status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(0);
  });
  it("blocks missing scope and non-exact MCP paths at the handler", async () => {
    expect(
      (
        await handleMcp(
          new Request(`${PUBLIC}/mcp`, rpc()),
          env,
          context({ userId: "18055365", scopes: [] }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleMcp(
          new Request(`${PUBLIC}/mcp/anything`, rpc()),
          env,
          context({ userId: "18055365", scopes: ["moodle:read"] }),
        )
      ).status,
    ).toBe(404);
    expect(upstream).toHaveBeenCalledTimes(0);
  });
});
