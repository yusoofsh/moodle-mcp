export class BodyLimitError extends Error {}

/** Cap bytes while streaming, including missing or false Content-Length. */
export async function boundedBytes(source: Request | Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid body limit');
  if (Number(source.headers.get('Content-Length')) > limit) {
    await source.body?.cancel();
    throw new BodyLimitError('Body exceeds size limit');
  }
  if (!source.body) return new Uint8Array();
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new BodyLimitError('Body exceeds size limit');
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** Workers lacks redirect:error: reject manual 3xx without following credentials. */
export async function fetchWithoutRedirect(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: 'manual' }); }
  catch { throw new Error('Upstream request failed'); }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error('Upstream redirects are not permitted');
  }
  return response;
}
