import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

export type RateLimitRule = Readonly<{ limit: number; windowMs: number }>;

type Bucket = { attempts: number[]; expiresAt: number };

/** Small process-local sliding-window limiter for public HTTP abuse controls. */
export class BoundedRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private nextPruneAt = 0;

  constructor(private readonly maxBuckets = 20_000, private readonly pruneIntervalMs = 5 * 60_000) {}

  attempt(scope: string, identity: string, rule: RateLimitRule, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    this.pruneIfDue(now);
    const safeIdentity = identity.slice(0, 128);
    const key = `${scope}:${safeIdentity}`;
    const cutoff = now - rule.windowMs;
    const existing = this.buckets.get(key);
    const attempts = existing?.attempts.filter((at) => at > cutoff) ?? [];
    if (attempts.length >= rule.limit) {
      this.buckets.set(key, { attempts, expiresAt: attempts[attempts.length - 1]! + rule.windowMs });
      return { allowed: false, retryAfterMs: Math.max(1, attempts[0]! + rule.windowMs - now) };
    }
    if (!existing && this.buckets.size >= this.maxBuckets) this.evictOldest();
    attempts.push(now);
    this.buckets.set(key, { attempts, expiresAt: attempts[attempts.length - 1]! + rule.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  clear(scope: string, identity: string): void {
    this.buckets.delete(`${scope}:${identity.slice(0, 128)}`);
  }

  prune(now = Date.now()): number {
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt > now) continue;
      this.buckets.delete(key);
      removed += 1;
    }
    this.nextPruneAt = now + this.pruneIntervalMs;
    return removed;
  }

  get size(): number { return this.buckets.size; }

  private pruneIfDue(now: number): void {
    if (now >= this.nextPruneAt) this.prune(now);
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestExpiry = Infinity;
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt >= oldestExpiry) continue;
      oldestKey = key;
      oldestExpiry = bucket.expiresAt;
    }
    if (oldestKey) this.buckets.delete(oldestKey);
  }
}

export function normalizeIp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let value = raw.trim().slice(0, 128);
  const bracketed = /^\[([^\]]+)](?::\d+)?$/.exec(value);
  if (bracketed) value = bracketed[1]!;
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(':'));
  value = value.split('%', 1)[0]!;
  if (value.toLowerCase().startsWith('::ffff:')) {
    const mapped = value.slice(7);
    if (isIP(mapped) === 4) value = mapped;
  }
  return isIP(value) ? value.toLowerCase() : undefined;
}

/** Render owns the final proxy hop, so only its runtime may supply X-Forwarded-For. */
export function trustedClientIp(request: IncomingMessage, renderRuntime = process.env.RENDER === 'true'): string {
  const socketIp = normalizeIp(request.socket.remoteAddress) ?? 'unknown';
  if (!renderRuntime) return socketIp;
  const header = request.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header.join(',') : header ?? '').slice(-1024).split(',').slice(-16);
  for (let index = forwarded.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeIp(forwarded[index]);
    if (normalized) return normalized;
  }
  return socketIp;
}
