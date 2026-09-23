import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { normalizeUrl, parseMaxFileMb } from "./config.js";
import { MoodleClient } from "./moodle-client.js";
import { registerAllTools } from "./register-tools.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";
import { authHandler } from "./auth/handler.js";
import {
  canonicalOrigin,
  isAllowedIdentity,
  READ_SCOPE,
} from "./auth/security.js";
import { HttpError, problem, readBytes } from "./http.js";
import type { Env } from "./worker-env.js";

export async function handleMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (new URL(request.url).pathname !== "/mcp")
    return problem(404, "Not found");
  if (!isAllowedIdentity(ctx.props, env.GITHUB_ALLOWED_USER_ID))
    return problem(403, "Insufficient permission");
  // A stateless server need not expose a GET/SSE or DELETE session endpoint.
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  let server: McpServer | undefined;
  try {
    const client = await MoodleClient.create({
      baseUrl: normalizeUrl(env.MOODLE_URL),
      token: env.MOODLE_TOKEN,
      maxFileBytes: Math.floor(
        parseMaxFileMb(env.MOODLE_MCP_MAX_FILE_MB) * 1024 * 1024,
      ),
    });
    server = new McpServer({ name: "moodle-mcp", version: "0.3.0" });
    registerAllTools(server, client);
    registerResources(server, client);
    registerPrompts(server);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch {
    return problem(502, "Moodle MCP request failed");
  } finally {
    await server?.close();
  }
}

export function createProvider(env: Env): OAuthProvider<Env> {
  const origin = canonicalOrigin(env.PUBLIC_URL);
  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: { fetch: handleMcp },
    defaultHandler: authHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    accessTokenTTL: 3600,
    refreshTokenTTL: 30 * 24 * 3600,
    clientRegistrationTTL: 90 * 24 * 3600,
    allowImplicitFlow: false,
    allowPlainPKCE: false,
    allowTokenExchangeGrant: false,
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [READ_SCOPE],
    // Scope reductions on refresh must also reduce application-level permissions.
    tokenExchangeCallback: ({ userId, requestedScope }) => ({
      accessTokenProps: { userId, scopes: requestedScope },
    }),
    resourceMetadata: {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: [READ_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Private Moodle MCP",
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const origin = canonicalOrigin(env.PUBLIC_URL);
      const url = new URL(request.url);
      if (url.origin !== origin)
        return problem(421, "Use the configured canonical origin");
      if (
        !env.OAUTH_KV ||
        !env.GITHUB_CLIENT_ID ||
        !env.GITHUB_CLIENT_SECRET ||
        !/^[1-9]\d*$/.test(env.GITHUB_ALLOWED_USER_ID) ||
        !env.MOODLE_TOKEN ||
        !env.MOODLE_URL
      )
        return problem(503, "Server configuration is incomplete");
      if (new URL(env.MOODLE_URL).protocol !== "https:")
        return problem(503, "Moodle must use HTTPS");
      if (url.pathname === "/health" && request.method === "GET")
        return Response.json(
          { status: "ok" },
          { headers: { "Cache-Control": "no-store" } },
        );
      const requestOrigin = request.headers.get("origin");
      if (
        url.pathname.startsWith("/mcp") &&
        requestOrigin &&
        requestOrigin !== origin
      )
        return problem(403, "Untrusted request origin");
      if (request.method === "POST") {
        const bytes = await readBytes(
          request,
          url.pathname === "/mcp" ? 1024 * 1024 : 16 * 1024,
        );
        request = new Request(request, { body: bytes });
      }
      return await createProvider(env).fetch(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError)
        return problem(error.status, error.message);
      return problem(503, "MCP service is unavailable");
    }
  },
};
