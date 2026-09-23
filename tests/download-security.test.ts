import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { MoodleClient } from "../src/moodle-client.js";
const originalFetch = globalThis.fetch;
let upstream: ReturnType<typeof mock>;
beforeEach(() => {
  upstream = mock(async () =>
    Response.json({ userid: 42, sitename: "Test", release: "4.5" }),
  );
  globalThis.fetch = upstream as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
async function client() {
  return MoodleClient.create({
    baseUrl: "https://moodle.example",
    token: "private-test-token",
    maxFileBytes: 4,
  });
}
it.each([
  "http://moodle.example/pluginfile.php/a.pdf",
  "https://user:password@moodle.example/pluginfile.php/a.pdf",
  "https://moodle.example/not/pluginfile.php/a.pdf",
  "https://moodle.example/pluginfile.php.evil/a.pdf",
  "https://other.example/pluginfile.php/a.pdf",
])("refuses an unsafe file URL without fetching it: %s", async (url) => {
  const c = await client();
  const count = upstream.mock.calls.length;
  await expect(c.downloadFile(url)).rejects.toThrow();
  expect(upstream.mock.calls.length).toBe(count);
});
it("disables redirects and adds a timeout to Moodle API calls", async () => {
  await client();
  const options = upstream.mock.calls[0][1] as RequestInit;
  expect(options.redirect).toBe("error");
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
it("disables redirects and times out credential-bearing file requests", async () => {
  const c = await client();
  upstream.mockResolvedValueOnce(
    new Response("abcd", { headers: { "Content-Type": "text/plain" } }),
  );
  const result = await c.downloadFile(
    "https://moodle.example/pluginfile.php/a.txt",
  );
  expect(new TextDecoder().decode(result.bytes)).toBe("abcd");
  const options = upstream.mock.calls.at(-1)![1] as RequestInit;
  expect(options.redirect).toBe("error");
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
it("rejects an oversized chunked download while reading", async () => {
  const c = await client();
  upstream.mockResolvedValueOnce(new Response("abcdef"));
  await expect(
    c.downloadFile("https://moodle.example/pluginfile.php/a.txt"),
  ).rejects.toThrow(/too large/i);
});
it("does not reflect a credential-bearing network exception", async () => {
  const c = await client();
  upstream.mockRejectedValueOnce(
    new Error("failure at https://moodle.example/?token=private-test-token"),
  );
  try {
    await c.downloadFile("https://moodle.example/pluginfile.php/a.txt");
    throw new Error("Expected rejection");
  } catch (e) {
    expect(String(e)).not.toContain("private-test-token");
    expect(String(e)).toContain("download failed");
  }
});

it("does not reflect an exception raised while reading a credential-bearing response", async () => {
  const c = await client();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error("stream failed: token=private-test-token"));
    },
  });
  upstream.mockResolvedValueOnce(new Response(body));
  try {
    await c.downloadFile("https://moodle.example/pluginfile.php/a.txt");
    throw new Error("Expected rejection");
  } catch (error) {
    expect(String(error)).not.toContain("private-test-token");
    expect(String(error)).toContain("download failed");
  }
});
