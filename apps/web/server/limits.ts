// In-memory rate limits and a tiny TTL cache. One process serves the site, so a Map is enough;
// both reset on a deploy, which is fine for limits and for a cache.

interface Bucket {
  count: number
  reset: number
}

const buckets = new Map<string, Bucket>()

/** True when `who` may do `action` again: at most `max` times per `windowMs`. */
export function allow(
  who: string,
  action: string,
  max: number,
  windowMs: number,
  now = Date.now()
): boolean {
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

/** A small in-memory cache of promises, typed by what it holds. */
export interface Cache<T> {
  entries: Map<string, { until: number; value: Promise<T> }>
}

export function makeCache<T>(): Cache<T> {
  return { entries: new Map() }
}

/** `load()`, remembered for `ttlMs`. Concurrent callers share one load; a failed load is not kept. */
export function cached<T>(
  cache: Cache<T>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const { entries } = cache
  const now = Date.now()
  const hit = entries.get(key)
  if (hit && hit.until > now) return hit.value
  if (entries.size > 5_000) {
    for (const [k, e] of entries) if (e.until <= now) entries.delete(k)
  }
  const value = load()
  entries.set(key, { until: now + ttlMs, value })
  value.catch(() => entries.delete(key))
  return value
}
