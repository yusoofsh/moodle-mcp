import { z } from "zod";
import { reauthorize } from "../file-access.js";
import type { MoodleClient } from "../moodle-client.js";
import {
  extractDocument,
  documentSchema,
  type DocumentWindow,
} from "./extract.js";
import { packet, readOutputSchema } from "../student/result.js";
export const fileIdSchema = z.string().min(4).max(4096);
export const readDocumentOutput = readOutputSchema.extend({
  data: z.object({
    filename: z.string(),
    fileId: z.string(),
    mimeType: z.string(),
    byteLength: z.number(),
    document: documentSchema,
  }),
});
export async function readDocument(
  client: MoodleClient,
  fileId: string,
  options: DocumentWindow = {},
) {
  fileIdSchema.parse(fileId);
  const ref = await client.fileIdStore.open(fileId, client.userId);
  if (!ref)
    throw new Error("File ID is invalid or expired; list resources again.");
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
  const document = await extractDocument(
    file.bytes,
    ref.filename,
    file.mime || ref.mime,
    options,
  );
  return packet(
    {
      filename: ref.filename,
      fileId,
      mimeType: file.mime || ref.mime,
      byteLength: file.bytes.length,
      document,
    },
    `## ${ref.filename}\n${document.text || "No extractable text returned (" + document.status + ")."}\n${document.nextPage !== null ? "Continue with startPage=" + document.nextPage + " and charOffset=" + (document.nextCharOffset ?? 0) : ""}`,
    {
      documentText:
        document.status === "unsupported" ? "not_supported" : "available",
    },
    [],
  );
}
