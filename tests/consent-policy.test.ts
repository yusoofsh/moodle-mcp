import { describe, expect, it } from "vitest";
import { consentCallbackOrigin } from "../src/auth/consent-policy.js";

describe("consent callback CSP", () => {
  it("permits only the registered callback origin, without query data", () => {
    const callback = "https://client.example:8443/oauth/callback?tenant=one";
    expect(consentCallbackOrigin(callback, [callback])).toBe(
      "https://client.example:8443",
    );
  });
  it("supports registered loopback callbacks", () => {
    const callback = "http://127.0.0.1:3210/callback";
    expect(consentCallbackOrigin(callback, [callback])).toBe(
      "http://127.0.0.1:3210",
    );
  });
  it.each(["https://unregistered.example/callback", undefined])(
    "rejects an unregistered callback",
    (value) => {
      expect(() =>
        consentCallbackOrigin(value, ["https://client.example/callback"]),
      ).toThrow();
    },
  );
  it.each([
    "https://*.example/callback",
    "https://user:pass@client.example/callback",
    "https://client.example/callback#fragment",
    "javascript:alert(1)",
    "https://client.example';form-action*/callback",
  ])("rejects unsafe registered URI %s", (value) => {
    expect(() => consentCallbackOrigin(value, [value])).toThrow();
  });
});
