import assert from 'node:assert/strict'
import { createNewGame } from '../src/engine/world'
import { WORLD_TEAMS } from '../src/engine/teams'
import { simulateLolMatch } from '../src/engine/lolMatch'
import { Rng } from '../src/engine/rng'
import { playRivalMatch } from '../src/engine/arena'
import { playOpenCupMatch } from '../src/engine/openCup'
import { CUP_TEAMS } from '../src/engine/cupTeams'

const [a, b] = WORLD_TEAMS.slice(0, 2).map(t => t.id)
const state = createNewGame(a, '验收', 14, undefined, { cards: true })
state.cardMatchStrength = { [a]: 80, [b]: 80 }
const before = JSON.stringify(state)
const original = simulateLolMatch(state, a, b, 5, new Rng(99))
simulateLolMatch(state, a, b, 3, new Rng(193))
assert.deepEqual(original, simulateLolMatch(state, a, b, 5, new Rng(99)), 'replay deterministic even after another simulation')
assert.equal(JSON.stringify(state), before, 'no mutation of saved input')
let wins = 0, games = 0, seconds = 0, kills = 0, lowerKillWins = 0
const times = new Set<number>()
for (let seed = 1; seed <= 600; seed++) {
  const bo = ([1, 3, 5] as const)[seed % 3]
  const r = simulateLolMatch(state, a, b, bo, new Rng(seed * 7919))
  assert.equal(r.format, 'lol-v1')
  assert.equal(Math.max(r.mapsWonA, r.mapsWonB), (bo + 1) / 2)
  assert.equal(r.maps.length, r.mapsWonA + r.mapsWonB)
  assert(r.maps.length <= bo)
  if (r.mapsWonA > r.mapsWonB) wins++
  assert.equal(r.maps.filter(m => m.lol!.winner === 'A').length, r.mapsWonA)
  for (const m of r.maps) {
    const lo = m.lol!, la = r.lineups!.a.map(id => m.lines[id]), lb = r.lineups!.b.map(id => m.lines[id])
    const sum = (ls: typeof la, k: 'kills' | 'deaths' | 'gold') => ls.reduce((n, l) => n + (l[k] ?? 0), 0)
    assert.equal(sum(la, 'kills'), sum(lb, 'deaths')); assert.equal(sum(lb, 'kills'), sum(la, 'deaths'))
    assert.equal(sum(la, 'kills'), m.scoreA); assert.equal(sum(lb, 'kills'), m.scoreB)
    assert.equal(sum(la, 'gold'), lo.goldA); assert.equal(sum(lb, 'gold'), lo.goldB)
    assert.equal([...la, ...lb].reduce((n, l) => n + l.firstKills, 0), m.scoreA + m.scoreB ? 1 : 0)
    for (const [ls, total] of [[la, m.scoreA], [lb, m.scoreB]] as const) for (const l of ls) {
      assert(l.assists <= total - l.kills)
      assert(l.kills >= 0 && l.deaths >= 0 && l.assists >= 0 && l.cs! >= 0)
      assert.equal(l.rounds, 0); assert.equal(l.clutches, 0)
    }
    assert(!m.rounds?.length)
    assert(lo.durationSeconds >= 1440 && lo.durationSeconds < 3060)
    assert(lo.towersA <= 11 && lo.towersB <= 11)
    assert((lo.winner === 'A' ? lo.towersA : lo.towersB) >= 5)
    assert(lo.dragonsA + lo.dragonsB <= 1 + Math.floor((lo.durationSeconds / 60 - 5) / 5))
    assert(lo.baronsA + lo.baronsB <= 1 + Math.floor((lo.durationSeconds / 60 - 20) / 6))
    assert(lo.events.at(-1)!.text.includes('摧毁水晶'))
    assert(lo.events.every((e, i) => e.minute <= lo.durationSeconds / 60 && (!i || e.minute >= lo.events[i - 1].minute)))
    if ((lo.winner === 'A' && m.scoreA < m.scoreB) || (lo.winner === 'B' && m.scoreB < m.scoreA)) lowerKillWins++
    games++; seconds += lo.durationSeconds; kills += m.scoreA + m.scoreB; times.add(Math.floor(lo.durationSeconds / 60))
  }
}
assert(wins > 240 && wins < 360, 'equal teams must not have strong seat bias')
assert(times.size > 8 && seconds / games / 60 < 43, 'games must not all reach timeout')
assert(kills / games > 15 && kills / games < 45, 'LoL-scale kills, not VAL-round totals')
assert(lowerKillWins > 10, 'kills do not directly decide victory')
let strongWins = 0
state.cardMatchStrength = { [a]: 94, [b]: 80 }
for (let seed = 1; seed <= 200; seed++) if (simulateLolMatch(state, a, b, 1, new Rng(seed * 7919)).mapsWonA) strongWins++
assert(strongWins > 130 && strongWins < 200, 'paper-strength advantage works without guaranteed wins')
const squad = CUP_TEAMS[0].squad
const rival = { ...squad, name: '验收对手', tag: 'QA', levels: {}, div: 0, points: 0 }
const cardResult = playRivalMatch(squad, () => 0, rival, 5, 99, undefined, true)
for (const side of [cardResult, cardResult.opp!]) for (const l of side.lines) {
  assert(l.playerId)
  assert.equal(l.kills, cardResult.result.maps.reduce((n, m) => n + m.lines[l.playerId!].kills, 0))
}
const cup = playOpenCupMatch(rival, rival, false, 99)
assert.equal(cup.detail.format, 'lol-v1')
assert(cup.detail.maps.every(m => m.lol && Object.keys(m.lines!).length === 10))
console.log(JSON.stringify({ pass: true, games, equalSeriesWins: wins + '/600', avgMinutes: seconds / games / 60, avgCombinedKills: kills / games, lowerKillWins, strongWins: strongWins + '/200' }))
