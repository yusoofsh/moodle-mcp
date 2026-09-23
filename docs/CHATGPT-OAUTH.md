# ChatGPT OAuth deployment

This fork is a **single-owner, read-only** remote MCP server. It does not install anything in Moodle and does not make Moodle an OAuth provider.

```text
ChatGPT -- OAuth access token --> HTTPS Worker /mcp
               |                      |
        GitHub owner login       Moodle WS token
        + explicit consent            |
                                      v
                              Moodle REST / files
```

The Moodle token stays in the Worker secret store. GitHub's access token is used only to identify the owner during sign-in and is not persisted. MCP access/refresh tokens are issued by `@cloudflare/workers-oauth-provider`, independently of both upstream credentials.

## Prerequisites

Use Bun 1.4.2 and Node.js 22 or newer, a Cloudflare account, a GitHub OAuth application, and your legitimately issued Moodle web-service token. The Moodle site must support the functions your account needs. This release supports Moodle installed at the domain root; subdirectory installations are not supported yet. Use the final HTTPS Moodle origin, not a redirecting hostname.

The configuration examples cannot be deployed unchanged: their domain, KV identifier, and credentials are placeholders. Nothing in CI deploys to Cloudflare.

## Configure the Worker

```bash
bun install --frozen-lockfile
bun run check
bun run bundle:check
bunx wrangler kv namespace create OAUTH_KV
```

Put the returned namespace ID in `wrangler.toml`. Set `PUBLIC_URL` to the **exact canonical HTTPS origin**, without a trailing slash, path, query, or fragment. For example, `https://moodle-mcp.example.com`. The Worker, OAuth issuer, GitHub callback, and ChatGPT endpoint must use the same origin. Alternate hostnames are rejected.

`GITHUB_ALLOWED_USER_ID` is the owner's immutable numeric GitHub ID, not their username. This fork's example uses `18055365`; a different operator must replace it. Ownership is rechecked on every MCP call, not just during sign-in. This is not a multi-user deployment: all permitted calls use the one configured Moodle account.

Keep both compatibility flags:

```toml
compatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]
```

The public-fetch flag is required for Cloudflare's CIMD SSRF protection. Do not disable it to reach a private Moodle host. Use a separate reviewed architecture for private-network Moodle.

## Configure GitHub identity

Register a GitHub **OAuth app** for this deployment. Its authorization callback URL must be:

```text
https://YOUR-CANONICAL-HOST/github/callback
```

Set the app's homepage to the canonical origin. The sign-in requests `read:user`; it does not request repository access. Use the dedicated app's client ID and secret, not a personal access token. GitHub's authorization-code flow also uses S256 PKCE in this implementation.

Store production configuration with secret prompts:

```bash
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET
bunx wrangler secret put MOODLE_URL
bunx wrangler secret put MOODLE_TOKEN
```

Do not place credentials in Git, URLs, tool arguments, screenshots, or `wrangler.toml`. `.dev.vars.example` is only a local example; `.dev.vars` and environment files are ignored. No Moodle username/password is required for the hosted Worker.

Before public deployment, add Cloudflare rate-limit rules for `/authorize`, `/github/callback`, `/consent`, `/oauth/register`, `/oauth/token`, and `/mcp`. Dynamic registration is intentionally public so compatible MCP clients can register; registration alone does not grant Moodle access. Choose limits appropriate to your personal usage and Cloudflare plan. This PR does not create those rules.

After configuring the canonical hostname and secrets, deploy explicitly:

```bash
bun run deploy
```

## Connect ChatGPT

Add a custom remote MCP app/connector in ChatGPT, using Developer mode where required by your account or workspace. Choose OAuth and use:

```text
https://YOUR-CANONICAL-HOST/mcp
```

The provider exposes dynamic client registration and CIMD. For dynamic registration, a pre-created MCP client ID/secret is not needed; do not paste the **GitHub OAuth app secret** into ChatGPT. If your client requires pre-registered confidential credentials instead, stop and configure that client separately; this guide covers dynamic registration.

Sign in to GitHub as the allowed owner, inspect the requesting client and redirect address on the consent page, and choose **Allow read-only access**. Other GitHub users are rejected. Deny issues no grant.

Discovery endpoints:

| Endpoint                                    | Purpose                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `/.well-known/oauth-protected-resource/mcp` | Canonical MCP resource and authorization-server discovery         |
| `/.well-known/oauth-authorization-server`   | S256, authorization, token, revocation, and registration metadata |
| `/authorize`                                | Start owner authentication and consent                            |
| `/github/callback`                          | GitHub identity callback                                          |
| `/consent`                                  | Same-origin, cookie-bound POST consent                            |
| `/oauth/register`                           | Dynamic MCP client registration                                   |
| `/oauth/token`                              | Code exchange, refresh, and RFC 7009 revocation                   |
| `/mcp`                                      | OAuth-protected Streamable HTTP, POST only                        |
| `/health`                                   | Non-sensitive configured-service health indicator                 |

The stateless transport returns JSON responses. GET/SSE and DELETE on `/mcp` are deliberately unsupported after authentication. Local stdio remains separate and uses process environment credentials; it does not expose an HTTP listener.

## Verify before relying on it

1. An unauthenticated POST to `/mcp` must return `401` with a `WWW-Authenticate` resource metadata challenge. A Moodle token or GitHub token used as the MCP bearer must also fail.
2. Discovery must identify the configured canonical origin and advertise S256. Missing PKCE, wrong redirect URIs, and another resource must fail authorization.
3. Complete owner login, explicitly deny once, then allow. Check `moodle_get_site_info`, `moodle_list_courses`, a permitted small file, and a denied/expired file ID. Confirm no upstream token appears in tool output.
4. Verify refresh and revocation with the real client. A changed owner setting must block existing tokens for the previous owner. Check all required Moodle functions against your university account.

## Limits and revocation

Only `moodle:read` is granted. Access tokens live for one hour, refresh tokens for 30 days, and dynamically registered clients for 90 days. Interactive login/consent records expire after 10 minutes. Refresh-token rotation and token/code handling are delegated to the pinned OAuth provider; this application does not implement its own token cryptography.

Revocation uses the endpoint advertised by discovery (`/oauth/token`), with the client's authentication plus `token` and optional `token_type_hint`, as supported by the provider. Revoking a refresh token revokes its grant. Do not assume disconnecting a ChatGPT UI entry necessarily revokes every credential. For an urgent containment action, disable the Worker and rotate the Moodle credential.

Cloudflare KV is eventually consistent. Interactive state uses browser-bound random nonces, expiry, and deletion, **not an atomic distributed one-use transaction**. Sequential replay is tested; strict cross-region replay exclusion and immediate globally consistent revocation are not guaranteed. A multi-user or higher-assurance service needs a separately reviewed consistent state store and lifecycle design.

The server caps request bodies, bounds file downloads while streaming, disallows credential-bearing download redirects, and sets upstream timeouts. It does not parse PDFs/DOCX into text or guarantee that ChatGPT can display every embedded binary. Large binary MCP responses may exceed client limits even below the default 25 MiB file cap; lower that cap where needed.

Automated tests use the real OAuth package and MCP SDK, but mock GitHub, Moodle, KV, and the Workers entrypoint base class. They do **not** verify real browser login, production KV propagation, Cloudflare CIMD fetch protection, university permissions, or ChatGPT end-to-end compatibility. A Wrangler dry-run validates bundling, not production deployment.

## References

- [OpenAI MCP authentication](https://developers.openai.com/apps-sdk/build/auth/)
- [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider)
- [GitHub OAuth authorization and PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
