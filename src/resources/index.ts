import { reauthorize } from "../tools/download.js";
import { ResourceTemplate } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  resolveMoodleClient,
  type MoodleClientSource,
} from "../moodle-source.js";

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
  contents?: ModuleContent[];
}

interface CourseSection {
  id: number;
  name: string;
  modules: CourseModule[];
}

interface Course {
  id: number;
  fullname: string;
  shortname: string;
}

const TEXT_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/yaml",
]);

function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") || TEXT_MIMES.has(mime);
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(s);
}

export function registerResources(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (
    typeof source !== "function" &&
    (!source.supports("core_course_get_contents") ||
      !source.supports("core_enrol_get_users_courses"))
  )
    return;
  server.registerResource(
    "moodle-course-files",
    new ResourceTemplate("moodle://files/{fileId}", {
      list: async () => {
        const client = await resolveMoodleClient(source);
        if (
          !client.supports("core_enrol_get_users_courses") ||
          !client.supports("core_course_get_contents")
        )
          throw new Error(
            "This Moodle token cannot list course file resources",
          );
        const courses = await client.call<Course[]>(
          "core_enrol_get_users_courses",
          {
            userid: client.userId,
          },
        );

        const resources: {
          uri: string;
          name: string;
          mimeType?: string;
          description?: string;
        }[] = [];

        await Promise.all(
          courses.map(async (course) => {
            try {
              const sections = await client.call<CourseSection[]>(
                "core_course_get_contents",
                {
                  courseid: course.id,
                },
              );
              for (const section of sections) {
                for (const mod of section.modules) {
                  if (!["resource", "folder"].includes(mod.modname)) continue;
                  for (const file of mod.contents ?? []) {
                    if (file.type !== "file") continue;
                    const mime = file.mimetype ?? "application/octet-stream";
                    const fileId = await client.fileIdStore.seal({
                      userId: client.userId,
                      courseId: course.id,
                      fileurl: file.fileurl,
                      mime,
                      filename: file.filename,
                      filesize: file.filesize,
                    });
                    resources.push({
                      uri: `moodle://files/${fileId}`,
                      name: `${course.shortname} / ${section.name || "General"} / ${file.filename}`,
                      mimeType: mime,
                      description: `${course.fullname} — ${section.name || "General"}`,
                    });
                  }
                }
              }
            } catch {
              // Skip courses that fail (permission / API issues).
            }
          }),
        );

        return { resources };
      },
    }),
    {},
    async (uri, { fileId }) => {
      const client = await resolveMoodleClient(source);
      if (!client.supports("core_course_get_contents"))
        throw new Error("This Moodle token cannot read course file resources");
      const ref = await client.fileIdStore.open(
        fileId as string,
        client.userId,
      );
      if (!ref) {
        throw new Error(
          "fileId is invalid, expired, or not issued to the current user",
        );
      }
      if (!(await reauthorize(client, ref)))
        throw new Error("Access denied: file is no longer visible");
      const downloaded = await client.downloadFile(ref.fileurl);
      const mime = downloaded.mime || ref.mime || "application/octet-stream";

      if (isTextMime(mime)) {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(
          downloaded.bytes,
        );
        return { contents: [{ uri: uri.href, mimeType: mime, text }] };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: mime,
            blob: bytesToBase64(downloaded.bytes),
          },
        ],
      };
    },
  );
}
