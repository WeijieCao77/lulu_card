export const REQUEST_RETENTION_MS = 3 * 24 * 60 * 60 * 1000
export const REQUEST_REPLY_KEEP_MS = 6 * 60 * 60 * 1000

function clampBatch(batch) {
  if (typeof batch !== 'number' || Number.isNaN(batch) || !Number.isFinite(batch)) return 500
  return Math.max(1, Math.min(1000, Math.floor(batch)))
}

export async function sweepCardRequests(sql, { now = Date.now, batch = 500 } = {}) {
  const batchSize = clampBatch(batch)
  const nowMs = now()
  const cutoff72h = new Date(nowMs - REQUEST_RETENTION_MS)
  const cutoff6h = new Date(nowMs - REQUEST_REPLY_KEEP_MS)

  // Claims, account mutations and replies commit atomically. In-flight claims are
  // invisible or locked; SKIP LOCKED leaves them alone. Expired committed nulls
  // are abandoned rows, not live claims, and may be removed after 72 hours.
  const deleted = await sql`
    delete from card_requests
    where ctid in (
      select ctid from card_requests
      where at < ${cutoff72h}
      order by at
      for update skip locked
      limit ${batchSize}
    )
    returning 1`

  const compacted = await sql`
    update card_requests
    set reply = jsonb_build_object(
      'ok', coalesce((reply->>'ok')::boolean, false),
      'trimmed', true,
      'why', reply->>'why'
    )
    where ctid in (
      select ctid from card_requests
      where at >= ${cutoff72h}
        and at < ${cutoff6h}
        and reply is not null
        and not (reply ? 'trimmed')
      order by at
      for update skip locked
      limit ${batchSize}
    )
    returning 1`

  return {
    deleted: deleted.length,
    compacted: compacted.length,
    cutoff72h: cutoff72h.toISOString(),
    cutoff6h: cutoff6h.toISOString()
  }
}
