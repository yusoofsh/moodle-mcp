import { MoodleApiError } from "./moodle-errors.js";
import { boundedBytes, fetchWithoutRedirect } from "./http.js";
import type { Config } from "./config.js";
import { FileIdStore } from "./file-id-store.js";

export interface SiteInfo {
  userid: number;
  username: string;
  sitename: string;
  fullname: string;
  release: string;
  functions?: { name: string; version: string }[];
}

type MoodleErrorResponse = {
  exception: string;
  errorcode?: string;
  message?: string;
};

export interface DownloadedFile {
  mime: string;
  bytes: Uint8Array;
}

export class MoodleClient {
  userId: number = 0;
  siteName: string = "";
  release: string = "";
  supportedFunctions: Set<string> = new Set();
  readonly fileIdStore: FileIdStore;

  private readonly baseOrigin: string;
  private readonly basePath: string;
  profile: SiteInfo | undefined;
  readonly maxFileBytes: number;

  private constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    maxFileBytes: number,
  ) {
    this.baseOrigin = new URL(baseUrl).origin;
    this.basePath = new URL(baseUrl).pathname.replace(/\/$/, "");
    this.fileIdStore = new FileIdStore(token);
    this.maxFileBytes = maxFileBytes;
  }

  get siteUrl(): string {
    return this.baseUrl;
  }

  /** Returns true if the WS function is available on this Moodle server. */
  supports(wsfunction: string): boolean {
    return this.supportedFunctions.has(wsfunction);
  }

  static async create(config: Config): Promise<MoodleClient> {
    const token =
      config.token ??
      (await MoodleClient.login(
        config.baseUrl,
        config.username!,
        config.password!,
      ));
    const client = new MoodleClient(config.baseUrl, token, config.maxFileBytes);
    await client.refreshSiteInfo();
    return client;
  }

  /** Explicitly refresh the advertised APIs without changing the configured account. */
  async refreshSiteInfo(): Promise<void> {
    const info = await this.call<SiteInfo>("core_webservice_get_site_info");
    if (!Number.isSafeInteger(info.userid) || info.userid <= 0)
      throw new Error("Moodle did not return a valid user ID");
    if (this.userId !== 0 && info.userid !== this.userId)
      throw new Error(
        "Moodle account identity changed; reconnect the intended account.",
      );
    this.profile = info;
    this.userId = info.userid;
    this.siteName = info.sitename;
    this.release = info.release ?? "";
    this.supportedFunctions = new Set(info.functions?.map((f) => f.name) ?? []);
  }

  private static async login(
    baseUrl: string,
    username: string,
    password: string,
  ): Promise<string> {
    const url = `${baseUrl}/login/token.php`;
    const body = new URLSearchParams({
      username,
      password,
      service: "moodle_mobile_app",
    });
    const res = await fetchWithoutRedirect(url, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(15000),
    });
    const text = new TextDecoder().decode(await boundedBytes(res, 64 * 1024));
    let data: { token?: string; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        "Moodle login returned an unexpected response — your school likely uses SSO (Microsoft/Google/CAS). " +
          "Use a token instead: log in via browser, then visit " +
          `${baseUrl}/login/token.php?service=moodle_mobile_app and set MOODLE_TOKEN.`,
      );
    }
    if (data.error) {
      throw new Error(
        `Moodle login failed: ${data.error}. Check your username, password, and Moodle URL.`,
      );
    }
    if (!data.token) {
      throw new Error(
        "Moodle login failed: no token returned. Ensure the Moodle Mobile app service is enabled.",
      );
    }
    return data.token;
  }

  async call<T>(
    wsfunction: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/webservice/rest/server.php`;
    if (
      ["wstoken", "wsfunction", "moodlewsrestformat"].some(
        (key) => key in params,
      )
    )
      throw new Error("Reserved Moodle API parameter");
    const body = new URLSearchParams({
      wstoken: this.token,
      wsfunction,
      moodlewsrestformat: "json",
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
    });
    const res = await fetchWithoutRedirect(url, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from Moodle API`);
    const data = JSON.parse(
      new TextDecoder().decode(await boundedBytes(res, 4 * 1024 * 1024)),
    ) as T & Partial<MoodleErrorResponse>;
    if (data && typeof data === "object" && data.exception) {
      if (data.errorcode === "webservicesnotenabled") {
        throw new MoodleApiError(
          "webservicesnotenabled",
          "Web services are not enabled on this Moodle server. Contact your IT department to enable them.",
        );
      }
      if (data.errorcode === "invalidtoken") {
        throw new MoodleApiError(
          "invalidtoken",
          "Invalid Moodle token. Check your MOODLE_TOKEN value.",
        );
      }
      const message = String(data.message ?? "No message")
        .split(this.token)
        .join("[REDACTED]");
      throw new MoodleApiError(
        data.errorcode ?? "unknown",
        `Moodle API error (${data.errorcode ?? "unknown"}): ${message}`,
      );
    }
    return data;
  }

  /**
   * Fetch a Moodle-managed file through the server. Only accepts pluginfile.php
   * URLs on this Moodle host — external `url` module targets are refused so we
   * don't become an SSRF relay. Caps the response at MAX_DOWNLOAD_BYTES.
   *
   * The Moodle WS token is attached to the outbound request only; it never
   * reappears in anything returned to the MCP client.
   */
  async downloadFile(fileurl: string): Promise<DownloadedFile> {
    let parsed: URL;
    try {
      parsed = new URL(fileurl);
    } catch {
      throw new Error("Invalid file URL");
    }
    if (
      parsed.origin !== this.baseOrigin ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(
        "Refused: file URL is not on this Moodle host and scheme",
      );
    }
    const paths = [
      `${this.basePath}/pluginfile.php`,
      `${this.basePath}/webservice/pluginfile.php`,
    ];
    if (
      !paths.some(
        (path) =>
          parsed.pathname === path || parsed.pathname.startsWith(path + "/"),
      )
    ) {
      throw new Error(
        "Refused: only Moodle-managed pluginfile.php URLs can be fetched",
      );
    }
    parsed.searchParams.set("token", this.token);

    const res = await fetchWithoutRedirect(parsed.toString(), {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Failed to fetch file: HTTP ${res.status}`);

    const maxMb = Math.round(this.maxFileBytes / 1024 / 1024);
    const lengthHeader = res.headers.get("content-length");
    if (lengthHeader && Number(lengthHeader) > this.maxFileBytes) {
      await res.body?.cancel();
      throw new Error(
        `File too large (${Math.round(Number(lengthHeader) / 1024 / 1024)} MB); max is ${maxMb} MB. Admins can raise the cap with MOODLE_MCP_MAX_FILE_MB.`,
      );
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new Error("File response has no body");
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > this.maxFileBytes) {
          await reader.cancel();
          throw new Error(`File too large; max is ${maxMb} MB`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const mime =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream";
    return { mime, bytes };
  }
}
