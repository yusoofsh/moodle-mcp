export const READ_SCOPE = "moodle:read";
export interface AuthProps {
  userId: string;
  scopes: string[];
}

export function canonicalOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || value !== url.origin) {
    throw new Error(
      "PUBLIC_URL must be a canonical HTTPS origin without a trailing slash",
    );
  }
  return url.origin;
}

export function isAllowedIdentity(
  props: unknown,
  owner: string,
): props is AuthProps {
  if (!/^[1-9]\d*$/.test(owner) || !props || typeof props !== "object")
    return false;
  const candidate = props as Partial<AuthProps>;
  return (
    candidate.userId === owner &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.includes(READ_SCOPE)
  );
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
export async function sha256(value: string): Promise<string> {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
}
