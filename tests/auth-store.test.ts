import { describe, it, expect, afterEach, vi } from "vitest";
import { AuthStore } from "../src/auth/store.js";
import { getHttpConfig } from "../src/auth/config.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const secret = "a".repeat(64);
afterEach(() => vi.useRealTimers());
describe("persistent OAuth store", () => {
  it("encrypts payloads and persists across restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "moodle-test-")),
      path = join(dir, "auth.sqlite");
    let store = new AuthStore(path, secret);
    await store
      .adapter("RefreshToken")
      .upsert("token-secret", { accountId: "owner", grantId: "grant" }, 3600);
    expect(
      JSON.stringify(store.db.prepare("SELECT * FROM oauth").all()),
    ).not.toContain("owner");
    expect(
      JSON.stringify(store.db.prepare("SELECT * FROM oauth").all()),
    ).not.toContain("token-secret");
    store.close();
    store = new AuthStore(path, secret);
    expect(
      await store.adapter("RefreshToken").find("token-secret"),
    ).toMatchObject({ accountId: "owner" });
    await store.adapter("RefreshToken").revokeByGrantId("grant");
    expect(
      await store.adapter("RefreshToken").find("token-secret"),
    ).toBeUndefined();
    store.close();
    rmSync(dir, { recursive: true });
  });
  it("expires records and atomically consumes one-time state", async () => {
    const store = new AuthStore(":memory:", secret);
    store.put("State", "state", { uid: "one" }, 1);
    expect(store.take("State", "state")).toMatchObject({ uid: "one" });
    expect(store.take("State", "state")).toBeUndefined();
    store.put("State", "expired", { uid: "one" }, -1);
    expect(store.get("State", "expired")).toBeUndefined();
    store.cleanup();
    expect(store.db.prepare("SELECT count(*) AS n FROM oauth").get()?.n).toBe(
      0,
    );
    store.close();
  });
  it("rejects repeated credential consumption and revokes its family", async () => {
    const store = new AuthStore(":memory:", secret),
      adapter = store.adapter("AuthorizationCode");
    await adapter.upsert("code", { grantId: "grant" }, 100);
    await store
      .adapter("AccessToken")
      .upsert("access", { grantId: "grant" }, 100);
    await adapter.consume("code");
    await expect(adapter.consume("code")).rejects.toThrow();
    expect(await store.adapter("AccessToken").find("access")).toBeUndefined();
    store.close();
  });
  it("does not expire persistent OAuth clients", () => {
    const store = new AuthStore(":memory:", secret);
    store.put("Client", "client", { client_id: "client" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2040-01-01"));
    store.cleanup();
    expect(store.get("Client", "client")?.client_id).toBe("client");
    store.close();
  });
});
describe("HTTP startup configuration", () => {
  const env = {
    PUBLIC_URL: "https://moodle-mcp.example",
    AUTH_MODE: "github",
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "secret",
    GITHUB_ALLOWED_USER_ID: "18055365",
    AUTH_SECRET: secret,
  };
  it("requires a strong secret and a numeric owner ID", () => {
    expect(() => getHttpConfig({ ...env, AUTH_SECRET: "weak" })).toThrow(
      /AUTH_SECRET/,
    );
    expect(() =>
      getHttpConfig({ ...env, GITHUB_ALLOWED_USER_ID: "yusoofsh" }),
    ).toThrow(/numeric/);
    expect(getHttpConfig(env).secure).toBe(true);
  });
  it.each([
    "http://public.example",
    "https://u:p@public.example",
    "https://public.example/path",
    "https://public.example?secret=x",
  ])("rejects unsafe public URL %s", (url) =>
    expect(() => getHttpConfig({ ...env, PUBLIC_URL: url })).toThrow(),
  );
  it("allows HTTP only with explicit loopback development opt-in", () => {
    expect(() =>
      getHttpConfig({ ...env, PUBLIC_URL: "http://localhost:3000" }),
    ).toThrow();
    expect(
      getHttpConfig({
        ...env,
        PUBLIC_URL: "http://localhost:3000",
        ALLOW_INSECURE_HTTP: "true",
      }).secure,
    ).toBe(false);
  });
});
