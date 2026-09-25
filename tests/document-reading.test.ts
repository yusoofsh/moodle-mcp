import { describe, it, expect, vi, afterEach } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractDocument } from "../src/documents/extract.js";
import {
  pdfFixture,
  docxFixture,
  pptxFixture,
} from "./fixtures/document-fixtures.js";
afterEach(() => vi.unstubAllGlobals());
describe("bounded offline document text reading", () => {
  it("extracts actual PDF text with page numbers and repeatable paging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("No external resource fetching");
      }),
    );
    const r = await extractDocument(
      pdfFixture(),
      "test.pdf",
      "application/pdf",
      { startPage: 1, maxPages: 1 },
    );
    expect(r.format).toBe("pdf");
    expect(r.totalPages).toBe(2);
    expect(r.pages[0]).toMatchObject({
      page: 1,
      text: expect.stringContaining("Synthetic Moodle handout"),
    });
    expect(r.nextPage).toBe(2);
    expect(r.complete).toBe(false);
    const last = await extractDocument(
      pdfFixture(),
      "test.pdf",
      "application/pdf",
      { startPage: 2, maxPages: 1 },
    );
    expect(last.pages[0].text).toContain("Second page");
    expect(last.nextPage).toBeNull();
    expect(last.complete).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("extracts DOCX text without executing fields or exposing deleted text", async () => {
    const r = await extractDocument(
      docxFixture(),
      "a.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      {},
    );
    expect(r.text).toContain("Hello & Moodle");
    expect(r.text).not.toContain("Deleted secret");
    expect(r.text).not.toContain("EXECUTE");
    expect(r.paginationUnit).toBe("document");
    expect(r.complete).toBe(true);
  });
  it("uses presentation relationship order for PPTX rather than numeric slide file order", async () => {
    const r = await extractDocument(
      pptxFixture(),
      "a.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      { maxPages: 1 },
    );
    expect(r.pages[0].text).toBe("Second slide");
    expect(r.totalPages).toBe(2);
  });
  it("reports truncation and safe continuation rather than losing a page tail", async () => {
    const r = await extractDocument(
      pdfFixture(["x".repeat(200)]),
      "a.pdf",
      "application/pdf",
      { maxChars: 50 },
    );
    expect(r.truncated).toBe(true);
    expect(r.nextPage).toBe(1);
    expect(r.nextCharOffset).toBe(50);
    const rest = await extractDocument(
      pdfFixture(["x".repeat(200)]),
      "a.pdf",
      "application/pdf",
      { maxChars: 1000, charOffset: 50 },
    );
    const all = await extractDocument(
      pdfFixture(["x".repeat(200)]),
      "a.pdf",
      "application/pdf",
      {},
    );
    expect(r.text + rest.text).toBe(all.text);
  });
  it.each(["../word/document.xml", "word/../document.xml"])(
    "rejects unsafe ZIP path %s",
    async (name) => {
      await expect(
        extractDocument(
          zipSync({ [name]: strToU8("<w:t>bad</w:t>") }),
          "x.docx",
          "application/zip",
          {},
        ),
      ).rejects.toThrow();
    },
  );
  it("rejects XML entities and oversized inflated content", async () => {
    await expect(
      extractDocument(
        docxFixture('<!DOCTYPE x [<!ENTITY boom "secret">]>&boom;'),
        "a.docx",
        "application/zip",
        {},
      ),
    ).rejects.toThrow();
    await expect(
      extractDocument(
        docxFixture("a".repeat(2200000)),
        "a.docx",
        "application/zip",
        {},
      ),
    ).rejects.toThrow(/limit|large/);
  });
  it("keeps an image-only PDF distinct from a failed download", async () => {
    const r = await extractDocument(
      pdfFixture([""]),
      "empty.pdf",
      "application/pdf",
      {},
    );
    expect(r.text).toBe("");
    expect(r.status).toBe("no_text");
    expect(r.ocrPerformed).toBe(false);
  });
  it("does not pretend unsupported formats are extracted documents", async () => {
    const r = await extractDocument(
      new Uint8Array([1, 2, 3]),
      "a.png",
      "image/png",
      {},
    );
    expect(r.status).toBe("unsupported");
    expect(r.complete).toBe(false);
  });
  it.each([
    { startPage: 0 },
    { maxPages: 99 },
    { maxChars: 0 },
    { charOffset: -1 },
  ])("rejects invalid extraction window %s", async (options) => {
    await expect(
      extractDocument(pdfFixture(), "a.pdf", "application/pdf", options),
    ).rejects.toThrow();
  });
});
