import assert from 'node:assert/strict'
import { decodeDisplayName } from '../src/engine/displayText'
import { BASE_PLAYER_CARDS } from '../src/engine/cards'
import rawWorld from '../src/data/world.json'

// Direct helper behaviour
assert.equal(decodeDisplayName('Ha-Lim&amp;nbsp;&quot;Joseph&quot; Hong'), 'Ha-Lim "Joseph" Hong')
assert.equal(decodeDisplayName('Joseph&amp;nbsp;Joon Pyun'), 'Joseph Joon Pyun')
assert.equal(decodeDisplayName('José &amp; Renée'), 'José & Renée')
assert.equal(decodeDisplayName('Björk &copy; Guðmundsdóttir'), 'Björk &copy; Guðmundsdóttir')
assert.equal(decodeDisplayName(null), null)
assert.equal(decodeDisplayName(undefined), null)

// The 44 raw names decode to contain no remaining known entities
const rawPlayers = rawWorld.players as Array<{ id: string; realName?: string | null }>
let decodedWithKnownEntities = 0
for (const p of rawPlayers) {
  const decoded = decodeDisplayName(p.realName ?? null)
  if (decoded == null) continue
  if (/&(?:amp|nbsp|quot|apos|lt|gt);|&#(?:39|34|160);/.test(decoded)) {
    decodedWithKnownEntities++
  }
}
assert.equal(decodedWithKnownEntities, 0)

// BASE_PLAYER_CARDS applies the helper to Levitate
const levitate = BASE_PLAYER_CARDS.find((c) => c.ign === 'Levitate')
assert.ok(levitate)
assert.equal(levitate.realName, 'Ha-Lim "Joseph" Hong')

// id and rating mapping remain intact against raw world data
const rawById = new Map(rawPlayers.map((p) => [p.id, p]))
for (const card of BASE_PLAYER_CARDS) {
  const raw = rawById.get(card.playerId)
  assert.ok(raw, `card playerId ${card.playerId} missing from world.json`)
  assert.equal(card.rating, (raw as { overall?: number }).overall)
}

console.log('display text checks passed')
