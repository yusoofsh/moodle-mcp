from pathlib import Path
import json

# One-use migration, applied by a manually dispatched workflow and then removed.
def replace(path, before, after):
    p=Path(path); s=p.read_text()
    if before not in s: raise RuntimeError(f'Migration baseline mismatch: {path}: {before[:60]}')
    p.write_text(s.replace(before,after))

p=Path('src/auth/store.ts');s=p.read_text().replace('import { DatabaseSync } from "node:sqlite";\n','').replace('import { mkdirSync, chmodSync } from "node:fs";\n','').replace('import { dirname } from "node:path";\n','')
s=s.replace('/** Single-process SQLite store. Payloads are authenticated/encrypted at rest. */\nexport class AuthStore {\n  readonly db: DatabaseSync;', '''export type SqlValue = string | number | null;
export interface SqlDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...values: SqlValue[]): Record<string, unknown> | undefined;
    all(...values: SqlValue[]): Record<string, unknown>[];
    run(...values: SqlValue[]): { changes: number | bigint };
  };
  close(): void;
}
/** Encrypted OAuth records, shared by Node and Durable Object SQLite. */
export class SqlAuthStore {''').replace('constructor(path: string, secret: string) {','constructor(readonly db: SqlDatabase, secret: string) {')
a=s.index('    if (path !== ":memory:")');b=s.index('      CREATE TABLE IF NOT EXISTS',a)
s=s[:a]+'    this.db.exec(`\n'+s[b:]
Path('src/auth/sql-store.ts').write_text('import { Buffer } from "node:buffer";\n'+s)
p.write_text('''import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { SqlAuthStore } from "./sql-store.js";

/** Node-only construction is excluded from the Worker bundle. */
export class AuthStore extends SqlAuthStore {
  constructor(path: string, secret: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), {recursive:true, mode:0o700});
    const db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path,0o600);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    super(db,secret);
  }
}
''')
for name in ['src/auth/provider.ts','src/auth/interactions.ts','src/auth/password-throttle.ts']:
    replace(name,'import type { AuthStore } from "./store.js";','import type { SqlAuthStore as AuthStore } from "./sql-store.js";')
p=Path('src/app.ts');s=p.read_text().replace('import { AuthStore } from "./auth/store.js";','import type { SqlAuthStore } from "./auth/sql-store.js";').replace('export function createApp(','export function createAppWithStore(').replace('  config: HttpConfig,','  config: HttpConfig,\n  store: SqlAuthStore,',1).replace('    createMoodleClient?: () => Promise<MoodleClient>;','    createMoodleClient?: () => Promise<MoodleClient>;\n    backgroundCleanup?: boolean;\n    disableHttpRateLimits?: boolean;').replace('    store = new AuthStore(config.databasePath, config.authSecret),\n','')
a=s.index('  app.use(\n    rateLimit(');b=s.index('  const metadata =',a)
s=s[:a]+'  if (!dependencies.disableHttpRateLimits) {\n'+s[a:b]+'  }\n'+s[b:]
s=s.replace('const cleanup = setInterval(() => store.cleanup(), 3600000);\n  cleanup.unref();','const cleanup = dependencies.backgroundCleanup === false ? undefined : setInterval(() => store.cleanup(),3600000);\n  cleanup?.unref();').replace('      clearInterval(cleanup);','      if (cleanup) clearInterval(cleanup);').replace('version: "0.4.0"','version: "0.5.0"')
Path('src/app-core.ts').write_text(s)
p.write_text('''import { createAppWithStore } from "./app-core.js";
import { AuthStore } from "./auth/store.js";
import type { HttpConfig } from "./auth/config.js";

export function createApp(config: HttpConfig, dependencies: Parameters<typeof createAppWithStore>[2] = {}) {
  return createAppWithStore(config,new AuthStore(config.databasePath,config.authSecret),dependencies);
}
''')
p=Path('src/auth/password.ts');s=p.read_text().replace('const FORMAT = /^scrypt:131072:8:1:([a-f0-9]{32}):([a-f0-9]{64})$/;','const FORMAT = /^(scrypt:131072:8:1|scrypt:32768:8:3):([a-f0-9]{32}):([a-f0-9]{64})$/;\nexport const WORKERS_PASSWORD_PREFIX = "scrypt:32768:8:3";').replace('function derive(password: string, salt: Buffer): Promise<Buffer>','function derive(password: string, salt: Buffer, profile = PREFIX): Promise<Buffer>').replace('scrypt(input, salt, 32, OPTIONS,','scrypt(input, salt, 32, profile === WORKERS_PASSWORD_PREFIX ? { N:32768, r:8, p:3, maxmem:48*1024*1024 } : OPTIONS,').replace('hashPassword(password: string): Promise<string>','hashPassword(password: string, workers = false): Promise<string>').replace('  const key = await derive(password, salt);','  const prefix = workers ? WORKERS_PASSWORD_PREFIX : PREFIX;\n  const key = await derive(password, salt, prefix);').replace('`${PREFIX}:${salt.toString','`${prefix}:${salt.toString').replace('const [, salt, expected] = FORMAT.exec(encoded)!;','const [, prefix, salt, expected] = FORMAT.exec(encoded)!;').replace('derive(password, Buffer.from(salt, "hex"))','derive(password, Buffer.from(salt, "hex"), prefix)').replace('salt.toString("hex")','Buffer.from(salt).toString("hex")').replace('key.toString("hex")','Buffer.from(key).toString("hex")')
p.write_text('import { Buffer } from "node:buffer";\n'+s)
p=Path('src/auth/interactions.ts');p.write_text('import { Buffer } from "node:buffer";\n'+p.read_text().replace('randomBytes(32).toString("base64url")','Buffer.from(randomBytes(32)).toString("base64url")'))
p=Path('src/auth/password-cli.ts');s=p.read_text().replace('[--stdin]\\n','[--stdin] [--workers]\\n').replace('Output is an AUTH_PASSWORD_HASH line for .env.','Output is an AUTH_PASSWORD_HASH line. --workers selects a 32 MiB scrypt profile.').replace('if (args.length > 1 || (args.length === 1 && args[0] !== "--stdin"))','if (new Set(args).size !== args.length || args.some((arg) => arg !== "--stdin" && arg !== "--workers"))').replace('Only --stdin or --help is supported;','Only --stdin, --workers or --help is supported;').replace('if (!args.length && !process.stdin.isTTY)','if (!args.includes("--stdin") && !process.stdin.isTTY)').replace('args[0] === "--stdin"','args.includes("--stdin")').replace('hashPassword(password);','hashPassword(password,args.includes("--workers"));');p.write_text(s)
p=Path('src/moodle-client.ts');s=p.read_text().replace('import type { Config }','import { boundedBytes, fetchWithoutRedirect } from "./http.js";\nimport type { Config }').replace('await fetch(url,','await fetchWithoutRedirect(url,').replace('await fetch(parsed.toString(),','await fetchWithoutRedirect(parsed.toString(),').replace('      redirect: "error",\n','').replace('const text = await res.text();','const text = new TextDecoder().decode(await boundedBytes(res,64*1024));').replace('const data = (await res.json()) as T & Partial<MoodleErrorResponse>;','const data = JSON.parse(new TextDecoder().decode(await boundedBytes(res,4*1024*1024))) as T & Partial<MoodleErrorResponse>;');p.write_text(s)
replace('tests/security.test.ts','.redirect).toBe("error")','.redirect).toBe("manual")')
p=Path('src/server.ts');p.write_text(p.read_text().replace('0.4.0','0.5.0'))
p=Path('tsconfig.json');d=json.loads(p.read_text());d['compilerOptions']['types']=['node','@cloudflare/workers-types'];p.write_text(json.dumps(d,indent=2)+'\n')
p=Path('package.json');d=json.loads(p.read_text());d['version']='0.5.0';d['description']='Read-only Moodle MCP with password OAuth for Cloudflare Workers Free and OCI';d['devDependencies'].update({'wrangler':'4.137.0','@cloudflare/workers-types':'5.20260923.1','miniflare':'5.20260921.0-alpha'});d['scripts'].update({'workers:build':'wrangler deploy --dry-run --outdir .wrangler/build','workers:dev':'wrangler dev','workers:deploy':'wrangler deploy','workers:test':'node scripts/test-workers.mjs'});d['scripts']['format']='prettier --write src tests scripts package.json tsconfig.json vitest.config.ts compose.yaml README.md SECURITY.md docs/TRIAGE.md docs/REVIEW.md docs/CLOUDFLARE.md';d['scripts']['format:check']=d['scripts']['format'].replace('--write','--check');p.write_text(json.dumps(d,indent=2)+'\n')
p=Path('.gitignore');p.write_text(p.read_text()+'\n# Local Workers secrets and bundles.\n.dev.vars\n.dev.vars.*\n!.dev.vars.example\n.wrangler/\n')
p=Path('README.md');s=p.read_text();n=s.index('\n');s=s[:n+1]+'\n## Cloudflare Workers Free — 0.5.0\n\nThe password/OAuth application can now run in a SQLite-backed Durable Object without Docker or a VPS. See [the Workers deployment and migration guide](docs/CLOUDFLARE.md). All 14 read-only Moodle tools remain, subject to Moodle permissions and Worker-specific limits. Generate a compatible hash with `bun run password:hash --workers`. Container support below is retained.\n'+s[n+1:];s=s.replace('The inherited Cloudflare Worker is a separate legacy transport: it now fails closed unless an independent `MCP_ACCESS_TOKEN` of at least 32 characters is supplied. It is not the OAuth container deployment.','The Cloudflare Worker now uses password OAuth and persistent Durable Object SQLite; see docs/CLOUDFLARE.md. MCP_ACCESS_TOKEN no longer applies.');p.write_text(s)
p=Path('docs/TRIAGE.md');p.write_text(p.read_text()+'\n## Workers migration — 0.5.0\n\nSplit Node-only database construction from the encrypted adapter. Reuse Express, oidc-provider and all curated tools inside SQLite Durable Objects. Add fixed 32 MiB scrypt profile, manual redirect rejection, response bounds and persistent HTTP budgets. Keep OCI/stdio support. Live Moodle acceptance, pagination, document extraction and CIMD remain separate follow-up work.\n')
p=Path('docs/REVIEW.md');p.write_text(p.read_text()+'\n## Workers migration — 0.5.0\n\nThe final GitHub Actions run is the source of truth for the Node suite, Worker bundle, workerd OAuth/persistence tests and OCI publication. The migration uses SQLite changes() rather than Cloudflare row billing counters for replay checks, isolates heavy operations in the Durable Object, and rebuilds forwarding headers from the platform address. No live user credentials were supplied. Workerd tests mock Moodle responses, not OAuth or SQL. oidc-provider targets Node.js upstream; its compatibility warning and operational limits are documented in docs/CLOUDFLARE.md. This is a self-review, not an independent security audit.\n')
p=Path('SECURITY.md');p.write_text(p.read_text()+'\n## Workers deployment\n\nOne named SQLite Durable Object stores encrypted OAuth state and persistent rate budgets. Only the memory-bounded Workers scrypt profile is accepted. Keep the object identity and AUTH_SECRET stable. Free quotas are shared across the account and can cause unavailability; application throttles are not a guarantee against quota exhaustion. Container databases and credentials are not automatically moved or deleted. See docs/CLOUDFLARE.md.\n')
p=Path('CHANGELOG.md');p.write_text('# 0.5.0 — Cloudflare Workers Free\n\n- Add SQLite Durable Object deployment retaining password OAuth and curated tools.\n- Add Workers-compatible hashing, bounded HTTP and workerd integration tests.\n- Preserve OCI and stdio deployment. No automatic container database migration.\n\n'+p.read_text())
print('Workers source migration applied')
