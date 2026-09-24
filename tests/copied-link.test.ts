import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStore } from "../src/auth/store.js";
import { MoodleConnection } from "../src/connect/connection.js";
import {
  parseCopiedMobileLink,
  parseMobileReturn,
} from "../src/connect/protocol.js";
import type { MoodleClient } from "../src/moodle-client.js";
const site = "https://moodle.example",
  token = "b".repeat(32),
  otherToken = "d".repeat(32);
const copied = (value = token, scheme = "moodlemobile") =>
  scheme +
  "://token=" +
  Buffer.from(
    "a".repeat(32) + ":::" + value + ":::discard-private-credential",
  ).toString("base64");
const fake = (userId = 42) =>
  ({
    userId,
    siteName: "Moodle fixture",
    profile: { fullname: "Student fixture" },
    supports: () => true,
  }) as unknown as MoodleClient;
let store: AuthStore,
  connection: MoodleConnection,
  factory: ReturnType<typeof vi.fn>;
beforeEach(() => {
  store = new AuthStore(":memory:", "ab".repeat(32));
  factory = vi.fn().mockResolvedValue(fake());
  connection = new MoodleConnection(
    store,
    { baseUrl: site, maxFileBytes: 1024, token: "fallback" },
    factory,
  );
});
afterEach(() => store.close());
describe("explicit copied mobile credential import", () => {
  it("parses only the two supported copied schemes and discards the private credential", () => {
    expect(parseCopiedMobileLink(copied())).toBe(token);
    expect(parseCopiedMobileLink(copied(token, "web+moodlemcp"))).toBe(token);
    expect(() => parseMobileReturn(copied(), "a".repeat(32))).toThrow();
    expect(() =>
      parseMobileReturn(copied(token, "web+moodlemcp"), "c".repeat(32)),
    ).toThrow();
  });
  it.each([
    "https://evil.example/#token=abc",
    "moodlemobile://token=abc",
    "moodlemobile://token=!!!!",
    "other://token=YWJj",
    "x".repeat(3000),
  ])("rejects invalid copied input", (value) =>
    expect(() => parseCopiedMobileLink(value)).toThrow(),
  );
  it("stages without a browser pairing, validates only on the configured site, and requires confirmation", async () => {
    const candidate = await connection.stageCopiedLink(
      "browser",
      "owner",
      copied(),
    );
    expect(factory).toHaveBeenCalledWith({
      baseUrl: site,
      maxFileBytes: 1024,
      token,
    });
    expect(connection.state().status).toBe("configured-token");
    expect(JSON.stringify(candidate)).not.toContain(token);
    expect(
      JSON.stringify(store.db.prepare("SELECT * FROM oauth").all()),
    ).not.toContain(token);
    expect(
      JSON.stringify(store.db.prepare("SELECT * FROM oauth").all()),
    ).not.toContain("discard-private-credential");
    connection.confirm("browser", "owner", candidate.confirmation);
    expect(connection.state().status).toBe("connected");
    expect(connection.state().credentialSource).toBe("copied-link");
    expect(() =>
      connection.confirm("browser", "owner", candidate.confirmation),
    ).toThrow();
  });
  it("never accepts the same unpaired payload through the automatic return", async () => {
    await expect(
      connection.stage("browser", "owner", copied(token, "web+moodlemcp")),
    ).rejects.toThrow(/Pairing/);
    expect(factory).not.toHaveBeenCalled();
  });
  it("retains the active credential when another account or invalid token is imported", async () => {
    const candidate = await connection.stageCopiedLink(
      "browser",
      "owner",
      copied(),
    );
    connection.confirm("browser", "owner", candidate.confirmation);
    factory.mockResolvedValueOnce(fake(99));
    await expect(
      connection.stageCopiedLink("browser", "owner", copied(otherToken)),
    ).rejects.toThrow(/different Moodle account/);
    factory.mockRejectedValueOnce(new Error("leaky-network-message=" + token));
    await expect(
      connection.stageCopiedLink("browser", "owner", copied()),
    ).rejects.toThrow("Could not validate the Moodle connection");
    expect(connection.state().userId).toBe(42);
    expect(connection.state().status).toBe("connected");
  });
  it("rejects another session confirmation and cancelled in-flight validation", async () => {
    const c = await connection.stageCopiedLink("browser", "owner", copied());
    expect(() =>
      connection.confirm("other", "owner", c.confirmation),
    ).toThrow();
    let resolve!: (value: MoodleClient) => void;
    factory.mockReturnValueOnce(
      new Promise<MoodleClient>((r) => {
        resolve = r;
      }),
    );
    const pending = connection.stageCopiedLink("browser", "owner", copied());
    connection.cancel("browser");
    resolve(fake());
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(store.get("MoodleCandidate", "browser")).toBeUndefined();
  });
  it("rejects stale imports after a concurrent disconnect", async () => {
    const c = await connection.stageCopiedLink("browser", "owner", copied());
    connection.disconnect();
    expect(() =>
      connection.confirm("browser", "owner", c.confirmation),
    ).toThrow(/changed/);
  });
});
