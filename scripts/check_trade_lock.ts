/**
 * Trade locks (owner, 2026-09-27): the first 50 pulls are bound, and a card bought or swapped in waits
 * three days before it can be listed or swapped again. Bound and held copies still play, level and salvage.
 *
 *   npx tsx scripts/check_trade_lock.ts
 */
import assert from 'node:assert/strict'
import { newGacha, openPack, salvage, upgrade } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { applyMail, escrowCard } from '../src/engine/inbox'
import { BOUND_PULLS, HOLD_MS, boundOf, notePull, tradeableCopies } from '../src/engine/tradeLock'
import { marketSaleLevel } from '../src/engine/marketGuidance'
import { PLAYER_CARDS } from '../src/engine/cards'

const store = new Map<string, string>()
;(globalThis as never as { localStorage: unknown }) = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }, key: () => null, clear: () => store.clear(), get length() { return store.size },
}
const now = Date.now()
const copies = (g: GachaState, id: string) => { const o = g.cards[id]; return o ? 1 + o.dupes + (o.spares?.length ?? 0) : 0 }

// 1. binding is switched off for now (BOUND_PULLS = 0): a new account's pulls trade like any other
assert.equal(BOUND_PULLS, 0, 'binding stays off until the owner turns it on')
const g = newGacha('VM-LOCK', '审计', '2026-09-27') as GachaState
for (let i = 0; i < 5; i++) { g.packs.elite = 1; openPack(g, 'elite', 'pack') }
assert.ok(Object.values(g.cards).every((o) => boundOf(o) === 0), 'nothing bound while it is off')
// ...and the mechanism, when on, binds exactly the pulls under the limit
const probe = { id: 'x', level: 0, dupes: 2, seen: 3, got: '2026-09-27' }
notePull(probe, 49, 50); notePull(probe, 50, 50)
assert.equal(boundOf(probe), 1, 'pull 49 bound, pull 50 not')
const onlyBound = { id: PLAYER_CARDS[0].id, level: 0, dupes: 1, seen: 2, got: '2026-09-27', bound: 2 }
const gb = newGacha('VM-BOUND', '审计', '2026-09-27') as GachaState
gb.cards[onlyBound.id] = onlyBound
const r1 = escrowCard(gb, onlyBound.id, undefined, now)
assert.equal(r1.ok, false)
assert.match(r1.locked ?? '', /绑定卡/, 'a bound card says why')
assert.equal(marketSaleLevel(onlyBound), null, 'the sale preview agrees nothing leaves')

// 2. a free duplicate goes before a bound one, and the bound copies stay behind
const mixed = { id: PLAYER_CARDS[1].id, level: 0, dupes: 2, seen: 3, got: '2026-09-27', bound: 2 }
gb.cards[mixed.id] = mixed
assert.equal(tradeableCopies(mixed, now), 1)
assert.equal(escrowCard(gb, mixed.id, undefined, now).ok, true)
assert.equal(boundOf(gb.cards[mixed.id]), 2, 'the bound copies stay behind')
assert.equal(escrowCard(gb, mixed.id, undefined, now).ok, false, 'and do not follow')

// 3. levelling and salvage spend bound copies first: nothing is lost to the lock
const h = newGacha('VM-SPEND', '审计', '2026-09-27') as GachaState
const card = PLAYER_CARDS.find((c) => c.rarity === 'bronze')!
h.cards[card.id] = { id: card.id, level: 0, dupes: 4, seen: 5, got: '2026-09-27', bound: 3 } // card + 2 dupes bound, 2 dupes free
h.coins = 1_000_000
assert.equal(tradeableCopies(h.cards[card.id], now), 2)
salvage(h, card.id, 1)
assert.equal(boundOf(h.cards[card.id]), 2, 'salvage spent a bound duplicate')
assert.equal(tradeableCopies(h.cards[card.id], now), 2, 'the free copies are still free')
upgrade(h, card.id) // +0 -> +1 costs one duplicate
assert.equal(boundOf(h.cards[card.id]), 1, 'levelling spent the last bound duplicate')
assert.equal(tradeableCopies(h.cards[card.id], now), 2)

// 4. bought or swapped in: held three days; an unsold listing coming home is not
const m = newGacha('VM-HOLD', '审计', '2026-09-27') as GachaState
const gold = PLAYER_CARDS.find((c) => c.rarity === 'gold')!
const silver = PLAYER_CARDS.find((c) => c.rarity === 'silver')!
applyMail(m, [
  { kind: 'bought', cardId: gold.id, level: 0, coins: 0, count: 0, body: {}, at: now } as never,
  { kind: 'unsold', cardId: silver.id, level: 0, coins: 0, count: 0, body: {}, at: now } as never,
])
assert.equal(copies(m, gold.id), 1)
assert.equal(tradeableCopies(m.cards[gold.id], now), 0, 'a bought card is on hold')
const r3 = escrowCard(m, gold.id, undefined, now)
assert.equal(r3.ok, false)
assert.match(r3.locked ?? '', /交易得来.*3 天/, `the hold says how long: ${r3.locked}`)
assert.equal(tradeableCopies(m.cards[silver.id], now), 1, 'your own card coming back is not held')
assert.equal(tradeableCopies(m.cards[gold.id], now + HOLD_MS + 1), 1, 'three days on it may trade again')
assert.equal(escrowCard(m, gold.id, undefined, now + HOLD_MS + 1).ok, true)

// 5. a second copy bought: one held, and the older free copy can still go
const k = newGacha('VM-HOLD2', '审计', '2026-09-27') as GachaState
k.cards[gold.id] = { id: gold.id, level: 0, dupes: 0, seen: 1, got: '2026-09-01' }
applyMail(k, [{ kind: 'swap_in', cardId: gold.id, level: 0, coins: 0, count: 0, body: {}, at: now } as never])
assert.equal(copies(k, gold.id), 2)
assert.equal(tradeableCopies(k.cards[gold.id], now), 1)
assert.equal(escrowCard(k, gold.id, undefined, now).ok, true)
assert.equal(escrowCard(k, gold.id, undefined, now).ok, false, 'the swapped-in copy waits')

console.log(`trade locks: binding off (mechanism checked), traded-in copies held ${HOLD_MS / 86_400_000} days; locked copies still level and salvage first`)
