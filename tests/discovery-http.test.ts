import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { getHttpConfig } from "../src/auth/config.js";
const origin = "http://localhost:3000";
const config = getHttpConfig({
  PUBLIC_URL: origin,
  ALLOW_INSECURE_HTTP: "true",
  AUTH_SECRET: "a".repeat(64),
  AUTH_PASSWORD_HASH:
    "scrypt:32768:8:3:" + "ab".repeat(16) + ":" + "cd".repeat(32),
  OAUTH_DATABASE_PATH: ":memory:",
});
let runtime: ReturnType<typeof createApp>;
let factory: ReturnType<typeof vi.fn>;
let accessToken: string;
beforeEach(async () => {
  factory = vi
    .fn()
    .mockRejectedValue(new Error("upstream failure token=DO-NOT-DISCLOSE"));
  runtime = createApp(config, { createMoodleClient: factory });
  // Synthetic test-only grant. Production still verifies the real owner and tokens.
  const registration = await request(runtime.app)
    .post("/oauth/register")
    .set("Host", "localhost:3000")
    .send({
      redirect_uris: ["https://client.example/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  expect(registration.status).toBe(201);
  const clientId = registration.body.client_id;
  const grant = new runtime.provider.Grant({
    accountId: config.ownerId,
    clientId,
  });
  grant.addResourceScope(origin + "/mcp", "moodle:read");
  const grantId = await grant.save();
  const token = new runtime.provider.AccessToken({
    accountId: config.ownerId,
    clientId,
    grantId,
    scope: "moodle:read",
    aud: origin + "/mcp",
  });
  accessToken = await token.save();
});
afterEach(() => runtime.close());
function post(
  method: string,
  params?: object,
  token: string | undefined = accessToken,
) {
  const req = request(runtime.app)
    .post("/mcp")
    .set("Host", "localhost:3000")
    .set("Accept", "application/json, text/event-stream");
  if (token) req.set("Authorization", "Bearer " + token);
  return req.send({ jsonrpc: "2.0", id: 1, method, params });
}
describe("authenticated HTTP discovery during Moodle outage", () => {
  it("initializes and lists tools without reaching Moodle", async () => {
    const init = await post("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "discovery-fixture", version: "1" },
    });
    expect(init.status, init.text).toBe(200);
    expect(init.body.result.capabilities.tools).toBeDefined();
    const list = await post("tools/list", {});
    expect(list.status, list.text).toBe(200);
    expect(list.body.result.tools).toHaveLength(14);
    for (const tool of list.body.result.tools) {
      expect(tool).not.toHaveProperty("execution");
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool._meta.securitySchemes).toEqual([
        { type: "oauth2", scopes: ["moodle:read"] },
      ]);
    }
    expect(factory).not.toHaveBeenCalled();
  });
  it("keeps OAuth mandatory and reports upstream failures as tool results", async () => {
    expect((await post("tools/list", {}, "")).status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
    const call = await post("tools/call", {
      name: "moodle_get_site_info",
      arguments: {},
    });
    expect(call.status, call.text).toBe(200);
    expect(call.body.result.isError).toBe(true);
    expect(call.text).not.toContain("DO-NOT-DISCLOSE");
    expect((await post("tools/list", {})).body.result.tools).toHaveLength(14);
  });
});
