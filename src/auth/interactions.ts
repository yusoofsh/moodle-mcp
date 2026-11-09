import { Buffer } from "node:buffer";
import { Router, urlencoded, type Request } from "express";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type Provider from "oidc-provider";
import helmet from "helmet";
import { WRITE_SCOPE } from "../write-api.js";
import { consentCallbackOrigin } from "./consent-policy.js";
import type { HttpConfig } from "./config.js";
import type { SqlAuthStore as AuthStore } from "./sql-store.js";
import { acquirePasswordSlot } from "./password-slot.js";
import { verifyPassword } from "./password.js";
import { reservePasswordAttempt } from "./password-throttle.js";
import { consentPage, passwordPage } from "./pages.js";

export type Fetcher = typeof fetch;
function equal(a: unknown, b: string): boolean {
  if (typeof a !== "string") return false;
  const actual = Buffer.from(a),
    expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function cookie(req: Request, name: string): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function interactionRouter(
  provider: Provider,
  config: HttpConfig,
  store: AuthStore,
  githubFetch: Fetcher = fetch,
): Router {
  const router = Router(),
    stateCookie = config.secure
      ? "__Host-moodle-oauth-state"
      : "moodle-oauth-state";
  const callbackUrl = `${config.publicUrl}/interaction/github/callback`;
  const cookieOptions = {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600000,
  };
  const passwordForm = (uid: string, invalid = false): string => {
    const nonce = Buffer.from(randomBytes(32)).toString("base64url");
    store.put("PasswordForm", nonce, { uid }, 600);
    return passwordPage(nonce, invalid);
  };
  const csrf = (uid: string): string =>
    createHmac("sha256", config.authSecret)
      .update("consent:" + uid)
      .digest("hex");
  router.get("/interaction", async (req, res) => {
    const details = await provider.interactionDetails(req, res);
    res.setHeader("Cache-Control", "no-store");
    if (details.prompt.name === "login") {
      if (config.authMode === "password") {
        res.type("html").send(passwordForm(details.uid));
        return;
      }
      const state = Buffer.from(randomBytes(32)).toString("base64url"),
        verifier = Buffer.from(randomBytes(32)).toString("base64url");
      store.put("GithubState", state, { uid: details.uid, verifier }, 600);
      res.cookie(stateCookie, state, cookieOptions);
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: config.githubClientId,
        redirect_uri: callbackUrl,
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
      res.redirect(url.href);
      return;
    }
    if (
      details.prompt.name !== "consent" ||
      details.session?.accountId !== config.ownerId
    ) {
      res.status(403).send("Access denied");
      return;
    }
    const client = await provider.Client.find(String(details.params.client_id));
    let callbackOrigin: string;
    try {
      callbackOrigin = consentCallbackOrigin(
        details.params.redirect_uri,
        client?.redirectUris,
      );
    } catch {
      res
        .status(400)
        .send("Unsupported authorization callback; restart sign-in");
      return;
    }
    // Browsers also apply form-action to the redirect chain after consent.
    // The password page remains self-only; only this consent page permits the
    // verified client callback. All other Helmet CSP directives remain enabled.
    helmet.contentSecurityPolicy({
      directives: { formAction: ["'self'", callbackOrigin] },
    })(req, res, () => {});
    res.setHeader("Cache-Control", "no-store");
    const requested =
      (
        details.prompt.details as {
          missingResourceScopes?: Record<string, string[]>;
        }
      ).missingResourceScopes?.[`${config.publicUrl}/mcp`] ?? [];
    res.type("html").send(
      consentPage({
        clientName: client?.clientName || client?.clientId || "MCP client",
        clientId: String(client?.clientId ?? ""),
        redirectUri: String(details.params.redirect_uri),
        returnsTo: new URL(callbackOrigin).host,
        csrf: csrf(details.uid),
        offersWrite: requested.includes(WRITE_SCOPE),
      }),
    );
  });
  router.post(
    "/interaction/password",
    urlencoded({ extended: false, limit: "8kb", parameterLimit: 4 }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      if (config.authMode !== "password") {
        res.status(404).send("Not found");
        return;
      }
      const password: unknown = req.body?.password;
      if (req.body && typeof req.body === "object") delete req.body.password;
      if (
        req.get("origin") !== config.publicUrl ||
        !req.is("application/x-www-form-urlencoded")
      ) {
        res.status(403).send("Invalid login request");
        return;
      }
      const details = await provider
        .interactionDetails(req, res)
        .catch(() => undefined);
      if (!details) {
        res
          .status(400)
          .send("Login session unavailable; start the connection again");
        return;
      }
      if (
        details.prompt.name !== "login" ||
        typeof req.body?.csrf !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(req.body.csrf)
      ) {
        res.status(403).send("Invalid login request");
        return;
      }
      const pending = store.take("PasswordForm", req.body.csrf);
      if (!pending || pending.uid !== details.uid) {
        res
          .status(403)
          .send("Expired or mismatched login form; restart sign-in");
        return;
      }
      const releasePassword = acquirePasswordSlot(store);
      if (!releasePassword) {
        res
          .status(429)
          .set("Retry-After", "1")
          .send("Login is busy; reload and try again");
        return;
      }
      const retry = reservePasswordAttempt(
        store,
        config.authSecret,
        req.ip || "unknown",
      );
      if (retry) {
        releasePassword();
        res
          .status(429)
          .set("Retry-After", String(retry))
          .send("Too many login attempts; try again later");
        return;
      }
      // Remove the submitted password from req.body before other middleware could
      // observe it. Never include it in state, logs, errors or OAuth credentials.
      try {
        if (!(await verifyPassword(password, config.passwordHash))) {
          res.status(401).type("html").send(passwordForm(details.uid, true));
          return;
        }
        await provider.interactionFinished(
          req,
          res,
          { login: { accountId: config.ownerId } },
          { mergeWithLastSubmission: false },
        );
      } finally {
        releasePassword();
      }
    },
  );
  router.get("/interaction/github/callback", async (req, res) => {
    if (config.authMode !== "github") {
      res.status(404).send("Not found");
      return;
    }
    const { state, code } = req.query;
    if (
      typeof state !== "string" ||
      typeof code !== "string" ||
      !equal(cookie(req, stateCookie), state)
    ) {
      res.status(400).send("Invalid OAuth state");
      return;
    }
    const details = await provider.interactionDetails(req, res);
    const pending = store.take("GithubState", state);
    res.clearCookie(stateCookie, { ...cookieOptions, maxAge: undefined });
    if (
      !pending ||
      pending.uid !== details.uid ||
      details.prompt.name !== "login"
    ) {
      res.status(400).send("Expired or mismatched login");
      return;
    }
    try {
      const tokenResponse = await githubFetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new URLSearchParams({
            client_id: config.githubClientId,
            client_secret: config.githubClientSecret,
            code,
            redirect_uri: callbackUrl,
            code_verifier: String(pending.verifier),
          }),
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!tokenResponse.ok) throw new Error("Login failed");
      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
      };
      if (!tokenData.access_token) throw new Error("Login failed");
      const userResponse = await githubFetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "moodle-mcp",
        },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!userResponse.ok) throw new Error("Login failed");
      const user = (await userResponse.json()) as { id?: number };
      if (String(user.id) !== config.ownerId) {
        res
          .status(403)
          .send(
            "Only the configured GitHub owner may authorize this Moodle account",
          );
        return;
      }
      await provider.interactionFinished(
        req,
        res,
        { login: { accountId: config.ownerId } },
        { mergeWithLastSubmission: false },
      );
    } catch {
      res
        .status(502)
        .send("GitHub sign-in failed. Start the connection again.");
    }
  });
  router.post(
    "/interaction/confirm",
    urlencoded({ extended: false, limit: "4kb" }),
    async (req, res) => {
      const details = await provider.interactionDetails(req, res);
      if (
        req.get("origin") !== config.publicUrl ||
        !equal(req.body.csrf, csrf(details.uid)) ||
        details.prompt.name !== "consent" ||
        details.session?.accountId !== config.ownerId
      ) {
        res.status(403).send("Invalid consent request");
        return;
      }
      if (req.body.decision !== "allow") {
        await provider.interactionFinished(
          req,
          res,
          {
            error: "access_denied",
            error_description: "The owner denied access",
          },
          { mergeWithLastSubmission: false },
        );
        return;
      }
      const grant = details.grantId
        ? await provider.Grant.find(details.grantId)
        : new provider.Grant({
            accountId: config.ownerId,
            clientId: String(details.params.client_id),
          });
      if (!grant) {
        res.status(400).send("Authorization expired");
        return;
      }
      const missing = details.prompt.details as {
        missingOIDCScope?: string[];
        missingOIDCClaims?: string[];
        missingResourceScopes?: Record<string, string[]>;
      };
      if (missing.missingOIDCScope)
        grant.addOIDCScope(missing.missingOIDCScope.join(" "));
      if (missing.missingOIDCClaims)
        grant.addOIDCClaims(missing.missingOIDCClaims);
      for (const [resource, scopes] of Object.entries(
        missing.missingResourceScopes || {},
      )) {
        if (
          resource !== `${config.publicUrl}/mcp` ||
          scopes.some((scope) => !["moodle:read", WRITE_SCOPE].includes(scope))
        ) {
          res.status(403).send("Invalid resource scope");
          return;
        }
        // Write is granted only by the owner's explicit tick. A declined scope is
        // recorded as rejected so the consent prompt is not shown again in a loop.
        const wantsWrite = req.body.write === "1";
        const granted = scopes.filter(
          (scope) => scope !== WRITE_SCOPE || wantsWrite,
        );
        if (granted.length) grant.addResourceScope(resource, granted.join(" "));
        if (scopes.includes(WRITE_SCOPE) && !wantsWrite)
          grant.rejectResourceScope(resource, WRITE_SCOPE);
      }
      const grantId = await grant.save();
      await provider.interactionFinished(
        req,
        res,
        { consent: { grantId } },
        { mergeWithLastSubmission: true },
      );
    },
  );
  return router;
}
