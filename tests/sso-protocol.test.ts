import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildMobileLaunch,
  parseMobileReturn,
  mobileSiteId,
} from "../src/connect/protocol.js";
const site = "https://solusi.sibermu.ac.id";
const passport = "a".repeat(43);
const sid = createHash("md5")
  .update(site + passport)
  .digest("hex");
const token = "b".repeat(32);
const config = {
  wwwroot: site,
  enablewebservices: 1,
  enablemobilewebservice: 1,
  launchurl: site + "/admin/tool/mobile/launch.php",
  identityproviders: [
    {
      name: "Login SSO Google",
      url: site + "/auth/oauth2/login.php?id=3&sesskey=not-reused",
    },
  ],
};
const payload = (text: string) =>
  "web+moodlemcp://token=" + Buffer.from(text).toString("base64");
describe("Moodle mobile SSO protocol", () => {
  it("uses the site/passport identifier and discovers the configured Google issuer", () => {
    expect(mobileSiteId(site, passport)).toBe(sid);
    const launch = new URL(buildMobileLaunch(site, passport, config));
    expect(launch.origin).toBe(site);
    expect(launch.searchParams.get("oauthsso")).toBe("3");
    expect(launch.searchParams.get("urlscheme")).toBe("web+moodlemcp");
    expect(launch.searchParams.get("service")).toBe("moodle_mobile_app");
    expect(launch.searchParams.get("confirmed")).toBe("1");
    expect(launch.searchParams.has("sesskey")).toBe(false);
  });
  it("returns only the API token and discards the optional private token", () => {
    expect(
      parseMobileReturn(
        payload(sid + ":::" + token + ":::private-mobile-secret"),
        sid,
      ),
    ).toBe(token);
  });
  it.each([
    "moodlemobile://token=YWJj",
    "https://evil.example",
    "web+moodlemcp://token=!!!",
    "web+moodlemcp://token=",
    "x".repeat(4097),
  ])("rejects malformed returns", (value) =>
    expect(() => parseMobileReturn(value, sid)).toThrow(),
  );
  it("rejects another transaction/site and invalid tokens", () => {
    expect(() =>
      parseMobileReturn(payload("c".repeat(32) + ":::" + token), sid),
    ).toThrow();
    expect(() => parseMobileReturn(payload(sid + ":::wrong"), sid)).toThrow();
  });
  it.each([
    { ...config, wwwroot: "https://evil.example" },
    { ...config, launchurl: "https://evil.example/launch.php" },
    { ...config, enablemobilewebservice: 0 },
    { ...config, forcedurlscheme: "moodlemobile" },
  ])("rejects disabled service or unsafe launch config", (conf) =>
    expect(() => buildMobileLaunch(site, passport, conf)).toThrow(),
  );
});
