# Cloudflare Workers Free deployment

Version 0.5.0 retains the TypeScript MCP SDK, Express, oidc-provider, password login and 14 read-only Moodle tools. The Node-only SQLite connection is replaced with a SQLite-backed Durable Object. This is a Worker deployment, not a container running in Workers. No VPS, Docker, KV, D1 or paid plan upgrade is required by this design.

```text
ChatGPT -- HTTPS/OAuth + PKCE --> Worker routing layer
                                   |
                            one MoodleMcp Durable Object
                            | password + separate consent
                            | encrypted durable SQLite
                            | existing MCP tools
                                   |
                            Moodle HTTPS Web Services
```

The outer Worker only validates and forwards requests. CPU-heavy hashing, OAuth, SQL, MCP and Moodle work runs inside the Durable Object, whose CPU limits differ from the Free Worker's 10 ms allowance. SQLite-backed Durable Objects are available on Free; `new_sqlite_classes` is intentional.

## Deploy

Use Node.js 24 and Bun 1.4.2 for local commands. Confirm your account has a workers.dev subdomain. The repository defaults to `https://moodle-mcp.yusoofsh.workers.dev`; change `PUBLIC_URL` in `wrangler.toml` for another account or custom domain. It must be the exact HTTPS origin without `/mcp` or a trailing slash.

```bash
git clone https://github.com/yusoofsh/moodle-mcp.git
cd moodle-mcp
bun install --frozen-lockfile --ignore-scripts
bun run build
bunx --no-install wrangler login
bun run workers:deploy
```

The first deploy provisions the durable binding. Until secrets are configured, requests intentionally return 503 rather than exposing Moodle.

Generate a compatible password hash:

```bash
bun run password:hash --workers
```

Enter a unique passphrase of at least 15 characters at the hidden prompt. It prints `AUTH_PASSWORD_HASH=scrypt:32768:8:3:...`. Paste only the value after `=` into the secret prompt below. This is the bridge password, not your Moodle password. Never put plaintext passwords into command-line arguments, Git or chat.

```bash
bunx --no-install wrangler secret put AUTH_PASSWORD_HASH
openssl rand -hex 32
bunx --no-install wrangler secret put AUTH_SECRET
bunx --no-install wrangler secret put MOODLE_URL
bunx --no-install wrangler secret put MOODLE_TOKEN
```

Enter the generated 64 hexadecimal characters for AUTH_SECRET. Set MOODLE_URL to the actual HTTPS installation URL, including a subdirectory when present. Set MOODLE_TOKEN to your permitted Moodle mobile/web-service token. No GitHub OAuth App credentials are needed.

The Worker rejects the container profile `scrypt:131072:8:1` because its roughly 128 MiB working memory leaves no application headroom. The `--workers` helper uses the OWASP-listed fixed profile `N=32768, r=8, p=3`, roughly 32 MiB. Container deployments continue accepting their existing profile and also accept the new one.

## Validate and connect

```bash
curl -i https://moodle-mcp.yusoofsh.workers.dev/healthz
curl -i https://moodle-mcp.yusoofsh.workers.dev/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://moodle-mcp.yusoofsh.workers.dev/mcp
```

After configuration, health and discovery should return 200; the unauthenticated MCP request should return 401 with WWW-Authenticate metadata. Health is process liveness, not proof that Moodle credentials work. Configure ChatGPT with OAuth and the public `/mcp` URL. Enter the local owner password on your server's page and review the separate consent screen.

DCR, PKCE S256, expiry, refresh rotation/replay detection, and revocation retain the existing provider behavior. This migration does not add CIMD or Moodle writes. Actual Moodle calls and a real ChatGPT authorization remain deployment acceptance checks.

## Tool discovery and upstream failures

After OAuth, `initialize`, `notifications/initialized`, `tools/list`, `prompts/list`,
and `resources/templates/list` do not require a Moodle network call. The remote
catalog contains all 14 implemented read-only tools. Actual tool calls and resource
reads still require the configured token's Moodle capabilities and permissions.

If Moodle is unreachable or rejects the token, tool execution returns a bounded
MCP error instead of failing the discovery handshake with HTTP 500. The next
invocation retries a failed initial connection. `moodle_get_site_info` is the first
diagnostic to run; metadata discovery alone is not proof that Moodle is accessible.
Refresh or reconnect an existing MCP client to replace any cached tool list.
Password, OAuth scopes, secrets, Durable Object identity and storage remain unchanged.

See [discovery regression evidence](DISCOVERY-VALIDATION.md) for the comparison
with `rahilp/second-brain-cloudflare` and the tested compatibility matrix.

## Persistence and upgrades

OAuth records, signing keys and throttling counters live in one named object, `idFromName('owner')`. Keep the Worker name, class, binding, migration history and AUTH_SECRET stable. Existing Docker SQLite files and OAuth credentials are not automatically imported. A different public origin is a different OAuth resource; reconnect clients. Do not delete the old container data as part of migration.

Regenerating a password hash changes the internal owner identity and requires reauthorization. Replacing AUTH_SECRET without migrating the encrypted database makes old records unreadable. Keep backups and do not rotate it during routine upgrades.

Workers supports password login only. GitHub sign-in remains an optional container mode. The old static-token Worker has been replaced; MCP_ACCESS_TOKEN does not authorize the new Worker.

## Bounds and the Free plan

Free is quota-limited, not unlimited hosting. As checked on 2026-09-23, Workers Free includes 100,000 requests/day and 128 MB memory. SQLite Durable Objects Free includes 100,000 requests/day, 13,000 GB-s/day, 5 million row reads/day, 100,000 row writes/day and 5 GB total storage. Quotas are shared across applications in the account. Exceeding Free limits causes failures; this repository does not enable paid billing. An account already on Paid follows its existing plan.

| Boundary                           | Application limit                          |
| ---------------------------------- | ------------------------------------------ |
| Simultaneous owner-object requests | 2                                          |
| Simultaneous password verification | 1                                          |
| MCP request body                   | 128 KiB                                    |
| Other request body                 | 16 KiB; login has an additional parser cap |
| Moodle JSON response               | 4 MiB                                      |
| File download                      | 2 MiB default, configurable up to 4 MiB    |
| Final HTTP result                  | 6 MiB                                      |
| Request budget                     | 240/minute total, 120/minute per address   |
| Client registration                | 50/hour total, 20/hour per address         |
| Password attempts                  | 5/address and 30 total per 15 minutes      |

Budgets persist across eviction. They can temporarily block legitimate sign-in during an attack and do not guarantee remaining platform quota. Large accounts or files can exceed the caps and are rejected, not silently reported as complete. Existing Moodle pagination and document-extraction limitations remain.

No repeating cleanup timer is started inside the object. Cleanup is request-driven. Manual outbound redirects are explicitly rejected before credentials can be forwarded.

## Tests and CI

```bash
bun run check
bun run test
bun run build
bun run workers:build
bun run workers:test
```

The Workers suite executes the actual bundled application in workerd through Miniflare. It tests password authorization, explicit consent, PKCE, MCP initialization and tool calls, a real process restart against persisted SQLite, token replay, throttling, password rotation and missing-secret rejection. Moodle network responses are mocked; OAuth and durable SQL are not mocked.

Upstream oidc-provider officially targets Node.js and emits an unsupported-runtime warning under Cloudflare compatibility. Workerd tests are our compatibility evidence, not an upstream support guarantee or independent audit. Keep versions locked and rerun tests on upgrades. Local workerd tests do not prove production CPU accounting or university API compatibility.

The OCI workflow also runs Workers tests before publication. The separate manually triggered Deploy Cloudflare Worker workflow needs Actions secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Runtime password/Moodle secrets are configured separately in Cloudflare. CLI deployment is sufficient; GitHub Actions is optional. Neither workflow purchases a plan.

## References

- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
