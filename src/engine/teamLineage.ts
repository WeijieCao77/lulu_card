import WORLD from '../data/world.json'
import FAMILIES from '../data/teamLineages.json'

export interface ClubIdentity { clubId?: string | null; clubTag?: string | null; region?: string | null }
export const TEAM_LINEAGES = FAMILIES
const normal = (s: string) => s.toUpperCase().replace(/[\s.·_-]/g, '')
const aliases = new Map(FAMILIES.flatMap(f => f.aliases.map(a => [`${f.region}:${normal(a)}`, `lineage:${f.id}`] as const)))
const registered = new Map(WORLD.teams.map(t => [t.id, t]))

/** IDs in the live database take precedence: repeated tags and academy teams are not aliases. */
export function clubLineage(card: ClubIdentity): string | null {
  const team = card.clubId ? registered.get(card.clubId) : undefined
  if (team) {
    if (team.tier === 1) return aliases.get(`${team.region}:${normal(team.tag)}`) ?? `club:${team.id}`
    return `club:${team.id}`
  }
  // Historical IDs and full names use explicit, region-qualified aliases only.
  const alias = card.region && card.clubTag ? aliases.get(`${card.region}:${normal(card.clubTag)}`) : undefined
  return alias ?? (card.clubId ? `club:${card.clubId}` : null)
}
export function sameClubLineage(a: ClubIdentity, b: ClubIdentity): boolean {
  const key = clubLineage(a)
  return key !== null && key === clubLineage(b)
}
