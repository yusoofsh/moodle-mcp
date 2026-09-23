import Provider, { errors, type Configuration } from "oidc-provider";
import { generateKeyPairSync } from "node:crypto";
import type { HttpConfig } from "./config.js";
import type { SqlAuthStore as AuthStore } from "./sql-store.js";

export function createProvider(config: HttpConfig, store: AuthStore): Provider {
  let keys = store.get("SigningKeys", "primary");
  if (!keys) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    keys = {
      keys: [
        {
          ...privateKey.export({ format: "jwk" }),
          kid: "moodle-mcp-rs256",
          use: "sig",
          alg: "RS256",
        },
      ],
    };
    store.put("SigningKeys", "primary", keys);
  }
  const resource = `${config.publicUrl}/mcp`;
  const settings: Configuration = {
    adapter: store.adapter,
    jwks: keys as unknown as Configuration["jwks"],
    cookies: {
      keys: [config.authSecret],
      long: { secure: config.secure, sameSite: "lax" },
      short: { secure: config.secure, sameSite: "lax" },
    },
    clients: [],
    scopes: ["openid", "offline_access", "moodle:read"],
    claims: { openid: ["sub"] },
    responseTypes: ["code"],
    subjectTypes: ["public"],
    clientAuthMethods: ["none", "client_secret_basic", "client_secret_post"],
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: true },
      revocation: {
        enabled: true,
        allowedPolicy: async (_ctx, client, token) =>
          token.clientId === client.clientId,
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => resource,
        useGrantedResource: () => true,
        getResourceServerInfo: async (_ctx, indicator) => {
          if (indicator !== resource)
            throw new errors.InvalidTarget("Unknown MCP resource");
          return {
            scope: "moodle:read",
            audience: resource,
            accessTokenTTL: 900,
            accessTokenFormat: "opaque",
          };
        },
      },
    },
    interactions: { url: () => `${config.publicUrl}/interaction` },
    findAccount: async (_ctx, id) =>
      id === config.ownerId
        ? { accountId: id, claims: async () => ({ sub: id }) }
        : undefined,
    issueRefreshToken: (_ctx, client) =>
      client.grantTypeAllowed("refresh_token"),
    rotateRefreshToken: true,
    expiresWithSession: () => false,
    ttl: {
      IdToken: 900,
      AccessToken: 900,
      AuthorizationCode: 60,
      Interaction: 600,
      Session: 86400,
      Grant: 30 * 86400,
      RefreshToken: 30 * 86400,
    },
    routes: {
      authorization: "/oauth/authorize",
      token: "/oauth/token",
      registration: "/oauth/register",
      revocation: "/oauth/revoke",
      jwks: "/oauth/jwks",
      userinfo: "/oauth/userinfo",
    },
    renderError: async (ctx) => {
      ctx.type = "text";
      ctx.body = "Authorization failed. Start the connection again.";
    },
  };
  const provider = new Provider(config.publicUrl, settings);
  provider.proxy = config.trustProxyHops > 0;
  // Never log provider error objects: request parameters can contain credentials.
  provider.on("server_error", () =>
    console.error("OAuth provider request failed"),
  );
  return provider;
}
