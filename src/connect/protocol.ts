import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";

export const SSO_SCHEME = "web+moodlemcp";
export interface MobilePublicConfig {
  wwwroot?: string;
  enablewebservices?: number;
  enablemobilewebservice?: number;
  launchurl?: string;
  forcedurlscheme?: string;
  identityproviders?: { name: string; url: string }[];
}
/** Protocol compatibility only; MD5 here is Moodle's transaction identifier, not a password hash or signature. */
export function mobileSiteId(site: string, passport: string): string {
  return createHash("md5")
    .update(site + passport)
    .digest("hex");
}
export function buildMobileLaunch(
  site: string,
  passport: string,
  config: MobilePublicConfig,
): string {
  if (
    config.wwwroot !== site ||
    config.enablewebservices !== 1 ||
    config.enablemobilewebservice !== 1
  )
    throw new Error(
      "This Moodle site has not enabled the required mobile Web Service",
    );
  const expected = site + "/admin/tool/mobile/launch.php";
  if (config.launchurl !== expected)
    throw new Error("Unexpected Moodle SSO launch URL");
  if (config.forcedurlscheme && config.forcedurlscheme !== SSO_SCHEME)
    throw new Error(
      "The institution requires its official app callback; browser onboarding is unavailable",
    );
  const url = new URL(expected);
  url.search = new URLSearchParams({
    service: "moodle_mobile_app",
    passport,
    urlscheme: SSO_SCHEME,
    // Ask Moodle for a visible launch link; automatic scheme redirects can stall.
    confirmed: "1",
  }).toString();
  const provider = config.identityproviders?.find((p) =>
    /google/i.test(p.name),
  );
  if (provider) {
    const issuer = new URL(provider.url);
    const id = issuer.searchParams.get("id");
    if (
      issuer.origin !== new URL(site).origin ||
      issuer.pathname !== new URL(site + "/auth/oauth2/login.php").pathname ||
      !id ||
      !/^[1-9][0-9]*$/.test(id)
    )
      throw new Error("Unexpected Moodle identity provider");
    url.searchParams.set("oauthsso", id);
  }
  return url.href;
}
/** Fixed messages only; never include callback payloads in public errors. */
export class MobileReturnError extends Error {
  constructor(
    readonly code: "invalid_return" | "pairing_mismatch" | "pairing_missing",
  ) {
    const messages = {
      invalid_return:
        "Invalid Moodle return format. For a copied app link, use Import copied Moodle link on the setup page.",
      pairing_mismatch:
        "Moodle return belongs to a different connection attempt. Restart SSO, or explicitly import your own copied Moodle link.",
      pairing_missing:
        "Pairing expired, was already used, or belongs to another browser. Restart SSO, or explicitly import your own copied Moodle link.",
    };
    super(messages[code]);
  }
}
function decodeMobileLink(
  raw: unknown,
  copied: boolean,
): { siteId: string; token: string } {
  if (typeof raw !== "string" || raw.length > 2048)
    throw new MobileReturnError("invalid_return");
  const pattern = copied
    ? /^(?:moodlemobile|web\+moodlemcp):\/\/token=([A-Za-z0-9+/]+={0,2})$/
    : /^web\+moodlemcp:\/\/token=([A-Za-z0-9+/]+={0,2})$/;
  const match = pattern.exec(copied ? raw.trim() : raw);
  if (!match || match[1].length % 4 !== 0)
    throw new MobileReturnError("invalid_return");
  const decoded = Buffer.from(match[1], "base64");
  if (decoded.toString("base64") !== match[1])
    throw new MobileReturnError("invalid_return");
  const parts = decoded.toString("utf8").split(":::");
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    !/^[a-f0-9]{32}$/.test(parts[0]) ||
    !/^[a-f0-9]{32}$/i.test(parts[1])
  )
    throw new MobileReturnError("invalid_return");
  // Never retain or return the optional, more powerful mobile private token.
  return { siteId: parts[0], token: parts[1] };
}
/** Automatic return: original scheme, live browser pairing and correlation remain mandatory. */
export function parseMobileReturn(
  raw: unknown,
  expectedSiteId: string,
): string {
  const data = decodeMobileLink(raw, false);
  if (
    !/^[a-f0-9]{32}$/.test(expectedSiteId) ||
    !timingSafeEqual(Buffer.from(data.siteId), Buffer.from(expectedSiteId))
  )
    throw new MobileReturnError("pairing_mismatch");
  return data.token;
}
/** Explicit credential provisioning, not an OAuth callback. The caller MUST require
 * owner authentication, fresh password, CSRF and subsequent account confirmation.
 * The payload's site identifier cannot establish ownership or the target site.
 */
export function parseCopiedMobileLink(raw: unknown): string {
  return decodeMobileLink(raw, true).token;
}
