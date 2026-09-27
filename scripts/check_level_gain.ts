/**
 * A level is worth 1.5 points (2026-09-27, as Val_Manager b0f2d3c), everywhere it is counted, and a five with
 * nobody flagged 指挥 is no longer marked down.
 *
 *   npx tsx scripts/check_level_gain.ts
 */
import assert from 'node:assert/strict'
import { BASE_PLAYER_CARDS, COACH_CARDS, COACH_LEVEL_LIFT, LEVEL_GAIN, NO_IGL_PENALTY, POWER_PER_LEVEL, POWER_PER_POINT, cardPower, chemistry, squadPaper } from '../src/engine/cards.ts'
import { ARENA_TEAM, buildArena } from '../src/engine/arena.ts'

assert.equal(LEVEL_GAIN, 1.5)
assert.equal(POWER_PER_LEVEL, POWER_PER_POINT * 1.5)
assert.equal(COACH_LEVEL_LIFT, 0.3)
const card = BASE_PLAYER_CARDS.find((c) => c.rarity === 'gold')!
assert.equal(cardPower(card, 5) - cardPower(card, 0), 5 * POWER_PER_LEVEL, 'a +5 card: five levels of 1.5')

// the five on paper: one +5 card moves the mean by 1.5 (7.5 / 5)
const five = BASE_PLAYER_CARDS.filter((c) => c.clubId === card.clubId).slice(0, 5)
const squad = { slots: five.map((c) => c.id), coach: null }
const base = squadPaper(squad, () => 0)
const one = squadPaper(squad, (id) => (id === five[0].id ? 5 : 0))
assert(Math.abs(one.score - base.score - 1.5) < 1e-9, `one +5 card is 1.5 阵容分, got ${one.score - base.score}`)
const all = squadPaper(squad, () => 5)
assert(Math.abs(all.score - base.score - 7.5) < 1e-9, `five +5 cards are 7.5 阵容分, got ${all.score - base.score}`)

// a coach's level is worth to the five what one player's level is
const coach = COACH_CARDS.find((c) => c.clubId === card.clubId && !c.legend) ?? COACH_CARDS[0]
const coached = { slots: squad.slots, coach: coach.id }
const c0 = squadPaper(coached, () => 0), c5 = squadPaper(coached, (id) => (id === coach.id ? 5 : 0))
assert(Math.abs(c5.score - c0.score - 1.5) < 1e-9, `a +5 coach is 1.5 阵容分, got ${c5.score - c0.score}`)

// the match sees the same levels: a +5 card plays stronger than the same card at +0
const at = (lv: number) => buildArena({ slots: [five[0].id, null, null, null, null], coach: null }, () => lv, 100)
const mine = (lv: number) => Object.values(at(lv).state.players).find((p) => p.teamId === ARENA_TEAM && p.ign === five[0].ign)!
const p0 = mine(0), p5 = mine(5)
assert(p5.overall > p0.overall, 'levels reach the match')

// nobody flagged 指挥: no mark-down any more
assert.equal(NO_IGL_PENALTY, 0)
const uncalled = BASE_PLAYER_CARDS.filter((c) => !c.isIgl).slice(0, 5)
const paper = squadPaper({ slots: uncalled.map((c) => c.id), coach: null })
assert.equal(paper.uncalled, 0)
assert(!chemistry({ slots: uncalled.map((c) => c.id), coach: null }).notes.some((n) => n.includes('队长')))
console.log('level gain: +1.5 a level on card, paper and match; coach +0.3; no 指挥 penalty')
