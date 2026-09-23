import { createHmac } from "node:crypto";
import { validatePasswordHash } from "./password.js";

interface CommonHttpConfig {
  publicUrl: string;
  ownerId: string;
  authSecret: string;
  databasePath: string;
  port: number;
  trustProxyHops: number;
  secure: boolean;
}
export type HttpConfig = CommonHttpConfig &
  (
    | {
        authMode: "password";
        passwordHash: string;
        githubClientId?: never;
        githubClientSecret?: never;
      }
    | {
        authMode: "github";
        passwordHash?: never;
        githubClientId: string;
        githubClientSecret: string;
      }
  );

export function getHttpConfig(
  env: NodeJS.ProcessEnv = process.env,
): HttpConfig {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required for HTTP/OAuth mode`);
    return value;
  };
  const url = new URL(required("PUBLIC_URL"));
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "PUBLIC_URL must be an origin without credentials, path, query or fragment",
    );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      loopback &&
      env.ALLOW_INSECURE_HTTP === "true"
    )
  )
    throw new Error(
      "PUBLIC_URL must use HTTPS; loopback development requires ALLOW_INSECURE_HTTP=true",
    );
  const authSecret = required("AUTH_SECRET");
  if (!/^[a-f0-9]{64}$/i.test(authSecret))
    throw new Error(
      "AUTH_SECRET must be 32 random bytes encoded as 64 hexadecimal characters",
    );
  const mode = env.AUTH_MODE?.trim() || "password";
  let identity: Pick<HttpConfig, "ownerId"> &
    (
      | { authMode: "password"; passwordHash: string }
      | {
          authMode: "github";
          githubClientId: string;
          githubClientSecret: string;
        }
    );
  if (mode === "password") {
    const passwordHash = required("AUTH_PASSWORD_HASH");
    validatePasswordHash(passwordHash);
    // Rotating the hash changes the principal: old sessions, access and refresh
    // tokens no longer authorize this owner. The encrypted database stays intact.
    const version = createHmac("sha256", Buffer.from(authSecret, "hex"))
      .update("moodle-password-owner-v1:")
      .update(passwordHash)
      .digest("hex");
    identity = {
      authMode: "password",
      passwordHash,
      ownerId: `local-owner:${version}`,
    };
  } else if (mode === "github") {
    const ownerId = required("GITHUB_ALLOWED_USER_ID");
    if (!/^[1-9][0-9]*$/.test(ownerId))
      throw new Error(
        "GITHUB_ALLOWED_USER_ID must be the numeric GitHub account ID, not the login name",
      );
    identity = {
      authMode: "github",
      ownerId,
      githubClientId: required("GITHUB_CLIENT_ID"),
      githubClientSecret: required("GITHUB_CLIENT_SECRET"),
    };
  } else {
    throw new Error("AUTH_MODE must be password or github");
  }
  const port = Number(env.PORT || 3000),
    trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535");
  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 2
  )
    throw new Error("TRUST_PROXY_HOPS must be 0, 1 or 2");
  return {
    publicUrl: url.origin,
    ...identity,
    authSecret,
    databasePath: env.OAUTH_DATABASE_PATH || "/data/oauth.sqlite",
    port,
    trustProxyHops,
    secure: url.protocol === "https:",
  };
}
