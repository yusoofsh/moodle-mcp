import { DatabaseSync } from "node:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { errors, type Adapter, type AdapterPayload } from "oidc-provider";

/** Single-process SQLite store. Payloads are authenticated/encrypted at rest. */
export class AuthStore {
  readonly db: DatabaseSync;
  private readonly key: Buffer;
  constructor(path: string, secret: string) {
    this.key = Buffer.from(secret, "hex");
    if (this.key.length !== 32)
      throw new Error("Invalid authentication storage key");
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS oauth (model TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
        expires INTEGER, consumed INTEGER, grant_id TEXT, uid TEXT, user_code TEXT, PRIMARY KEY(model,id));
      CREATE INDEX IF NOT EXISTS oauth_grant ON oauth(grant_id);
      CREATE INDEX IF NOT EXISTS oauth_uid ON oauth(model,uid);
      CREATE INDEX IF NOT EXISTS oauth_expiry ON oauth(expires);`);
  }
  hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
  private seal(model: string, id: string, payload: AdapterPayload): string {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`${model}:${id}`));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    );
  }
  private open(
    row: Record<string, unknown> | undefined,
  ): AdapterPayload | undefined {
    if (
      !row ||
      (typeof row.expires === "number" &&
        row.expires <= Math.floor(Date.now() / 1000))
    )
      return undefined;
    const data = Buffer.from(String(row.payload), "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      data.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(`${row.model}:${row.id}`));
    decipher.setAuthTag(data.subarray(12, 28));
    const payload = JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as AdapterPayload;
    if (row.consumed) payload.consumed = row.consumed;
    return payload;
  }
  put(
    model: string,
    rawId: string,
    payload: AdapterPayload,
    expiresIn?: number,
  ): void {
    const id = this.hash(rawId),
      expires =
        expiresIn === undefined
          ? null
          : Math.floor(Date.now() / 1000) + expiresIn;
    this.db
      .prepare(
        `INSERT INTO oauth(model,id,payload,expires,consumed,grant_id,uid,user_code) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(model,id) DO UPDATE SET payload=excluded.payload,expires=excluded.expires,consumed=excluded.consumed,grant_id=excluded.grant_id,uid=excluded.uid,user_code=excluded.user_code`,
      )
      .run(
        model,
        id,
        this.seal(model, id, payload),
        expires,
        payload.consumed || null,
        payload.grantId ? this.hash(payload.grantId) : null,
        payload.uid ? this.hash(payload.uid) : null,
        payload.userCode ? this.hash(payload.userCode) : null,
      );
  }
  get(model: string, id: string): AdapterPayload | undefined {
    return this.open(
      this.db
        .prepare("SELECT * FROM oauth WHERE model=? AND id=?")
        .get(model, this.hash(id)),
    );
  }
  take(model: string, id: string): AdapterPayload | undefined {
    return this.open(
      this.db
        .prepare("DELETE FROM oauth WHERE model=? AND id=? RETURNING *")
        .get(model, this.hash(id)),
    );
  }
  cleanup(): void {
    this.db
      .prepare("DELETE FROM oauth WHERE expires IS NOT NULL AND expires <= ?")
      .run(Math.floor(Date.now() / 1000));
  }
  close(): void {
    this.db.close();
  }
  adapter = (model: string): Adapter => ({
    upsert: async (id, payload, expiresIn) => {
      this.put(model, id, payload, expiresIn);
    },
    find: async (id) => this.get(model, id),
    findByUid: async (uid) =>
      this.open(
        this.db
          .prepare("SELECT * FROM oauth WHERE model=? AND uid=?")
          .get(model, this.hash(uid)),
      ),
    findByUserCode: async (code) =>
      this.open(
        this.db
          .prepare("SELECT * FROM oauth WHERE model=? AND user_code=?")
          .get(model, this.hash(code)),
      ),
    destroy: async (id) => {
      this.db
        .prepare("DELETE FROM oauth WHERE model=? AND id=?")
        .run(model, this.hash(id));
    },
    consume: async (id) => {
      const result = this.db
        .prepare(
          "UPDATE oauth SET consumed=? WHERE model=? AND id=? AND consumed IS NULL",
        )
        .run(Math.floor(Date.now() / 1000), model, this.hash(id));
      if (result.changes !== 1) {
        const item = this.get(model, id);
        if (item?.grantId)
          this.db
            .prepare("DELETE FROM oauth WHERE grant_id=? OR (model=? AND id=?)")
            .run(this.hash(item.grantId), "Grant", this.hash(item.grantId));
        throw new errors.InvalidGrant("Credential already consumed");
      }
    },
    revokeByGrantId: async (grantId) => {
      this.db
        .prepare("DELETE FROM oauth WHERE grant_id=?")
        .run(this.hash(grantId));
    },
  });
}
