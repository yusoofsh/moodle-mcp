export interface HttpConfig {
  publicUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  ownerId: string;
  authSecret: string;
  databasePath: string;
  port: number;
  trustProxyHops: number;
  secure: boolean;
}
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
  const ownerId = required("GITHUB_ALLOWED_USER_ID");
  if (!/^[1-9][0-9]*$/.test(ownerId))
    throw new Error(
      "GITHUB_ALLOWED_USER_ID must be the numeric GitHub account ID, not the login name",
    );
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
    githubClientId: required("GITHUB_CLIENT_ID"),
    githubClientSecret: required("GITHUB_CLIENT_SECRET"),
    ownerId,
    authSecret,
    databasePath: env.OAUTH_DATABASE_PATH || "/data/oauth.sqlite",
    port,
    trustProxyHops,
    secure: url.protocol === "https:",
  };
}
