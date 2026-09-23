import assert from 'node:assert/strict'
import { suggestMarketPrice, marketSaleLevel, hasMarketDuplicates } from '../src/engine/marketGuidance'
import { sparesOf } from '../src/engine/inbox'
import { ALL_CARDS, MAX_LEVEL } from '../src/engine/cards'
import { escrowCard } from '../src/engine/inbox'
import type { GachaState } from '../src/engine/gacha'
import type { MarketHistoryReply } from '../src/engine/market'

const now = Date.UTC(2025, 0, 15, 12, 0, 0)
const day = 86_400_000
const cardId = ALL_CARDS[0].id

function history(partial: Partial<MarketHistoryReply>): MarketHistoryReply {
  return {
    ok: true,
    cardId,
    sold: 4,
    avg: 3700,
    median: 3700,
    week: { sold: 4, avg: 3700 },
    level: { level: 2, sold: 4, avg: 3700 },
    recent: [
      { price: 3500, level: 2, at: new Date(now - 1 * day).toISOString() },
      { price: 3600, level: 2, at: new Date(now - 2 * day).toISOString() },
      { price: 3800, level: 2, at: new Date(now - 3 * day).toISOString() },
      { price: 3700, level: 2, at: new Date(now - 4 * day).toISOString() },
    ],
    ...partial,
  }
}

// invalid payloads, mismatches, wrong levels, empty/small samples
assert.equal(suggestMarketPrice(null, cardId, 1, 60, now), null)
assert.equal(suggestMarketPrice(undefined, cardId, 1, 60, now), null)
assert.equal(suggestMarketPrice(history({ ok: false }), cardId, 2, 60, now), null)
assert.equal(suggestMarketPrice(history({ cardId: 'other' }), cardId, 2, 60, now), null)
assert.equal(suggestMarketPrice(history({}), cardId, 3, 60, now), null)
assert.equal(suggestMarketPrice(history({ recent: [] }), cardId, 2, 60, now), null)
assert.equal(suggestMarketPrice(history({ recent: [{ price: 100, level: 2, at: new Date(now - 1 * day).toISOString() }] }), cardId, 2, 60, now), null)
assert.equal(suggestMarketPrice(history({ recent: [
  { price: 100, level: 2, at: new Date(now - 1 * day).toISOString() },
  { price: 100, level: 2, at: new Date(now - 2 * day).toISOString() },
] }), cardId, 2, 60, now), null)
assert.equal(suggestMarketPrice(history({}), '', 2, 60, now), null)
assert.equal(suggestMarketPrice(history({}), cardId, 2, 0, now), null)
assert.equal(suggestMarketPrice(history({}), cardId, 2, 60.5, now), null)
assert.equal(suggestMarketPrice(history({}), cardId, 2, 999999, now), null)
assert.equal(suggestMarketPrice(history({}), cardId, 2, 60, 0), null)

// 7-day median uses same-level latest 8
const sevenDayResult = suggestMarketPrice(history({ recent: [
  { price: 1, level: 2, at: new Date(now - 6 * day).toISOString() },
  { price: 5000, level: 2, at: new Date(now - 5 * day).toISOString() },
  { price: 2500, level: 2, at: new Date(now - 4 * day).toISOString() },
  { price: 2600, level: 2, at: new Date(now - 3 * day).toISOString() },
] }), cardId, 2, 60, now)
assert.ok(sevenDayResult)
assert.equal(sevenDayResult.days, 7)
assert.equal(sevenDayResult.sample, 4)
assert.equal(sevenDayResult.median, 2550)
assert.equal(sevenDayResult.price, 2550)
assert.equal(sevenDayResult.floorApplied, false)

// 30-day fallback when fewer than 3 in 7 days
const thirtyDayResult = suggestMarketPrice(history({ recent: [
  { price: 4200, level: 2, at: new Date(now - 1 * day).toISOString() },
  { price: 4000, level: 2, at: new Date(now - 2 * day).toISOString() },
  { price: 4100, level: 2, at: new Date(now - 12 * day).toISOString() },
  { price: 3900, level: 2, at: new Date(now - 13 * day).toISOString() },
] }), cardId, 2, 60, now)
assert.ok(thirtyDayResult)
assert.equal(thirtyDayResult.days, 30)
assert.equal(thirtyDayResult.sample, 4)
assert.equal(thirtyDayResult.median, 4050)
assert.equal(thirtyDayResult.price, 4050)
assert.equal(thirtyDayResult.floorApplied, false)

// newest 8 overall limit; same-level filter occurs after slice
const mixedLevelsRecent = [
  { price: 10000, level: 5, at: new Date(now - 0.5 * day).toISOString() },
  { price: 10000, level: 4, at: new Date(now - 1 * day).toISOString() },
  { price: 10000, level: 5, at: new Date(now - 1.5 * day).toISOString() },
  { price: 10000, level: 4, at: new Date(now - 2 * day).toISOString() },
  { price: 10000, level: 5, at: new Date(now - 2.5 * day).toISOString() },
  { price: 10000, level: 4, at: new Date(now - 3 * day).toISOString() },
  { price: 10000, level: 5, at: new Date(now - 3.5 * day).toISOString() },
  { price: 10000, level: 4, at: new Date(now - 4 * day).toISOString() },
  { price: 2500, level: 2, at: new Date(now - 5 * day).toISOString() },
  { price: 2600, level: 2, at: new Date(now - 6 * day).toISOString() },
  { price: 2700, level: 2, at: new Date(now - 7 * day).toISOString() },
]
const newest8LimitResult = suggestMarketPrice(history({ recent: mixedLevelsRecent }), cardId, 2, 60, now)
assert.equal(newest8LimitResult, null)

// excludes future/old/wrong-level entries
const invalidEntriesRecent = [
  { price: 3000, level: 2, at: new Date(now - 1 * day).toISOString() },
  { price: 3100, level: 2, at: new Date(now - 2 * day).toISOString() },
  { price: 3200, level: 2, at: new Date(now - 3 * day).toISOString() },
  { price: 99999, level: 2, at: new Date(now + 1 * day).toISOString() },
  { price: 99999, level: 2, at: new Date(now - 31 * day).toISOString() },
  { price: 99999, level: 3, at: new Date(now - 1.5 * day).toISOString() },
]
const filteredResult = suggestMarketPrice(history({ recent: invalidEntriesRecent }), cardId, 2, 60, now)
assert.ok(filteredResult)
assert.equal(filteredResult.days, 7)
assert.equal(filteredResult.sample, 3)
assert.equal(filteredResult.median, 3100)

// floor clamp
const floorClampResult = suggestMarketPrice(history({}), cardId, 2, 4000, now)
assert.ok(floorClampResult)
assert.equal(floorClampResult.price, 4000)
assert.equal(floorClampResult.median, 3650)
assert.equal(floorClampResult.floorApplied, true)

// marketSaleLevel: dupes returns 0 (server escrow takes default duplicate), spares take lowest, else main
assert.equal(marketSaleLevel({ level: 4, dupes: 0, spares: undefined }), 4)
assert.equal(marketSaleLevel({ level: 4, dupes: 1, spares: undefined }), 0)
assert.equal(marketSaleLevel({ level: 4, dupes: 2, spares: undefined }), 0)
assert.equal(marketSaleLevel({ level: 4, dupes: 0, spares: [0, 2, 3] }), 2)
assert.equal(marketSaleLevel({ level: 4, dupes: 0, spares: [9, 2] }), 2)
assert.equal(marketSaleLevel({ level: 4, dupes: 0, spares: [1] }), 1)
assert.equal(marketSaleLevel({ level: 4, dupes: 0, spares: [] }), 4)
assert.equal(marketSaleLevel(undefined), null)
assert.equal(marketSaleLevel({ level: -1, dupes: 0, spares: [] }), null)
assert.equal(marketSaleLevel({ level: 99, dupes: 0, spares: [] }), null)

// hasMarketDuplicates
assert.equal(hasMarketDuplicates({ level: 4, dupes: 0, spares: undefined }), false)
assert.equal(hasMarketDuplicates({ level: 4, dupes: 1, spares: undefined }), true)
assert.equal(hasMarketDuplicates({ level: 4, dupes: 0, spares: [2] }), true)
assert.equal(hasMarketDuplicates({ level: 4, dupes: 0, spares: [] }), false)
assert.equal(hasMarketDuplicates(undefined), false)
assert.equal(hasMarketDuplicates({ level: -1, dupes: 0, spares: [] }), false)

// sparesOf cleans invalid entries
assert.deepEqual(sparesOf({ spares: [0, 3, '2', 5, 1, 99] }), [1, 2, 3, 5])

// escrow-card agreement for real game card with dupes/spares/main across levels
assert.ok(ALL_CARDS.length > 0, 'ALL_CARDS should not be empty')
const realCardId = ALL_CARDS[0].id
assert.ok(realCardId, 'real card should have an id')

for (let level = 0; level <= MAX_LEVEL; level++) {
  for (const owned of [{ level, dupes: 0 }, { level, dupes: 2 }, { level, dupes: 0, spares: [3, 1] }, { level, dupes: 1, spares: [2] }]) {
    const expected = marketSaleLevel(owned)
    const fakeGacha = {
      cards: { [realCardId]: structuredClone(owned) },
      squad: { slots: Array(5).fill(null), coach: null }, presets: [],
    } as unknown as GachaState
    const escrowResult = escrowCard(fakeGacha, realCardId)
    assert.equal(escrowResult.ok, true)
    assert.equal(escrowResult.level, expected, 'helper must match actual default server escrow')
  }
}
assert.equal(suggestMarketPrice(history({}), cardId, 2, null, now), null)
assert.equal(suggestMarketPrice(history({}), cardId, 2, 60, NaN), null)
for (const invalidPrice of [0, -1, 500001, Infinity, NaN, 1.5]) {
 const data = history({ recent: [100, 200, invalidPrice].map(price => ({ price, level: 2, at: new Date(now - day).toISOString() })) })
 assert.equal(suggestMarketPrice(data, cardId, 2, 60, now), null)
}
const robust = history({ recent: [1000, 1100, 499999].map(price => ({ price, level: 2, at: new Date(now - day).toISOString() })) })
assert.equal(suggestMarketPrice(robust, cardId, 2, 60, now)?.price, 1100)
assert.equal(suggestMarketPrice(robust, cardId, 2, 60, now + 31 * day), null)
console.log('market guidance checks passed: samples, median, boundaries, and 24 actual escrow fixtures')
