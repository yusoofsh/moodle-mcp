import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { zipSync, strToU8 } from "fflate";
const dir = await mkdtemp(join(tmpdir(), "moodle-documents-"));
function pdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let s = "%PDF-1.4\n";
  const offsets = [];
  for (const [i, o] of objects.entries()) {
    offsets.push(s.length);
    s += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const start = s.length;
  s += `xref\n0 5\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, "0") + " 00000 n ").join("\n")}\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return strToU8(s);
}
let mf;
try {
  const path = join(dir, "worker.mjs");
  await build({
    entryPoints: ["scripts/document-parser-worker.ts"],
    outfile: path,
    bundle: true,
    format: "esm",
    platform: "node",
    conditions: ["workerd", "worker"],
    external: ["node:*", "cloudflare:*"],
    minify: true,
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "document-parser-test",
      modules: true,
      scriptPath: path,
      compatibilityDate: "2026-09-23",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      outboundService: async () => {
        throw new Error("Document parsing must not fetch remote assets");
      },
    }),
  );
  await mf.ready;
  const cases = [
    {
      filename: "test.pdf",
      mime: "application/pdf",
      bytes: pdf("Verified PDF text inside workerd"),
      expected: "Verified PDF text inside workerd",
    },
    {
      filename: "test.docx",
      mime: "application/zip",
      bytes: zipSync({
        "word/document.xml": strToU8(
          '<w:document xmlns:w="w"><w:p><w:r><w:t>Verified DOCX text inside workerd</w:t></w:r></w:p></w:document>',
        ),
      }),
      expected: "Verified DOCX text inside workerd",
    },
  ];
  for (const c of cases) {
    const response = await mf.dispatchFetch("https://documents.test/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blob: Buffer.from(c.bytes).toString("base64"),
        filename: c.filename,
        mime: c.mime,
      }),
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.status, "extracted");
    assert.ok(data.text.includes(c.expected), data.text);
    console.log("PASS workerd document parser:", c.filename);
  }
} finally {
  await mf?.dispose();
  await rm(dir, { recursive: true, force: true });
}
