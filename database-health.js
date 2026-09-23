export function createDatabaseHealth(sql, { now = Date.now, ttlMs = 60000 } = {}) {
  let cache = null
  let inFlight = null

  async function collectHealth() {
    const result = {
      ok: true,
      available: [],
      unavailable: [],
      database: null,
      tables: [],
      wal: null,
      requests: null
    }

    try {
      const [db] = await sql`select pg_database_size(current_database())::bigint as size`
      result.database = { sizeBytes: Number(db.size) }
      result.available.push('database')
    } catch {
      result.database = null
      result.unavailable.push('database')
    }

    try {
      const tables = await sql`
        select relname as name,
               pg_total_relation_size(relid)::bigint as total_bytes,
               pg_relation_size(relid)::bigint as heap_bytes,
               pg_indexes_size(relid)::bigint as index_bytes,
               n_live_tup::bigint as live_rows,
               n_dead_tup::bigint as dead_rows,
               last_autovacuum,
               last_vacuum,
               autovacuum_count
        from pg_stat_user_tables
        order by pg_total_relation_size(relid) desc
        limit 200`
      result.tables = tables.map((t) => ({
        name: t.name,
        totalBytes: Number(t.total_bytes),
        heapBytes: Number(t.heap_bytes),
        indexBytes: Number(t.index_bytes),
        toastBytes: Math.max(0, Number(t.total_bytes) - Number(t.heap_bytes) - Number(t.index_bytes)),
        liveRows: t.live_rows !== null ? Number(t.live_rows) : null,
        deadRows: t.dead_rows !== null ? Number(t.dead_rows) : null,
        lastAutovacuum: t.last_autovacuum,
        lastVacuum: t.last_vacuum,
        autovacuumCount: t.autovacuum_count !== null ? Number(t.autovacuum_count) : null
      }))
      result.available.push('tables')
    } catch {
      result.tables = []
      result.unavailable.push('tables')
    }

    try {
      const [wal] = await sql`select coalesce(sum(size), 0)::bigint as total_bytes, count(*)::int as file_count from pg_ls_waldir()`
      result.wal = {
        totalBytes: Number(wal.total_bytes),
        fileCount: Number(wal.file_count)
      }
      result.available.push('wal')
    } catch {
      result.wal = null
      result.unavailable.push('wal')
    }

    try {
      const requests = await sql`
        select to_char(date_trunc('day', at at time zone 'UTC'), 'YYYY-MM-DD') as day,
               count(*)::int as count
        from card_requests
        where at >= now() - interval '3 days'
        group by 1
        order by 1`
      result.requests = requests.map((r) => ({
        day: r.day,
        count: Number(r.count)
      }))
      result.available.push('requests')
    } catch {
      result.requests = null
      result.unavailable.push('requests')
    }

    return result
  }

  return {
    async get() {
      const t = now()
      if (cache && t - cache.timestamp < ttlMs) return cache.data
      if (inFlight) return inFlight
      inFlight = collectHealth()
        .then((data) => {
          cache = { timestamp: t, data }
          return data
        })
        .finally(() => { inFlight = null })
      return inFlight
    }
  }
}
