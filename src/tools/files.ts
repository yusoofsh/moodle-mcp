import {
  resolveCourseUrls,
  isUserVisible,
  type ResolvedUrl,
} from "../url-resolver.js";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClient } from "../moodle-client.js";

interface ModuleContent {
  type: string;
  filename: string;
  fileurl: string;
  filesize: number;
  mimetype?: string;
}

interface CourseModule {
  id: number;
  name: string;
  modname: string;
  url?: string;
  instance?: number;
  uservisible?: boolean | number;
  contents?: ModuleContent[];
}

interface CourseSection {
  id: number;
  name: string;
  uservisible?: boolean | number;
  modules: CourseModule[];
}

const FILE_MODS = new Set(["resource", "url", "folder"]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listResources(
  client: MoodleClient,
  courseId: number,
): Promise<{ text: string; links: ResolvedUrl[] }> {
  const sections = await client.call<CourseSection[]>(
    "core_course_get_contents",
    {
      courseid: courseId,
    },
  );

  const urls = await resolveCourseUrls(client, courseId, sections);
  const lines: string[] = [`## Files — Course ${courseId}\n`];
  let hasFiles = false;

  for (const section of sections.filter(isUserVisible)) {
    const fileMods = section.modules.filter(
      (m) => isUserVisible(m) && FILE_MODS.has(m.modname),
    );
    if (fileMods.length === 0) continue;

    lines.push(`### ${section.name || "General"}`);
    hasFiles = true;

    for (const mod of fileMods) {
      if (mod.modname === "url") {
        const link = urls.get(mod.id)!;
        // Render the real target in plain text too: gateways may omit structuredContent.
        const title = mod.name.replace(/[\r\n]/g, " ");
        lines.push(`- **${title}** — moduleId: \`${mod.id}\``);
        if (link.resolved) lines.push(`  externalurl: ${link.externalurl}`);
        else
          lines.push(
            `  externalurl: unavailable (${link.reason}); not resolved to an external destination.`,
          );
        lines.push(`  Moodle activity: ${link.activityUrl}`);
        continue;
      }
      if (!mod.contents || mod.contents.length === 0) {
        lines.push(`- 📁 **${mod.name}** *(empty)*`);
        continue;
      }
      for (const file of mod.contents) {
        if (file.type !== "file") continue;
        const mime = file.mimetype ?? "application/octet-stream";
        const fileId = await client.fileIdStore.seal({
          userId: client.userId,
          courseId,
          fileurl: file.fileurl,
          mime,
          filename: file.filename,
          filesize: file.filesize,
        });
        const size = formatSize(file.filesize);
        lines.push(
          `- 📄 **${file.filename}** *(${size})* — fileId: \`${fileId}\``,
        );
      }
    }
    lines.push("");
  }

  if (!hasFiles)
    return { text: "No downloadable files found in this course.", links: [] };
  lines.push(
    "_Call `moodle_download_file` with a fileId above to read the file's contents._",
  );
  return { text: lines.join("\n"), links: [...urls.values()] };
}

export function registerFileTools(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_list_resources"))
    server.registerTool(
      "moodle_list_resources",
      {
        description:
          "List all downloadable files and links in a course, grouped by the course's own sections (weeks, chapters, topics — as defined by the professor). Each file gets an opaque fileId you pass to moodle_download_file to read contents. URL activities include their actual externalurl and moduleId when Moodle permits resolution, with the activity wrapper kept separately. Missing targets are labelled unresolved. External sites are not fetched.",
        inputSchema: z.object({
          courseId: z
            .number()
            .int()
            .positive()
            .max(Number.MAX_SAFE_INTEGER)
            .describe("Course ID from moodle_list_courses"),
        }),
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ courseId }) => {
        const client = await getToolClient(source, "moodle_list_resources");
        const result = await listResources(client, courseId);
        return {
          // Some gateways expose only structuredContent; retain the file IDs there too.
          structuredContent: { courseId, ...result },
          content: [
            {
              type: "text" as const,
              text: result.text,
            },
          ],
        };
      },
    );
}
