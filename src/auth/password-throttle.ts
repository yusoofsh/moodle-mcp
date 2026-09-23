import { createHmac } from "node:crypto";
import type { AuthStore } from "./store.js";

const WINDOW = 15 * 60;
/** Persistent fixed-window budgets, reserved synchronously before any scrypt work.
 * Single-process only, matching the SQLite deployment. Successful attempts count
 * too; counters expire naturally and are not an indefinite account lockout.
 */
export function reservePasswordAttempt(
  store: AuthStore,
  secret: string,
  address: string,
): number {
  const now = Math.floor(Date.now() / 1000);
  const ipKey = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(address)
    .digest("hex");
  const budgets = [
    { key: "global", limit: 30 },
    { key: `ip:${ipKey}`, limit: 5 },
  ].map((budget) => {
    const record = store.get("PasswordThrottle", budget.key);
    const valid =
      record && typeof record.resetAt === "number" && record.resetAt > now;
    return {
      ...budget,
      count: valid ? Number(record.count) : 0,
      resetAt: valid ? Number(record.resetAt) : now + WINDOW,
    };
  });
  const retry = Math.max(
    0,
    ...budgets.filter((b) => b.count >= b.limit).map((b) => b.resetAt - now),
  );
  if (retry) return retry;
  // There are no asynchronous operations between read and write. Do not move
  // password verification into this critical section or run multiple replicas.
  for (const b of budgets)
    store.put(
      "PasswordThrottle",
      b.key,
      { count: b.count + 1, resetAt: b.resetAt },
      b.resetAt - now,
    );
  return 0;
}
