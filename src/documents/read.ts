import { createHash } from "node:crypto";
import { z } from "zod";
import { reauthorize } from "../file-access.js";
import type { MoodleClient } from "../moodle-client.js";
import {
  extractDocument,
  documentSchema,
  documentWindow,
  type DocumentWindow,
} from "./extract.js";
import {
  packet,
  readOutputSchema,
  warning,
  type ReadWarning,
} from "../student/result.js";

export const fileIdSchema = z.string().min(4).max(4096);
const cursorSchema = documentWindow
  .required()
  .extend({
    version: z.literal(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const readDocumentOutput = readOutputSchema.extend({
  data: z.object({
    filename: z.string(),
    fileId: z.string(),
    nextFileId: z.string().nullable(),
    mimeType: z.string(),
    byteLength: z.number(),
    document: documentSchema,
  }),
});

export async function readDocument(
  client: MoodleClient,
  fileId: string,
  raw: DocumentWindow = {},
) {
  fileIdSchema.parse(fileId);
  const options = documentWindow.parse(raw);
  const ref = await client.fileIdStore.open(fileId, client.userId);
  if (!ref)
    throw new Error("File ID is invalid or expired; list resources again.");
  const cursor =
    ref.documentCursor === undefined
      ? null
      : cursorSchema.parse(ref.documentCursor);
  if (cursor && Object.values(options).some((v) => v !== undefined))
    throw new Error(
      "Use the original fileId to request an explicit document window; a continuation already fixes its position.",
    );
  const window: DocumentWindow = cursor
    ? {
        startPage: cursor.startPage,
        charOffset: cursor.charOffset,
        maxPages: cursor.maxPages,
        maxChars: cursor.maxChars,
      }
    : options;
  if (!(await reauthorize(client, ref)))
    throw new Error("File is no longer visible to this Moodle account.");
  let file;
  try {
    file = await client.downloadFile(ref.fileurl, 4 * 1024 * 1024);
  } catch {
    throw new Error(
      "File download unavailable or exceeds configured size limit. No content was read.",
    );
  }
  const contentHash = createHash("sha256").update(file.bytes).digest("hex");
  if (cursor && cursor.contentHash !== contentHash)
    throw new Error(
      "Document changed between windows. List resources and restart with the original fileId; content from different versions was not combined.",
    );
  const document = await extractDocument(
    file.bytes,
    ref.filename,
    file.mime || ref.mime,
    window,
  );
  const warnings: ReadWarning[] = [];
  let nextFileId: string | null = null;
  if (document.nextPage !== null) {
    const nextOffset = document.nextCharOffset ?? 0;
    const progressed =
      document.nextPage > (window.startPage ?? 1) ||
      (document.nextPage === (window.startPage ?? 1) &&
        nextOffset > (window.charOffset ?? 0));
    if (progressed) {
      const next = await client.fileIdStore.seal({
        ...ref,
        documentCursor: {
          version: 1,
          startPage: document.nextPage,
          charOffset: nextOffset,
          maxPages: window.maxPages ?? 3,
          maxChars: window.maxChars ?? 50000,
          contentHash,
        },
      });
      if (fileIdSchema.safeParse(next).success) nextFileId = next;
      else
        warnings.push(
          warning(
            "CONTINUATION_ID_TOO_LONG",
            "Use explicit page controls with the original fileId; this file reference could not fit a continuation envelope.",
          ),
        );
    } else
      warnings.push(
        warning(
          "DOCUMENT_WINDOW_NO_PROGRESS",
          "The parser budget ended before advancing. Retry the original window; no looping continuation was issued.",
        ),
      );
  }
  const continuationText = nextFileId
    ? "Continue by calling moodle_download_file with nextFileId as its fileId (no other window parameters)."
    : document.nextPage !== null
      ? "Continue with the original fileId, startPage=" +
        document.nextPage +
        " and charOffset=" +
        (document.nextCharOffset ?? 0)
      : "";
  return packet(
    {
      filename: ref.filename,
      fileId,
      nextFileId,
      mimeType: file.mime || ref.mime,
      byteLength: file.bytes.length,
      document,
    },
    `## ${ref.filename}\n${document.text || "No extractable text returned (" + document.status + ")."}\n${continuationText}`,
    {
      documentText:
        document.status === "unsupported" ? "not_supported" : "available",
    },
    warnings,
  );
}
