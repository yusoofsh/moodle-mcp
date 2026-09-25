import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeUrl } from "../src/config.js";
import { MoodleClient } from "../src/moodle-client.js";
import { FileIdStore } from "../src/file-id-store.js";

afterEach(() => vi.unstubAllGlobals());
async function client(maxFileBytes = 1024) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ userid: 7, sitename: "Test", functions: [] }),
        ),
      ),
  );
  return MoodleClient.create({
    baseUrl: "https://school.example/moodle",
    token: "private-token",
    maxFileBytes,
  });
}
describe("security regressions", () => {
  it("preserves Moodle installations in subdirectories", () => {
    expect(normalizeUrl("https://school.example/moodle/")).toBe(
      "https://school.example/moodle",
    );
    expect(
      normalizeUrl("https://school.example/moodle/course/view.php?id=5"),
    ).toBe("https://school.example/moodle");
  });
  it.each([
    "ftp://school.example",
    "http://school.example",
    "https://user:pass@school.example",
  ])("rejects unsafe Moodle URL %s", (url) => {
    expect(() => normalizeUrl(url)).toThrow();
  });
  it("treats an explicitly empty function list as no capabilities", async () => {
    expect((await client()).supports("mod_assign_get_assignments")).toBe(false);
  });
  it.each([
    "http://school.example/moodle/pluginfile.php/1",
    "https://school.example/moodle/pluginfile.php.evil/1",
    "https://school.example/pluginfile.php/1",
    "https://user@school.example/moodle/pluginfile.php/1",
  ])("rejects unsafe file URL %s", async (url) => {
    await expect((await client()).downloadFile(url)).rejects.toThrow();
  });
  it("never follows file redirects", async () => {
    const c = await client();
    const fetcher = vi.fn().mockResolvedValue(new Response("file"));
    vi.stubGlobal("fetch", fetcher);
    await c.downloadFile(
      "https://school.example/moodle/webservice/pluginfile.php/1",
    );
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  });
  it("enforces size while streaming, without relying on Content-Length", async () => {
    const c = await client(3);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(4));
              controller.close();
            },
          }),
        ),
      ),
    );
    await expect(
      c.downloadFile("https://school.example/moodle/pluginfile.php/1"),
    ).rejects.toThrow(/large/i);
  });
  it("binds sealed file IDs to account and signing secret", async () => {
    const a = new FileIdStore("one"),
      b = new FileIdStore("two");
    const id = await a.seal({
      userId: 7,
      courseId: 2,
      fileurl: "https://school.example/pluginfile.php/1",
      mime: "text/plain",
      filename: "a.txt",
      filesize: 1,
    });
    expect(await a.open(id, 8)).toBeNull();
    expect(await b.open(id, 7)).toBeNull();
    expect(await a.open(id + "x", 7)).toBeNull();
    expect(await a.open(id, 7)).not.toBeNull();
  });
});

it("honors a lower per-call download limit before reading a declared large file", async () => {
  const c = await client();
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response("123456789", {
      headers: { "Content-Length": "9", "Content-Type": "text/html" },
    }),
  );
  await expect(
    c.downloadFile("https://school.example/moodle/pluginfile.php/a.html", 4),
  ).rejects.toThrow(/large/);
});
