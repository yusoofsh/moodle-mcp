import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStore } from "../src/auth/store.js";
import { MoodleConnection } from "../src/connect/connection.js";
import { mobileSiteId } from "../src/connect/protocol.js";
import type { MoodleClient } from "../src/moodle-client.js";
const site = "https://solusi.sibermu.ac.id",
  token = "b".repeat(32),
  secret = "a".repeat(64);
const publicConfig = {
  wwwroot: site,
  enablewebservices: 1,
  enablemobilewebservice: 1,
  launchurl: site + "/admin/tool/mobile/launch.php",
  identityproviders: [],
};
let store: AuthStore,
  connection: MoodleConnection,
  factory: ReturnType<typeof vi.fn>;
function fake(userId = 42) {
  return {
    userId,
    siteName: "SiberMu",
    profile: { userid: userId, fullname: "Student" },
    supports: () => true,
  } as unknown as MoodleClient;
}
async function candidate(session = "browser", principal = "owner") {
  const launch = new URL(connection.begin(session, principal, publicConfig));
  const sid = mobileSiteId(site, launch.searchParams.get("passport")!);
  return connection.stage(
    session,
    principal,
    "web+moodlemcp://token=" +
      Buffer.from(sid + ":::" + token + ":::discard-me").toString("base64"),
  );
}
beforeEach(() => {
  store = new AuthStore(":memory:", secret);
  factory = vi.fn().mockResolvedValue(fake());
  connection = new MoodleConnection(
    store,
    { baseUrl: site, maxFileBytes: 1024 },
    factory,
  );
});
afterEach(() => {
  store.close();
  vi.useRealTimers();
});
describe("encrypted owner-approved Moodle connection", () => {
  it("requires onboarding with no token but does not touch upstream for status", async () => {
    expect(connection.state().status).toBe("disconnected");
    expect(factory).not.toHaveBeenCalled();
    await expect(connection.getClient()).rejects.toThrow(/not connected/);
  });
  it("stages without changing the active credential, confirms once, encrypts tokens", async () => {
    const c = await candidate();
    expect(c.userId).toBe(42);
    expect(JSON.stringify(c)).not.toContain(token);
    expect(connection.state().status).toBe("disconnected");
    connection.confirm("browser", "owner", c.confirmation);
    expect(connection.state().status).toBe("connected");
    expect((await connection.getClient()).userId).toBe(42);
    expect(() =>
      connection.confirm("browser", "owner", c.confirmation),
    ).toThrow();
    const rows = JSON.stringify(store.db.prepare("SELECT * FROM oauth").all());
    expect(rows).not.toContain(token);
    expect(rows).not.toContain("discard-me");
  });
  it("binds the return to the initiating browser and consumes pairing once", async () => {
    const launch = new URL(connection.begin("browser", "owner", publicConfig));
    const raw =
      "web+moodlemcp://token=" +
      Buffer.from(
        mobileSiteId(site, launch.searchParams.get("passport")!) +
          ":::" +
          token,
      ).toString("base64");
    await expect(connection.stage("other", "owner", raw)).rejects.toThrow();
    await connection.stage("browser", "owner", raw);
    await expect(connection.stage("browser", "owner", raw)).rejects.toThrow();
  });
  it("rejects expired pairing and staging", async () => {
    connection.begin("browser", "owner", publicConfig);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 601000);
    await expect(
      connection.stage("browser", "owner", "anything"),
    ).rejects.toThrow();
    vi.useRealTimers();
    const c = await candidate();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 301000);
    expect(() =>
      connection.confirm("browser", "owner", c.confirmation),
    ).toThrow();
  });
  it("keeps the original token on validation failure and rejects account switching", async () => {
    const c = await candidate();
    connection.confirm("browser", "owner", c.confirmation);
    factory.mockResolvedValueOnce(fake(99));
    await expect(candidate()).rejects.toThrow(/different Moodle account/);
    expect(connection.state().userId).toBe(42);
    factory.mockRejectedValueOnce(new Error("private-token=" + token));
    await expect(candidate()).rejects.toThrow(
      "Could not validate the Moodle connection",
    );
    expect(connection.state().status).toBe("connected");
  });
  it("prevents stale confirmations from overwriting a newer disconnect", async () => {
    const c = await candidate();
    connection.disconnect();
    expect(() =>
      connection.confirm("browser", "owner", c.confirmation),
    ).toThrow(/changed/);
    expect(connection.state().status).toBe("disconnected");
  });
  it("keeps configuration fallback until SSO approval and disables it on disconnect", async () => {
    connection = new MoodleConnection(
      store,
      { baseUrl: site, token: "old-fallback", maxFileBytes: 1024 },
      factory,
    );
    expect(connection.state().status).toBe("configured-token");
    await connection.getClient();
    expect(factory.mock.calls.at(-1)![0].token).toBe("old-fallback");
    const c = await candidate();
    connection.confirm("browser", "owner", c.confirmation);
    await connection.getClient();
    expect(factory.mock.calls.at(-1)![0].token).toBe(token);
    connection.disconnect();
    await expect(connection.getClient()).rejects.toThrow(/not connected/);
  });
  it("does not cache a failed initial connection and safely retries", async () => {
    const c = await candidate();
    connection.confirm("browser", "owner", c.confirmation);
    factory.mockRejectedValueOnce(new Error("unavailable"));
    await expect(connection.getClient()).rejects.toThrow();
    expect((await connection.getClient()).userId).toBe(42);
  });
});

describe("connection operation race boundaries", () => {
  it("does not retain a staged token after logout/cancel while validation is in flight", async () => {
    let resolve!: (value: MoodleClient) => void;
    factory.mockReturnValueOnce(
      new Promise<MoodleClient>((r) => {
        resolve = r;
      }),
    );
    const pending = candidate();
    await Promise.resolve();
    connection.cancel("browser");
    resolve(fake());
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(store.get("MoodleCandidate", "browser")).toBeUndefined();
  });
  it("cannot complete a previous transaction after a newer one starts", async () => {
    let resolve!: (value: MoodleClient) => void;
    factory.mockReturnValueOnce(
      new Promise<MoodleClient>((r) => {
        resolve = r;
      }),
    );
    const pending = candidate();
    await Promise.resolve();
    connection.begin("browser", "owner", publicConfig);
    resolve(fake());
    await expect(pending).rejects.toThrow(/superseded/);
  });
  it("does not return an in-flight old client after a disconnect", async () => {
    const c = await candidate();
    connection.confirm("browser", "owner", c.confirmation);
    let resolve!: (value: MoodleClient) => void;
    factory.mockReturnValueOnce(
      new Promise<MoodleClient>((r) => {
        resolve = r;
      }),
    );
    const pending = connection.getClient();
    await Promise.resolve();
    connection.disconnect();
    resolve(fake());
    await expect(pending).rejects.toThrow(/changed/);
  });
});

describe("pending mobile return recovery", () => {
  it("does not resume another principal or a cancelled, expired, or superseded connection", () => {
    const launch = connection.begin("browser", "owner", publicConfig);
    expect(connection.pendingReturn("other", "owner")).toBeNull();
    expect(connection.pendingReturn("browser", "other")).toBeNull();
    expect(connection.pendingReturn("browser", "owner")?.launchUrl).toBe(
      launch,
    );
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 601000);
    expect(connection.pendingReturn("browser", "owner")).toBeNull();
    vi.useRealTimers();
    connection.begin("browser", "owner", publicConfig);
    connection.disconnect();
    expect(connection.pendingReturn("browser", "owner")).toBeNull();
  });
  it("leaves the passport valid for exactly one Moodle return after recovery", async () => {
    const launch = new URL(connection.begin("browser", "owner", publicConfig));
    const finish = new URL(
      connection.pendingReturn("browser", "owner")!.finishUrl,
    );
    expect(finish.searchParams.get("passport")).toBe(
      launch.searchParams.get("passport"),
    );
    const raw =
      "web+moodlemcp://token=" +
      Buffer.from(
        mobileSiteId(site, finish.searchParams.get("passport")!) +
          ":::" +
          token,
      ).toString("base64");
    await connection.stage("browser", "owner", raw);
    expect(connection.pendingReturn("browser", "owner")).toBeNull();
    await expect(connection.stage("browser", "owner", raw)).rejects.toThrow();
  });
});
