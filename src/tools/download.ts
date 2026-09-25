import { Buffer } from "node:buffer";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { MoodleClientSource } from "../moodle-source.js";
import {
  canRegister,
  getToolClient,
  READ_ONLY,
  AUTH_META,
} from "../tool-policy.js";
import { reauthorize } from "../file-access.js";
import {
  readDocument,
  fileIdSchema,
  readDocumentOutput,
} from "../documents/read.js";
import { documentWindow } from "../documents/extract.js";
import { toolResult } from "../student/result.js";
export { reauthorize } from "../file-access.js";
export function registerDownloadTool(
  server: McpServer,
  source: MoodleClientSource,
): void {
  if (canRegister(source, "moodle_download_file"))
    server.registerTool(
      "moodle_download_file",
      {
        description:
          "Read an authorized course file by its opaque fileId. Default auto mode now returns extracted PDF/DOCX/PPTX/plain text with explicit pagination, avoiding dropped binary resources in gateways. mode=raw retains embedded bytes for capable clients; no raw URL or Moodle token is returned. Max file size remains configured. Scans are not OCRed. Reuse startPage/charOffset for continuation.",
        inputSchema: documentWindow
          .extend({
            fileId: fileIdSchema,
            mode: z.enum(["auto", "raw"]).optional(),
          })
          .strict(),
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ fileId, mode, ...options }) => {
        const client = await getToolClient(source, "moodle_download_file");
        let extracted;
        if (mode !== "raw") {
          extracted = await readDocument(client, fileId, options);
          if (extracted.data.document.status !== "unsupported")
            return toolResult(extracted);
        }
        const ref = await client.fileIdStore.open(fileId, client.userId);
        if (!ref || !(await reauthorize(client, ref)))
          throw new Error("File ID invalid, expired, or access denied.");
        const file = await client.downloadFile(ref.fileurl);
        const mime = file.mime || ref.mime;
        return {
          ...(extracted ? { structuredContent: { ...extracted } } : {}),
          content: [
            {
              type: "text" as const,
              text: `${ref.filename}: ${file.bytes.length} bytes. Raw resource follows; this is not extracted text.`,
            },
            {
              type: "resource" as const,
              resource: {
                uri: "moodle://files/" + encodeURIComponent(ref.filename),
                mimeType: mime,
                blob: Buffer.from(file.bytes).toString("base64"),
              },
            },
          ],
        };
      },
    );
  if (canRegister(source, "moodle_read_document"))
    server.registerTool(
      "moodle_read_document",
      {
        description:
          "Extract bounded PDF, DOCX, PPTX or plain-text content using an opaque authorized fileId. PDF pages and slide order preserved; DOCX uses one logical document. No scripts/macros, remote assets, OCR, image/table rendering. Truncation and page/character continuation explicit. Extraction is single-flight.",
        inputSchema: documentWindow.extend({ fileId: fileIdSchema }).strict(),
        outputSchema: readDocumentOutput,
        annotations: READ_ONLY,
        _meta: AUTH_META,
      },
      async ({ fileId, ...options }) =>
        toolResult(
          await readDocument(
            await getToolClient(source, "moodle_read_document"),
            fileId,
            options,
          ),
        ),
    );
}
