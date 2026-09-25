import { Parser } from "htmlparser2";
import { z } from "zod";

export const MAX_HTML_BYTES = 512 * 1024;
export const MAX_CONTENT_CHARS = 64000;
export const contentSchema = z.object({
  text: z.string(),
  format: z.literal("plain_text"),
  originalFormat: z.number().nullable(),
  truncated: z.boolean(),
  links: z.array(
    z.object({ url: z.string(), kind: z.enum(["link", "media"]) }),
  ),
  linksTruncated: z.boolean(),
  untrusted: z.literal(true),
});
export type ReadableContent = z.infer<typeof contentSchema>;
const secretKeys =
  /^(token|wstoken|sesskey|access_token|refresh_token|id_token|authorization|password|code)$/i;
/** URL metadata only; do not fetch these URLs or inherit Moodle authorization. */
export function safeContentUrl(raw: unknown, base: string): string | null {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > 8192 ||
    /[\u0000-\u0020\u007f\\]/.test(raw) ||
    raw.includes("@@PLUGINFILE@@")
  )
    return null;
  try {
    const u = new URL(raw, base);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return null;
    for (const key of [...u.searchParams.keys()])
      if (secretKeys.test(key)) u.searchParams.delete(key);
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
const block = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ul",
  "ol",
  "table",
  "tr",
  "section",
  "article",
  "pre",
  "blockquote",
  "br",
  "hr",
]);
const skip = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "iframe",
  "object",
  "svg",
  "canvas",
  "form",
  "head",
]);
/** Extract text with a streaming HTML parser: no DOM, script execution or resource requests. */
export function readableContent(
  value: unknown,
  format: number | undefined,
  base: string,
  maxChars = MAX_CONTENT_CHARS,
): ReadableContent {
  if (typeof value !== "string") throw new Error("Missing activity content");
  if (new TextEncoder().encode(value).byteLength > MAX_HTML_BYTES)
    throw new Error("Activity content exceeds the bounded HTML limit");
  if (
    !Number.isSafeInteger(maxChars) ||
    maxChars < 1 ||
    maxChars > MAX_CONTENT_CHARS
  )
    throw new Error("Invalid content character limit");
  let text = "",
    truncated = false,
    suppressed = 0;
  const stack: boolean[] = [],
    links: ReadableContent["links"] = [],
    seen = new Set<string>();
  let linksTruncated = false;
  const append = (s: string) => {
    const remaining = maxChars - text.length;
    if (s.length > remaining) truncated = true;
    if (remaining > 0) text += s.slice(0, remaining);
  };
  const newline = () => {
    if (text && !text.endsWith("\n")) append("\n");
  };
  const addLink = (raw: unknown, kind: "link" | "media") => {
    const url = safeContentUrl(raw, base);
    if (!url || seen.has(url)) return;
    seen.add(url);
    if (links.length >= 100) {
      linksTruncated = true;
      return;
    }
    links.push({ url, kind });
  };
  // Moodle FORMAT_PLAIN=2; other formats can contain HTML and are reduced to text.
  if (format === 2) append(value);
  else {
    const parser = new Parser(
      {
        onopentag(name, attrs) {
          const hidden =
            skip.has(name) ||
            "hidden" in attrs ||
            attrs["aria-hidden"] === "true";
          stack.push(hidden);
          if (!suppressed) {
            if (name === "a") addLink(attrs.href, "link");
            if (["iframe", "video", "audio", "source"].includes(name))
              addLink(attrs.src, "media");
            if (block.has(name)) newline();
          }
          if (hidden) suppressed++;
        },
        ontext(s) {
          if (!suppressed) append(s.replace(/[\t\r ]+/g, " "));
        },
        onclosetag(name) {
          if (stack.pop()) suppressed--;
          if (!suppressed && block.has(name)) newline();
        },
      },
      { decodeEntities: true },
    );
    parser.end(value);
  }
  return {
    text: text
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    format: "plain_text",
    originalFormat: format ?? null,
    truncated,
    links,
    linksTruncated,
    untrusted: true,
  };
}
