/**
 * Daily Shanghai schedule, legacy open-cup compatibility and no synthetic backfill.
 *
 *   npx tsx scripts/check_cup_daily_schedule.ts
 */
process.env.ENGINE_FROM_SOURCE = '1'
process.env.PHONE_GATE = '0'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { DAILY_START_HOURS, OPEN_CUP_TIMEZONE } from '../src/engine/openCup'
import { BASE_PLAYER_CARDS, personOf } from '../src/engine/cards'
import { CUP_LEAGUES, newGacha, type CupLeague } from '../src/engine/gacha'
const engine = await import('../src/engine/server.ts')
const { CARD_SCHEMA, normalizeId } = await import('../cards-api.js')
const { OPEN_CUP_SCHEMA, OPEN_CUP_V2_SCHEMA, OPEN_CUP_LEAGUE_SCHEMA, makeOpenCupApi } = await import('../opencup-api.js')
const { displayName } = await import('../names.js')

const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const iso = (ms: number) => new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(11, 19)
const shanghaiDay = (ms: number) => new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)

// --- pure schedule: deterministic Shanghai 12/20, fast override intact
{
  const slots = (day: string, h: number) => Date.parse(`${day}T${String(h).padStart(2, '0')}:00:00+08:00`)
  const every = 2 * 60 * 60 * 1000
  const t = Date.parse('2026-09-17T03:20:00Z')
  assert.equal(engine.openCupSlot(t, every), Date.parse('2026-09-17T04:00:00Z'))
  assert.equal(engine.openCupSlot(Date.parse('2026-09-17T04:00:00Z'), every), Date.parse('2026-09-17T06:00:00Z'))
  assert.equal(engine.openCupSlot(slots('2026-09-17', 12) - 1), slots('2026-09-17', 12))
  assert.equal(engine.openCupSlot(slots('2026-09-17', 12)), slots('2026-09-17', 20), 'exact start points to next slot')
  assert.equal(engine.openCupSlot(slots('2026-09-17', 20) - 1), slots('2026-09-17', 20))
  assert.equal(engine.openCupSlot(slots('2026-09-17', 20)), slots('2026-09-18', 12))
  assert.deepEqual(DAILY_START_HOURS, [12, 20])
  assert.equal(OPEN_CUP_TIMEZONE, 'Asia/Shanghai')

  // two distinct daily starts across UTC midnight, month boundaries, US DST change and new year
  for (const day of ['2026-03-07', '2026-11-01', '2026-12-31']) {
    let cursor = Date.parse(`${day}T00:00:00+08:00`)
    const dayStarts = new Set<string>()
    while (shanghaiDay(cursor) === day) {
      cursor = engine.openCupSlot(cursor)
      if (shanghaiDay(cursor) === day) dayStarts.add(iso(cursor).slice(0, 5))
    }
    assert.deepEqual([...dayStarts].sort(), ['12:00', '20:00'], `${day}: ${[...dayStarts]}`)
  }

  const boundaries = [
    ['2026-09-17T11:59:59+08:00', '2026-09-17T12:00:00+08:00'],
    ['2026-09-17T12:00:00+08:00', '2026-09-17T20:00:00+08:00'],
    ['2026-09-17T19:59:59+08:00', '2026-09-17T20:00:00+08:00'],
    ['2026-09-17T20:00:00+08:00', '2026-09-18T12:00:00+08:00'],
  ]
  for (const [nowTs, expected] of boundaries) {
    assert.equal(engine.openCupSlot(Date.parse(nowTs)), Date.parse(expected), `${nowTs} -> ${expected}`)
  }
  console.log('PASS daily Shanghai 12:00/20:00 schedule, exact boundaries and fast override')
}

// --- real API + PGlite
{
  const db = new PGlite(), sql = makeSql(db)
  await db.exec(CARD_SCHEMA)
  await db.exec(OPEN_CUP_SCHEMA)
  await db.exec(OPEN_CUP_V2_SCHEMA)
  await db.exec(OPEN_CUP_LEAGUE_SCHEMA)

  let now = Date.parse('2026-09-17T09:00:00+08:00')
  const api = makeOpenCupApi(sql, {
    readBody: async (req: any) => JSON.stringify(req.body),
    json: (res: any, code: number, body: any) => { res.code = code; res.body = body },
    normalizeId, displayName, rateLimited: () => false, engine,
    clock: () => now, timer: false, minDays: 0, format: 1,
    compute: async (args: Parameters<typeof engine.playOpenCupMatch>) => engine.playOpenCupMatch(...args),
  } as never)
  const twin = makeOpenCupApi(sql, {
    readBody: async (req: any) => JSON.stringify(req.body),
    json: (res: any, code: number, body: any) => { res.code = code; res.body = body },
    normalizeId, displayName, rateLimited: () => false, engine,
    clock: () => now, timer: false, minDays: 0, format: 1,
    compute: async (args: Parameters<typeof engine.playOpenCupMatch>) => engine.playOpenCupMatch(...args),
  } as never)

  async function call(route: string, body: Record<string, unknown> = {}, via = api) {
    const r: any = {}
    await via.route({ body }, r, route, 'daily-test')
    return r.body as any
  }

  const roles = ['上单', '打野', '中单', '下路', '辅助'] as const
  function legalGoldFive() {
    const picked = roles.map((role) => BASE_PLAYER_CARDS.find((c) => c.rarity === 'gold' && c.role === role)!)
    assert(picked.every(Boolean), 'five gold role cards exist')
    assert.equal(new Set(picked.map(personOf)).size, 5, 'five unique people')
    return { slots: picked.map((c) => c.id), coach: null }
  }

  let accountSeq = 0
  async function account(league: CupLeague = 'gold', squadOverride?: { slots: (string | null)[]; coach: string | null }) {
    const chars = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
    const code = chars[Math.floor(accountSeq / chars.length)] + chars[accountSeq++ % chars.length]
    const id = `VM-${code}22-2222-2222-2222-2222`
    const g = newGacha(id, `测试${code}`, '2026-09-17')
    g.pulls = 100
    g.squad = structuredClone(squadOverride ?? legalGoldFive())
    for (const card of g.squad.slots) {
      if (card) g.cards[card] = { id: card, level: 0, dupes: 0, seen: 1, got: '2026-09-17' }
    }
    await sql`insert into card_accounts(id_hash, name, state, created) values(${hash(id)}, ${g.name}, ${sql.json(g)}, now()-interval '4 days')`
    return id
  }

  async function snapshotEntry(cupId: number | string, id: string) {
    const rows = await sql`select state from card_accounts where id_hash = ${hash(id)}`
    const state = rows[0]?.state as ReturnType<typeof newGacha>
    assert(state, `account state exists for ${id}`)
    await sql`insert into open_cup_entries (cup_id, id_hash, name, five) values(${cupId}, ${hash(id)}, ${state.name}, ${sql.json({ slots: state.squad.slots, coach: state.squad.coach, levels: {} })})`
  }

  try {
    await api.advance()
    const initial = await sql`select starts from open_cups where status = 'open' order by starts`
    assert.equal(initial.length, CUP_LEAGUES.length, 'one future scheduled cup per league at initial start')
    assert(initial.every((r: any) => iso(Number(new Date(r.starts))) === '12:00:00'), `initial slot is 12:00, got ${initial.map((r: any) => iso(Number(new Date(r.starts))))}`)

    // Seed one legacy off-schedule open cup at 10:00 with eight members before any state read.
    const legacyStart = Date.parse('2026-09-17T10:00:00+08:00')
    await sql`insert into open_cups (starts, seed, format_version, phase, league, status) values(${new Date(legacyStart)}, 42, 1, 'knockout', 'gold', 'open')`
    const legacyRows = await sql`select id from open_cups where starts = ${new Date(legacyStart)} and league = 'gold'`
    const legacyCupId = legacyRows[0].id as number
    const legacyMembers: string[] = []
    for (let i = 0; i < 8; i++) {
      const id = await account('gold')
      legacyMembers.push(id)
      await snapshotEntry(legacyCupId, id)
    }

    const member = legacyMembers[0]
    const publicState = await call('/api/card/opencup', { id: member, league: 'gold' })
    assert(publicState.legacyPending?.some((c: any) => c.id === String(legacyCupId)), 'legacy pending surfaced')
    const legacyDetail = await call('/api/card/opencup/cup', { id: member, cup: String(legacyCupId) })
    assert.equal(legacyDetail.cup?.starts, legacyStart, 'persisted legacy cup remains queryable by id')
    assert.equal(publicState.next?.starts, engine.openCupSlot(now), 'public next is the scheduled 12:00 slot')
    assert.equal(iso(publicState.next.starts).slice(0, 5), '12:00')

    const joinRes = await call('/api/card/opencup/join', { id: member, league: 'gold' })
    assert(joinRes.ok, JSON.stringify(joinRes))
    assert.equal(joinRes.starts, engine.openCupSlot(now), 'new join targets the scheduled slot')
    assert.notEqual(joinRes.starts, legacyStart, 'new join does not target legacy cup')
    const legacyMemberCount = await sql`select count(*)::int as n from open_cup_entries where cup_id = ${legacyCupId} and id_hash = ${hash(member)}`
    assert.equal(legacyMemberCount[0].n, 1, 'legacy registration remains unchanged')

    // A user outside the legacy cup sees next but no legacy pending.
    const outsider = await account('gold')
    const outsiderState = await call('/api/card/opencup', { id: outsider, league: 'gold' })
    assert(outsiderState.next?.starts === engine.openCupSlot(now))
    assert(!outsiderState.legacyPending?.some((c: any) => c.id === String(legacyCupId)))

    // Other league filter hides pending but keeps its own next.
    const memberBronzeState = await call('/api/card/opencup', { id: member, league: 'bronze' })
    assert(!memberBronzeState.legacyPending?.some((c: any) => c.id === String(legacyCupId)))
    assert(memberBronzeState.next?.starts)

    // A future off-schedule legacy while current next is still 12:00 is also visible.
    const futureLegacyStart = legacyStart + 4 * 60 * 60 * 1000 // 14:00
    await sql`insert into open_cups (starts, seed, format_version, phase, league, status) values(${new Date(futureLegacyStart)}, 43, 1, 'knockout', 'gold', 'open')`
    const futureLegacyRows = await sql`select id from open_cups where starts = ${new Date(futureLegacyStart)} and league = 'gold'`
    const futureLegacyCupId = futureLegacyRows[0].id
    await sql`insert into open_cup_entries (cup_id, id_hash, name) values(${futureLegacyCupId}, ${hash(outsider)}, 'future-legacy')`
    const futurePending = await call('/api/card/opencup', { id: outsider, league: 'gold' })
    assert(futurePending.legacyPending?.some((c: any) => c.id === String(futureLegacyCupId)), 'future off-schedule legacy visible')
    assert.equal(futurePending.next?.starts, engine.openCupSlot(now))

    // Resolve seeded legacy off-schedule cup at its persisted start; it must run and finish exactly once.
    now = legacyStart + 1000
    api.invalidate(); twin.invalidate()
    await Promise.all([api.advance(), twin.advance()])
    const legacyCup = await sql`select status, round, rounds, step_sec, entrants, champion from open_cups where id = ${legacyCupId}`
    assert.equal(legacyCup[0].status, 'live', JSON.stringify(legacyCup[0]))
    const afterLegacyStart = await call('/api/card/opencup', { id: member, league: 'gold' })
    assert(!afterLegacyStart.legacyPending?.some((c: any) => c.id === String(legacyCupId)), 'started legacy cup leaves pending list; no endless pending countdown')
    assert.equal(afterLegacyStart.live?.id, String(legacyCupId), 'legacy live cup visible')
    assert.equal(legacyCup[0].entrants, 8)
    for (let guard = 0; guard < 30 && legacyCup[0].status === 'live'; guard++) {
      now = legacyStart + (legacyCup[0].round + 1) * legacyCup[0].step_sec * 1000
      api.invalidate(); twin.invalidate()
      await Promise.all([api.advance(), twin.advance()])
      const next = await sql`select status, round, rounds, step_sec, champion from open_cups where id = ${legacyCupId}`
      legacyCup[0] = next[0]
    }
    assert.equal(legacyCup[0].status, 'done', `legacy cup finished, got ${JSON.stringify(legacyCup[0])}`)
    assert(legacyCup[0].champion, 'champion exists')

    const payoutRows = () => sql`select id::text as id, to_h, coins, pack, body from card_mail where kind = 'open_cup' and body->>'cup' = ${String(legacyCupId)} order by id`
    const firstPayouts = await payoutRows()
    assert(firstPayouts.length > 0, 'legacy cup pays winners')
    const firstIds = firstPayouts.map((r: any) => r.id).join(',')
    now += 5 * 60 * 60 * 1000
    await Promise.all([api.advance(), twin.advance(), api.advance()])
    const secondPayouts = await payoutRows()
    assert.equal(secondPayouts.map((r: any) => r.id).join(','), firstIds, 'repeated advance does not duplicate legacy payout')
    assert.deepEqual(secondPayouts, firstPayouts, 'reward content and count exactly once')

    // A future legacy entry that never awards can simply remain pending; prove it was not selected as public next.
    const futureLegacyState = await call('/api/card/opencup', { league: 'gold' })
    assert.notEqual(futureLegacyState.next?.starts, futureLegacyStart)

    // A downtime gap must not backfill missed daily slots or create duplicates.
    const countBeforeGap = await sql`select count(*)::int as n from open_cups`
    now += 4 * 86_400_000
    api.invalidate(); twin.invalidate()
    await Promise.all([api.advance(), twin.advance()])
    const countAfterGap = await sql`select count(*)::int as n from open_cups`
    assert.equal(countAfterGap[0].n, countBeforeGap[0].n + CUP_LEAGUES.length, 'only the next scheduled four rows are created after downtime, no backfill')
    const duplicateCheck = await sql`select starts, league, count(*)::int as n from open_cups group by starts, league having count(*) > 1`
    assert.equal(duplicateCheck.length, 0, 'no duplicate starts within a league after restart')

    console.log('PASS legacy off-schedule visibility, new-join isolation, single resolve/reward, no restart backfill')
  } finally {
    api.close(); twin.close()
    await db.close()
  }
}

console.log('PASS check_cup_daily_schedule')
