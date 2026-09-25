import { getDocumentProxy } from "unpdf";
import { Unzip, UnzipInflate } from "fflate";
import { Parser } from "htmlparser2";
import { z } from "zod";

export const documentWindow = z
  .object({
    startPage: z.number().int().min(1).max(500).optional(),
    maxPages: z.number().int().min(1).max(10).optional(),
    maxChars: z.number().int().min(1).max(100000).optional(),
    charOffset: z.number().int().min(0).max(1000000).optional(),
  })
  .strict();
export type DocumentWindow = z.infer<typeof documentWindow>;
const pageSchema = z.object({
  page: z.number(),
  text: z.string(),
  charOffset: z.number(),
  truncated: z.boolean(),
});
export const documentSchema = z.object({
  format: z.string(),
  status: z.enum(["extracted", "no_text", "unsupported"]),
  pages: z.array(pageSchema),
  text: z.string(),
  totalPages: z.number().nullable(),
  paginationUnit: z.enum(["page", "slide", "document", "text"]),
  startPage: z.number(),
  nextPage: z.number().nullable(),
  nextCharOffset: z.number().nullable(),
  truncated: z.boolean(),
  complete: z.boolean(),
  ocrPerformed: z.literal(false),
  untrusted: z.literal(true),
  limitations: z.array(z.string()),
});
export type DocumentText = z.infer<typeof documentSchema>;
const INPUT_LIMIT = 4 * 1024 * 1024,
  PART_LIMIT = 2 * 1024 * 1024,
  TOTAL_XML_LIMIT = 8 * 1024 * 1024;
let extracting = false;
function retainedPart(name: string): boolean {
  return (
    /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(
      name,
    ) ||
    /^ppt\/(slides\/slide\d+\.xml|presentation\.xml|_rels\/presentation\.xml.rels)$/.test(
      name,
    )
  );
}
function zipParts(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("Invalid ZIP document");
  const count = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true);
  if (
    count > 2000 ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0
  )
    throw new Error("ZIP document entry limit or unsupported archive");
  let cursor = offset,
    total = 0;
  const names = new Set<string>();
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Malformed ZIP directory");
    const flags = view.getUint16(cursor + 8, true),
      length = view.getUint16(cursor + 28, true),
      extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true),
      size = view.getUint32(cursor + 24, true);
    if (cursor + 46 + length + extra + comment > end || flags & 1)
      throw new Error("Encrypted or malformed ZIP document");
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + length),
    );
    if (
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").includes("..") ||
      names.has(name)
    )
      throw new Error("Unsafe or duplicate ZIP path");
    names.add(name);
    if (retainedPart(name)) {
      total += size;
      if (size > PART_LIMIT || total > TOTAL_XML_LIMIT)
        throw new Error("Expanded XML exceeds document limit");
    }
    cursor += 46 + length + extra + comment;
  }
  const parts = new Map<string, string>();
  let inflated = 0,
    found = 0;
  const unzip = new Unzip((file) => {
    if (++found > 2000) throw new Error("ZIP entry limit");
    if (!names.has(file.name)) throw new Error("ZIP directory mismatch");
    if (!retainedPart(file.name)) return;
    if (file.originalSize !== undefined && file.originalSize > PART_LIMIT)
      throw new Error("XML part too large");
    let size = 0;
    const chunks: Uint8Array[] = [];
    file.ondata = (err, data, final) => {
      if (err) throw new Error("Cannot decompress document");
      size += data.length;
      inflated += data.length;
      if (size > PART_LIMIT || inflated > TOTAL_XML_LIMIT) {
        file.terminate();
        throw new Error("Expanded XML exceeds document limit");
      }
      chunks.push(data);
      if (final) {
        const out = new Uint8Array(size);
        let at = 0;
        for (const c of chunks) {
          out.set(c, at);
          at += c.length;
        }
        const xml = new TextDecoder().decode(out);
        if (/<!DOCTYPE|<!ENTITY/i.test(xml))
          throw new Error("XML entity declarations are not accepted");
        parts.set(file.name, xml);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let i = 0; i < bytes.length; i += 1024)
    unzip.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length);
  return parts;
}
function officeText(xml: string): string {
  const chunks: string[] = [];
  const stack: string[] = [];
  let length = 0;
  const put = (s: string) => {
    length += s.length;
    if (length > 1000000) throw new Error("Document text exceeds safe limit");
    chunks.push(s);
  };
  new Parser(
    {
      onopentag(name) {
        stack.push(name);
        if (name === "w:tab") put("\t");
        if (["w:br", "a:br"].includes(name)) put("\n");
      },
      ontext(text) {
        if (
          ["w:t", "a:t"].includes(stack.at(-1) ?? "") &&
          !stack.some((n) => ["w:del", "w:instrText"].includes(n))
        )
          put(text);
      },
      onclosetag(name) {
        stack.pop();
        if (["w:p", "a:p"].includes(name)) put("\n");
        if (name === "w:tc") put("\t");
      },
    },
    { xmlMode: true, decodeEntities: true, lowerCaseTags: false },
  ).end(xml);
  return chunks
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function slideOrder(parts: Map<string, string>): string[] {
  const presentation = parts.get("ppt/presentation.xml"),
    rels = parts.get("ppt/_rels/presentation.xml.rels");
  if (!presentation || !rels)
    throw new Error("Missing presentation order or relationships");
  const ids: string[] = [],
    targets = new Map<string, string>();
  new Parser(
    {
      onopentag(name, a) {
        if (name === "p:sldId" && a["r:id"]) ids.push(a["r:id"]);
      },
    },
    { xmlMode: true, lowerCaseAttributeNames: false },
  ).end(presentation);
  new Parser(
    {
      onopentag(name, a) {
        if (
          name === "Relationship" &&
          a.Id &&
          a.Target &&
          a.TargetMode !== "External" &&
          /^\/?(?:ppt\/)?slides\/slide[1-9][0-9]*\.xml$/.test(a.Target)
        ) {
          const path =
            "ppt/" + a.Target.replace(/^\/?ppt\//, "").replace(/^\//, "");
          targets.set(a.Id, path);
        }
      },
    },
    { xmlMode: true, lowerCaseAttributeNames: false },
  ).end(rels);
  return ids.map((id) => {
    const path = targets.get(id);
    if (!path || !parts.has(path))
      throw new Error("Slide relationship unavailable");
    return path;
  });
}
export async function extractDocument(
  bytes: Uint8Array,
  filename: string,
  mime: string,
  raw: DocumentWindow = {},
): Promise<DocumentText> {
  const options = documentWindow.parse(raw),
    start = options.startPage ?? 1,
    max = options.maxPages ?? 3,
    budget = options.maxChars ?? 50000,
    firstOffset = options.charOffset ?? 0;
  if (bytes.length > INPUT_LIMIT)
    throw new Error("Document exceeds 4 MiB parser input limit");
  if (extracting)
    throw new Error("Document extraction busy; retry sequentially");
  extracting = true;
  const result: DocumentText = {
    format: "unknown",
    status: "unsupported",
    pages: [],
    text: "",
    totalPages: null,
    paginationUnit: "text",
    startPage: start,
    nextPage: null,
    nextCharOffset: null,
    truncated: false,
    complete: false,
    ocrPerformed: false,
    untrusted: true,
    limitations: [],
  };
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  const consume = (page: number, text: string) => {
    const offset = page === start ? firstOffset : 0;
    if (offset > text.length)
      throw new Error("Character offset exceeds page text");
    const remaining =
      budget - result.pages.reduce((sum, p) => sum + p.text.length, 0);
    const available = text.slice(offset),
      truncated = available.length > remaining;
    result.pages.push({
      page,
      text: available.slice(0, remaining),
      charOffset: offset,
      truncated,
    });
    if (truncated) {
      result.truncated = true;
      result.nextPage = page;
      result.nextCharOffset = offset + remaining;
      return false;
    }
    return true;
  };
  try {
    const header = new TextDecoder().decode(bytes.subarray(0, 8));
    let texts: string[] = [];
    if (header.startsWith("%PDF-")) {
      result.format = "pdf";
      result.paginationUnit = "page";
      pdf = await getDocumentProxy(bytes.slice(), {
        useWorkerFetch: false,
        useSystemFonts: false,
        disableFontFace: true,
        disableAutoFetch: true,
        disableStream: true,
        useWasm: false,
        maxImageSize: 1000000,
        verbosity: 0,
      });
      if (pdf.numPages > 500)
        throw new Error("PDF exceeds 500 page document limit");
      result.totalPages = pdf.numPages;
      if (start > pdf.numPages) throw new Error("Start page exceeds document");
      const deadline = Date.now() + 15000;
      for (
        let page = start;
        page <= Math.min(pdf.numPages, start + max - 1);
        page++
      ) {
        if (Date.now() > deadline) {
          result.truncated = true;
          result.nextPage = page;
          result.nextCharOffset = 0;
          break;
        }
        const p = await pdf.getPage(page);
        const text = await p.getTextContent({ disableNormalization: false });
        let s = "";
        for (const item of text.items) {
          if ("str" in item) {
            s += item.str + (item.hasEOL ? "\n" : " ");
            if (s.length > 1000000)
              throw new Error("PDF page text exceeds parser limit");
          }
        }
        p.cleanup();
        if (!consume(page, s.trim())) break;
      }
      result.limitations = [
        "Text layer only; no OCR, images or table/layout reconstruction. Parsing uses the isolate CPU; the time budget is cooperative, not a hard preemption guarantee.",
      ];
    } else if (/\.(docx|pptx)$/i.test(filename)) {
      const parts = zipParts(bytes);
      if (/\.docx$/i.test(filename)) {
        result.format = "docx";
        result.paginationUnit = "document";
        const main = parts.get("word/document.xml");
        if (!main) throw new Error("Missing Word document");
        texts = [
          officeText(main) +
            [...parts]
              .filter(
                ([n]) => n !== "word/document.xml" && n.startsWith("word/"),
              )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([, xml]) => "\n" + officeText(xml))
              .join(""),
        ];
        result.limitations = [
          "OOXML text with paragraph/table delimiters, headers and footnotes. No rendered pagination, images, field execution or deleted text.",
        ];
      } else {
        result.format = "pptx";
        result.paginationUnit = "slide";
        texts = slideOrder(parts).map((n) => officeText(parts.get(n)!));
        result.limitations = [
          "Text shapes in presentation order; no images, animation, chart rendering or speaker notes.",
        ];
      }
      result.totalPages = texts.length;
      if (start > texts.length) throw new Error("Start page exceeds document");
      for (let n = start; n <= Math.min(texts.length, start + max - 1); n++)
        if (!consume(n, texts[n - 1])) break;
    } else if (
      mime.startsWith("text/") ||
      /\.(txt|md|csv|json|xml)$/i.test(filename)
    ) {
      result.format = "text";
      result.paginationUnit = "text";
      result.totalPages = 1;
      if (start !== 1) throw new Error("Plain text has one logical part");
      consume(1, new TextDecoder().decode(bytes));
    } else {
      return result;
    }
    if (
      result.nextPage === null &&
      result.totalPages !== null &&
      (result.pages.at(-1)?.page ?? 0) < result.totalPages
    ) {
      result.nextPage = (result.pages.at(-1)?.page ?? start - 1) + 1;
      result.nextCharOffset = 0;
    }
    result.text = result.pages.map((p) => p.text).join("\n\n");
    result.status = result.text.trim() ? "extracted" : "no_text";
    result.complete =
      start === 1 &&
      firstOffset === 0 &&
      result.nextPage === null &&
      !result.truncated;
    return result;
  } finally {
    try {
      await pdf?.loadingTask.destroy();
    } finally {
      extracting = false;
    }
  }
}
