import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { SqlAuthStore } from '../auth/sql-store.js';

/** Synchronous reservations do not interleave inside one Durable Object. */
export function reserveHttpRequest(store: SqlAuthStore, secret: string, address: string, path: string): number {
  const now = Math.floor(Date.now() / 1000);
  const ip = createHmac('sha256', Buffer.from(secret, 'hex')).update(address).digest('hex');
  const budgets = [{key:'all',window:60,limit:240}, {key:`ip:${ip}`,window:60,limit:120}];
  if (path === '/oauth/register') budgets.push({key:'registration',window:3600,limit:50},{key:`registration:${ip}`,window:3600,limit:20});
  if (path.startsWith('/interaction')) budgets.push({key:`interaction:${ip}`,window:60,limit:30});
  const counters = budgets.map(b => {
    const old = store.get('HttpBudget', b.key);
    const valid = old && typeof old.resetAt === 'number' && old.resetAt > now;
    return {...b, count:valid ? Number(old.count) : 0, resetAt:valid ? Number(old.resetAt) : now+b.window};
  });
  const retry = Math.max(0,...counters.filter(b=>b.count>=b.limit).map(b=>b.resetAt-now));
  if (retry) return retry;
  for (const b of counters) store.put('HttpBudget',b.key,{count:b.count+1,resetAt:b.resetAt},b.resetAt-now);
  return 0;
}
