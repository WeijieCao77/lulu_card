import { cardById, isCoachCard, isPlayerCard } from './cards'
import type { Squad } from './cards'
import { WORLD_TEAMS } from './teams'
import { crestUrl } from './dossier'
import { TEAM_LINEAGES } from './teamLineage'
import { REGION_CN } from './types'
import type { RawTeam } from './teams'
import type { PlayerCard } from './cards'

/**
 * 完整战队阵容 6/6 — ported from Val_Manager (4f9afab, src/engine/teamIdentity.ts).
 *
 * Cosmetic identity only: all five distinct players and their coach must share a club. The coach's club
 * is the anchor; a legend card counts for the club it played that night for. It changes no number.
 */
export function squadTeamIdentity(squad: Squad) {
  if (squad.slots.length !== 5 || !squad.coach || squad.slots.some(id => !id)) return null
  const players = squad.slots.map(id => cardById(id!))
  const coach = cardById(squad.coach)
  if (!coach || !isCoachCard(coach) || !coach.clubId || players.some(p => !p || !isPlayerCard(p) || p.clubId !== coach.clubId)) return null
  if (new Set(players.map(p => p && isPlayerCard(p) ? p.playerId : '')).size !== 5) return null
  const team = WORLD_TEAMS.find(t => t.id === coach.clubId)
  const tag = team?.tag ?? coach.clubTag ?? 'TEAM'
  return { id: coach.clubId, tag, name: team?.name ?? tag, crest: crestUrl(coach.clubId), color: TEAM_COLORS[tag] ?? '#54a9d8',
    intro: clubIntro(team, players as PlayerCard[]) }
}

/**
 * A few short lines about the club, so the board is not a crest and a lot of empty dark: where it plays and what
 * it was called, what it has won in the years the match data covers (2016 on, so it says so), and this five.
 */
export function clubIntro(team: RawTeam | undefined, players: PlayerCard[]): string[] {
  const lines: string[] = []
  const lineage = team && TEAM_LINEAGES.find(l => l.aliases.includes(team.name))
  const region = team && (REGION_CN as Record<string, string>)[team.region]
  const head = [region, lineage?.label.includes('→') ? `传承 ${lineage.label}` : null].filter(Boolean).join(' · ')
  if (head) lines.push(head)
  const hs = team?.honours ?? []
  const n = (end: string) => hs.filter(h => h.endsWith(end)).length
  const won = ([[n('WLDs 冠军'), '世界赛冠军'], [n('MSI 冠军'), 'MSI 冠军'], [n('WLDs 亚军'), '世界赛亚军']] as const)
    .filter(([k]) => k > 0).map(([k, label]) => `${label} ${k} 次`)
  if (won.length) lines.push(`2016 年以来：${won.join('、')}`)
  if (players.length) {
    const avg = Math.round(players.reduce((s, p) => s + p.rating, 0) / players.length)
    const top = players.reduce((a, b) => (b.rating > a.rating ? b : a))
    lines.push(`本阵容平均 ${avg} 分，${top.ign} ${top.rating} 分最高`)
  }
  return lines
}

/** Val_Manager's palette, plus the LoL clubs players are most likely to complete; anyone else glows blue. */
const TEAM_COLORS: Record<string, string> = {
  EDG: '#e63a48', PRX: '#f24b9a', GEN: '#cfab56', FNC: '#ff792b', BLG: '#4098ef', FPX: '#ef5734', DRG: '#7c69ed', XLG: '#f2a442', T1: '#ef394c', G2: '#c6d0df', NRG: '#fa6558', SEN: '#ed364a',
  JDG: '#d7282f', TES: '#ff7a1a', LNG: '#1c9be6', WBG: '#c9a45c', IG: '#e0b84a', HLE: '#f37321', DK: '#27c4b4', KT: '#e3192d', KC: '#2f6bff', C9: '#1f9ae0', TL: '#4a78b8', FLY: '#2e9b5f', VIT: '#f2d31b',
}

/** Same vector artwork is used by the live board and exported share image. */
export function teamBackdrop(color: string) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><radialGradient id="g"><stop stop-color="${color}" stop-opacity=".46"/><stop offset="1" stop-color="#080e18" stop-opacity="0"/></radialGradient><linearGradient id="b" x2="1" y2="1"><stop stop-color="#121e30"/><stop offset="1" stop-color="#070b13"/></linearGradient><pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M0 28L28 0" stroke="#fff" stroke-opacity=".025"/></pattern></defs><path fill="url(#b)" d="M0 0h1600v900H0z"/><ellipse cx="1160" cy="380" rx="900" ry="700" fill="url(#g)"/><path d="M940 0h170L480 900H310zM1300 0h25L695 900h-25z" fill="${color}" opacity=".08"/><path fill="url(#p)" d="M0 0h1600v900H0z"/><path d="M0 16h520l110 80h970M0 882h940l90-65h570" fill="none" stroke="${color}" stroke-opacity=".55" stroke-width="2"/><path d="M24 16h95M1477 882h99" stroke="${color}" stroke-width="6"/></svg>`)
}
