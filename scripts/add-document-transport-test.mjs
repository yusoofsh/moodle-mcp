import fs from "node:fs/promises";
const path = "scripts/test-workers.mjs";
let s = await fs.readFile(path, "utf8");
if (s.includes("function parserPdfFixture")) process.exit(0);
s = 'import { strToU8 } from "fflate";\n' + s;
const pos = s.indexOf("const ORIGIN");
if (pos < 0) throw new Error("Missing runtime test origin");
s =
  s.slice(0, pos) +
  `function parserPdfFixture() {
 const content='Synthetic authenticated Moodle PDF';
 const stream=\`BT /F1 12 Tf 72 720 Td (\${content}) Tj ET\`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>',\`<< /Length \${stream.length} >>\\nstream\\n\${stream}\\nendstream\`];
 let text='%PDF-1.4\\n';const offsets=[];for(const [i,obj] of objects.entries()){offsets.push(text.length);text+=\`\${i+1} 0 obj\\n\${obj}\\nendobj\\n\`;}
 const start=text.length;text+=\`xref\\n0 5\\n0000000000 65535 f \\n\${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\\n')}\\ntrailer\\n<< /Size 5 /Root 1 0 R >>\\nstartxref\\n\${start}\\n%%EOF\`;
 return strToU8(text);
}
` +
  s.slice(pos);
const route = "      const target = new URL(request.url);";
if (!s.includes(route)) throw new Error("Missing request fixture route");
s = s.replace(
  route,
  route +
    `
      if (target.pathname === '/webservice/pluginfile.php/72/mod_resource/content/handout.pdf') {
        assert.equal(target.searchParams.get('token'),bindings.MOODLE_TOKEN);
        return new Response(parserPdfFixture(),{headers:{'Content-Type':'application/pdf'}});
      }
`,
);
const modules = "              modules: [\n";
if (!s.includes(modules)) throw new Error("Missing course fixture modules");
s = s.replace(
  modules,
  modules +
    `                {id:707,instance:807,name:'PDF handout',modname:'resource',uservisible:true,contents:[{type:'file',filename:'handout.pdf',filepath:'/',filesize:900,mimetype:'application/pdf',fileurl:'https://moodle.example/webservice/pluginfile.php/72/mod_resource/content/handout.pdf'}]},
`,
);
const index = s.indexOf(
  '  await check(\n    "authenticated discovery survives Moodle failure',
);
if (index < 0) throw new Error("Missing discovery test location");
s =
  s.slice(0, index) +
  `  await check('authorized file download returns real PDF text through structured output',async()=>{
    const list=await rpc(granted.access_token,'tools/call',{name:'moodle_list_resources',arguments:{courseId:7}});
    const fileId=/handout\\.pdf[^\\n]*fileId: \u0060(f_[^\u0060]+)\u0060/.exec(list.json.result.structuredContent.text)?.[1];assert.ok(fileId,list.text);
    for(const name of ['moodle_download_file','moodle_read_document']){
      const r=await rpc(granted.access_token,'tools/call',{name,arguments:{fileId}});
      assert.notEqual(r.json.result.isError,true,r.text);
      assert.equal(r.json.result.structuredContent.data.document.status,'extracted');
      assert.match(r.json.result.structuredContent.data.document.text,/Synthetic authenticated Moodle PDF/);
      assert.ok(!r.text.includes(bindings.MOODLE_TOKEN));
    }
    const denied=await rpc(granted.access_token,'tools/call',{name:'moodle_read_document',arguments:{fileId:'f_not_issued'}});
    assert.equal(denied.json.result.isError,true);
  });
` +
  s.slice(index);
await fs.writeFile(path, s);
