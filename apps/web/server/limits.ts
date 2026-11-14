// In-memory rate limits and a tiny TTL cache. One process serves the site, so a Map is enough;
// both reset on a deploy, which is fine for limits and for a cache.

interface Bucket {
  count: number
  reset: number
}

const buckets = new Map<string, Bucket>()

/** True when `who` may do `action` again: at most `max` times per `windowMs`. */
export function allow(who: string, action: string, max: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > 50_000) {
    for (const [key, bucket] of buckets) if (bucket.reset <= now) buckets.delete(key)
  }
  const key = `${action}:${who}`
  const bucket = buckets.get(key)
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count++
  return true
}

interface Entry {
  until: number
  value: Promise<unknown>
}

const entries = new Map<string, Entry>()

/** `load()`, remembered for `ttlMs`. Concurrent callers share one load; a failed load is not kept. */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = entries.get(key)
  if (hit && hit.until > now) return hit.value as Promise<T>
  if (entries.size > 5_000) {
    for (const [k, e] of entries) if (e.until <= now) entries.delete(k)
  }
  const value = load()
  entries.set(key, { until: now + ttlMs, value })
  value.catch(() => entries.delete(key))
  return value
}

/** Drop every cached value whose key starts with `prefix`. */
export function forget(prefix: string): void {
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key)
}
