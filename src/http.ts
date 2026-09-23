/** An intentional, non-sensitive HTTP failure safe to show to a caller. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Enforce the cap while reading, not after buffering an unbounded body. */
export async function readBytes(
  source: Request | Response,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new Error("Invalid response limit");
  const declared = Number(source.headers.get("content-length"));
  if (declared > limit) {
    await source.body?.cancel();
    throw new HttpError(413, "Body too large");
  }
  if (!source.body) return new Uint8Array();
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function problem(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
