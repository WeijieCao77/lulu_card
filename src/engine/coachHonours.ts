/**
 * What a head coach has already won, and the floor it puts under his card (owner, 2026-09-28).
 *
 * A coach's three numbers are read off his current team's season (scripts/lol_rating/build_lol_ratings.py),
 * so a champion coach at a team that is merely as good as its paper — kkOma at T1 — rated 81 while
 * coaches no player had heard of rated 88. The trophies are the other half of what a coach is: they
 * set a floor, the season can still carry him above it, and ordinary cards stop at 90 like players.
 *
 * Titles are from Liquipedia (checked 2026-09-28), as a coach only — nothing won as a player counts.
 * A title on the staff but not as head coach counts half. Only the World Championship, MSI and
 * domestic top leagues are listed; academy and challenger leagues are not.
 */
import HONOURS from '../data/coachHonours.json'

export interface CoachTitle {
  /** e.g. 2016, or 'LCK 2016 Spring' for a league */
  title: string
  assistant?: boolean
}

export interface CoachHonours {
  worlds: CoachTitle[]
  msi: CoachTitle[]
  leagues: CoachTitle[]
}

export const COACH_HONOURS = HONOURS as Record<string, CoachHonours>

export const honoursOf = (name: string): CoachHonours | undefined => COACH_HONOURS[name]

/** What one title is worth, before the curve. */
const WORLDS_POINTS = 10
const MSI_POINTS = 4
const leaguePoints = (title: string): number =>
  /^(LCK|LPL|OGN)/.test(title) ? 2
    : /^(LEC|EU LCS|LCS|NA LCS|LTA)/.test(title) ? 1.5
      : 1

/**
 * Leagues now crown three or four champions a year (LEC Versus/Spring/Summer/Season Finals), so a
 * decade of domestic titles would otherwise outweigh a World Championship. Capped: at most about 85
 * from league titles alone.
 */
const LEAGUE_POINTS_CAP = 8

export function honourPoints(h: CoachHonours | undefined): number {
  if (!h) return 0
  const weigh = (t: CoachTitle, p: number) => (t.assistant ? p / 2 : p)
  return h.worlds.reduce((s, t) => s + weigh(t, WORLDS_POINTS), 0)
    + h.msi.reduce((s, t) => s + weigh(t, MSI_POINTS), 0)
    + Math.min(LEAGUE_POINTS_CAP, h.leagues.reduce((s, t) => s + weigh(t, leaguePoints(t.title)), 0))
}

/** Ordinary cards, players and coaches alike, stop here; only 彩卡 go past it. */
export const ORDINARY_CAP = 90

/**
 * The floor a record sets, on the card scale. Diminishing: one small-region title is about 77,
 * two LCK titles about 82, a World Championship with a league or two about 87, and several
 * World Championships reach the cap.
 */
export function honourFloor(h: CoachHonours | undefined): number {
  const p = honourPoints(h)
  return p > 0 ? Math.min(ORDINARY_CAP, Math.round(74 + 5 * Math.log(1 + p))) : 0
}

/** '世界冠军 ×3 · MSI 冠军 ×2 · 联赛冠军 ×8', or null for a coach with none of these. */
export function honoursLine(h: CoachHonours | undefined): string | null {
  if (!h) return null
  const head = (ts: CoachTitle[]) => ts.filter((t) => !t.assistant).length
  const asst = (ts: CoachTitle[]) => ts.filter((t) => t.assistant).length
  const part = (label: string, ts: CoachTitle[]) => {
    const a = head(ts), b = asst(ts)
    return [a ? `${label} ×${a}` : '', b ? `${label}（助教）×${b}` : ''].filter(Boolean)
  }
  const bits = [...part('世界冠军', h.worlds), ...part('MSI 冠军', h.msi), ...part('联赛冠军', h.leagues)]
  return bits.length ? bits.join(' · ') : null
}
