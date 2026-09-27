/**
 * One trade a day between the same two accounts (owner, 2026-09-27): bids and swaps, either direction,
 * pending ones included; other buyers are not affected, and the next Beijing day starts afresh.
 *
 *   npx tsx scripts/check_market_pair.ts
 */
import { AUTO_VERIFY } from './verified-fixture.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { CARD_SCHEMA, engine, normalizeId } from '../cards-api.js'
import { makeMarketApi, PAIR_PER_DAY, TRADE_DAYS, TRADE_PULLS } from '../market-api.js'
import { displayName } from '../names.js'
process.env.PHONE_GATE = '0'
const db = new PGlite()
await db.exec(CARD_SCHEMA)
await db.exec(AUTO_VERIFY)
const sql = makeSql(db)
const A = 'VM-2222-2222-2222-2222-2222', B = 'VM-3333-3333-3333-3333-3333', C = 'VM-4444-4444-4444-4444-4444'
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const cardId = 'p:P1'
const api = makeMarketApi(sql, {
  engine, normalizeId, displayName, rateLimited: () => false, timer: false,
  readBody: async (req: { body: unknown }) => JSON.stringify(req.body),
  json: (res: { body?: any }, _status: number, body: any) => { res.body = body },
} as never)
async function call(action: string, body: object) {
  const res: { body?: any } = {}
  await api.route({ body }, res, `/api/market/${action}`, 'test')
  return res.body
}
async function account(id: string, copies: number) {
  const state = engine.newGacha(id, 'test', '2026-09-14')
  state.pulls = TRADE_PULLS
  state.coins = 1_000_000
  state.cards = { [cardId]: { id: cardId, level: 0, dupes: copies - 1, seen: copies, got: '2026-09-14' } }
  await sql`insert into card_accounts (id_hash, state, created)
            values (${hash(id)}, ${sql.json(state)}, now() - make_interval(days => ${TRADE_DAYS + 1}))
            on conflict (id_hash) do update set state = excluded.state`
}
assert.equal(PAIR_PER_DAY, 1)
await account(A, 5); await account(B, 3); await account(C, 3)
const listed = async () => { const r = await call('list', { id: A, cardId, ask: 1000 }); assert(r.ok, JSON.stringify(r)); return r.id ?? (await sql`select max(id)::text as id from card_listings`)[0].id }
const l1 = await listed(), l2 = await listed()

// a bid is the day's trade between the two, even before it wins
assert((await call('offer', { id: B, listing: l1, price: 1000 })).ok, 'first bid from B on A')
const second = await call('offer', { id: B, listing: l2, price: 1000 })
assert.equal(second.pair, true, 'a second of A\'s listings the same day is refused')
assert.match(String(second.why), /每天最多交易 1 次/)
assert((await call('offer', { id: C, listing: l2, price: 1000 })).ok, 'somebody else is not affected')

// a swap between the two counts as well, from either side
const swapBA = await call('swap', { id: B, code: hash(A).slice(0, 8), giveId: cardId, wantId: cardId })
assert.equal(swapBA.pair, true, 'no swap while a bid between them is open')

// completed today: still one; completed yesterday (Beijing): a new day
await sql`update card_offers set status = 'outbid' where buyer_h = ${hash(B)}`
await sql`insert into card_offers (listing, buyer_h, price, status, settled) values (${l1}::bigint, ${hash(B)}, 1000, 'accepted', now())`
assert.equal((await call('offer', { id: B, listing: l2, price: 1100 })).pair, true, 'bought from A today: no more today')
assert.equal((await call('swap', { id: A, code: hash(B).slice(0, 8), giveId: cardId, wantId: cardId })).pair, true, 'nor the other way round')
await sql`update card_offers set settled = now() - interval '2 days' where status = 'accepted'`
const tomorrow = await call('offer', { id: B, listing: l2, price: 1100 })
assert.notEqual(tomorrow.pair, true, `a day later the pair may trade again: ${JSON.stringify(tomorrow).slice(0, 80)}`)

await db.close()
console.log('market pair limit: one trade a day between two accounts, bids and swaps, either way; others unaffected')
