import { McpServer } from "@modelcontextprotocol/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { normalizeUrl, parseMaxFileMb } from "./config.js";
import { MoodleClient } from "./moodle-client.js";
import { registerAllTools } from "./register-tools.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

interface Env {
  MOODLE_URL: string;
  MOODLE_TOKEN: string;
  /** Legacy static-token transport only. Use the OCI HTTP server for OAuth. */
  MCP_ACCESS_TOKEN?: string;
  MOODLE_MCP_MAX_FILE_MB?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/mcp")
      return new Response("Not found", { status: 404 });
    if (
      !env.MCP_ACCESS_TOKEN ||
      env.MCP_ACCESS_TOKEN.length < 32 ||
      env.MCP_ACCESS_TOKEN === env.MOODLE_TOKEN
    )
      return new Response("Hosted access is not configured", { status: 503 });
    const received = request.headers.get("authorization") || "";
    const digest = async (value: string) =>
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      );
    const [actual, expected] = await Promise.all([
      digest(received),
      digest("Bearer " + env.MCP_ACCESS_TOKEN),
    ]);
    let difference = 0;
    for (let i = 0; i < actual.length; i++)
      difference |= actual[i] ^ expected[i];
    if (difference !== 0)
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" },
      });
    if (!env.MOODLE_URL || !env.MOODLE_TOKEN) {
      return new Response(
        JSON.stringify({
          error:
            "Set MOODLE_URL and MOODLE_TOKEN as secrets in your Cloudflare Worker dashboard",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const maxFileBytes = Math.floor(
        parseMaxFileMb(env.MOODLE_MCP_MAX_FILE_MB) * 1024 * 1024,
      );
      const config = {
        baseUrl: normalizeUrl(env.MOODLE_URL),
        token: env.MOODLE_TOKEN,
        maxFileBytes,
      };
      const client = await MoodleClient.create(config);

      const server = new McpServer({ name: "moodle-mcp", version: "0.3.0" });

      registerAllTools(server, client);
      registerResources(server, client);
      registerPrompts(server);

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      return transport.handleRequest(request);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
