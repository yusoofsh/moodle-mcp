import { getHttpConfig, type HttpConfig } from '../auth/config.js';
import { normalizeUrl, parseMaxFileMb, type Config } from '../config.js';
import { WORKERS_PASSWORD_PREFIX } from '../auth/password.js';

export interface WorkerEnv {
  MOODLE_MCP: DurableObjectNamespace;
  PUBLIC_URL?: string;
  AUTH_SECRET?: string;
  AUTH_PASSWORD_HASH?: string;
  MOODLE_URL?: string;
  MOODLE_TOKEN?: string;
  MOODLE_MCP_MAX_FILE_MB?: string;
  ALLOW_INSECURE_HTTP?: string;
}
export function workerConfig(env: WorkerEnv): { http: HttpConfig; moodle: Config } {
  const http = getHttpConfig({
    PUBLIC_URL: env.PUBLIC_URL, AUTH_SECRET: env.AUTH_SECRET,
    AUTH_PASSWORD_HASH: env.AUTH_PASSWORD_HASH, AUTH_MODE: 'password',
    TRUST_PROXY_HOPS: '1', ALLOW_INSECURE_HTTP: env.ALLOW_INSECURE_HTTP,
  });
  if (!http.passwordHash?.startsWith(`${WORKERS_PASSWORD_PREFIX}:`))
    throw new Error('Generate a Workers hash with password:hash --workers');
  if (!env.MOODLE_URL || !env.MOODLE_TOKEN?.trim()) throw new Error('Moodle configuration is required');
  if (new URL(env.MOODLE_URL).protocol !== 'https:') throw new Error('Moodle must use HTTPS');
  const mb = parseMaxFileMb(env.MOODLE_MCP_MAX_FILE_MB ?? '2');
  const maxFileBytes = Math.floor(mb * 1024 * 1024);
  if (maxFileBytes < 1 || mb > 4) throw new Error('Workers file cap must be between 1 byte and 4 MiB');
  return { http, moodle: { baseUrl: normalizeUrl(env.MOODLE_URL), token: env.MOODLE_TOKEN.trim(), maxFileBytes } };
}
