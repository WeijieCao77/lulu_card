import { Rng, clamp } from './rng'
import type { GameState, MapScore, MapLine, MatchResult, Player, Role } from './types'

// DeepSeek implementation, reviewed and corrected: all randomness belongs to
// the supplied stream; a game ends by a base push, independently of kill score.
// These are card-game design parameters, not claimed professional statistics.
type Side = 'A' | 'B'
type Line = MapLine & { cs: number; gold: number }
const KILL: Record<Role, number> = { 上单: 1, 打野: 1.1, 中单: 1.3, 下路: 1.5, 辅助: .3 }
const ASSIST: Record<Role, number> = { 上单: .9, 打野: 1.3, 中单: 1, 下路: .8, 辅助: 2.2 }
const FARM: Record<Role, number> = { 上单: 7.8, 打野: 6, 中单: 8.5, 下路: 9, 辅助: 1 }
const GOLD: Record<Role, number> = { 上单: 1.05, 打野: .9, 中单: 1.15, 下路: 1.25, 辅助: .65 }
const logistic = (x: number) => 1 / (1 + Math.exp(-x))
function playersOf(state: GameState, id: string): Player[] {
  const t = state.teams[id]
  const ids = [...new Set([...(t?.starters ?? []), ...(t?.roster ?? [])])]
  const ps = ids.map(pid => state.players[pid]).filter((p): p is Player => !!p).slice(0, 5)
  if (ps.length !== 5) throw new Error('峡谷比赛需要双方各五名选手')
  return ps
}
function strength(state: GameState, id: string, ps: Player[]): number {
  return state.cardMatchStrength?.[id] ?? ps.reduce((n, p) => n + p.overall, 0) / 5
}
function playGame(state: GameState, a: string, b: string, rng: Rng): MapScore {
  const pa = playersOf(state, a), pb = playersOf(state, b)
  const makeTeam = (id: string, side: Side, players: Player[]) => ({
    id, side, players, gold: 2500, kills: 0, towers: 0, dragons: 0, barons: 0,
    baronUntil: 0, power: strength(state, id, players) + rng.norm(0, 5),
  })
  const ta = makeTeam(a, 'A', pa), tb = makeTeam(b, 'B', pb)
  type Team = typeof ta
  const tag = (t: Team) => state.teams[t.id].tag === 'MINE' ? '我方' : state.teams[t.id].tag
  const lines: Record<string, Line> = {}
  for (const p of [...pa, ...pb]) lines[p.id] = {
    kills: 0, deaths: 0, assists: 0, damage: 0, firstKills: 0, firstDeaths: 0,
    clutches: 0, rounds: 0, acs: 0, cs: 0, gold: 0,
  }
  const events: { minute: number; text: string }[] = []
  let firstBlood = false, dragonAt = 5, baronAt = 20, duration = 50
  let winner: Side | null = null
  const tempo = rng.range(.8, 1.15)
  for (let minute = 1; minute <= 50; minute++) {
    for (const t of [ta, tb]) t.gold += 1500 + rng.int(-100, 100)
    const edge = (ta.power - tb.power) / 12 + (ta.gold - tb.gold) / 18000
    const pA = logistic(edge)
    const dead = new Set<string>()
    const kill = (att: Team, def: Team) => {
      const alive = att.players.filter(p => !dead.has(p.id))
      const victims = def.players.filter(p => !dead.has(p.id))
      if (!alive.length || !victims.length) return
      const killer = rng.weighted(alive, alive.map(p => KILL[p.role] * (p.attrs.aim + p.attrs.reaction)))
      const victim = rng.weighted(victims, victims.map(p => Math.max(15, 120 - p.attrs.awareness)))
      const assists = alive.filter(p => p.id !== killer.id)
      const count = Math.min(assists.length, minute < 14 ? rng.int(0, 2) : rng.int(1, 4))
      for (let n = 0; n < count; n++) {
        const helper = rng.weighted(assists, assists.map(p => ASSIST[p.role] * (p.attrs.teamwork + p.attrs.communication)))
        lines[helper.id].assists++
        assists.splice(assists.indexOf(helper), 1)
      }
      lines[killer.id].kills++; lines[victim.id].deaths++; att.kills++
      att.gold += 300 + count * 50
      dead.add(victim.id)
      if (!firstBlood) {
        firstBlood = true
        lines[killer.id].firstKills++; lines[victim.id].firstDeaths++
        att.gold += 100
        events.push({ minute, text: `${tag(att)} ${killer.ign} 击杀 ${victim.ign}，拿下一血` })
      }
    }
    if (rng.chance(tempo * (minute < 14 ? .3 : minute < 23 ? .42 : .52))) {
      const att = rng.chance(pA) ? ta : tb, def = att === ta ? tb : ta
      const ka = ta.kills, kb = tb.kills
      for (let n = 0, count = rng.int(1, minute < 14 ? 2 : 4); n < count; n++) {
        kill(att, def)
        if (rng.chance(.3)) kill(def, att)
      }
      if (minute >= 14) events.push({ minute, text: `交战：${tag(ta)} ${ta.kills - ka} 换 ${tb.kills - kb} ${tag(tb)}` })
    }
    if (minute >= dragonAt && rng.chance(.45)) {
      const t = rng.chance(pA) ? ta : tb
      t.dragons++; t.gold += 400; dragonAt = minute + 5
      events.push({ minute, text: `${tag(t)} 控下小龙（累计 ${t.dragons} 条）` })
    }
    if (minute >= baronAt && rng.chance(.22)) {
      const t = rng.chance(pA) ? ta : tb
      t.barons++; t.gold += 1500; t.baronUntil = minute + 3; baronAt = minute + 6
      events.push({ minute, text: `${tag(t)} 拿下大龙，获得推进机会` })
    }
    if (minute >= 8) for (const t of [ta, tb]) {
      const advantage = t === ta ? pA : 1 - pA
      const chance = (.16 + (minute >= 20 ? .2 : 0)) * (.55 + advantage) + (t.baronUntil > minute ? .25 : 0)
      // Leave the base push to the end condition instead of declaring a kill win.
      if (t.towers < 10 && rng.chance(chance)) {
        t.towers++; t.gold += 650
        if ([3, 6, 9].includes(t.towers)) events.push({ minute, text: `${tag(t)} 已推掉 ${t.towers} 座塔` })
      }
    }
    if (minute >= 24) {
      const macro = (ta.towers - tb.towers) * .25 + (ta.dragons - tb.dragons) * .08
        + (ta.barons - tb.barons) * .25 + edge * .35
      const sieger = rng.chance(logistic(macro)) ? ta : tb
      const endChance = clamp(.05 + (minute - 24) * .027 + Math.abs(macro) * .03, .05, .8)
      if (minute === 50 || (sieger.towers >= 5 && rng.chance(endChance))) {
        winner = sieger.side; duration = minute
        // A lane plus its inhibitor and Nexus turrets is enough; all 11 towers
        // need not fall. Aggregate counts model that final lane breakthrough.
        const finalTowers = Math.min(11, Math.max(5, sieger.towers + 2))
        sieger.gold += (finalTowers - sieger.towers) * 650; sieger.towers = finalTowers
        events.push({ minute, text: `${tag(sieger)} 推破高地与基地防线，摧毁水晶获胜` })
        break
      }
    }
  }
  for (const t of [ta, tb]) {
    const weights = t.players.map(p => GOLD[p.role] + lines[p.id].kills * .025)
    const sum = weights.reduce((s, n) => s + n, 0)
    let allocated = 0
    t.players.forEach((p, i) => {
      const l = lines[p.id]
      l.cs = Math.max(0, Math.round(duration * FARM[p.role] * rng.range(.88, 1.1)))
      l.gold = i === 4 ? t.gold - allocated : Math.floor(t.gold * weights[i] / sum)
      allocated += l.gold
      l.damage = Math.round(duration * (p.role === '辅助' ? 250 : p.role === '下路' ? 720 : 560) * rng.range(.8, 1.25))
      const kp = (l.kills + l.assists) / Math.max(1, t.kills)
      // Role-adjusted contribution kept in the legacy acs storage field only.
      l.acs = Math.round(clamp(40 + kp * 40 + l.kills / KILL[p.role] * 1.2 - l.deaths * 2 + rng.range(-3, 3), 1, 100))
    })
  }
  const kept = events.filter((e, i) => i >= events.length - 13 || e.text.includes('拿下一血'))
  return {
    map: '召唤师峡谷', scoreA: ta.kills, scoreB: tb.kills, lines,
    lol: { winner: winner!, durationSeconds: duration * 60 + rng.int(0, 59),
      goldA: ta.gold, goldB: tb.gold, towersA: ta.towers, towersB: tb.towers,
      dragonsA: ta.dragons, dragonsB: tb.dragons, baronsA: ta.barons, baronsB: tb.barons, events: kept },
  }
}
export function simulateLolMatch(state: GameState, a: string, b: string, bo: 1 | 3 | 5, rng: Rng): MatchResult {
  const maps: MapScore[] = [], target = Math.floor(bo / 2) + 1
  let mapsWonA = 0, mapsWonB = 0
  while (mapsWonA < target && mapsWonB < target) {
    const m = playGame(state, a, b, rng); maps.push(m)
    if (m.lol!.winner === 'A') mapsWonA++; else mapsWonB++
  }
  const lineups = { a: playersOf(state, a).map(p => p.id), b: playersOf(state, b).map(p => p.id) }
  const winners = mapsWonA > mapsWonB ? lineups.a : lineups.b
  const mvp = winners.slice().sort((x, y) => maps.reduce((n, m) => n + m.lines[y].acs - m.lines[x].acs, 0))[0]
  return { format: 'lol-v1', mapsWonA, mapsWonB, maps, lineups, vetoLog: [], mvp,
    highlights: maps[maps.length - 1].lol!.events.slice(-5).map(e => `${e.minute} 分 · ${e.text}`) }
}
