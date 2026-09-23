import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  OAUTH_KV: KVNamespace;
  /** Injected by OAuthProvider; not a deploy-time secret. */
  OAUTH_PROVIDER: OAuthHelpers;
  PUBLIC_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_ALLOWED_USER_ID: string;
  MOODLE_URL: string;
  MOODLE_TOKEN: string;
  MOODLE_MCP_MAX_FILE_MB?: string;
}
