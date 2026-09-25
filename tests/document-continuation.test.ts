import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { FileIdStore, type FileRef } from "../src/file-id-store.js";
import type { MoodleClient } from "../src/moodle-client.js";
import { readDocument } from "../src/documents/read.js";
import { registerDownloadTool } from "../src/tools/download.js";
import { pdfFixture } from "./fixtures/document-fixtures.js";

let body: Uint8Array,
  visible: boolean,
  source: MoodleClient,
  ref: FileRef,
  store: FileIdStore;
const pairs: { server: McpServer; client: Client }[] = [];
beforeEach(() => {
  body = new TextEncoder().encode("abcdefghijklmnopqrstuvwx");
  visible = true;
  store = new FileIdStore("synthetic-token-for-continuation");
  ref = {
    userId: 42,
    courseId: 7,
    fileurl: "https://moodle.example/pluginfile.php/1/notes.txt",
    mime: "text/plain",
    filename: "notes.txt",
    filesize: body.length,
  };
  source = {
    userId: 42,
    fileIdStore: store,
    supports: () => true,
    call: vi.fn(async () => [
      {
        modules: [
          {
            uservisible: visible,
            contents: [{ type: "file", fileurl: ref.fileurl }],
          },
        ],
      },
    ]),
    downloadFile: vi.fn(async () => ({ bytes: body, mime: ref.mime })),
  } as unknown as MoodleClient;
});
afterEach(async () => {
  vi.useRealTimers();
  for (const p of pairs.splice(0)) {
    await p.client.close();
    await p.server.close();
  }
});

describe("opaque document continuation identifiers", () => {
  it("allows repeated fileId-only calls to recover all character windows without omissions", async () => {
    let id: string | null = await store.seal(ref);
    let text = "",
      count = 0;
    while (id) {
      const part = await readDocument(
        source,
        id,
        count === 0 ? { maxChars: 7 } : {},
      );
      text += part.data.document.text;
      id = part.data.nextFileId;
      count++;
      expect(count).toBeLessThanOrEqual(4);
    }
    expect(text).toBe("abcdefghijklmnopqrstuvwx");
    expect(count).toBe(4);
  });
  it("supports multi-page PDF continuation with stable page numbers using only the next fileId", async () => {
    body = pdfFixture(["Page one", "Page two", "Page three", "Page four"]);
    ref = {
      ...ref,
      mime: "application/pdf",
      filename: "fixture.pdf",
      filesize: body.length,
    };
    const first = await readDocument(source, await store.seal(ref));
    expect(first.data.document.pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(first.data.nextFileId).toMatch(/^f_/);
    const last = await readDocument(source, first.data.nextFileId!);
    expect(last.data.document.pages.map((p) => p.page)).toEqual([4]);
    expect(last.data.document.text).toContain("Page four");
    expect(last.data.nextFileId).toBeNull();
    expect(last.data.document.complete).toBe(false);
  });
  it("does not disclose the URL, credential or byte hash in the opaque identifier", async () => {
    const first = await readDocument(source, await store.seal(ref), {
      maxChars: 7,
    });
    const id = first.data.nextFileId!;
    expect(id).not.toContain("pluginfile");
    expect(id).not.toContain("synthetic-token");
    expect(id.length).toBeLessThanOrEqual(4096);
  });
  it("fails closed when the file changes between windows", async () => {
    const first = await readDocument(source, await store.seal(ref), {
      maxChars: 7,
    });
    body = new TextEncoder().encode("MODIFIED private replacement content");
    await expect(readDocument(source, first.data.nextFileId!)).rejects.toThrow(
      /changed/i,
    );
  });
  it("rechecks current visibility before downloading the next window", async () => {
    const first = await readDocument(source, await store.seal(ref), {
      maxChars: 7,
    });
    visible = false;
    vi.mocked(source.downloadFile).mockClear();
    await expect(readDocument(source, first.data.nextFileId!)).rejects.toThrow(
      /visible/i,
    );
    expect(source.downloadFile).not.toHaveBeenCalled();
  });
  it("does not allow another account or rotated Moodle token to open a continuation", async () => {
    const first = await readDocument(source, await store.seal(ref), {
      maxChars: 7,
    });
    expect(await store.open(first.data.nextFileId!, 99)).toBeNull();
    expect(
      await new FileIdStore("different-token").open(first.data.nextFileId!, 42),
    ).toBeNull();
  });
  it("retains expiration and authenticated encryption checks", async () => {
    vi.useFakeTimers();
    source.fileIdStore = new FileIdStore("short-lived", 10);
    const first = await readDocument(
      source,
      await source.fileIdStore.seal(ref),
      { maxChars: 7 },
    );
    const id = first.data.nextFileId!;
    expect(
      await source.fileIdStore.open(
        id.slice(0, 30) + (id[30] === "A" ? "B" : "A") + id.slice(31),
        42,
      ),
    ).toBeNull();
    vi.advanceTimersByTime(11);
    expect(await source.fileIdStore.open(id, 42)).toBeNull();
  });
  it("rejects conflicting explicit window parameters on an opaque continuation", async () => {
    const first = await readDocument(source, await store.seal(ref), {
      maxChars: 7,
    });
    await expect(
      readDocument(source, first.data.nextFileId!, { startPage: 1 }),
    ).rejects.toThrow(/original fileId/i);
  });
  it("does not create a continuation for a complete document or unsupported content", async () => {
    expect(
      (await readDocument(source, await store.seal(ref))).data.nextFileId,
    ).toBeNull();
    ref = { ...ref, mime: "image/png", filename: "image.png" };
    body = new Uint8Array([137, 80, 78, 71]);
    expect(
      (await readDocument(source, await store.seal(ref))).data.nextFileId,
    ).toBeNull();
  });
  it("works through the actual MCP fileId-only contract and preserves JSON parity", async () => {
    const server = new McpServer({ name: "continuation-test", version: "1" });
    registerDownloadTool(server, async () => source);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    pairs.push({ server, client });
    await server.connect(st);
    await client.connect(ct);
    body = pdfFixture(["One", "Two", "Three", "Four"]);
    ref = {
      ...ref,
      mime: "application/pdf",
      filename: "four.pdf",
      filesize: body.length,
    };
    const first = await client.callTool({
      name: "moodle_download_file",
      arguments: { fileId: await store.seal(ref) },
    });
    expect(first.isError).not.toBe(true);
    const next = (first.structuredContent as any).data.nextFileId;
    expect(typeof next).toBe("string");
    const last = await client.callTool({
      name: "moodle_download_file",
      arguments: { fileId: next },
    });
    expect(last.isError).not.toBe(true);
    expect(JSON.parse((last.content as { text: string }[])[0].text)).toEqual(
      last.structuredContent,
    );
    expect((last.structuredContent as any).data.document.pages[0].page).toBe(4);
  });
});

it("retries an unchanged continuation idempotently without advancing server-side state", async () => {
  const first = await readDocument(source, await store.seal(ref), {
    maxChars: 7,
  });
  const a = await readDocument(source, first.data.nextFileId!);
  const b = await readDocument(source, first.data.nextFileId!);
  expect(a.data.document).toEqual(b.data.document);
});
it("rejects malformed sealed parser positions before network access", async () => {
  const invalid = await store.seal({
    ...ref,
    documentCursor: {
      version: 1,
      startPage: 0,
      charOffset: 0,
      maxPages: 3,
      maxChars: 100,
      contentHash: "a".repeat(64),
    },
  });
  await expect(readDocument(source, invalid)).rejects.toThrow();
  expect(source.downloadFile).not.toHaveBeenCalled();
});
