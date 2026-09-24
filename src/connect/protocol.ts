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
/** Accept only a return generated for this pending transaction. Never parse its base64 authority through URL, which may normalize it. */
export function parseMobileReturn(
  raw: unknown,
  expectedSiteId: string,
): string {
  if (typeof raw !== "string" || raw.length > 2048)
    throw new Error("Invalid Moodle return");
  const match = /^web\+moodlemcp:\/\/token=([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!match || match[1].length % 4 !== 0)
    throw new Error("Invalid Moodle return");
  const decoded = Buffer.from(match[1], "base64");
  if (decoded.toString("base64") !== match[1])
    throw new Error("Invalid Moodle return");
  const parts = decoded.toString("utf8").split(":::");
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    !/^[a-f0-9]{32}$/.test(parts[0]) ||
    !/^[a-f0-9]{32}$/i.test(parts[1])
  )
    throw new Error("Invalid Moodle return");
  if (
    !/^[a-f0-9]{32}$/.test(expectedSiteId) ||
    !timingSafeEqual(Buffer.from(parts[0]), Buffer.from(expectedSiteId))
  )
    throw new Error(
      "Moodle return does not match this browser connection attempt",
    );
  // The optional third field is a different, more powerful mobile credential. Discard it.
  return parts[1];
}
