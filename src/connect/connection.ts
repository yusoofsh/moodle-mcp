import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import type { SqlAuthStore } from "../auth/sql-store.js";
import type { Config } from "../config.js";
import { MoodleClient } from "../moodle-client.js";
import { boundedBytes, fetchWithoutRedirect } from "../http.js";
import {
  buildMobileLaunch,
  mobileSiteId,
  parseMobileReturn,
  type MobilePublicConfig,
} from "./protocol.js";

const random = () => Buffer.from(randomBytes(32)).toString("base64url");
export const NOT_CONNECTED =
  "Moodle is not connected. Open /connect/moodle on this MCP server and connect your university account.";
export type MoodleFactory = (config: Config) => Promise<MoodleClient>;
interface ConnectionRecord {
  mode: "sso" | "disabled" | "fallback";
  revision: string;
  token?: string;
  userId?: number;
  fullname?: string;
  siteName?: string;
  verifiedAt?: number;
}
export class MoodleConnection {
  private cached?: { revision: string; pending: Promise<MoodleClient> };
  private failed = false;
  constructor(
    readonly store: SqlAuthStore,
    readonly config: Config,
    private readonly factory: MoodleFactory = (c) => MoodleClient.create(c),
  ) {}
  private record(): ConnectionRecord | undefined {
    return this.store.get(
      "MoodleConnection",
      this.config.baseUrl,
    ) as unknown as ConnectionRecord | undefined;
  }
  private revision(): string {
    return this.record()?.revision ?? "initial";
  }
  state() {
    const r = this.record();
    return {
      site: this.config.baseUrl,
      status: this.failed
        ? "reconnect-required"
        : r?.mode === "sso"
          ? "connected"
          : r?.mode === "disabled"
            ? "disconnected"
            : this.config.token ||
                (this.config.username && this.config.password)
              ? "configured-token"
              : "disconnected",
      userId: r?.userId,
      fullname: r?.fullname,
      siteName: r?.siteName,
      verifiedAt: r?.verifiedAt,
      hasFallback: Boolean(
        this.config.token || (this.config.username && this.config.password),
      ),
    };
  }
  async publicConfig(): Promise<MobilePublicConfig> {
    const response = await fetchWithoutRedirect(
      this.config.baseUrl +
        "/lib/ajax/service.php?info=tool_mobile_get_public_config",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { index: 0, methodname: "tool_mobile_get_public_config", args: {} },
        ]),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error("Could not read Moodle mobile configuration");
    const result: unknown = JSON.parse(
      new TextDecoder().decode(await boundedBytes(response, 128 * 1024)),
    );
    if (
      !Array.isArray(result) ||
      result.length !== 1 ||
      result[0]?.error !== false ||
      !result[0]?.data
    )
      throw new Error("Could not read Moodle mobile configuration");
    return result[0].data;
  }
  begin(
    session: string,
    principal: string,
    publicConfig: MobilePublicConfig,
  ): string {
    const passport = random();
    const launch = buildMobileLaunch(
      this.config.baseUrl,
      passport,
      publicConfig,
    );
    const generation = random();
    this.cancel(session);
    this.store.put(
      "MoodlePairGeneration",
      session,
      { generation, principal },
      600,
    );
    this.store.put(
      "MoodlePair",
      session,
      {
        generation,
        principal,
        site: this.config.baseUrl,
        expected: mobileSiteId(this.config.baseUrl, passport),
        launch,
        expiresAt: Date.now() + 600000,
        revision: this.revision(),
      },
      600,
    );
    return launch;
  }
  /** Read-only recovery of this browser's live pairing, never a new passport. */
  pendingReturn(
    session: string,
    principal: string,
  ): {
    launchUrl: string;
    finishUrl: string;
    expiresAt: number;
  } | null {
    const pairing = this.store.get("MoodlePair", session);
    if (
      !pairing ||
      pairing.principal !== principal ||
      pairing.site !== this.config.baseUrl ||
      pairing.revision !== this.revision() ||
      typeof pairing.launch !== "string" ||
      typeof pairing.expiresAt !== "number" ||
      pairing.expiresAt <= Date.now() ||
      this.store.get("MoodlePairGeneration", session)?.generation !==
        pairing.generation
    )
      return null;
    const finish = new URL(pairing.launch);
    if (
      finish.origin !== new URL(this.config.baseUrl).origin ||
      finish.pathname !==
        new URL(this.config.baseUrl + "/admin/tool/mobile/launch.php").pathname
    )
      return null;
    // Reuse the university browser session rather than looping through Google.
    finish.searchParams.delete("oauthsso");
    finish.searchParams.set("confirmed", "1");
    return {
      launchUrl: pairing.launch,
      finishUrl: finish.href,
      expiresAt: pairing.expiresAt,
    };
  }
  cancel(session: string): void {
    this.store.take("MoodlePair", session);
    this.store.take("MoodleCandidate", session);
    this.store.take("MoodlePairGeneration", session);
  }
  async stage(session: string, principal: string, raw: unknown) {
    const pairing = this.store.take("MoodlePair", session);
    if (
      !pairing ||
      pairing.principal !== principal ||
      pairing.site !== this.config.baseUrl
    )
      throw new Error(
        "Pairing expired or belongs to another browser; restart connection",
      );
    const token = parseMobileReturn(raw, String(pairing.expected));
    let client: MoodleClient;
    try {
      client = await this.factory({
        baseUrl: this.config.baseUrl,
        maxFileBytes: this.config.maxFileBytes,
        token,
      });
    } catch {
      throw new Error("Could not validate the Moodle connection");
    }
    if (!Number.isSafeInteger(client.userId) || client.userId <= 0)
      throw new Error("Moodle returned an invalid account");
    if (
      this.store.get("MoodlePairGeneration", session)?.generation !==
      pairing.generation
    )
      throw new Error("Pairing superseded or cancelled");
    if (pairing.revision !== this.revision())
      throw new Error("Connection changed; restart connection");
    const pin = this.record()?.userId;
    if (pin && pin !== client.userId)
      throw new Error(
        "A different Moodle account cannot replace the pinned account",
      );
    const confirmation = random();
    const info = {
      userId: client.userId,
      fullname: String(client.profile?.fullname ?? "").slice(0, 200),
      siteName: String(client.siteName ?? "").slice(0, 200),
    };
    this.store.put(
      "MoodleCandidate",
      session,
      {
        generation: pairing.generation,
        principal,
        site: this.config.baseUrl,
        revision: pairing.revision,
        confirmation,
        token,
        ...info,
      },
      300,
    );
    return { confirmation, ...info };
  }
  confirm(session: string, principal: string, confirmation: unknown): void {
    const c = this.store.take("MoodleCandidate", session);
    if (
      !c ||
      c.principal !== principal ||
      c.site !== this.config.baseUrl ||
      c.confirmation !== confirmation
    )
      throw new Error("Confirmation expired or invalid; reconnect Moodle");
    if (
      this.store.get("MoodlePairGeneration", session)?.generation !==
      c.generation
    )
      throw new Error("Pairing superseded or cancelled");
    if (c.revision !== this.revision())
      throw new Error("Connection changed; restart connection");
    const pin = this.record()?.userId;
    if (pin && pin !== c.userId)
      throw new Error(
        "A different Moodle account cannot replace the pinned account",
      );
    this.store.take("MoodlePairGeneration", session);
    this.store.put("MoodleConnection", this.config.baseUrl, {
      mode: "sso",
      revision: random(),
      token: c.token,
      userId: c.userId,
      fullname: c.fullname,
      siteName: c.siteName,
      verifiedAt: Date.now(),
    });
    this.cached = undefined;
    this.failed = false;
  }
  disconnect(): void {
    const old = this.record();
    // A tombstone suppresses the old environment fallback. Do not revoke a token
    // at Moodle: it may also be used by the official mobile application.
    this.store.put("MoodleConnection", this.config.baseUrl, {
      mode: "disabled",
      revision: random(),
      userId: old?.userId,
    });
    this.cached = undefined;
    this.failed = false;
  }
  useFallback(): void {
    if (!this.config.token && !(this.config.username && this.config.password))
      throw new Error("No configured credential fallback");
    this.store.put("MoodleConnection", this.config.baseUrl, {
      mode: "fallback",
      revision: random(),
      userId: this.record()?.userId,
    });
    this.cached = undefined;
    this.failed = false;
  }
  async check(): Promise<ReturnType<MoodleConnection["state"]>> {
    this.cached = undefined;
    await this.getClient();
    return this.state();
  }
  async getClient(): Promise<MoodleClient> {
    const r = this.record(),
      revision = this.revision();
    if (
      r?.mode === "disabled" ||
      (r?.mode !== "sso" &&
        !this.config.token &&
        !(this.config.username && this.config.password))
    )
      throw new Error(NOT_CONNECTED);
    if (!this.cached || this.cached.revision !== revision) {
      const config =
        r?.mode === "sso"
          ? {
              baseUrl: this.config.baseUrl,
              maxFileBytes: this.config.maxFileBytes,
              token: r.token,
            }
          : this.config;
      const pending = Promise.resolve()
        .then(() => this.factory(config))
        .then((client) => {
          if (this.revision() !== revision)
            throw new Error("Connection changed; retry the tool");
          if (r?.userId && client.userId !== r.userId)
            throw new Error(
              "Configured token belongs to another Moodle account",
            );
          this.failed = false;
          return client;
        })
        .catch((error) => {
          if (this.cached?.pending === pending) {
            this.cached = undefined;
            this.failed = true;
          }
          throw error;
        });
      this.cached = { revision, pending };
    }
    return this.cached.pending;
  }
}
