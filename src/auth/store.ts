import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { SqlAuthStore } from "./sql-store.js";

/** Node-only construction is excluded from the Worker bundle. */
export class AuthStore extends SqlAuthStore {
  constructor(path: string, secret: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    super(db, secret);
  }
}
