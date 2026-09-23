import { boundedBytes } from "../http.js";

/** Keep the bounded Fetch body available to Node/Express/Koa body parsers. */
export async function prepareNodeRequest(
  request: Request,
  limit: number,
): Promise<Request> {
  if (request.method === "GET" || request.method === "HEAD") return request;
  const body = await boundedBytes(request, limit);
  const headers = new Headers(request.headers);
  // Fetch/service-binding requests need not carry HTTP/1 framing. type-is,
  // used by Koa and Express, treats the body as absent without a length or
  // Transfer-Encoding. Do not trust or carry stale client-supplied framing.
  headers.delete("Transfer-Encoding");
  headers.set("Content-Length", String(body.byteLength));
  return new Request(request, { headers, body, redirect: "manual" });
}
