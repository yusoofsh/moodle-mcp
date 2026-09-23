import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SqlAuthStore } from "../src/auth/sql-store.js";
import { boundedBytes, fetchWithoutRedirect } from "../src/http.js";
import { workerConfig } from "../src/workers/config.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { reserveHttpRequest } from "../src/workers/limits.js";

const secret = "ab".repeat(32);
const hash = "scrypt:32768:8:3:" + "ab".repeat(16) + ":" + "cd".repeat(32);
const env = {
  PUBLIC_URL: "https://mcp.example",
  AUTH_SECRET: secret,
  AUTH_PASSWORD_HASH: hash,
  MOODLE_URL: "https://moodle.example/moodle",
  MOODLE_TOKEN: "test",
  MOODLE_MCP: {} as DurableObjectNamespace,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Workers portability and limits", () => {
  it("shares encryption and atomic credential consumption with an injected database", async () => {
    const db = new DatabaseSync(":memory:"),
      store = new SqlAuthStore(db, secret);
    store.put(
      "AuthorizationCode",
      "code",
      { accountId: "private-owner", grantId: "g" },
      60,
    );
    store.put("AccessToken", "token", { grantId: "g" }, 60);
    await store.adapter("AuthorizationCode").consume("code");
    await expect(
      store.adapter("AuthorizationCode").consume("code"),
    ).rejects.toThrow();
    expect(store.get("AccessToken", "token")).toBeUndefined();
    expect(
      JSON.stringify(db.prepare("SELECT * FROM oauth").all()),
    ).not.toContain("private-owner");
    store.close();
  });
  it("generates and verifies the fixed Workers scrypt profile", async () => {
    const encoded = await hashPassword("my workers test passphrase", true);
    expect(encoded).toMatch(/^scrypt:32768:8:3:/);
    expect(await verifyPassword("my workers test passphrase", encoded)).toBe(
      true,
    );
    expect(await verifyPassword("wrong", encoded)).toBe(false);
  });
  it("requires the Workers profile and HTTPS Moodle", () => {
    expect(workerConfig(env).moodle.maxFileBytes).toBe(2 * 1024 * 1024);
    expect(() =>
      workerConfig({
        ...env,
        AUTH_PASSWORD_HASH: hash.replace("32768:8:3", "131072:8:1"),
      }),
    ).toThrow(/Workers/);
    expect(() =>
      workerConfig({ ...env, MOODLE_URL: "http://localhost" }),
    ).toThrow(/HTTPS/);
  });
  it.each(["0", "5", "NaN", "0.00000001"])(
    "rejects invalid file cap %s",
    (value) => {
      expect(() =>
        workerConfig({ ...env, MOODLE_MCP_MAX_FILE_MB: value }),
      ).toThrow();
    },
  );
  it("rejects redirects and does not expose credential-bearing errors", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.example" },
        }),
      );
    vi.stubGlobal("fetch", mock);
    await expect(
      fetchWithoutRedirect("https://moodle.example?token=private", {
        method: "GET",
      }),
    ).rejects.toThrow(/redirect/);
    expect(mock.mock.calls[0][1].redirect).toBe("manual");
    mock.mockRejectedValueOnce(new Error("private-token"));
    await expect(
      fetchWithoutRedirect("https://moodle.example", {}),
    ).rejects.toThrow("Upstream request failed");
  });
  it("bounds chunked and declared bodies while accepting small responses", async () => {
    expect(await boundedBytes(new Response("abc"), 3)).toHaveLength(3);
    await expect(boundedBytes(new Response("abcdef"), 3)).rejects.toThrow(
      /size/,
    );
    await expect(
      boundedBytes(
        new Response("abc", { headers: { "Content-Length": "100" } }),
        3,
      ),
    ).rejects.toThrow(/size/);
  });
  it("persists registration budgets independently of process memory", () => {
    const db = new DatabaseSync(":memory:"),
      store = new SqlAuthStore(db, secret);
    for (let i = 0; i < 20; i++)
      expect(
        reserveHttpRequest(store, secret, "192.0.2.1", "/oauth/register"),
      ).toBe(0);
    expect(
      reserveHttpRequest(store, secret, "192.0.2.1", "/oauth/register"),
    ).toBeGreaterThan(0);
    expect(
      reserveHttpRequest(store, secret, "192.0.2.2", "/oauth/register"),
    ).toBe(0);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3601000);
    expect(
      reserveHttpRequest(store, secret, "192.0.2.1", "/oauth/register"),
    ).toBe(0);
    store.close();
  });
});
