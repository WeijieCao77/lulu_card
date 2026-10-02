/**
 * 胜率表: how often the side with the higher 阵容分 wins, counted from real
 * matches — never simulated.
 *
 * Two sources. The 全服杯 already keeps every match with both fives' 阵容分
 * (open_cup_entries.score), so its history is read as it is, for the cups
 * played on the current score curve. The 天梯 kept nothing of the kind, so from
 * this release each ladder match writes one line here: which kind of opponent,
 * the gap, and whether the higher side won. No account, no names — nothing in
 * card_match_log says who played.
 *
 * The table is cut once a day at Beijing midnight and stays the same until the
 * next one: everybody sees the same numbers all day, and the database is asked
 * once a day rather than on every visit.
 */

export const WINRATE_SCHEMA = `
create table if not exists card_match_log (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  mode   text not null,
  gap    smallint not null,
  hi_won boolean not null
);
create index if not exists card_match_log_at_idx on card_match_log(at);
create table if not exists winrate_snapshots (
  day  date primary key,
  data jsonb not null,
  made timestamptz not null default now()
);
`

/** gap bands, inclusive; a level gap (0) has no higher side and is left out */
export const BANDS = [[1, 1], [2, 4], [5, 7], [8, 11], [12, 99]]
export const MODES = ['cup', 'ladder_pvp', 'ladder_club']
/** how far back the ladder log is read */
export const LADDER_DAYS = 30
const DAY = 86_400_000
const BJ = 8 * 3_600_000

/** The Beijing date `t` falls on, and the instant that day began. */
export function beijingDay(t) {
  const day = new Date(t + BJ).toISOString().slice(0, 10)
  return { day, start: Date.parse(day + 'T00:00:00Z') - BJ }
}

// the band index below is BANDS, written out: the same case in both queries
/** Count the matches before `cutoff` (ms) into the table the page shows. */
export async function computeSnapshot(sql, cutoff, balanceVersion) {
  const until = new Date(cutoff).toISOString()
  const since = new Date(cutoff - LADDER_DAYS * DAY).toISOString()
  const ladder = await sql`
    select mode, case when gap <= 1 then 0 when gap <= 4 then 1 when gap <= 7 then 2 when gap <= 11 then 3 else 4 end as band, count(*)::int as n, sum(case when hi_won then 1 else 0 end)::int as w
      from card_match_log
     where at >= ${since} and at < ${until} and gap > 0
     group by 1, 2`
  const cup = await sql`
    select case when gap <= 1 then 0 when gap <= 4 then 1 when gap <= 7 then 2 when gap <= 11 then 3 else 4 end as band, count(*)::int as n, sum(case when hi_won then 1 else 0 end)::int as w
      from (
        select abs(ea.score - eb.score) as gap,
               m.winner = case when ea.score > eb.score then m.a else m.b end as hi_won
          from open_cup_matches m
          join open_cups c on c.id = m.cup_id
          join open_cup_entries ea on ea.cup_id = m.cup_id and ea.id_hash = m.a
          join open_cup_entries eb on eb.cup_id = m.cup_id and eb.id_hash = m.b
         where m.b is not null and m.winner is not null and m.maps_a is not null
           and ea.score is not null and eb.score is not null and ea.score <> eb.score
           and c.balance_version = ${balanceVersion} and c.starts < ${until}
      ) x
     group by 1`
  const empty = () => BANDS.map(([lo, hi]) => ({ lo, hi, n: 0, w: 0 }))
  const modes = Object.fromEntries(MODES.map((m) => [m, empty()]))
  for (const r of cup) modes.cup[r.band] = { ...modes.cup[r.band], n: r.n, w: r.w }
  for (const r of ladder) if (modes[r.mode]) modes[r.mode][r.band] = { ...modes[r.mode][r.band], n: r.n, w: r.w }
  return { cutoff, ladderDays: LADDER_DAYS, balanceVersion, modes }
}

/**
 * @param getSql () => the pool, or null when there is no database
 * @param opts.json the server's JSON responder
 * @param opts.balanceVersion engine.BALANCE_VERSION — older cups were played on another curve
 * @param opts.now clock, for tests
 */
export function makeWinRateApi(getSql, { json, balanceVersion, now = () => Date.now() }) {
  let memo = null // { day, data }
  let making = null

  /** Today's table: kept in memory, else read, else counted and stored. */
  async function today() {
    const { day, start } = beijingDay(now())
    if (memo?.day === day) return memo.data
    if (making) return making
    making = (async () => {
      const sql = getSql()
      if (!sql) return null
      const have = await sql`select data from winrate_snapshots where day = ${day}`
      let data = have[0]?.data
      if (!data) {
        data = await computeSnapshot(sql, start, balanceVersion)
        // two processes may count at once; the first row stands
        await sql`insert into winrate_snapshots (day, data) values (${day}, ${sql.json(data)}) on conflict (day) do nothing`
        const kept = await sql`select data from winrate_snapshots where day = ${day}`
        data = kept[0]?.data ?? data
      }
      if (typeof data === 'string') data = JSON.parse(data)
      memo = { day, data }
      return data
    })().finally(() => { making = null })
    return making
  }

  /** One ladder match, best effort: a lost line costs the table one sample, never the match. */
  function logMatch(mode, mine, theirs, won, pool = null) {
    const sql = pool ?? getSql()
    if (!sql || !MODES.includes(mode) || !Number.isFinite(mine) || !Number.isFinite(theirs)) return
    const a = Math.round(mine), b = Math.round(theirs)
    const gap = Math.min(99, Math.abs(a - b))
    const hiWon = a >= b ? !!won : !won
    void sql`insert into card_match_log (mode, gap, hi_won) values (${mode}, ${gap}, ${hiWon})`
      .catch((err) => console.warn('winrate: log failed', err.message))
  }

  async function route(req, res) {
    if (req.method !== 'GET') { json(res, 405, { ok: false }); return }
    try {
      const data = await today()
      if (!data) { json(res, 200, { ok: false, why: '胜率表暂时不可用。' }); return }
      res.setHeader?.('Cache-Control', 'public, max-age=600')
      json(res, 200, { ok: true, ...data })
    } catch (err) {
      console.warn('winrate: snapshot failed', err.message)
      json(res, 200, { ok: false, why: '胜率表暂时不可用。' })
    }
  }

  return { route, logMatch, today }
}
