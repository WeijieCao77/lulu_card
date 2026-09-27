/**
 * Price caps for bronze and silver, and at most three high-value trades a day bought and three sold
 * (owner, 2026-09-27). Cheap trades are untouched.
 *
 *   npx tsx scripts/check_market_caps.ts
 */
import { AUTO_VERIFY } from './verified-fixture.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { CARD_SCHEMA, engine, normalizeId } from '../cards-api.js'
import { makeMarketApi, HIGH_VALUE_PER_DAY, HIGH_VALUE_PRICE, PRICE_CAP, TRADE_DAYS, TRADE_PULLS } from '../market-api.js'
import { displayName } from '../names.js'
import { BASE_PLAYER_CARDS } from '../src/engine/cards'
process.env.PHONE_GATE = '0'
const db = new PGlite()
await db.exec(CARD_SCHEMA)
await db.exec(AUTO_VERIFY)
const sql = makeSql(db)
const A = 'VM-2222-2222-2222-2222-2222', B = 'VM-3333-3333-3333-3333-3333', C = 'VM-4444-4444-4444-4444-4444'
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const bronze = BASE_PLAYER_CARDS.find((c) => c.rarity === 'bronze')!.id
const silver = BASE_PLAYER_CARDS.find((c) => c.rarity === 'silver')!.id
const gold = BASE_PLAYER_CARDS.find((c) => c.rarity === 'gold')!.id
// the pair rule has its own check; here many trades between A and B are only the scaffolding
const api = makeMarketApi(sql, { pairPerDay: Infinity,
  engine, normalizeId, displayName, rateLimited: () => false, timer: false,
  readBody: async (req: { body: unknown }) => JSON.stringify(req.body),
  json: (res: { body?: any }, _status: number, body: any) => { res.body = body },
} as never)
async function call(action: string, body: object) {
  const res: { body?: any } = {}
  await api.route({ body }, res, `/api/market/${action}`, 'test')
  return res.body
}
async function account(id: string) {
  const state = engine.newGacha(id, 'test', '2026-09-14')
  state.pulls = TRADE_PULLS
  state.coins = 1_000_000
  state.cards = Object.fromEntries([bronze, silver, gold].map((c) => [c, { id: c, level: 0, dupes: 9, seen: 10, got: '2026-09-14' }]))
  await sql`insert into card_accounts (id_hash, state, created)
            values (${hash(id)}, ${sql.json(state)}, now() - make_interval(days => ${TRADE_DAYS + 1}))
            on conflict (id_hash) do update set state = excluded.state`
}
await account(A); await account(B); await account(C)
const lastListing = async () => (await sql`select max(id)::text as id from card_listings`)[0].id

// 1. bronze and silver are capped: start price, buy-now price and bids
assert.deepEqual(PRICE_CAP, { bronze: 2000, silver: 5000 })
const over = await call('list', { id: A, cardId: bronze, ask: 2001 })
assert.equal(over.bad, true); assert.equal(over.max, 2000)
assert.equal((await call('list', { id: A, cardId: bronze, ask: 500, buyout: 2500 })).badBuyout, true, 'buy-now over the cap')
assert.equal((await call('list', { id: A, cardId: silver, ask: 5001 })).bad, true)
assert.equal((await call('list', { id: A, cardId: bronze, ask: 1500 })).ok, true, 'under the cap is fine')
const bl = await lastListing()
const bidHigh = await call('offer', { id: B, listing: bl, price: 50_000 })
assert.equal(bidHigh.capped, true, 'a bid cannot push a bronze past its cap'); assert.equal(bidHigh.max, 2000)
assert.equal((await call('offer', { id: B, listing: bl, price: 2000 })).ok, true, 'a bid at the cap is fine')
assert.equal((await call('list', { id: A, cardId: gold, ask: 200_000 })).ok, true, 'gold is not capped')
await sql`update card_listings set status = 'withdrawn'`; await sql`update card_offers set status = 'outbid'`

// 2. three high-value purchases a day; cheap ones do not count and are not stopped
// (B's earlier purchases were from C, so A's own sales stay at zero for the listings below)
const bought = async (card: string, price: number, when = 'now()') => {
  const l = await sql`insert into card_listings (seller_h, card_id, level, ask, status) values (${hash(C)}, ${card}, 0, ${price}, 'sold') returning id`
  await sql.unsafe(`insert into card_offers (listing, buyer_h, price, status, settled) values (${l[0].id}, '${hash(B)}', ${price}, 'accepted', ${when})`)
}
for (let i = 0; i < HIGH_VALUE_PER_DAY; i++) await bought(gold, 1500)
await bought(bronze, 800)
await bought(gold, 1500, "now() - interval '2 days'") // yesterday's do not count
assert.equal((await call('list', { id: A, cardId: gold, ask: 1000 })).ok, true)
const gl = await lastListing()
const fourth = await call('offer', { id: B, listing: gl, price: 1000 })
assert.equal(fourth.highCap, true, 'a fourth gold purchase today is refused')
assert.match(String(fourth.why), /买入已满 3 笔/)
assert.equal((await call('list', { id: A, cardId: bronze, ask: 300 })).ok, true)
assert.equal((await call('offer', { id: B, listing: await lastListing(), price: 300 })).ok, true, 'a cheap bronze is still fine')
assert.equal((await call('list', { id: A, cardId: silver, ask: 3000 })).ok, true)
assert.equal((await call('offer', { id: B, listing: await lastListing(), price: 3000 })).highCap, true, `a silver at ${HIGH_VALUE_PRICE}+ is high-value`)

// 3. three high-value sales a day: completed ones plus what is on the shelf now
await sql`update card_listings set status = 'withdrawn' where status = 'open'`; await sql`update card_offers set status = 'outbid' where status = 'open'`
// C has just sold three high-value cards (section 2 bought them from C)
const sell = await call('list', { id: C, cardId: gold, ask: 1000 })
assert.equal(sell.highCap, true, 'a fourth high-value sale today is refused at listing')
assert.match(String(sell.why), /卖出已满 3 笔/)
assert.equal((await call('list', { id: C, cardId: bronze, ask: 300 })).ok, true, 'cheap listings are not counted')
await sql`update card_offers set settled = now() - interval '2 days' where status = 'accepted'`
assert.equal((await call('list', { id: C, cardId: gold, ask: 1000 })).ok, true, 'a new day, a new three')

await db.close()
console.log(`market caps: bronze ≤ ${PRICE_CAP.bronze}, silver ≤ ${PRICE_CAP.silver} (list, buy-now, bids); ${HIGH_VALUE_PER_DAY} high-value buys and sells a day (gold/彩卡 or ≥ ${HIGH_VALUE_PRICE}); cheap trades untouched`)
