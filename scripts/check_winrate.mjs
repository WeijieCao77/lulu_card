/** 胜率表: counted from logged ladder matches and 全服杯 history, cut once a Beijing day. */
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { OPEN_CUP_SCHEMA, OPEN_CUP_V2_SCHEMA, OPEN_CUP_LEAGUE_SCHEMA } from '../opencup-api.js'
import { WINRATE_SCHEMA, beijingDay, makeWinRateApi } from '../winrate-api.js'

const db = new PGlite()
await db.exec(OPEN_CUP_SCHEMA + OPEN_CUP_V2_SCHEMA + OPEN_CUP_LEAGUE_SCHEMA + WINRATE_SCHEMA)
const sql = makeSql(db)

// Beijing midnight is 16:00 UTC the day before
assert.deepEqual(beijingDay(Date.parse('2026-09-30T16:30:00Z')), { day: '2026-10-01', start: Date.parse('2026-09-30T16:00:00Z') })
assert.equal(beijingDay(Date.parse('2026-09-30T15:59:00Z')).day, '2026-09-30')

let clock = Date.parse('2026-10-01T04:00:00Z') // 12:00 Beijing
const api = makeWinRateApi(() => sql, {
  json: (res, code, body) => { res.code = code; res.body = body },
  balanceVersion: 3,
  now: () => clock,
})
const get = async () => { const res = {}; await api.route({ method: 'GET' }, res); return res.body }

// the ladder: three logged yesterday, one today (after the cut), one with no higher side
api.logMatch('ladder_pvp', 80, 77, true)   // gap 3, higher won
api.logMatch('ladder_pvp', 77, 80, true)   // gap 3, lower won
api.logMatch('ladder_club', 70, 82, false) // gap 12, higher won
api.logMatch('ladder_pvp', 80, 80, true)   // level: left out
api.logMatch('nonsense', 80, 70, true)     // unknown mode: never written
await new Promise((r) => setTimeout(r, 50))
await sql`update card_match_log set at = ${new Date(clock - 86_400_000).toISOString()}`
api.logMatch('ladder_pvp', 90, 80, true)   // today: not in today's table
await new Promise((r) => setTimeout(r, 50))
assert.equal((await sql`select count(*)::int as n from card_match_log`)[0].n, 5)

// the 全服杯: one cup on the current curve, one on an old one
await sql`insert into open_cups (id, starts, status, balance_version) values (1, '2026-09-29T12:00:00Z', 'done', 3), (2, '2026-09-20T12:00:00Z', 'done', 2)`
for (const [cup, h, score] of [[1, 'a', 85], [1, 'b', 80], [1, 'c', 70], [1, 'd', 70], [2, 'a', 90], [2, 'b', 60]])
  await sql`insert into open_cup_entries (cup_id, id_hash, score) values (${cup}, ${h}, ${score})`
const match = (cup, round, slot, a, b, winner) =>
  sql`insert into open_cup_matches (cup_id, round, slot, a, b, winner, maps_a, maps_b) values (${cup}, ${round}, ${slot}, ${a}, ${b}, ${winner}, 1, 1)`
await match(1, 1, 1, 'a', 'b', 'b') // gap 5, lower won
await match(1, 1, 2, 'c', 'd', 'c') // level
await match(1, 2, 1, 'b', 'c', 'b') // gap 10, higher won
await match(2, 1, 1, 'a', 'b', 'b') // old curve: left out
await sql`insert into open_cup_matches (cup_id, round, slot, a, b, winner) values (1, 3, 1, 'a', null, 'a')` // a bye

const t = await get()
assert.equal(t.ok, true)
assert.equal(t.cutoff, Date.parse('2026-09-30T16:00:00Z'))
const band = (mode, lo) => t.modes[mode].find((b) => b.lo === lo)
assert.deepEqual(band('ladder_pvp', 2), { lo: 2, hi: 4, n: 2, w: 1 })
assert.deepEqual(band('ladder_pvp', 8), { lo: 8, hi: 11, n: 0, w: 0 }, "today's match waits for tomorrow")
assert.deepEqual(band('ladder_club', 12), { lo: 12, hi: 99, n: 1, w: 1 })
assert.deepEqual(band('cup', 5), { lo: 5, hi: 7, n: 1, w: 0 })
assert.deepEqual(band('cup', 8), { lo: 8, hi: 11, n: 1, w: 1 })
assert.equal(t.modes.cup.reduce((s, b) => s + b.n, 0), 2)

// the same all day, even with new matches
await sql`update card_match_log set at = ${new Date(clock - 86_400_000).toISOString()}`
assert.deepEqual(await get(), t)
// and a new table the next Beijing day, kept in the database
clock += 86_400_000
const next = await get()
assert.deepEqual(band.call(null, 'ladder_pvp', 8) && next.modes.ladder_pvp.find((b) => b.lo === 8), { lo: 8, hi: 11, n: 1, w: 1 })
assert.equal((await sql`select count(*)::int as n from winrate_snapshots`)[0].n, 2)
// a second process reads the stored row rather than counting again
const other = makeWinRateApi(() => sql, { json: (res, code, body) => { res.body = body }, balanceVersion: 3, now: () => clock })
const res = {}; await other.route({ method: 'GET' }, res)
assert.deepEqual(res.body, next)
console.log('winrate: ok')
