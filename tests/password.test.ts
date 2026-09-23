import { beforeAll, describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  validatePasswordHash,
} from "../src/auth/password.js";
import { getHttpConfig } from "../src/auth/config.js";

const password = "a long private passphrase";
let hash: string;
beforeAll(async () => {
  hash = await hashPassword(password);
});
describe("password storage", () => {
  it("uses salted scrypt and validates the correct password", async () => {
    expect(hash).toMatch(/^scrypt:131072:8:1:[a-f0-9]{32}:[a-f0-9]{64}$/);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await hashPassword(password)).not.toBe(hash);
  });
  it("rejects wrong and malformed password input without truncation", async () => {
    expect(await verifyPassword(password + "x", hash)).toBe(false);
    for (const value of [undefined, null, [], {}, "", "x".repeat(1025)]) {
      expect(await verifyPassword(value, hash)).toBe(false);
    }
  });
  it("preserves spaces and Unicode instead of silently trimming passwords", async () => {
    const value = "  sebuah kata sandi العربية  ";
    const encoded = await hashPassword(value);
    expect(await verifyPassword(value, encoded)).toBe(true);
    expect(await verifyPassword(value.trim(), encoded)).toBe(false);
  });
  it("rejects malformed or unsafe hash encodings at startup", () => {
    for (const value of [
      password,
      "",
      hash.replace("131072", "1024"),
      hash.replace(":8:", ":999:"),
      hash + "x",
      hash.toUpperCase(),
    ]) {
      expect(() => validatePasswordHash(value)).toThrow(/AUTH_PASSWORD_HASH/);
    }
  });
  it("rejects short and oversized passwords when generating a hash", async () => {
    await expect(hashPassword("too short")).rejects.toThrow();
    await expect(hashPassword("é".repeat(600))).rejects.toThrow();
  });
});
describe("password-mode configuration", () => {
  const env = {
    PUBLIC_URL: "https://mcp.example",
    AUTH_SECRET: "a".repeat(64),
  };
  it("defaults to password mode without requiring a GitHub app", () => {
    const config = getHttpConfig({ ...env, AUTH_PASSWORD_HASH: hash });
    expect(config.authMode).toBe("password");
    expect(config.ownerId).toMatch(/^local-owner:/);
    expect(config.githubClientId).toBeUndefined();
  });
  it("fails closed rather than falling back to GitHub or plaintext", () => {
    expect(() => getHttpConfig(env)).toThrow(/AUTH_PASSWORD_HASH/);
    expect(() =>
      getHttpConfig({ ...env, AUTH_PASSWORD_HASH: password }),
    ).toThrow(/AUTH_PASSWORD_HASH/);
    expect(() =>
      getHttpConfig({ ...env, AUTH_MODE: "none", AUTH_PASSWORD_HASH: hash }),
    ).toThrow(/AUTH_MODE/);
  });
  it("changes the owner identity on password rotation", async () => {
    const a = getHttpConfig({ ...env, AUTH_PASSWORD_HASH: hash });
    const b = getHttpConfig({
      ...env,
      AUTH_PASSWORD_HASH: await hashPassword("a different long passphrase"),
    });
    expect(a.ownerId).not.toBe(b.ownerId);
    expect(getHttpConfig({ ...env, AUTH_PASSWORD_HASH: hash }).ownerId).toBe(
      a.ownerId,
    );
  });
  it("retains GitHub only when explicitly selected", () => {
    expect(
      getHttpConfig({
        ...env,
        AUTH_MODE: "github",
        GITHUB_CLIENT_ID: "id",
        GITHUB_CLIENT_SECRET: "secret",
        GITHUB_ALLOWED_USER_ID: "18055365",
      }).authMode,
    ).toBe("github");
  });
});
