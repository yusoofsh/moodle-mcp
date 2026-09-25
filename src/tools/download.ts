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
import type { FileRef } from "../file-id-store.js";

interface ModuleContent {
  type: string;
  fileurl: string;
}

interface CourseModule {
  uservisible?: boolean | number;
  contents?: ModuleContent[];
}

interface CourseSection {
  uservisible?: boolean | number;
  modules: CourseModule[];
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

/**
 * Re-check that the file behind this ref is still visible to the current
 * user. Catches unenrolment, module hides, file removal between the list
 * call and the download call.
 */
export async function reauthorize(
  client: MoodleClient,
  ref: FileRef,
): Promise<boolean> {
  try {
    const sections = await client.call<CourseSection[]>(
      "core_course_get_contents",
      {
        courseid: ref.courseId,
      },
    );
    for (const section of sections) {
      if (section.uservisible === false || section.uservisible === 0) continue;
      for (const mod of section.modules) {
        if (mod.uservisible === false || mod.uservisible === 0) continue;
        for (const file of mod.contents ?? []) {
          if (file.type === "file" && file.fileurl === ref.fileurl) return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function registerDownloadTool(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_download_file"))
    server.registerTool(
      "moodle_download_file",
      {
        description:
          "Download a Moodle course file by its opaque fileId (from moodle_list_resources). Returns text for text/JSON/XML files; returns the raw bytes as an embedded resource for binary formats like PDFs, DOCX, images. The server fetches the file — you never need to fetch Moodle URLs directly.",
        inputSchema: z.object({
          fileId: z
            .string()
            .describe("Opaque fileId returned by moodle_list_resources"),
        }),
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ fileId }) => {
        const client = await getToolClient(source, "moodle_download_file");

        const ref = await client.fileIdStore.open(fileId, client.userId);
        if (!ref) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "fileId is invalid, expired, or was not issued to the current user. Re-run moodle_list_resources to get fresh IDs.",
              },
            ],
          };
        }

        const visible = await reauthorize(client, ref);
        if (!visible) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Access denied: this file is no longer visible to you (unenrolled, hidden, or removed).",
              },
            ],
          };
        }

        let downloaded;
        try {
          downloaded = await client.downloadFile(ref.fileurl);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return {
            isError: true,
            content: [
              { type: "text" as const, text: `Download failed: ${message}` },
            ],
          };
        }

        const mime = downloaded.mime || ref.mime || "application/octet-stream";
        const resourceUri = `moodle://files/${encodeURIComponent(ref.filename)}`;

        if (isTextMime(mime)) {
          const text = new TextDecoder("utf-8", { fatal: false }).decode(
            downloaded.bytes,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `**${ref.filename}** (${mime})\n\n${text}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `**${ref.filename}** (${mime}, ${downloaded.bytes.length} bytes) — embedded below.`,
            },
            {
              type: "resource" as const,
              resource: {
                uri: resourceUri,
                mimeType: mime,
                blob: bytesToBase64(downloaded.bytes),
              },
            },
          ],
        };
      },
    );
}
