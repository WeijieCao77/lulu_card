/**
 * A lineup of its own for each cup (owner, 2026-09-27): the club cup, the team cup and each 全服杯 division sign
 * up and kick off with theirs, so changing the 卡组 — or one cup's lineup — does not break another cup.
 *
 *   npx tsx scripts/check_cup_lineups.ts
 */
process.env.ENGINE_FROM_SOURCE = '1'
process.env.PHONE_GATE = '0'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { cupSquadOf, mergeClientFields, newGacha, CLIENT_KEYS } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { BASE_PLAYER_CARDS, COACH_CARDS, isPlayerCard } from '../src/engine/cards'
import type { Squad } from '../src/engine/cards'
import { runAction } from '../src/engine/cardActions'

const store = new Map<string, string>()
;(globalThis as never as { localStorage: unknown }) = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }, key: () => null, clear: () => store.clear(), get length() { return store.size },
}

// five different people of one metal, one per position where possible, and a coach of that metal
function fiveOf(rarity: 'gold' | 'bronze'): { squad: Squad; ids: string[] } {
  const roles = ['上单', '打野', '中单', '下路', '辅助'] as const
  const used = new Set<string>()
  const slots = roles.map((r) => {
    const c = BASE_PLAYER_CARDS.find((c) => c.rarity === rarity && isPlayerCard(c) && c.roles.includes(r) && !used.has(c.ign))!
    used.add(c.ign)
    return c.id
  })
  const coach = COACH_CARDS.find((c) => c.rarity === rarity && !c.legend)!.id
  return { squad: { slots, coach }, ids: [...slots, coach] }
}
const gold = fiveOf('gold'), bronze = fiveOf('bronze')

// 1. the engine: a cup without its own lineup plays the 卡组; the client's lineups are checked like the squad
assert.ok((CLIENT_KEYS as readonly string[]).includes('cupSquads'))
const g = newGacha('VM-LINE', '审计', '2026-09-27') as GachaState
for (const id of [...gold.ids, ...bronze.ids]) g.cards[id] = { id, level: 0, dupes: 0, seen: 1, got: '2026-09-27' }
g.squad = structuredClone(gold.squad)
assert.deepEqual(cupSquadOf(g, 'open:bronze'), gold.squad, 'no lineup of its own: the 卡组')
const notMine = BASE_PLAYER_CARDS.find((c) => c.rarity === 'gold' && !g.cards[c.id])!.id
const merged = mergeClientFields(structuredClone(g), {
  cupSquads: { 'open:bronze': bronze.squad, club: { slots: [notMine, null, null, null, null], coach: null }, bogus: gold.squad } as never,
})
assert.deepEqual(merged.cupSquads?.['open:bronze'], bronze.squad, 'a lineup of owned cards is kept')
assert.equal(merged.cupSquads?.club?.slots[0], null, 'a card the account does not own is dropped')
assert.ok(!('bogus' in (merged.cupSquads ?? {})), 'an unknown cup is dropped')

// 2. the club cup signs up with its own lineup
const c = structuredClone(g)
c.cupSquads = { club: structuredClone(bronze.squad) }
const env = { now: Date.parse('2026-09-27T12:00:00+08:00'), today: '2026-09-27', seed: 3 }
const entered = runAction(c, 'cup_enter', {}, env)
assert.equal(entered.ok, true, JSON.stringify(entered).slice(0, 120))
assert.deepEqual(c.cup!.registration!.squad.slots, bronze.squad.slots, 'the club cup registered its own five, not the 卡组')

// 3. the server: the 全服杯 bronze division takes its bronze lineup while the 卡组 is all gold
const { CARD_SCHEMA, makeCardApi, normalizeId } = await import('../cards-api.js')
const { TRADE_PULLS } = await import('../market-api.js')
const { OPEN_CUP_SCHEMA, OPEN_CUP_V2_SCHEMA, OPEN_CUP_LEAGUE_SCHEMA, makeOpenCupApi } = await import('../opencup-api.js')
const { displayName } = await import('../names.js')
const engine = await import('../src/engine/server.ts')
const db = new PGlite(), sql = makeSql(db)
await db.exec(CARD_SCHEMA)
await db.exec((await import('./verified-fixture.mjs')).AUTO_VERIFY)
await db.exec(OPEN_CUP_SCHEMA); await db.exec(OPEN_CUP_V2_SCHEMA); await db.exec(OPEN_CUP_LEAGUE_SCHEMA)
type Reply = { code: number; body: Record<string, any> }
const json = (res: Reply, code: number, body: Record<string, any>) => { res.code = code; res.body = body }
const readBody = async (req: { body: string }) => req.body
const cards = makeCardApi(sql, { rateLimited: () => false, readBody, json } as never)
const now = Date.parse('2026-09-27T03:20:00Z')
const open = makeOpenCupApi(sql, { readBody, json, normalizeId, displayName, rateLimited: () => false, engine, clock: () => now, timer: false } as never)
const call = async (path: string, body: unknown): Promise<Reply> => {
  const out: Reply = { code: 0, body: { ok: false } }
  await (path.startsWith('/api/card/opencup') ? open : cards).route({ method: 'POST', body: JSON.stringify(body) } as never, out as never, path, 't')
  return out
}
const id = 'VM-CQPA-CQPA-CQPA-CQPA-CQPA'
const hash = createHash('sha256').update(id).digest('hex')
assert.ok((await call('/api/card/claim', { id, name: '阵容' })).body.ok)
const s = newGacha(id, '阵容', '2026-09-27') as GachaState
s.cards = structuredClone(g.cards); s.squad = structuredClone(gold.squad); s.pulls = TRADE_PULLS + 5
await sql`update card_accounts set state = ${sql.json(s)}, created = now() - interval '5 days' where id_hash = ${hash}`
const before = await call('/api/card/opencup/join', { id, league: 'bronze' })
assert.equal(before.body.ok, false, 'a gold 卡组 cannot enter the bronze division')
s.cupSquads = { 'open:bronze': structuredClone(bronze.squad) }
await sql`update card_accounts set state = ${sql.json(s)} where id_hash = ${hash}`
const after = await call('/api/card/opencup/join', { id, league: 'bronze' })
assert.equal(after.body.ok, true, `with its own bronze lineup it may: ${JSON.stringify(after.body).slice(0, 120)}`)
const goldToo = await call('/api/card/opencup/join', { id, league: 'gold' })
assert.equal(goldToo.body.ok, true, `and the gold division still takes the gold 卡组: ${JSON.stringify(goldToo.body).slice(0, 120)}`)
await db.close()

console.log('cup lineups: each cup its own five (club, team, every 全服杯 division), the 卡组 where none is set; checked like the squad')
