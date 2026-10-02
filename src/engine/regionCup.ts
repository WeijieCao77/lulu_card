/**
 * 地区杯 (owner, 2026-10-02, after 开瓦包's 国家队杯).
 *
 * Five players and a coach from one 地区, once a day, no 体力. The opponents are other players'
 * 地区 fives as they were registered — another 地区 first — and the five you register is kept for
 * them to play in turn. Bracket, 双败 and purse are the 俱乐部杯's (recordCup).
 *
 * What a 地区 is: the player's nationality, with Hong Kong and Macau counted as 中国 and Taiwan as
 * its own 地区 named 中国台湾 (owner's call). It is called 地区杯 and never 国家 anywhere on screen.
 *
 * While few people have registered, a round with nobody near its target gets a 地区 side built from
 * that 地区's own cards (an 「联队」), pitched like the club cup's clubs (gacha.ts cupPitch).
 */
import { Rng, hashStr } from './rng'
import {
  BASE_PLAYER_CARDS, COACH_CARDS, SQUAD_SLOTS, cardById, isCoachCard, isPlayerCard, personOf, squadRating,
} from './cards'
import type { PlayerCard, Squad } from './cards'
import type { RivalSquad } from './arena'
import { natName } from './nat'
import { BALANCE_VERSION } from './balance'
import { CUP_CLIMB_FROM, CUP_CLIMB_TO, cupPitch, registerCupSquad } from './gacha'
import type { CupRegistration, CupState } from './gacha'

/** A 地区 code: the nationality, lower case, with hk and mo folded into cn; tw stays its own. */
export const regionOf = (nat: string | null | undefined): string | null => {
  const k = (nat ?? '').toLowerCase()
  if (!k) return null
  return k === 'hk' || k === 'mo' ? 'cn' : k
}
/** 中国 / 中国台湾 / 韩国 … */
export const regionName = (r: string): string => natName(r)

/** The 地区 a lineup plays for, or why it cannot enter. */
export function squadRegion(squad: Squad): { ok: true; region: string } | { ok: false; why: string } {
  const ids = [...squad.slots, squad.coach]
  if (ids.some((id) => !id)) return { ok: false, why: '地区杯要五名选手加一名教练，六个人都要上。' }
  const cards = ids.map((id) => cardById(id!))
  if (cards.some((c) => !c || !(isPlayerCard(c) || isCoachCard(c)))) return { ok: false, why: '阵容里有认不出的卡。' }
  const regions = cards.map((c) => regionOf((c as { nat?: string | null }).nat))
  if (regions.some((r) => !r)) return { ok: false, why: '阵容里有国籍未知的卡，进不了地区杯。' }
  const set = [...new Set(regions as string[])]
  if (set.length > 1) return { ok: false, why: `地区杯要六个人同一地区，现在有 ${set.map(regionName).join('、')}。` }
  return { ok: true, region: set[0] }
}

/** Another player's registered 地区 five, as the server hands it over. */
export interface RegionEntry {
  /** opaque, stable per account */
  id: string
  name: string
  tag: string
  region: string
  slots: (string | null)[]
  coach: string | null
  levels: Record<string, number>
  score: number
}

export interface RegionRival extends RivalSquad {
  region: string
  score: number
  /** a 联队 built from the 地区's cards, not a player's five */
  ai?: boolean
}

export interface RegionCupState extends CupState {
  /** the Beijing day it was entered: one a day */
  day: string
  region: string
  rivals: Record<string, RegionRival>
  /** the 败者组 opponent drawn for each round, in advance */
  lowers: string[]
}

const ROUND_ODDS: [number, number][] = [[3, 0.35], [4, 0.4], [5, 0.25]]
/** how far from a round's target a player's five may be and still be drawn for it */
const NEAR = 6

// ---------------------------------------------------------------- 联队

/** The 地区s that can field five players and a coach from ordinary cards. */
let sides: Map<string, { five: Squad; at: number[] }[]> | null = null
function aiSides(): Map<string, { five: Squad; at: number[] }[]> {
  if (sides) return sides
  sides = new Map()
  const players = new Map<string, PlayerCard[]>()
  for (const c of BASE_PLAYER_CARDS) {
    const r = regionOf(c.nat)
    if (r) (players.get(r) ?? players.set(r, []).get(r)!).push(c)
  }
  const coaches = new Map<string, string[]>()
  for (const c of COACH_CARDS) {
    const r = regionOf((c as { nat?: string | null }).nat)
    if (r) (coaches.get(r) ?? coaches.set(r, []).get(r)!).push(c.id)
  }
  for (const [r, list] of players) {
    const staff = coaches.get(r)
    if (!staff?.length) continue
    const sorted = list.slice().sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
    const out: { five: Squad; at: number[] }[] = []
    // the best five the 地区 can field, then the next ones down, so there is a side near most targets
    for (let skip = 0; skip + 5 <= sorted.length; skip += 2) {
      const used = new Set<string>()
      const pool = sorted.slice(skip)
      const slots = SQUAD_SLOTS.map((slot) => {
        const p = pool.find((c) => !used.has(personOf(c)) && c.roles.includes(slot))
        if (p) used.add(personOf(p))
        return p?.id ?? null
      })
      if (slots.some((s) => !s)) break
      const five: Squad = { slots, coach: staff[(skip / 2) % staff.length] }
      out.push({ five, at: [0, 1, 2, 3, 4, 5].map((lv) => squadRating(five, () => lv)) })
    }
    if (out.length) sides.set(r, out)
  }
  return sides
}

/** The 地区s a 联队 can come from. */
export const playableRegions = (): string[] => [...aiSides().keys()]

function aiRival(target: number, avoid: string, used: Set<string>, rng: Rng): [string, RegionRival] {
  const all = aiSides()
  let best: { r: string; i: number; lv: number; d: number } | null = null
  const regions = rng.shuffle([...all.keys()])
  for (const pass of [true, false]) {
    for (const r of regions) {
      if (pass && r === avoid) continue
      all.get(r)!.forEach((s, i) => {
        if (used.has(`ai:${r}:${i}`)) return
        s.at.forEach((score, lv) => {
          const d = Math.abs(score - target)
          if (!best || d < best.d) best = { r, i, lv, d }
        })
      })
    }
    if (best) break
  }
  const b = best ?? { r: regions[0], i: 0, lv: 0, d: 0 }
  const side = all.get(b.r)![b.i]
  const levels = Object.fromEntries([...side.five.slots, side.five.coach].filter((x): x is string => !!x).map((id) => [id, b.lv]))
  const id = `ai:${b.r}:${b.i}`
  return [id, {
    name: `${regionName(b.r)}联队`, tag: '#地区', slots: side.five.slots, coach: side.five.coach, levels,
    div: 0, points: 0, region: b.r, score: side.at[b.lv], ai: true,
  }]
}

// ---------------------------------------------------------------- the draw

export const canEnterRegionCup = (cup: RegionCupState | null | undefined, today: string): { ok: true } | { ok: false; why: string } => {
  if (cup && !cup.done) return { ok: false, why: '上一届地区杯还没打完' }
  if (cup?.day === today) return { ok: false, why: '地区杯每天一次，今天已经打过了，明天再来。' }
  return { ok: true }
}

/**
 * Draw a 地区杯 for a registered five: three to five rounds climbing from below it to just above, the
 * way the club cup does, from other players' fives — another 地区 first — and 联队 where nobody fits.
 */
export function drawRegionCup(
  registration: CupRegistration, region: string, pool: RegionEntry[], today: string, seed: number, me = '',
): RegionCupState {
  const rng = new Rng((seed ^ hashStr(`region${today}${me}`)) >>> 0)
  const score = squadRating(registration.squad, (id) => registration.levels[id] ?? 0)
  let rounds = 3
  let dice = rng.next()
  for (const [n, p] of ROUND_ODDS) { rounds = n; if (dice < p) break; dice -= p }
  const rivals: Record<string, RegionRival> = {}
  const used = new Set<string>()
  const fromPool = (target: number): [string, RegionRival] | null => {
    const open = pool.filter((e) => e.id !== me && !used.has(`p:${e.id}`) && Math.abs(e.score - target) <= NEAR)
    const foreign = open.filter((e) => e.region !== region)
    const list = (foreign.length ? foreign : open).sort((a, b) => Math.abs(a.score - target) - Math.abs(b.score - target)).slice(0, 6)
    if (!list.length) return null
    const e = rng.pick(list)
    return [`p:${e.id}`, { name: e.name, tag: e.tag, slots: e.slots, coach: e.coach, levels: e.levels, div: 0, points: 0, region: e.region, score: e.score }]
  }
  const draw = (target: number): string => {
    const [id, rival] = fromPool(target) ?? aiRival(target, region, used, rng)
    used.add(id)
    rivals[id] = rival
    return id
  }
  const targets = Array.from({ length: rounds }, (_, round) =>
    cupPitch(score) - CUP_CLIMB_FROM + ((CUP_CLIMB_FROM + CUP_CLIMB_TO) / (rounds - 1)) * round)
  const path = targets.map(draw).sort((a, b) => rivals[a].score - rivals[b].score)
  const lowers = path.map((id) => draw(rivals[id].score))
  return {
    path, round: 0, legs: [], done: false, won: false, entry: 0, double: true, balance: BALANCE_VERSION,
    registration, day: today, region, rivals, lowers,
  }
}

export const regionOpponent = (cup: RegionCupState | null | undefined): string | null =>
  cup && !cup.done ? cup.lower || (cup.path[cup.round] ?? null) : null

export { registerCupSquad }
