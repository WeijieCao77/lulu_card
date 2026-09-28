/** Duplicate-card merge (cards.ts MERGED_CARDS): node --import tsx scripts/check_card_merge.ts */
import assert from 'node:assert/strict'
import { ALL_CARDS, MERGED_CARDS, cardById } from '../src/engine/cards'
import { mergeClientFields, migrateGacha, newGacha } from '../src/engine/gacha'

Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, fetch: undefined })

const [from, to] = Object.entries(MERGED_CARDS)[0]
assert(!ALL_CARDS.some((c) => c.id === from), 'retired id is no longer dealt')
assert.equal(cardById(from)?.id, to, 'retired id still resolves to the kept card')

const fresh = (cards: Record<string, object>) => {
  const g = newGacha('VM-MERGE-TEST-0000-0000-0000', 'test', '2026-09-28') as ReturnType<typeof newGacha>
  g.cards = cards as never
  return g
}

// only the retired card: renamed, nothing else changes
let g = migrateGacha(JSON.parse(JSON.stringify(fresh({ [from]: { id: from, level: 2, dupes: 3, seen: 4, got: '2026-09-26' } }))), 'VM-MERGE-TEST-0000-0000-0000')
assert(!g.cards[from])
assert.deepEqual({ ...g.cards[to], got: undefined }, { id: to, level: 2, dupes: 3, seen: 4, got: undefined })

// both: higher level wins, the other becomes an upgraded spare, counts add up
g = fresh({
  [from]: { id: from, level: 3, dupes: 1, seen: 2, got: '2026-09-25', holds: [111] },
  [to]: { id: to, level: 1, dupes: 2, seen: 3, got: '2026-09-27', bound: 1, spares: [2] },
})
g.squad = { slots: [from, null, null, null, null], coach: null }
g.presets = [{ name: 'a', squad: { slots: [from, to, null, null, null], coach: null } }]
g.cupSquads = { club: { slots: [from, null, null, null, null], coach: null } }
g = migrateGacha(JSON.parse(JSON.stringify(g)), g.id)
const m = g.cards[to]
assert.equal(m.level, 3)
assert.equal(m.dupes, 3, 'dupes add; the +1 copy is a spare, not a dupe')
assert.deepEqual(m.spares, [1, 2])
assert.equal(m.seen, 5)
assert.equal(m.got, '2026-09-25')
assert.equal(m.bound, 1)
assert.deepEqual(m.holds, [111])
assert.equal(g.squad.slots[0], to)
assert.deepEqual(g.presets![0]!.squad.slots, [to, null, null, null, null], 'same person twice collapses to one seat')
assert.equal(g.cupSquads!.club!.slots[0], to)

// a client still sending the retired id keeps its seat
const merged = mergeClientFields(g, { squad: { slots: [from, null, null, null, null], coach: null } })
assert.equal(merged.squad.slots[0], to)

// idempotent
const again = migrateGacha(JSON.parse(JSON.stringify(g)), g.id)
assert.deepEqual(again.cards[to], g.cards[to])
console.log(`ok ${Object.keys(MERGED_CARDS).length} merged ids: rename, fold, lineups, client squad, idempotent`)
