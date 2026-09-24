/** CSP only permits the callback origin already registered to this OAuth client. */
export function consentCallbackOrigin(
  redirect: unknown,
  registered: readonly string[] | undefined,
): string {
  if (typeof redirect !== "string" || !registered?.includes(redirect))
    throw new Error("Unregistered consent callback");
  const url = new URL(redirect);
  // Never interpolate a CSP wildcard, delimiter, opaque scheme, or credential.
  if (
    url.username ||
    url.password ||
    url.hash ||
    !/^https?:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:.]+\])(?::\d+)?$/i.test(url.origin)
  )
    throw new Error("Unsupported consent callback origin");
  return url.origin;
}
