# Security model

This is a **single-owner read-only bridge**, not a public multi-tenant Moodle service. The allowlisted GitHub owner authorizes MCP clients to use one Moodle account configured on the server.

## Deployment requirements

- Use HTTPS on the entire public origin. Keep the application's upstream port on loopback or a private, firewall-restricted network reachable only by your trusted reverse proxy.
- Set `TRUST_PROXY_HOPS` to the actual bounded proxy count. Strip untrusted forwarding headers at the edge; do not deploy behind an arbitrary public HTTP forwarder.
- Generate `AUTH_SECRET` using a cryptographically secure generator. Keep `.env` readable only by its operator, outside Git and image layers.
- Retain both the secret and the persistent `/data` volume across restarts. Encrypted database backups require the same secret; protect and back up them separately.
- Use your own least-privileged Moodle web-service token. Do not use a Moodle administrator token for student access. The server's read-only tools do not reduce the upstream token's privileges elsewhere.
- Run one application replica. The SQLite adapter and in-process rate limits are not a distributed deployment design.
- Approve only known MCP clients. Dynamic registration is public by design; registration alone does not authorize Moodle access. Inspect the client ID and exact redirect URI on the consent screen.

## Boundaries

The provider enforces authorization-code and PKCE flows. The HTTP resource validates token ownership, expiry, scope, audience and its live grant. Invalid requests cannot initialize a Moodle API client. Refresh tokens rotate and replay revokes the related grant credentials. Standard token revocation is available at `/oauth/revoke`.

Moodle file requests accept only configured-origin pluginfile paths, reject redirects and enforce time/size bounds while streaming. Opaque file references are account-bound and expire. Both MCP tools and resource reads recheck visibility before download. This does not bypass Moodle enrollment or activity permissions.

Course content is untrusted input. Its text must not be treated as instructions to change credentials, visit arbitrary URLs or disclose secrets. No Moodle credential should be returned to the MCP client.

## Operations and limitations

`/healthz` is a process-liveness check, not proof that Moodle credentials work. Raw request bodies, access tokens and provider errors must not be logged by reverse proxies or observability agents. Rate limiting is an abuse mitigation, not a replacement for authentication.

On suspected compromise, revoke the relevant OAuth credentials and rotate the Moodle token as appropriate. Stopping the service, replacing the authentication secret and reinitializing its auth database invalidates all MCP client sessions but requires reauthorization; do not erase persistent data during routine updates. Back up first when recovery is intended.

Report suspected vulnerabilities privately to the repository owner rather than publishing credentials or exploit data in public issues. A successful test suite or dependency audit is not an independent security assessment.
