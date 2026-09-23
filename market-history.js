export const MARKET_HISTORY_SCHEMA = `
create index if not exists listing_sold_history_idx on card_listings (card_id, closed desc, id desc) where status = 'sold';
create index if not exists offer_accepted_history_idx on card_offers (listing) include (price) where status = 'accepted';
`

const HISTORY_RECENT = 8

/**
 * Public market sold-price history: aggregate stats and recent sales for one
 * card. Immutable — reads only, never settles or mutates. No identities, no
 * hands. Cache is bounded, singleflight coalesces concurrent same-key reads.
 */
export function createMarketHistory(sql, {
  now = Date.now,
  ttlMs = 30000,
  maxEntries = 128,
} = {}) {
  const cache = new Map()
  const inflight = new Map()
  const inflightMax = Math.max(4, maxEntries)

  const keyFor = (cardId, level) => `${cardId}\u0000${level ?? ''}`

  async function queryOne(cardId, level) {
    const [all] = await sql`
      select count(*)::int as n, round(avg(o.price))::int as avg,
             percentile_cont(0.5) within group (order by o.price)::int as median,
             count(*) filter (where l.closed > now() - interval '7 days')::int as n7,
             round(avg(o.price) filter (where l.closed > now() - interval '7 days'))::int as avg7
      from card_listings l
      join card_offers o on o.listing = l.id and o.status = 'accepted'
      where l.card_id = ${cardId} and l.status = 'sold'`
    const levelStats = level == null ? null : (await sql`
      select count(*)::int as n, round(avg(o.price))::int as avg
      from card_listings l
      join card_offers o on o.listing = l.id and o.status = 'accepted'
      where l.card_id = ${cardId} and l.status = 'sold' and l.level = ${level}`)[0]
    const recentRows = await sql`
      select o.price, l.level, l.closed
      from card_listings l
      join card_offers o on o.listing = l.id and o.status = 'accepted'
      where l.card_id = ${cardId} and l.status = 'sold'
      order by l.closed desc, l.id desc
      limit ${HISTORY_RECENT}`
    return {
      ok: true,
      cardId,
      sold: all?.n ?? 0,
      avg: all?.avg ?? null,
      median: all?.median ?? null,
      week: { sold: all?.n7 ?? 0, avg: all?.avg7 ?? null },
      level: level == null ? null : { level, sold: levelStats?.n ?? 0, avg: levelStats?.avg ?? null },
      recent: recentRows.map((r) => ({ price: r.price, level: r.level, at: r.closed })),
    }
  }

  async function history(cardId, level) {
    const key = keyFor(cardId, level)
    const cached = cache.get(key)
    if (cached && (now() - cached.at) < ttlMs) return cached.data
    if (inflight.has(key)) return inflight.get(key)
    if (inflight.size >= inflightMax) return { ok: false, busy: true }
    const p = (async () => {
      try {
        const data = await queryOne(cardId, level)
        cache.set(key, { at: now(), data })
        if (cache.size > maxEntries) {
          cache.delete(cache.keys().next().value)
        }
        return data
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, p)
    return p
  }

  return {
    history,
    diagnostics: () => ({ cacheSize: cache.size, inflightSize: inflight.size }),
  }
}
