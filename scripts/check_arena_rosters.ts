import assert from 'node:assert/strict'
import { newGacha, pendingOpponent, repairCup, STAMINA_MAX } from '../src/engine/gacha'
import { runAction } from '../src/engine/cardActions'
import { WORLD_TEAMS } from '../src/engine/teams'
import { WORLD_PLAYERS } from '../src/engine/world'
import { CUP_TEAMS } from '../src/engine/cupTeams'
import { buildArena, buildCupArena, playArenaMatch } from '../src/engine/arena'
import { BASE_PLAYER_CARDS, SQUAD_SLOTS, personOf, cardById } from '../src/engine/cards'
import type { ArenaSquad } from '../src/engine/arena'

function realPersonOf(pid: string): string {
  return pid.startsWith('AS:') ? pid.split(':').slice(2).join(':') : pid
}

const teamsJson = JSON.stringify(WORLD_TEAMS)
const playersJson = JSON.stringify(WORLD_PLAYERS)

const sample: ArenaSquad = { slots: CUP_TEAMS[0].squad.slots, coach: null, name: '审计', tag: 'AUD' }

const arena = buildArena(sample, () => 0, 424242)
for (const team of WORLD_TEAMS) {
  const st = arena.state.teams[team.id]
  if (!st || st.starters.length !== 5) throw new Error(`${team.id} 不是五人首发`)
  const persons = new Set<string>()
  for (const pid of st.starters) {
    const p = arena.state.players[pid]
    if (!p) throw new Error(`${team.id} 的 ${pid} 不存在`)
    const rp = realPersonOf(pid)
    if (persons.has(rp)) throw new Error(`${team.id} 重复 person ${rp}`)
    persons.add(rp)
    const cards = BASE_PLAYER_CARDS.filter(c => personOf(c) === rp)
    if (cards.length === 0) throw new Error(`${team.id} 的 ${pid} 不是真实普通卡`)
    if (!p.roles.includes(p.role) || !SQUAD_SLOTS.includes(p.role)) throw new Error(`${team.id} ${pid} 位置无效`)
  }
  assert.deepEqual(st.starters.map(pid => arena.state.players[pid].role), SQUAD_SLOTS)
  const own = BASE_PLAYER_CARDS.filter(c => c.clubId === team.id && team.roster.includes(c.playerId))
  if (new Set(own.map(c => c.role)).size === 5) {
    assert.ok(st.starters.every(pid => !pid.startsWith('AS:')), `${team.tag}: no unnecessary stand-ins`)
  }
  const res = playArenaMatch(sample, () => 0, team.id, 1, 777)
  if (!res.result.maps.length) throw new Error(`${team.id} 比赛失败`)
}

for (const cup of CUP_TEAMS) {
  const ca = buildCupArena(sample, () => 0, cup.id, 888)
  const st = ca.state.teams[cup.id]
  if (!st || st.starters.length !== 5) throw new Error(`杯赛 ${cup.id} 不是五人`)
  const persons = new Set(cup.squad.slots.map(id => personOf(cardById(id!)!)))
  assert.deepEqual(st.starters.map(pid => ca.state.players[pid].ign), cup.squad.slots.map(id => cardById(id!)!.ign))
  if (persons.size !== 5) throw new Error(`杯赛 ${cup.id} 有重复 person`)
}

if (JSON.stringify(WORLD_TEAMS) !== teamsJson) throw new Error('WORLD_TEAMS 被修改')
if (JSON.stringify(WORLD_PLAYERS) !== playersJson) throw new Error('WORLD_PLAYERS 被修改')

const t13 = arena.state.teams['T13']
if (!t13) throw new Error('T13 不存在')
const t13Persons = t13.starters.map(pid => arena.state.players[pid].ign)
for (const existing of ['sasi', 'Climber', 'Saber', 'Xiaoxia']) {
  if (!t13Persons.includes(existing)) throw new Error(`T13 丢失 ${existing}`)
}
assert.equal(t13.starters.filter(pid => pid.startsWith('AS:')).length, 1)
if (t13.starters.some(pid => pid.startsWith('AS:'))) {
  const tmp = t13.starters.find(pid => pid.startsWith('AS:'))!
  const p = arena.state.players[tmp]
  if (!p.ign.includes('临时替补')) throw new Error('T13 临时替补 ign 未标记')
  if (!p.role || p.role !== '下路') throw new Error(`T13 临时替补应该打下路，实际 ${p.role}`)
}

// An existing pinned UP opponent must finish normally under the same ID.
const day = '2026-09-22', now = Date.parse(`${day}T12:00:00Z`)
const g = newGacha('arena-up-regression', '审计', day)
g.squad = structuredClone(sample)
for (const id of g.squad.slots) if (id) g.cards[id] = { id, level: 0, dupes: 0, seen: 1, got: day }
g.ladder.pending = { at: 0, club: 'T13' }
g.daily.stamina = STAMINA_MAX; g.daily.staminaAt = now
assert.equal(pendingOpponent(g)?.club, 'T13')
const played = runAction(g, 'ladder', {}, { now, today: day, seed: 1012 })
assert.ok(played.ok, JSON.stringify(played))
assert.equal((played as { result: { opp: string } }).result.opp, 'T13')
assert.equal(pendingOpponent(g), null)
// Old cups which contain a club without five native cards use the existing
// migration repair; the normal cup pool and real club registry are unchanged.
g.cup = { path: ['T13', CUP_TEAMS[0].id, CUP_TEAMS[1].id], round: 0, legs: [], done: false, won: false, entry: 5 }
repairCup(g)
assert.ok(g.cup.path.every(id => CUP_TEAMS.some(t => t.id === id)))
assert.ok(runAction(g, 'cup_play', {}, { now: now + 1000, today: day, seed: 9 }).ok)
assert.equal(JSON.stringify(WORLD_TEAMS), teamsJson)
assert.equal(JSON.stringify(WORLD_PLAYERS), playersJson)
console.log(`arena roster audit passed: ${WORLD_TEAMS.length} clubs played; ${CUP_TEAMS.length} cup squads; pinned UP and old cup repaired`)
