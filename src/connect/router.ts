import { Buffer } from "node:buffer";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router, json, urlencoded, type Request, type Response } from "express";
import helmet from "helmet";
import type { HttpConfig } from "../auth/config.js";
import type { SqlAuthStore } from "../auth/sql-store.js";
import { acquirePasswordSlot } from "../auth/password-slot.js";
import { verifyPassword } from "../auth/password.js";
import { reservePasswordAttempt } from "../auth/password-throttle.js";
import type { MoodleConnection } from "./connection.js";
import { CONNECT_PATH, connectionPage, connectionScript } from "./ui.js";
const random = () => Buffer.from(randomBytes(32)).toString("base64url");
const SESSION_TTL = 20 * 60;
function same(value: unknown, expected: string): boolean {
  if (typeof value !== "string") return false;
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function readCookie(req: Request, name: string): string | undefined {
  const parts = (req.headers.cookie ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(name + "="));
  if (parts.length !== 1) return;
  const value = parts[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
export function moodleConnectionRouter(
  config: HttpConfig,
  store: SqlAuthStore,
  connection: MoodleConnection,
): Router {
  const router = Router(),
    cookie = config.secure ? "__Host-moodle-connect" : "moodle-connect",
    loginCookie = cookie + "-login";
  const options = {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax" as const,
    path: "/",
  };
  const session = (req: Request) => {
    const key = readCookie(req, cookie);
    if (!key) return;
    const data = store.get("MoodleOwnerSession", key);
    if (
      !data ||
      data.principal !== config.ownerId ||
      typeof data.csrf !== "string"
    )
      return;
    return { key, csrf: data.csrf };
  };
  const login = (res: Response, message = "", status = 200) => {
    const key = random();
    store.put("MoodleOwnerLogin", key, { principal: config.ownerId }, 600);
    res.cookie(loginCookie, key, { ...options, maxAge: 600000 });
    res
      .status(status)
      .type("html")
      .send(connectionPage(connection.config.baseUrl, key, message));
  };
  router.use(
    CONNECT_PATH,
    (_req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "same-origin");
      res.setHeader("X-Frame-Options", "DENY");
      next();
    },
    helmet.contentSecurityPolicy({
      directives: {
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    }),
  );
  router.get(CONNECT_PATH + "/client.js", (_req, res) =>
    res.type("application/javascript").send(connectionScript),
  );
  router.get(CONNECT_PATH + "/return", (req, res) => {
    // A fragment return is processed by the same-origin script before any POST.
    if (new URL(req.originalUrl, config.publicUrl).search) {
      res
        .status(400)
        .send(
          "Use a fragment-based return, never put credentials in query parameters",
        );
      return;
    }
    res.type("html").send(connectionPage(connection.config.baseUrl));
  });
  router.get(CONNECT_PATH, (req, res) => {
    if (config.authMode !== "password") {
      res.status(404).send("Password-mode setup only");
      return;
    }
    if (!session(req)) {
      login(res);
      return;
    }
    res.type("html").send(connectionPage(connection.config.baseUrl));
  });
  router.post(
    CONNECT_PATH + "/login",
    urlencoded({ extended: false, limit: "8kb", parameterLimit: 4 }),
    async (req, res) => {
      const password: unknown = req.body?.password;
      if (req.body && typeof req.body === "object") delete req.body.password;
      if (config.authMode !== "password") {
        res.status(404).end();
        return;
      }
      if (
        req.get("origin") !== config.publicUrl ||
        !req.is("application/x-www-form-urlencoded")
      ) {
        res.status(403).send("Invalid setup login request");
        return;
      }
      const key = readCookie(req, loginCookie);
      if (
        !key ||
        !same(req.body?.csrf, key) ||
        store.take("MoodleOwnerLogin", key)?.principal !== config.ownerId
      ) {
        res.status(403).send("Expired login form; restart setup");
        return;
      }
      const releasePassword = acquirePasswordSlot(store);
      if (!releasePassword) {
        res
          .status(429)
          .set("Retry-After", "1")
          .send("Login busy; restart setup");
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
      try {
        if (!(await verifyPassword(password, config.passwordHash))) {
          login(res, "Incorrect passphrase. Try again.", 401);
          return;
        }
        const previous = session(req);
        if (previous) {
          store.take("MoodleOwnerSession", previous.key);
          connection.cancel(previous.key);
        }
        const id = random();
        store.put(
          "MoodleOwnerSession",
          id,
          { principal: config.ownerId, csrf: random() },
          SESSION_TTL,
        );
        res.clearCookie(loginCookie, options);
        res.cookie(cookie, id, { ...options, maxAge: SESSION_TTL * 1000 });
        res.redirect(303, CONNECT_PATH);
      } finally {
        releasePassword();
      }
    },
  );
  router.get(CONNECT_PATH + "/status", (req, res) => {
    const owner = session(req);
    if (!owner) {
      res.status(401).json({ error: "Owner login required" });
      return;
    }
    res.json({
      csrf: owner.csrf,
      connection: connection.state(),
      returnVerified:
        store.get("MoodleReturnVerified", owner.key)?.principal ===
        config.ownerId,
      pending: connection.pendingReturn(owner.key, config.ownerId),
    });
  });
  const actions = [
    "probe",
    "probe-complete",
    "start",
    "complete",
    "confirm",
    "cancel",
    "disconnect",
    "fallback",
    "check",
    "logout",
  ];
  router.post(
    actions.map((a) => CONNECT_PATH + "/" + a),
    json({ limit: "8kb" }),
    async (req, res) => {
      const owner = session(req);
      if (!owner) {
        res.status(401).json({ error: "Owner login required; restart setup" });
        return;
      }
      if (
        req.get("origin") !== config.publicUrl ||
        !req.is("application/json") ||
        !same(req.get("X-CSRF-Token"), owner.csrf)
      ) {
        res.status(403).json({ error: "Invalid setup request" });
        return;
      }
      const action = req.path.slice(CONNECT_PATH.length + 1);
      try {
        if (action === "probe") {
          const nonce = random();
          store.take("MoodleReturnVerified", owner.key);
          store.put(
            "MoodleReturnProbe",
            owner.key,
            { nonce, principal: config.ownerId },
            600,
          );
          res.json({ probeUrl: "web+moodlemcp://probe=" + nonce });
          return;
        }
        if (action === "probe-complete") {
          const raw: unknown = req.body?.callback;
          if (req.body) delete req.body.callback;
          const probe = store.take("MoodleReturnProbe", owner.key);
          if (
            !probe ||
            probe.principal !== config.ownerId ||
            typeof probe.nonce !== "string" ||
            !same(raw, "web+moodlemcp://probe=" + probe.nonce)
          ) {
            res.status(400).json({
              error:
                "Browser-return test expired or did not match this setup session. Enable browser return and test again.",
            });
            return;
          }
          store.put(
            "MoodleReturnVerified",
            owner.key,
            { principal: config.ownerId },
            600,
          );
          res.json({ ok: true });
          return;
        }
        if (action === "start") {
          const publicConfig = await connection.publicConfig();
          // Recheck after network I/O so an expired/logged-out session cannot start a transaction.
          if (!session(req)) {
            res.status(401).json({ error: "Setup session expired" });
            return;
          }
          res.json({
            launchUrl: connection.begin(
              owner.key,
              config.ownerId,
              publicConfig,
            ),
            site: connection.config.baseUrl,
          });
          return;
        }
        if (action === "complete") {
          const callback: unknown = req.body?.callback;
          if (req.body) delete req.body.callback;
          const candidate = await connection.stage(
            owner.key,
            config.ownerId,
            callback,
          );
          if (!session(req)) {
            connection.cancel(owner.key);
            res.status(401).json({ error: "Setup session expired" });
            return;
          }
          res.json(candidate);
          return;
        }
        if (action === "confirm")
          connection.confirm(owner.key, config.ownerId, req.body?.confirmation);
        if (action === "cancel") connection.cancel(owner.key);
        if (action === "disconnect") {
          connection.cancel(owner.key);
          connection.disconnect();
        }
        if (action === "fallback") {
          connection.cancel(owner.key);
          connection.useFallback();
        }
        if (action === "check") await connection.check();
        if (action === "logout") {
          connection.cancel(owner.key);
          store.take("MoodleOwnerSession", owner.key);
          store.take("MoodleReturnProbe", owner.key);
          store.take("MoodleReturnVerified", owner.key);
          res.clearCookie(cookie, options);
        }
        res.json({ ok: true, connection: connection.state() });
      } catch {
        // Never echo OAuth payloads, upstream responses, URLs, tokens, or stacks.
        res.status(400).json({
          error:
            action === "complete"
              ? "Moodle return could not be validated. The session may have expired, the account may differ, or the institution may restrict the handoff. Restart setup."
              : action === "check"
                ? "Moodle did not accept the connection. Reconnect with university SSO or check the configured token."
                : "Connection request could not be completed. Restart setup; existing credentials were not replaced unless explicitly confirmed.",
        });
      }
    },
  );
  return router;
}
