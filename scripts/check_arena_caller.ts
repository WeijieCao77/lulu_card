/**
 * The caller in a card match is the best 运营 (igl attribute) on the five, whatever the cards' 「运营」 tag says
 * (owner, 2026-09-27): the tag is information only and can neither help nor cost a five.
 *
 *   npx tsx scripts/check_arena_caller.ts
 */
import assert from 'node:assert/strict'
import { ARENA_TEAM, buildArena } from '../src/engine/arena'
import { BASE_PLAYER_CARDS, isPlayerCard } from '../src/engine/cards'
import { callerOf } from '../src/engine/roster'

const roles = ['上单', '打野', '中单', '下路', '辅助'] as const
// a tagged card with modest 运营, and untagged teammates, one of them with more 运营
const tagged = BASE_PLAYER_CARDS.filter((c) => isPlayerCard(c) && c.isIgl).sort((a, b) => a.attrs.igl - b.attrs.igl)[0]
const used = new Set([tagged.ign])
const rest = roles.filter((r) => !tagged.roles.includes(r)).slice(0, 4).map((r) => {
  const c = BASE_PLAYER_CARDS.filter((c) => !c.isIgl && c.roles.includes(r) && !used.has(c.ign)).sort((a, b) => b.attrs.igl - a.attrs.igl)[0]
  used.add(c.ign)
  return c
})
const best = [...rest].sort((a, b) => b.attrs.igl - a.attrs.igl)[0]
assert.ok(best.attrs.igl > tagged.attrs.igl, 'the setup has an untagged teammate with more 运营')

for (const withTag of [true, false]) {
  const five = withTag ? [tagged, ...rest] : [rest[0], ...rest.slice(1), BASE_PLAYER_CARDS.find((c) => !c.isIgl && !used.has(c.ign))!]
  const arena = buildArena({ slots: five.map((c) => c.id), coach: null }, () => 0, 100)
  const players = Object.values(arena.state.players).filter((p) => p.teamId === ARENA_TEAM)
  const callers = players.filter((p) => p.isIgl)
  assert.equal(callers.length, 1, 'exactly one caller on the five')
  const top = players.slice().sort((a, b) => b.attrs.igl - a.attrs.igl)[0]
  assert.equal(callers[0].id, top.id, `the caller is the best 运营 on the five (${withTag ? 'with' : 'without'} a tagged card)`)
  assert.equal(callerOf(arena.state, ARENA_TEAM, players)?.id, top.id, 'the match engine asks the same man')
}
console.log(`arena caller: the best 运营 on the five calls (${best.ign} ${best.attrs.igl} over tagged ${tagged.ign} ${tagged.attrs.igl}); the tag decides nothing`)
