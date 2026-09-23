import { describe, expect, it } from "bun:test";
import {
  canonicalOrigin,
  isAllowedIdentity,
  randomToken,
  sha256,
} from "../src/auth/security.js";
import { readBytes } from "../src/http.js";

describe("canonical public origin", () => {
  it("accepts a canonical HTTPS origin", () =>
    expect(canonicalOrigin("https://mcp.example.com")).toBe(
      "https://mcp.example.com",
    ));
  it.each([
    "http://mcp.example.com",
    "https://u:p@mcp.example.com",
    "https://mcp.example.com/mcp",
    "https://mcp.example.com?x=1",
    "https://mcp.example.com#x",
    "not a URL",
  ])("rejects %s", (value) => expect(() => canonicalOrigin(value)).toThrow());
});
describe("owner and scope authorization", () => {
  it("allows only the configured numeric owner with the read scope", () =>
    expect(
      isAllowedIdentity({ userId: "123", scopes: ["moodle:read"] }, "123"),
    ).toBe(true));
  it.each([
    undefined,
    {},
    { userId: "456", scopes: ["moodle:read"] },
    { userId: "123", scopes: [] },
    { userId: "123", scopes: "moodle:read" },
  ])("rejects malformed or unauthorized props", (props) =>
    expect(isAllowedIdentity(props, "123")).toBe(false),
  );
  it("fails closed for an empty owner setting", () =>
    expect(isAllowedIdentity({ userId: "", scopes: ["moodle:read"] }, "")).toBe(
      false,
    ));
});
describe("browser binding primitives", () => {
  it("uses unique 256-bit URL-safe tokens", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(randomToken());
  });
  it("matches the RFC 7636 S256 example", async () =>
    expect(await sha256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    ));
});
describe("bounded response reading", () => {
  it("returns bytes below the limit", async () =>
    expect(
      new TextDecoder().decode(await readBytes(new Response("abc"), 3)),
    ).toBe("abc"));
  it("rejects a declared oversized body", async () =>
    expect(
      readBytes(
        new Response("abc", { headers: { "Content-Length": "100" } }),
        3,
      ),
    ).rejects.toThrow("too large"));
  it("rejects a chunked body while streaming", async () =>
    expect(readBytes(new Response("abcdef"), 3)).rejects.toThrow("too large"));
});
