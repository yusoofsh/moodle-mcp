import { zipSync, strToU8 } from "fflate";
/** Minimal authored fixture, no private university content or credential. */
export function pdfFixture(
  lines = ["Synthetic Moodle handout", "Second page content"],
): Uint8Array {
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  const kids: number[] = [];
  for (const line of lines) {
    const page = objects.length + 1,
      stream = page + 1;
    kids.push(page);
    const text = `BT /F1 12 Tf 72 720 Td (${line.replace(/[()\\]/g, "\\$&")}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${stream} 0 R >>`,
      `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((n) => n + " 0 R").join(" ")}] >>`;
  let s = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, o] of objects.entries()) {
    offsets.push(s.length);
    s += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const start = s.length;
  s += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return strToU8(s);
}
export function docxFixture(body = "Hello &amp; Moodle"): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p><w:del><w:r><w:delText>Deleted secret</w:delText></w:r></w:del><w:p><w:r><w:instrText>DO NOT EXECUTE</w:instrText><w:t>Visible second paragraph</w:t></w:r></w:p></w:body></w:document>`,
    ),
  });
}
export function pptxFixture(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "ppt/slides/slide1.xml": strToU8(
      '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:sld>',
    ),
    "ppt/slides/slide2.xml": strToU8(
      '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:sld>',
    ),
    "ppt/presentation.xml": strToU8(
      '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="257" r:id="rId2"/><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
    ),
    "ppt/_rels/presentation.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
    ),
  });
}
