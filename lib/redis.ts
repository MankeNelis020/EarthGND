import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await getRedis().get<T>(key);
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Non-fatal: continue without caching
  }
}

/**
 * Fixed-window rate limiter. Returns true when the request is allowed.
 * Fails open: if Redis is unavailable, the request is always allowed.
 *
 * @param key     Unique key per resource + identifier (e.g. "rl:bro:<ip>")
 * @param limit   Max requests allowed in the window
 * @param windowS Window size in seconds
 */
export async function checkRateLimit(key: string, limit: number, windowS: number): Promise<boolean> {
  try {
    const r = getRedis();
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, windowS);
    return count <= limit;
  } catch {
    return true; // fail open — never block users due to Redis being down
  }
}
