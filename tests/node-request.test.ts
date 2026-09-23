import { describe, expect, it } from "vitest";
import { prepareNodeRequest } from "../src/workers/node-request.js";

const url = "https://mcp.example/oauth/register";
function post(body: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers, body });
}
describe("bounded Fetch to Node request framing", () => {
  it.each(["application/json", "application/json; charset=utf-8"])(
    "restores body length for %s without changing the media type",
    async (type) => {
      const payload = JSON.stringify({ client_name: "Moodle العربية" });
      const request = post(payload, { "Content-Type": type });
      expect(request.headers.has("content-length")).toBe(false);
      const prepared = await prepareNodeRequest(request, 1024);
      expect(prepared.headers.get("content-length")).toBe(
        String(new TextEncoder().encode(payload).byteLength),
      );
      expect(prepared.headers.get("content-type")).toBe(type);
      expect(await prepared.text()).toBe(payload);
    },
  );
  it("replaces stale framing with the measured length", async () => {
    const prepared = await prepareNodeRequest(
      post("abcd", {
        "Content-Length": "1",
        "Transfer-Encoding": "chunked",
        "Content-Type": "application/json",
      }),
      4,
    );
    expect(prepared.headers.get("content-length")).toBe("4");
    expect(prepared.headers.has("transfer-encoding")).toBe(false);
    expect(await prepared.text()).toBe("abcd");
  });
  it("retains form encoding for the password and token endpoints", async () => {
    const payload = "grant_type=authorization_code";
    const prepared = await prepareNodeRequest(
      post(payload, { "Content-Type": "application/x-www-form-urlencoded" }),
      1024,
    );
    expect(prepared.headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(prepared.headers.get("content-length")).toBe(String(payload.length));
  });
  it("does not relabel an incorrect media type", async () => {
    const prepared = await prepareNodeRequest(
      post("{}", { "Content-Type": "text/plain" }),
      1024,
    );
    expect(prepared.headers.get("content-type")).toBe("text/plain");
  });
  it("enforces limits while streaming rather than trusting declared length", async () => {
    await expect(
      prepareNodeRequest(post("abcdef", { "Content-Length": "1" }), 3),
    ).rejects.toThrow(/size limit/);
    await expect(
      prepareNodeRequest(post("abc", { "Content-Length": "100" }), 3),
    ).rejects.toThrow(/size limit/);
  });
  it.each(["GET", "HEAD"])(
    "leaves bodyless %s requests unchanged",
    async (method) => {
      const request = new Request(url, { method });
      expect(await prepareNodeRequest(request, 1024)).toBe(request);
    },
  );
});
