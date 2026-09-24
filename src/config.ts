export interface Config {
  baseUrl: string;
  token?: string;
  username?: string;
  password?: string;
  /** Per-file download cap in bytes. Default 25 MB. */
  maxFileBytes: number;
}

export const DEFAULT_MAX_FILE_MB = 25;

export function parseMaxFileMb(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_MAX_FILE_MB;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `MOODLE_MCP_MAX_FILE_MB must be a positive number; got "${raw}"`,
    );
  }
  return n;
}

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    ) {
      throw new Error("HTTPS is required except on loopback");
    }
    // Keep installation prefixes, but tolerate a copied course/API URL.
    const path = url.pathname
      .replace(/\/(?:course|mod|user|my|login|webservice)(?:\/.*)?$/, "")
      .replace(/\/+$/, "");
    return url.origin + path;
  } catch {
    throw new Error(
      "Invalid MOODLE_URL: use an HTTPS Moodle URL without credentials",
    );
  }
}

export function getConfig(allowUnconnected = false): Config {
  const rawUrl = process.env.MOODLE_URL;
  if (!rawUrl) throw new Error("MOODLE_URL environment variable is required");

  const baseUrl = normalizeUrl(rawUrl);
  const token = process.env.MOODLE_TOKEN;
  const username = process.env.MOODLE_USERNAME;
  const password = process.env.MOODLE_PASSWORD;

  if (!allowUnconnected && !token && (!username || !password)) {
    throw new Error(
      "Set either MOODLE_TOKEN or both MOODLE_USERNAME and MOODLE_PASSWORD",
    );
  }

  const maxFileBytes = Math.floor(
    parseMaxFileMb(process.env.MOODLE_MCP_MAX_FILE_MB) * 1024 * 1024,
  );

  return { baseUrl, token, username, password, maxFileBytes };
}
