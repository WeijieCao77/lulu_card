/**
 * Wrong admin tokens, counted per network bucket.
 *
 * The owner keeps a short admin token (2026-09-25), and no admin route was
 * rate limited, so nothing stopped a script from guessing it as fast as the
 * server answers. Every request that carries a token (header or ?token=) is
 * looked at in server.js before any route: past `max` wrong tokens inside
 * `windowMs`, that bucket is refused — right token or not — until the
 * window runs out. Players never send a token, so they never meet this.
 */
export function makeAdminGuard({ max = 10, windowMs = 10 * 60_000, now = () => Date.now() } = {}) {
  const fails = new Map()
  const live = (bucket) => {
    const rec = fails.get(bucket)
    if (rec && now() - rec.start > windowMs) { fails.delete(bucket); return null }
    return rec ?? null
  }
  return {
    locked(bucket) { return (live(bucket)?.n ?? 0) >= max },
    fail(bucket) {
      const rec = live(bucket)
      if (rec) rec.n += 1
      else fails.set(bucket, { start: now(), n: 1 })
      if (fails.size > 10_000) {
        for (const [k, v] of fails) if (now() - v.start > windowMs) fails.delete(k)
      }
    },
  }
}
