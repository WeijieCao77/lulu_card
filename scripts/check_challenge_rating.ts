/**
 * 「挑战里 Raptor 85，图鉴里 81」: the daily challenge shows the same rating as the player's ordinary card.
 *
 *   npx tsx scripts/check_challenge_rating.ts
 */
import assert from 'node:assert/strict'
import { answerPool, evaluate } from '../src/engine/challenge.ts'
import { cardById } from '../src/engine/cards.ts'

const pool = answerPool('player')
assert(pool.length > 50)
let checked = 0
for (const id of pool) {
  const card = cardById(`p:${id}`)
  if (!card || card.kind !== 'player') continue
  const cell = evaluate('player', pool[0], id).cells.find((c) => c.label === '能力')
  assert.equal(cell?.value, String(card.rating), `${card.ign}: challenge ${cell?.value}, card ${card.rating}`)
  checked++
}
const raptor = pool.find((id) => cardById(`p:${id}`)?.kind === 'player' && (cardById(`p:${id}`) as { ign: string }).ign === 'Raptor')
if (raptor) assert.equal(evaluate('player', pool[0], raptor).cells.find((c) => c.label === '能力')?.value, String(cardById(`p:${raptor}`)!.rating))
console.log(`challenge rating: ${checked} players show their ordinary card's rating${raptor ? ` (Raptor ${cardById(`p:${raptor}`)!.rating})` : ''}`)
