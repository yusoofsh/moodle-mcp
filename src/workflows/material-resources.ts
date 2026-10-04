import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import { resolveMoodleClient } from "../moodle-source.js";
import { loadSections } from "../student/course-data.js";
import { readResource } from "../student/resources.js";
import { privateResult, observedManifest } from "./core.js";
function positive(value: unknown) { const text = String(value); if (!/^[1-9][0-9]{0,14}$/.test(text)) throw new Error("Invalid resource identifier"); return Number(text); }
export function registerMaterialResources(server: McpServer, source: MoodleClientSource) {
  server.registerResource("study-manifest", new ResourceTemplate("moodle://study-manifest/{courseId}", { list: undefined }), { mimeType: "application/json" }, async (uri, { courseId }) => {
    const client = await resolveMoodleClient(source), id = positive(courseId);
    const result = await loadSections(client, id), modules = result.sections.flatMap(s => s.modules);
    const manifest = { ...observedManifest("course-materials", modules.map(m => ({ name: m.name, kind: m.modname, uri: `moodle://activity/${id}/${m.id}` })), modules.length <= 50, result.warnings.map(w => w.message)), observedModuleCount: modules.length, omittedCount: Math.max(0, modules.length - 50) };
    return privateResult({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(manifest) }] });
  });
  server.registerResource("study-activity", new ResourceTemplate("moodle://activity/{courseId}/{cmid}", { list: undefined }), { mimeType: "application/json" }, async (uri, { courseId, cmid }) => {
    const client = await resolveMoodleClient(source), id = positive(courseId), module = positive(cmid);
    const loaded = await loadSections(client, id), activity = loaded.sections.flatMap(section => section.modules).find(item => item.id === module);
    if (!activity) throw new Error("Activity is not visible in this course");
    const readable = new Set(["resource", "url", "page", "book", "folder", "label"]);
    const result = readable.has(activity.modname) ? await readResource(client, module, id, { maxChars: 8000 }) : { observedAt: new Date().toISOString(), courseId: id, cmid: module, name: activity.name, kind: activity.modname, note: "Use the original assignment or activity read tool for further details. No content-view or write operation was called." };
    return privateResult({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result) }] });
  });
}
