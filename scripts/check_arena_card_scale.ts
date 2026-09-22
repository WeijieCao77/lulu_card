import { ladderPool, DIVISIONS } from '../src/engine/gacha'
/**
 * Arena natural opponents must use the same new-card scale as the player's
 * own squad: same five ordinary cards seated as a 101-world club and as an
 * arena opponent must produce identical per-player attributes and overall,
 * and the opponent rating must match squadPaper on the new scale.
 */
import assert from 'node:assert/strict'
import { buildArena, arenaOpponentSquad, arenaOpponentRating, ARENA_TEAM } from '../src/engine/arena'
import { WORLD_TEAMS } from '../src/engine/teams'
import { WORLD_PLAYERS } from '../src/engine/world'
import { squadPaper, cardById, isPlayerCard, SQUAD_SLOTS, personOf } from '../src/engine/cards'

let checked = 0

const originalWorld = structuredClone(WORLD_TEAMS)
const originalPlayers = structuredClone(WORLD_PLAYERS)

for (const team of WORLD_TEAMS) {
  // 101 world teams only: this is the natural-opponent cache scope.
  if (!('roster' in team)) continue
  const squad = arenaOpponentSquad(team.id)
  if (!squad) throw new Error(`Missing opponent squad for ${team.id}`)
  if (squad.slots.length !== 5) throw new Error(`${team.id} should seat exactly 5 cards`)
  if (!squad.slots.every(id => id !== null && isPlayerCard(cardById(id)))) {
    throw new Error(`${team.id} has a non-player card in opponent squad`)
  }

  // Five distinct people, preserving the old cache rule.
  const people = squad.slots.map(id => personOf(cardById(id)!))
  if (new Set(people).size !== 5) throw new Error(`${team.id} has duplicate people`)

  const rating = arenaOpponentRating(team.id)
  if (rating === undefined) throw new Error(`Missing opponent rating for ${team.id}`)
  if (rating !== squadPaper(squad).score) throw new Error(`${team.id} rating mismatch`)

  // Coach must be from the team's actual COACH_CARDS entry, not invented.
  if (squad.coach !== null) {
    const ccard = cardById(squad.coach)
    if (!ccard || ccard.kind !== 'coach') throw new Error(`${team.id} has invalid coach card`)
    if (ccard.clubId !== team.id || ccard.name !== team.coach?.name) {
      throw new Error(`${team.id} coach is not the team's actual coach card`)
    }
  }

  // Build the arena once and compare AS-seated opponent starters against
  // the same squad seated as a user side with identical ids.
  const { state } = buildArena(squad, () => 0, 12345)

  const starters = state.teams[team.id]?.starters ?? []
  if (starters.length !== 5) throw new Error(`${team.id} has ${starters.length} starters after arena seating`)
  if (state.teams[team.id].rating !== rating) throw new Error(`${team.id} state rating not set to arena rating`)

  for (let i = 0; i < 5; i++) {
    const opponentPid = starters[i]
    const comparePid = state.teams[ARENA_TEAM].starters[i]
    const op = state.players[opponentPid]
    const cp = state.players[comparePid]
    if (!op || !cp) throw new Error(`Missing player for ${team.id} slot ${i}`)
    if (op.overall !== cp.overall) {
      throw new Error(`${team.id} overall mismatch at slot ${i}: AS=${op.overall} CMP=${cp.overall}`)
    }
    for (const k of Object.keys(op.attrs) as (keyof typeof op.attrs)[]) {
      if (op.attrs[k] !== cp.attrs[k]) {
        throw new Error(`${team.id} ${String(k)} mismatch at slot ${i}: AS=${op.attrs[k]} CMP=${cp.attrs[k]}`)
      }
    }
    // Roles must follow SQUAD_SLOTS.
    if (op.role !== SQUAD_SLOTS[i]) throw new Error(`${team.id} slot ${i} role mismatch`)
  }

  checked++
}

if (WORLD_TEAMS.some((t, i) => JSON.stringify(t) !== JSON.stringify(originalWorld[i]))) {
  throw new Error('WORLD_TEAMS was mutated during arena opponent checks')
}

if (checked < 100) throw new Error(`Expected at least 100 101-world teams, got ${checked}`)

const nativeID = WORLD_TEAMS.some(t => t.roster.some(pid => /^AS:/.test(pid)))
if (nativeID) throw new Error('Expected native player ids and AS clone ids to coexist only in arena state, not WORLD_TEAMS')

assert.deepEqual(WORLD_PLAYERS, originalPlayers, 'raw player data unchanged')
console.log(`check_arena_card_scale: ${checked} arena opponents validated at new card scale`)

let lastMean = -Infinity
for (let div = 0; div < DIVISIONS.length; div++) {
  const ids = ladderPool(div)
  assert.ok(ids.length > 0, `ladder division ${div} empty`)
  const ratings = ids.map(id => {
    const value = arenaOpponentRating(id)
    assert.ok(value !== undefined && Number.isFinite(value), `${id} has no new card rating`)
    return value!
  })
  const mean = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
  assert.ok(mean >= lastMean, `ladder division ${div} new paper mean fell`)
  lastMean = mean
}
console.log('ladder division average strength rises on the new card scale')
