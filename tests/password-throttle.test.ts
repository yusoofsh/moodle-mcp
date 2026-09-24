import { acquirePasswordSlot } from "../src/auth/password-slot.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStore } from "../src/auth/store.js";
import { reservePasswordAttempt } from "../src/auth/password-throttle.js";
import { readPasswordInput } from "../src/auth/password-cli.js";
const secret = "a".repeat(64);
afterEach(() => vi.useRealTimers());
describe("persistent password attempt budgets", () => {
  it("limits an IP, expires the budget, and does not store raw addresses", () => {
    const store = new AuthStore(":memory:", secret);
    try {
      for (let i = 0; i < 5; i++)
        expect(reservePasswordAttempt(store, secret, "192.0.2.10")).toBe(0);
      expect(
        reservePasswordAttempt(store, secret, "192.0.2.10"),
      ).toBeGreaterThan(0);
      expect(
        JSON.stringify(store.db.prepare("SELECT * FROM oauth").all()),
      ).not.toContain("192.0.2.10");
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 901000);
      expect(reservePasswordAttempt(store, secret, "192.0.2.10")).toBe(0);
    } finally {
      store.close();
    }
  });
  it("enforces a shared global budget across addresses and container restarts", () => {
    const dir = mkdtempSync(join(tmpdir(), "moodle-throttle-"));
    const db = join(dir, "oauth.db");
    let store = new AuthStore(db, secret);
    try {
      for (let i = 0; i < 30; i++)
        expect(reservePasswordAttempt(store, secret, `192.0.2.${i}`)).toBe(0);
      store.close();
      store = new AuthStore(db, secret);
      expect(
        reservePasswordAttempt(store, secret, "198.51.100.1"),
      ).toBeGreaterThan(0);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
describe("password helper input", () => {
  it("preserves whitespace and accepts one terminal newline", async () => {
    async function* input() {
      yield "  a long passphrase  \r\n";
    }
    expect(await readPasswordInput(input())).toBe("  a long passphrase  ");
  });
  it("bounds piped input before generating a hash", async () => {
    async function* input() {
      yield "x".repeat(1027);
    }
    await expect(readPasswordInput(input())).rejects.toThrow(/exceeds/);
  });
});

it("shares a password slot and releases it only once", () => {
  const scope = {};
  const release = acquirePasswordSlot(scope)!;
  expect(acquirePasswordSlot(scope)).toBeUndefined();
  release();
  const next = acquirePasswordSlot(scope)!;
  release();
  expect(acquirePasswordSlot(scope)).toBeUndefined();
  next();
  expect(acquirePasswordSlot(scope)).toBeTypeOf("function");
});
