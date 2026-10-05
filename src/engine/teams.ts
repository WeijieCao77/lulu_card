/**
 * The 78 clubs, without the 518 players.
 *
 * world.json is one file and 370 KB of it is rosters, so anything that reached
 * for a club's name or region used to drag every player's attributes along
 * with it — including the front page, which wants a club name for the
 * 「继续上次存档」 line and two integers for the counts underneath, and was
 * downloading the whole game to get them.
 *
 * A named import lets the bundler leave the players behind. That is the entire
 * reason this file exists: world.ts imports the JSON's default export and
 * needs both halves, and a module cannot be half-imported. This one imports
 * only `teams`, and world.ts re-exports it so there is still exactly one
 * WORLD_TEAMS in the program.
 */
import { teams, meta } from '../data/world.json'
import COACH_CHANGES from '../data/coachChanges.json'

export interface RawTeam {
  id: string; name: string; tag: string; region: string; tier: number; league: string
  rating: number; budget: number; reputation: number; roster: string[]
  coach: { name: string; tactics: number; development: number; motivation: number; assistants?: string[] } | null
  facilities: number
  /** Worlds / MSI finals since 2016, e.g. '2023 WLDs 冠军' (scripts/lol_rating) */
  honours?: string[]
}

export const WORLD_TEAMS = teams as unknown as RawTeam[]

type RawCoach = NonNullable<RawTeam['coach']>

/**
 * Head coaches as of the last check (data/coachChanges.json), laid over world.json — owner, 2026-09-28:
 * 「执教俱乐部按最新的」. A coach who moved takes his own three numbers with him; a coach new to the game
 * takes over the numbers of the team he inherited, which is what those numbers were read from. Coaches
 * left without a head-coaching job are FORMER_COACHES: still cards, now 自由身.
 */
export interface FormerCoach { coach: RawCoach; region: string; titleClubs: string[] }
export interface ExtraCoach { coach: RawCoach; team: RawTeam }

const byTag = new Map(WORLD_TEAMS.map((t) => [t.tag, t]))
const originalCoach = new Map(WORLD_TEAMS.map((t) => [t.tag, t.coach]))
for (const [tag, change] of Object.entries(COACH_CHANGES.teams as Record<string, { coach: string; from?: string }>)) {
  const team = byTag.get(tag)
  const numbers = originalCoach.get(change.from ?? tag)
  if (!team || !numbers) throw new Error(`coachChanges: ${tag} / ${change.from ?? tag} 不在 world.json`)
  team.coach = { ...numbers, name: change.coach, assistants: change.from ? numbers.assistants : [] }
}

const coaching = new Set(WORLD_TEAMS.map((t) => t.coach?.name).filter(Boolean))
export const FORMER_COACHES: FormerCoach[] = Object.entries(COACH_CHANGES.former as Record<string, { titleClubs: string[]; numbersFrom?: string }>)
  .map(([name, f]) => {
    if (coaching.has(name)) throw new Error(`coachChanges: ${name} 仍是主教练，不能算自由身`)
    // a coach new to the game who is between jobs (KIM, 2026-10-05) carries the season read of the club he
    // last coached (`numbersFrom`); the others carry their own original team's
    const team = f.numbersFrom ? byTag.get(f.numbersFrom) : WORLD_TEAMS.find((t) => originalCoach.get(t.tag)?.name === name)
    if (!team) throw new Error(`coachChanges: 找不到 ${name} 原来的球队`)
    return { coach: { ...originalCoach.get(team.tag)!, name, assistants: [] }, region: team.region, titleClubs: f.titleClubs }
  })

export const EXTRA_COACHES: ExtraCoach[] = (COACH_CHANGES.extra as { coach: string; team: string }[]).map((x) => {
  const team = byTag.get(x.team)
  const numbers = originalCoach.get(x.team)
  if (!team || !numbers) throw new Error(`coachChanges: ${x.team} 不在 world.json`)
  return { coach: { ...numbers, name: x.coach, assistants: [] }, team }
})

/**
 * Every real analyst in the world, and there are very few.
 *
 * Liquipedia records an analyst for only a handful of clubs, and this project
 * does not invent people — so an analyst is a genuinely scarce hire rather than
 * another row in the same list as the assistant coaches.
 */
export const WORLD_ANALYSTS = ((meta as { analysts?: unknown[] })?.analysts ?? []) as {
  name: string; from: string; spec: string
  tactics: number; development: number; motivation: number
}[]
