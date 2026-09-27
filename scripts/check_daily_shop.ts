/**
 * 每日商店 (owner, 2026-09-27): five cards a day per account — four players, one coach — fixed prices by metal,
 * one slot preferring a card not owned, each slot sold once, refreshed daily, rolled and kept by the server.
 * A card bought here waits the market's hold before it can be listed or swapped.
 *
 *   npx tsx scripts/check_daily_shop.ts
 */
import assert from 'node:assert/strict'
import { runAction } from '../src/engine/cardActions'
import type { ActEnv } from '../src/engine/cardActions'
import { newGacha, SERVER_KEYS, mergeClientFields } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { cardById, BASE_PLAYER_CARDS } from '../src/engine/cards'
import { rollShop, SHOP_PRICE } from '../src/engine/dailyShop'
import { HOLD_MS, tradeableCopies } from '../src/engine/tradeLock'

const store = new Map<string, string>()
;(globalThis as never as { localStorage: unknown }) = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }, key: () => null, clear: () => store.clear(), get length() { return store.size },
}
const env = (today: string, seed = 7): ActEnv => ({ now: Date.parse(`${today}T12:00:00+08:00`), today, seed })

// 1. the shelf: 4 players then 1 coach, no 彩卡, no repeats, prices by metal, one slot for a card not owned
const g = newGacha('VM-SHOP', '审计', '2026-09-27') as GachaState
g.coins = 100_000
const r = runAction(g, 'shop', {}, env('2026-09-27'))
assert.equal(r.ok, true)
const shop = g.shop!
assert.equal(shop.day, '2026-09-27')
assert.equal(shop.slots.length, 5)
const cards = shop.slots.map((s) => cardById(s.cardId)!)
assert.deepEqual(cards.map((c) => c.kind), ['player', 'player', 'player', 'player', 'coach'])
assert.ok(cards.every((c) => !c.legend && c.rarity !== 'mythic'), 'no 彩卡')
assert.equal(new Set(shop.slots.map((s) => s.cardId)).size, 5, 'no card twice')
shop.slots.forEach((s, i) => assert.equal(s.price, SHOP_PRICE[cards[i].rarity as 'gold'], `price by metal: ${cards[i].rarity}`))
assert.equal(shop.slots[0].fresh, true, 'the first slot is a card this account does not have')
assert.ok(!g.cards[shop.slots[0].cardId])

// asking again the same day keeps the same shelf; the client cannot hand in its own
const same = JSON.stringify(g.shop)
runAction(g, 'shop', {}, env('2026-09-27', 99))
assert.equal(JSON.stringify(g.shop), same, 'one shelf a day')
assert.ok((SERVER_KEYS as readonly string[]).includes('shop'), 'the shelf is server-owned')
const forged = { ...g, shop: { day: '2026-09-27', slots: [{ cardId: BASE_PLAYER_CARDS.find((c) => c.rarity === 'gold')!.id, price: 1 }] } }
assert.equal(JSON.stringify(mergeClientFields(g, forged as never).shop), same, 'a forged shelf from the client is ignored')

// 2. buying: coins out, card in, held like a market purchase, each slot once
const before = g.coins
const b1 = runAction(g, 'shop_buy', { slot: 0 }, env('2026-09-27'))
assert.equal(b1.ok, true)
assert.equal(before - g.coins, shop.slots[0].price)
const got = g.cards[g.shop!.slots[0].cardId]
assert.ok(got, 'the card is in the collection')
const t = env('2026-09-27').now
assert.equal(tradeableCopies(got, t), 0, 'held: not listable yet')
assert.equal(tradeableCopies(got, t + HOLD_MS + 1), 1, 'after the hold it trades like any card')
const again = runAction(g, 'shop_buy', { slot: 0 }, env('2026-09-27'))
assert.equal(again.ok, false, 'a slot sells once')
const poor = newGacha('VM-POOR', '审计', '2026-09-27') as GachaState
poor.coins = 0
runAction(poor, 'shop', {}, env('2026-09-27'))
const broke = runAction(poor, 'shop_buy', { slot: 1 }, env('2026-09-27'))
assert.equal(broke.ok, false)
assert.match(String((broke as { why?: string }).why), /金币不够/)

// 3. a new day, a new shelf
runAction(g, 'shop', {}, env('2026-09-28', 8))
assert.equal(g.shop!.day, '2026-09-28')
assert.ok(g.shop!.slots.every((s) => !s.bought), 'nothing bought on the new shelf')
const stale = runAction(g, 'shop_buy', { slot: 9 }, env('2026-09-28'))
assert.equal(stale.ok, false)

// 4. the metals over many shelves: about 55 / 33 / 12
const n = { bronze: 0, silver: 0, gold: 0 } as Record<string, number>
for (let i = 0; i < 4000; i++) for (const s of rollShop(g, '2026-10-01', i * 2654435761).slots) n[cardById(s.cardId)!.rarity]++
const total = n.bronze + n.silver + n.gold
const pct = (k: string) => n[k] / total
assert.ok(Math.abs(pct('gold') - 0.12) < 0.015 && Math.abs(pct('silver') - 0.33) < 0.02 && Math.abs(pct('bronze') - 0.55) < 0.02,
  `metals ${JSON.stringify(n)}`)

console.log(`daily shop: 4 players + 1 coach, bronze ${SHOP_PRICE.bronze} / silver ${SHOP_PRICE.silver} / gold ${SHOP_PRICE.gold}, `
  + `gold ${(pct('gold') * 100).toFixed(1)}% silver ${(pct('silver') * 100).toFixed(1)}%, held like a market buy, server-owned`)
