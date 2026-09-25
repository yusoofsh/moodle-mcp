// Test-only Worker; never referenced by production wrangler.toml.
import { extractDocument } from '../src/documents/extract.js';
export default {async fetch(request:Request){const data=await request.json() as {blob:string;filename:string;mime:string;options?:Record<string,number>};const bytes=Uint8Array.from(atob(data.blob),c=>c.charCodeAt(0));return Response.json(await extractDocument(bytes,data.filename,data.mime,data.options??{}));}};
