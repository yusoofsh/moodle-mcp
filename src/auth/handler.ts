import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Env } from "../worker-env.js";
import { HttpError, problem, readBytes } from "../http.js";
import { escapeHtml, randomToken, READ_SCOPE, sha256 } from "./security.js";

const COOKIE = "__Host-moodle-oauth";
const TTL = 600;
interface Pending {
  request: AuthRequest;
  browserHash: string;
  expiresAt: number;
  verifier?: string;
  userId?: string;
}

function cookie(value: string, maxAge = TTL): string {
  return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
function browserToken(request: Request): string {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${COOKIE}=`));
  if (values.length !== 1)
    throw new HttpError(400, "Missing or ambiguous login session");
  const token = values[0].slice(COOKIE.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(400, "Invalid login session");
  return token;
}
function page(html: string, sessionCookie?: string): Response {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  if (sessionCookie) headers.set("Set-Cookie", sessionCookie);
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Moodle MCP authorization</title><body><main>${html}</main></body></html>`,
    { headers },
  );
}
function redirect(location: string, sessionCookie?: string): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  if (sessionCookie) headers.set("Set-Cookie", sessionCookie);
  return new Response(null, { status: 303, headers });
}
async function store(
  env: Env,
  phase: string,
  pending: Pending,
): Promise<string> {
  const id = randomToken();
  await env.OAUTH_KV.put(
    `interactive:${phase}:${id}`,
    JSON.stringify(pending),
    { expirationTtl: TTL },
  );
  return id;
}
async function load(
  request: Request,
  env: Env,
  phase: string,
  id: string,
): Promise<Pending> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(id))
    throw new HttpError(400, "Invalid authorization state");
  const pending = await env.OAUTH_KV.get<Pending>(
    `interactive:${phase}:${id}`,
    "json",
  );
  if (
    !pending ||
    pending.expiresAt <= Date.now() ||
    pending.browserHash !== (await sha256(browserToken(request)))
  ) {
    throw new HttpError(400, "Expired or mismatched authorization session");
  }
  return pending;
}
async function githubJson(
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new HttpError(502, "GitHub authentication is unavailable");
  const data: unknown = JSON.parse(
    new TextDecoder().decode(await readBytes(response, 64 * 1024)),
  );
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new HttpError(502, "Invalid identity-provider response");
  return data as Record<string, unknown>;
}

async function authorize(request: Request, env: Env): Promise<Response> {
  let oauth: AuthRequest;
  try {
    oauth = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch {
    throw new HttpError(400, "Invalid OAuth authorization request");
  }
  if (
    oauth.responseType !== "code" ||
    oauth.codeChallengeMethod !== "S256" ||
    !oauth.codeChallenge
  ) {
    throw new HttpError(
      400,
      "Authorization code flow with PKCE S256 is required",
    );
  }
  // No scope means the resource's advertised minimum scope. Never grant writes.
  if (oauth.scope.length === 0) oauth.scope = [READ_SCOPE];
  if (oauth.scope.some((s) => s !== READ_SCOPE))
    throw new HttpError(400, "Unsupported OAuth scope");
  const browser = randomToken();
  const verifier = randomToken();
  const state = await store(env, "login", {
    request: oauth,
    browserHash: await sha256(browser),
    expiresAt: Date.now() + TTL * 1000,
    verifier,
  });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.PUBLIC_URL}/github/callback`,
    scope: "read:user",
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
  }).toString();
  return redirect(url.toString(), cookie(browser));
}

async function callback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const pending = await load(request, env, "login", state);
  await env.OAUTH_KV.delete(`interactive:login:${state}`);
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error"))
    throw new HttpError(400, "GitHub sign-in was not completed");
  const token = await githubJson(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${env.PUBLIC_URL}/github/callback`,
        code_verifier: pending.verifier!,
      }),
    },
  );
  if (typeof token.access_token !== "string")
    throw new HttpError(400, "GitHub sign-in failed");
  const identity = await githubJson("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "moodle-mcp",
    },
  });
  if (
    !Number.isSafeInteger(identity.id) ||
    String(identity.id) !== env.GITHUB_ALLOWED_USER_ID
  )
    throw new HttpError(
      403,
      "This Moodle connection is restricted to its owner",
    );
  const client = await env.OAUTH_PROVIDER.lookupClient(
    pending.request.clientId,
  );
  if (!client) throw new HttpError(400, "OAuth client is no longer available");
  const browser = randomToken();
  const consent = await store(env, "consent", {
    request: pending.request,
    userId: String(identity.id),
    browserHash: await sha256(browser),
    expiresAt: Date.now() + TTL * 1000,
  });
  return page(
    `<h1>Allow read-only Moodle access?</h1><p>Client: <strong>${escapeHtml(client.clientName ?? pending.request.clientId)}</strong></p><p>Return address: <code>${escapeHtml(pending.request.redirectUri)}</code></p><p>This client can read courses, files, assignments, grades, calendar, forums and notifications from the configured Moodle account. It cannot submit assignments or change grades. Access can continue through token refresh until expiry or revocation.</p><form method="post" action="/consent"><input type="hidden" name="state" value="${consent}"><button name="decision" value="allow" type="submit">Allow read-only access</button> <button name="decision" value="deny" type="submit">Deny</button></form>`,
    cookie(browser),
  );
}

async function consent(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("origin") !== env.PUBLIC_URL)
    throw new HttpError(403, "Invalid consent origin");
  if (
    request.headers.get("content-type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    throw new HttpError(415, "Form encoding is required");
  const form = new URLSearchParams(
    new TextDecoder().decode(await readBytes(request, 16 * 1024)),
  );
  const state = form.get("state") ?? "";
  const pending = await load(request, env, "consent", state);
  if (pending.userId !== env.GITHUB_ALLOWED_USER_ID)
    throw new HttpError(403, "Owner authorization changed");
  const decision = form.get("decision");
  if (decision !== "allow" && decision !== "deny")
    throw new HttpError(400, "Choose Allow or Deny");
  await env.OAUTH_KV.delete(`interactive:consent:${state}`);
  if (decision === "deny") {
    const url = new URL(pending.request.redirectUri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("state", pending.request.state);
    url.searchParams.set("iss", env.PUBLIC_URL);
    return redirect(url.toString(), cookie("", 0));
  }
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: pending.request,
    userId: pending.userId,
    metadata: {},
    scope: pending.request.scope,
    props: { userId: pending.userId, scopes: pending.request.scope },
  });
  return redirect(redirectTo, cookie("", 0));
}

export const authHandler: ExportedHandler<Env> = {
  async fetch(request, env) {
    try {
      const path = new URL(request.url).pathname;
      if (path === "/authorize" && request.method === "GET")
        return await authorize(request, env);
      if (path === "/github/callback" && request.method === "GET")
        return await callback(request, env);
      if (path === "/consent" && request.method === "POST")
        return await consent(request, env);
      return problem(404, "Not found");
    } catch (error) {
      if (error instanceof HttpError)
        return problem(error.status, error.message);
      // Never reflect provider response bodies, codes, tokens, or error stacks.
      return problem(502, "Authorization could not be completed");
    }
  },
};
