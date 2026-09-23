import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { requireBearerAuth } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer, OAuthError } from "@modelcontextprotocol/server";
import { getConfig } from "./config.js";
import { MoodleClient } from "./moodle-client.js";
import { registerAllTools } from "./register-tools.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";
import type { HttpConfig } from "./auth/config.js";
import { AuthStore } from "./auth/store.js";
import { createProvider } from "./auth/provider.js";
import { interactionRouter, type Fetcher } from "./auth/interactions.js";

export function createApp(
  config: HttpConfig,
  dependencies: {
    githubFetch?: Fetcher;
    createMoodleClient?: () => Promise<MoodleClient>;
  } = {},
) {
  const app = express(),
    store = new AuthStore(config.databasePath, config.authSecret),
    provider = createProvider(config, store);
  const resource = `${config.publicUrl}/mcp`,
    metadataUrl = `${config.publicUrl}/.well-known/oauth-protected-resource/mcp`;
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxyHops);
  app.use(helmet());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.use((req, res, next) => {
    if (req.get("host") !== new URL(config.publicUrl).host) {
      res.status(403).send("Invalid Host");
      return;
    }
    // Preserve the configured issuer even if a proxy forwards untrusted host data.
    req.headers["x-forwarded-host"] = new URL(config.publicUrl).host;
    next();
  });
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(
    "/oauth/register",
    rateLimit({
      windowMs: 3600000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(
    "/interaction",
    rateLimit({
      windowMs: 60000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const metadata = {
    resource,
    authorization_servers: [config.publicUrl],
    scopes_supported: ["moodle:read"],
    bearer_methods_supported: ["header"],
    resource_name: "Moodle MCP",
  };
  app.get(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ],
    (_req, res) => res.json(metadata),
  );
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    req.url = "/.well-known/openid-configuration";
    provider.callback()(req, res);
  });
  app.use(interactionRouter(provider, config, store, dependencies.githubFetch));
  const authenticate = requireBearerAuth({
    resourceMetadataUrl: metadataUrl,
    requiredScopes: ["moodle:read"],
    verifier: {
      verifyAccessToken: async (token) => {
        const access = await provider.AccessToken.find(token);
        if (
          !access ||
          access.isExpired ||
          access.accountId !== config.ownerId ||
          access.aud !== resource ||
          !access.clientId ||
          !access.grantId ||
          !(await provider.Grant.find(access.grantId))
        )
          throw new OAuthError("invalid_token", "Invalid access token");
        return {
          token,
          clientId: access.clientId,
          scopes: (access.scope || "").split(" "),
          expiresAt: access.exp,
          resource: new URL(resource),
        };
      },
    },
  });
  app.use(
    "/mcp",
    (req, res, next) => {
      const origin = req.get("origin");
      if (origin && origin !== config.publicUrl) {
        res.status(403).send("Origin not allowed");
        return;
      }
      next();
    },
    authenticate,
  );
  let pending: Promise<MoodleClient> | undefined;
  const getClient = (): Promise<MoodleClient> => {
    if (!pending)
      pending = (
        dependencies.createMoodleClient?.() || MoodleClient.create(getConfig())
      ).catch((error) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };
  app.post("/mcp", express.json({ limit: "1mb" }), async (req, res) => {
    const client = await getClient();
    const server = new McpServer({ name: "moodle-mcp", version: "0.3.0" });
    registerAllTools(server, client);
    registerResources(server, client);
    registerPrompts(server);
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  app.use(provider.callback());
  const errors: ErrorRequestHandler = (_err, _req, res, _next) => {
    const status =
      typeof _err?.status === "number" && [400, 413].includes(_err.status)
        ? _err.status
        : 500;
    if (!res.headersSent)
      res.status(status).json({
        error:
          status === 500
            ? "Request failed; check configuration and upstream availability"
            : "Invalid or oversized request",
      });
  };
  app.use(errors);
  const cleanup = setInterval(() => store.cleanup(), 3600000);
  cleanup.unref();
  return {
    app,
    provider,
    store,
    close: () => {
      clearInterval(cleanup);
      store.close();
    },
  };
}
