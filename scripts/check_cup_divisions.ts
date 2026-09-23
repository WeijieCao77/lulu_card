/** Real API + isolated DB: four independent cups, eligibility, payouts and unified ladder. */
process.env.ENGINE_FROM_SOURCE = '1'
process.env.PHONE_GATE = '0'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { BASE_PLAYER_CARDS, LEGEND_CARDS, COACH_CARDS, personOf } from '../src/engine/cards'
import { CUP_LEAGUES, newGacha, leagueEntry, type CupLeague } from '../src/engine/gacha'
import { runAction } from '../src/engine/cardActions'
const engine = await import('../src/engine/server.ts')
const { CARD_SCHEMA, normalizeId, BOARDS } = await import('../cards-api.js')
const { OPEN_CUP_SCHEMA, OPEN_CUP_V2_SCHEMA, OPEN_CUP_LEAGUE_SCHEMA, makeOpenCupApi } = await import('../opencup-api.js')
const { displayName } = await import('../names.js')
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const roles = ['上单', '打野', '中单', '下路', '辅助']
function squad(league: CupLeague) {
  const picked = roles.map(role => BASE_PLAYER_CARDS.find(c => c.rarity === (league === 'hof' ? 'gold' : league) && c.role === role)!)
  assert(picked.every(Boolean), `five roles in ${league}`)
  if (league === 'hof') {
    const legends = LEGEND_CARDS.filter(c => c.kind === 'player')
    picked[0] = legends.find(c => c.role === picked[0].role) as typeof picked[0]
    picked[1] = legends.find(c => c.role === picked[1].role && personOf(c) !== personOf(picked[0])) as typeof picked[1]
  }
  assert.equal(new Set(picked.map(personOf)).size, 5)
  return { slots: picked.map(c => c.id), coach: null }
}
const squads = Object.fromEntries(CUP_LEAGUES.map(k => [k, squad(k)])) as Record<CupLeague, ReturnType<typeof squad>>
for (const k of CUP_LEAGUES) assert(leagueEntry(squads[k], k).ok)
assert(leagueEntry(squads.bronze, 'gold').ok)
assert(leagueEntry(squads.bronze, 'silver').ok)
assert(!leagueEntry(squads.gold, 'silver').ok)
assert(!leagueEntry(squads.hof, 'gold').ok)
assert(!leagueEntry({ ...squads.bronze, coach: COACH_CARDS.find(c => c.rarity === 'gold')!.id }, 'bronze').ok)
const oneMythic = { ...squads.hof, slots: [...squads.hof.slots] }
oneMythic.slots[1] = squads.gold.slots[1]
assert(!leagueEntry(oneMythic, 'hof').ok)
assert.deepEqual(BOARDS, ['open'])
for (const requested of ['open', ...CUP_LEAGUES]) {
  const g = newGacha('unified-test', '测试', '2026-09-21')
  g.squad = structuredClone(squads.hof)
  for (const id of g.squad.slots) if (id) g.cards[id] = { id, level: 0, dupes: 0, seen: 1, got: '2026-09-21' }
  const r = runAction(g, 'ladder', { league: requested }, { today: '2026-09-21', now: Date.parse('2026-09-21T12:00Z'), seed: 23 })
  assert(r.ok, JSON.stringify(r))
  assert.equal(g.ladder.wins + g.ladder.losses, 1)
  assert(!g.leagues || Object.keys(g.leagues).length === 0, 'old clients cannot keep playing separate ladders')
}
console.log('PASS unified ladder, card ceilings, coach ceilings and two-mythic requirement')

for (const format of [1, 2]) {
  const db = new PGlite(), sql = makeSql(db)
  await db.exec(CARD_SCHEMA)
  await db.exec(OPEN_CUP_SCHEMA)
  await db.exec(OPEN_CUP_V2_SCHEMA)
  // Migration must retain a historical cup and remove the former starts-only constraint.
  await sql`insert into open_cups(starts, status) values('2020-01-01', 'done')`
  await db.exec(OPEN_CUP_LEAGUE_SCHEMA)
  await db.exec(OPEN_CUP_LEAGUE_SCHEMA)
  assert.equal((await sql`select league from open_cups where starts='2020-01-01'`)[0].league, 'gold')
  let now = Date.parse('2026-09-21T12:01Z')
  const api = makeOpenCupApi(sql, {
    readBody: async (req: any) => JSON.stringify(req.body),
    json: (res: any, code: number, body: any) => { res.code = code; res.body = body },
    normalizeId, displayName, rateLimited: () => false, engine,
    clock: () => now, timer: false, minDays: 0, format,
    compute: async (args: Parameters<typeof engine.playOpenCupMatch>) => engine.playOpenCupMatch(...args),
  } as never)
  async function call(action: string, body: object = {}) {
    const r: any = {}
    await api.route({ body } as never, r, '/api/card/opencup' + action, 'test')
    return r.body
  }
  let count = 0
  const ids = {} as Record<CupLeague, string[]>
  async function account(k: CupLeague) {
    const chars = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
    const code = chars[Math.floor(count / chars.length)] + chars[count++ % chars.length]
    const id = `VM-${code}22-2222-2222-2222-2222`
    const g = newGacha(id, '测试' + code, '2026-09-21')
    g.pulls = 100; g.squad = structuredClone(squads[k])
    for (const card of g.squad.slots) if (card) g.cards[card] = { id: card, level: 0, dupes: 0, seen: 1, got: '2026-09-21' }
    await sql`insert into card_accounts(id_hash, name, state, created) values(${hash(id)}, ${g.name}, ${sql.json(g)}, now()-interval '4 days')`
    return id
  }
  try {
    await api.advance()
    const cupIds: string[] = []
    for (const k of CUP_LEAGUES) {
      ids[k] = []
      for (let i = 0; i < 8; i++) {
        const id = await account(k); ids[k].push(id)
        const r = await call('/join', { id, league: k })
        assert(r.ok, JSON.stringify(r))
      }
      const r = await call('', { id: ids[k][0], league: k })
      assert.equal(r.next.signed, 8); assert(r.next.joined); assert.equal(r.next.league, k)
      cupIds.push(r.next.id)
    }
    assert.equal(new Set(cupIds).size, 4)
    assert(!(await call('/join', { id: ids.gold[0], league: 'bronze' })).ok)
    assert(!(await call('/join', { id: ids.hof[0], league: 'gold' })).ok)
    assert(!(await call('/join', { id: ids.gold[0], league: 'hof' })).ok)
    assert(!(await call('/join', { id: ids.gold[0], league: 'invalid' })).ok)
    // A bronze player can join another eligible division, but withdrawing only leaves the selected one.
    const extra = await account('bronze')
    assert((await call('/join', { id: extra, league: 'bronze' })).ok)
    assert((await call('/join', { id: extra, league: 'silver' })).ok)
    assert((await call('/leave', { id: extra, league: 'silver' })).ok)
    assert((await call('', { id: extra, league: 'bronze' })).next.joined)
    assert(!(await call('', { id: extra, league: 'silver' })).next.joined)
    // Switching to gold after registering for bronze must be caught at start.
    const switched = newGacha(extra, '换卡测试', '2026-09-21')
    switched.pulls = 100; switched.squad = structuredClone(squads.gold)
    for (const id of switched.squad.slots) if (id) switched.cards[id] = { id, level: 0, dupes: 0, seen: 1, got: '2026-09-21' }
    await sql`update card_accounts set state=${sql.json(switched)} where id_hash=${hash(extra)}`
    const firstStart = (await sql`select starts from open_cups where league = 'bronze' and status = 'open' order by starts limit 1`)[0].starts
    now = Number(new Date(firstStart))
    api.invalidate(); await api.advance()
    const excluded = await sql`select five, alive, out_round from open_cup_entries where cup_id=${cupIds[2]} and id_hash=${hash(extra)}`
    assert.equal(excluded[0].five, null); assert.equal(excluded[0].alive, false); assert.equal(excluded[0].out_round, -1)
    now = Number(new Date(firstStart)) + 3 * 60 * 60 * 1000
    api.invalidate(); await api.advance()
    for (let i = 0; i < CUP_LEAGUES.length; i++) {
      const k = CUP_LEAGUES[i]
      const r = await call('', { id: ids[k][0], league: k })
      assert.equal(r.last.id, cupIds[i]); assert.equal(r.last.status, 'done'); assert.equal(r.last.entrants, 8)
      assert.equal(r.boards.all.length, 1); assert.equal(r.boards.all[0].titles, 1)
      assert(r.last.me, 'own matches retained')
      const mails = await sql`select body from card_mail where body->>'cup'=${cupIds[i]}`
      assert(mails.length > 0); assert(mails.every((m: any) => m.body.league === k))
      const detail = await call('/cup', { cup: cupIds[i] })
      assert.equal(detail.cup.league, k)
    }
    const before = (await sql`select count(*)::int as n from card_mail`)[0].n
    api.invalidate(); await api.advance()
    assert.equal((await sql`select count(*)::int as n from card_mail`)[0].n, before, 'no duplicate payout')
    console.log(`PASS format ${format}: four independent brackets, signup/withdrawal, start-time recheck, champion boards, tagged mail, idempotent payout and migration`)
  } finally { api.close(); await db.close() }
}
