import RAW from '../data/seoul2024.json'
import STAGED from '../data/seoul2024_stages.json'
import FACES from '../data/seoul2024_faces.json'
import type { PlayerCard } from './cards'
import type { Attrs, Player, Region, Role } from './types'
import { emptyStats } from './types'

export const SEOUL_EVENT = 'seoul-2024' as const
export const SEOUL_TEAMS = RAW.teams
export const SEOUL_META = RAW.meta
export type SeoulEntry = typeof RAW.players[number]
const roleAgents: Record<string, Role> = {
  jett: '上单', raze: '上单', neon: '上单', yoru: '上单', reyna: '上单', iso: '上单', phoenix: '上单',
  sova: '打野', fade: '打野', breach: '打野', skye: '打野', kayo: '打野', gekko: '打野',
  omen: '中单', brimstone: '中单', viper: '中单', astra: '中单', harbor: '中单', clove: '中单',
  cypher: '下路', killjoy: '下路', deadlock: '下路', sage: '下路', chamber: '下路',
}
// PRX called by committee in 2024; d4v41 is the one most sources name, and a
// five with no caller at all plays under a stand-in on 指挥 55
const callers = new Set(['nobody', 'Boo', 'kiNgg', 'johnqt', 'Boaster', 'MaKo', 'valyn', 'heybay', 'Munchkin', 'ceNder', 'Melser', 'BerLIN', 'Crws', 'MrFaliN', 'nephh', 'd4v41'])
const bounded = (n: number) => Math.max(55, Math.min(96, Math.round(n)))

// A short run is mostly noise: the same player's VLR rating moves 0.32 from
// one map to the next (14,575 map lines in scripts/cache/vlr_matches.json),
// which is ±7 card points over four maps — wider than gold to silver. Every
// stat the game reads is pulled toward the event's map-weighted average by six
// maps' worth of it, so primmie's four maps keep 40% of his gap to the field
// and EDG's twenty-one keep 78%. ACS, K/D and maps on the card stay as played.
const SETTLE_MAPS = 6
type Stat = 'rating' | 'acs' | 'kpr' | 'kast' | 'apr' | 'clutch'
const STATS: Stat[] = ['rating', 'acs', 'kpr', 'kast', 'apr', 'clutch']
const MAPS = RAW.players.reduce((s, p) => s + p.maps, 0)
const FIELD = Object.fromEntries(STATS.map(k => [k, RAW.players.reduce((s, p) => s + p[k] * p.maps, 0) / MAPS])) as Record<Stat, number>
// Later rounds weigh more. Each map counts by its rounds times its round's
// weight — groups 1, first playoff rounds 1.5, upper semifinal to lower final
// 2, grand final 3 — from the match pages (scripts/build_seoul_stages.mjs).
// A flat average hid ZmjjKK's final: 0.93 over the groups, 1.39 in it.
// Clutch has no per-map record and stays the event figure.
const STAGE = STAGED.players as Record<string, Partial<Record<Stat, number>>>
const played = (p: SeoulEntry, k: Stat) => STAGE[p.profile.split('/')[4]]?.[k] ?? p[k]
const settled = (p: SeoulEntry, k: Stat) => (played(p, k) * p.maps + FIELD[k] * SETTLE_MAPS) / (p.maps + SETTLE_MAPS)

// VLR Rating reads neither the call nor the round a teammate was set up for.
// A caller is paid for calling, more the further his side went — 指挥 counts
// for as much as aim. An initiator gets up to 3 for KAST and assists above the
// field, in spreads, scaled by how much of the event he spent on initiators.
const CALL_BONUS: Record<number, number> = { 1: 6, 2: 5, 3: 4, 4: 4, 5: 3, 7: 3, 9: 2, 13: 1 }
const standing = (k: Stat) => {
  const xs = RAW.players.map(p => [settled(p, k), p.maps] as const)
  const mean = xs.reduce((s, [x, m]) => s + x * m, 0) / MAPS
  const sd = Math.sqrt(xs.reduce((s, [x, m]) => s + (x - mean) ** 2 * m, 0) / MAPS)
  return (x: number) => (x - mean) / sd
}
const KAST_Z = standing('kast'), APR_Z = standing('apr')

/** Frozen tournament statistics become game attributes, never an official 0–99 rating.
 * The same explicit formula is used for all 80 players, including retired players.
 * Live card identities are reused, but neither 2026 teams nor attributes leak in. */
export function buildSeoulCards(base: readonly PlayerCard[]): PlayerCard[] {
  return RAW.players.map(p => {
    const live = base.find(c => c.playerId === p.playerId)
    const team = SEOUL_TEAMS.find(t => t.tag === p.team)!
    const usage = new Map<Role, number>()
    for (const [agent, share] of Object.entries(p.agentUsage)) {
      const role = roleAgents[agent]
      if (role) usage.set(role, (usage.get(role) ?? 0) + (share ?? 0))
    }
    const roles = [...usage].sort((a, b) => b[1] - a[1]).map(([role]) => role)
    const s = (k: Stat) => settled(p, k)
    const combat = 70 + (s('rating') - .75) * 45
    const isIgl = callers.has(p.ign)
    const call = isIgl ? CALL_BONUS[team.placement] ?? 0 : 0
    const opener = (usage.get('打野') ?? 0) / ([...usage.values()].reduce((a, b) => a + b, 0) || 1)
    const lift = Math.round(opener * Math.max(0, Math.min(3, KAST_Z(s('kast')) + APR_Z(s('apr')))))
    const rating = bounded(combat + call + lift)
    const attrs: Attrs = {
      aim: bounded(55 + s('acs') * .145), reaction: bounded(52 + s('kpr') * 42),
      awareness: bounded(20 + s('kast') * .85), utility: bounded(62 + s('apr') * 58),
      clutch: bounded(68 + s('clutch') * .55), teamwork: bounded(20 + s('kast') * .85),
      communication: bounded(65 + s('apr') * 42), igl: isIgl ? bounded(combat + call + 5) : 55,
    }
    return {
      kind: 'player', id: `s24:${p.profile.split('/')[4]}`,
      playerId: live?.playerId ?? `historic:vlr:${p.profile.split('/')[4]}`,
      event: SEOUL_EVENT, seoul: p,
      ign: p.ign, realName: p.realName, nat: p.nat,
      // the Seoul Features Day portrait when there is one (scripts/seoul2024_faces.py)
      face: (FACES as Record<string, { face?: string }>)[p.profile.split('/')[4]]?.face ?? p.face,
      region: team.region as Region, clubId: team.clubId ?? `s24:${team.tag}`, clubTag: team.tag,
      role: roles[0] ?? '辅助', roles: roles.length ? roles : ['辅助'], isIgl,
      age: p.age, attrs, rating, rarity: rating >= 84 ? 'gold' : rating >= 76 ? 'silver' : 'bronze',
    }
  })
}

/** Event-only people can play in the arena without adding them to a 2026 career. */
export function seoulArenaPlayer(card: PlayerCard): Player | undefined {
  if (!card.seoul) return undefined
  return {
    id: card.playerId, ign: card.ign, realName: card.realName, nat: card.nat ?? undefined,
    teamId: card.clubId, region: card.region, role: card.role, roles: [...card.roles],
    age: card.age, ageEstimated: true, isIgl: card.isIgl, attrs: { ...card.attrs }, overall: card.rating,
    potential: card.rating, form: 76, morale: 84, fatigue: 0, salary: 0, value: 0, contractYears: 0,
    loyalty: 70, ambition: 70, agentPool: card.seoul.agents.map(a => a === 'kayo' ? 'KAY/O' : a[0].toUpperCase() + a.slice(1)),
    season: emptyStats(), career: emptyStats(), injuredUntil: 0, xp: {},
  }
}
