import { DurableObject } from "cloudflare:workers";
import { handleAsNodeRequest } from "cloudflare:node";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { createAppWithStore } from "./app-core.js";
import { SqlAuthStore } from "./auth/sql-store.js";
import { MoodleClient } from "./moodle-client.js";
import { DurableSqlDatabase } from "./workers/sql-database.js";
import { workerConfig, type WorkerEnv } from "./workers/config.js";
import { reserveHttpRequest } from "./workers/limits.js";
import { boundedBytes, BodyLimitError } from "./http.js";

const fail = (status: number, message: string, retry?: number) =>
  new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      ...(retry ? { "Retry-After": String(retry) } : {}),
    },
  });
const paths = new Set([
  "/healthz",
  "/mcp",
  "/interaction",
  "/interaction/password",
  "/interaction/confirm",
  "/oauth/authorize",
  "/oauth/token",
  "/oauth/register",
  "/oauth/revoke",
  "/oauth/jwks",
  "/oauth/userinfo",
  "/session/end",
  "/session/end/confirm",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
]);

/** Heavy work runs in one SQLite Durable Object, not the outer Free Worker. */
export class MoodleMcp extends DurableObject<WorkerEnv> {
  private runtime?: ReturnType<typeof createAppWithStore>;
  private port = 0;
  private nextCleanup = 0;
  private active = 0;
  private async initialize() {
    if (this.runtime) return;
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.runtime) return;
      const { http, moodle } = workerConfig(this.env);
      const store = new SqlAuthStore(
        new DurableSqlDatabase(this.ctx.storage.sql),
        http.authSecret,
      );
      const runtime = createAppWithStore(http, store, {
        backgroundCleanup: false,
        disableHttpRateLimits: true,
        createMoodleClient: () => MoodleClient.create(moodle),
      });
      const server = createServer(runtime.app);
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("HTTP adapter failed");
      this.port = address.port;
      this.runtime = runtime;
    });
  }
  async fetch(request: Request): Promise<Response> {
    if (this.active >= 2) return fail(429, "Server busy; retry shortly", 1);
    this.active++;
    try {
      await this.initialize();
      const path = new URL(request.url).pathname;
      const retry = reserveHttpRequest(
        this.runtime!.store,
        this.env.AUTH_SECRET!,
        request.headers.get("X-Forwarded-For") ?? "unknown",
        path,
      );
      if (retry) return fail(429, "Request budget exceeded", retry);
      // Request-driven cleanup permits idle lifecycle management.
      if (Date.now() >= this.nextCleanup) {
        this.runtime!.store.cleanup();
        this.nextCleanup = Date.now() + 3600000;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        const body = await boundedBytes(
          request,
          path === "/mcp" ? 128 * 1024 : 16 * 1024,
        );
        const headers = new Headers(request.headers);
        headers.delete("Content-Length");
        request = new Request(request, { headers, body, redirect: "manual" });
      }
      const response = await handleAsNodeRequest(this.port, request);
      const bytes = await boundedBytes(response, 6 * 1024 * 1024);
      return new Response(bytes.length ? bytes : null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      return error instanceof BodyLimitError
        ? fail(413, "Request or result exceeds Workers limits")
        : fail(503, "Moodle MCP configuration or runtime is unavailable");
    } finally {
      this.active--;
    }
  }
}
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (
      !paths.has(url.pathname) &&
      !/^\/oauth\/authorize\/[A-Za-z0-9_-]+$/.test(url.pathname)
    )
      return fail(404, "Not found");
    if (!env.PUBLIC_URL || url.origin !== env.PUBLIC_URL)
      return fail(421, "Use the configured PUBLIC_URL origin");
    if (
      !env.AUTH_SECRET ||
      !env.AUTH_PASSWORD_HASH ||
      !env.MOODLE_TOKEN ||
      !env.MOODLE_URL
    )
      return fail(503, "Configure the required Worker secrets");
    const headers = new Headers(request.headers),
      address = headers.get("CF-Connecting-IP") ?? "";
    headers.delete("Forwarded");
    headers.set("X-Forwarded-For", isIP(address) ? address : "127.0.0.1");
    headers.set("X-Forwarded-Host", url.host);
    headers.set("X-Forwarded-Proto", url.protocol.slice(0, -1));
    headers.set("Host", url.host);
    try {
      return await env.MOODLE_MCP.get(env.MOODLE_MCP.idFromName("owner")).fetch(
        new Request(request, { headers, redirect: "manual" }),
      );
    } catch {
      return fail(503, "Service unavailable or platform quota reached");
    }
  },
};
