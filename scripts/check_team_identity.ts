/**
 * 完整战队阵容 6/6: five distinct players and a coach of one club wear its crest; anything less does not.
 *
 *   npx tsx scripts/check_team_identity.ts
 */
import assert from 'node:assert/strict'
import { BASE_PLAYER_CARDS, COACH_CARDS, LEGEND_CARDS } from '../src/engine/cards.ts'
import { squadTeamIdentity, teamBackdrop } from '../src/engine/teamIdentity.ts'

// a club the pool can complete: a coach and five different players of it
const clubs = new Map<string, string[]>()
for (const p of BASE_PLAYER_CARDS) if (p.clubId) clubs.set(p.clubId, [...(clubs.get(p.clubId) ?? []), p.id])
const coach = COACH_CARDS.find((c) => c.clubId && !c.legend && (clubs.get(c.clubId)?.length ?? 0) >= 6)
assert(coach, 'the pool has at least one completable club')
const five = clubs.get(coach.clubId!)!.slice(0, 5)
const other = BASE_PLAYER_CARDS.find((p) => p.clubId && p.clubId !== coach.clubId)!

const full = squadTeamIdentity({ slots: five, coach: coach.id })
assert(full, 'five of one club with their coach')
assert.equal(full.id, coach.clubId)
assert(/^#[0-9a-f]{6}$/i.test(full.color))
assert(full.name && full.tag)
assert.equal(squadTeamIdentity({ slots: five, coach: null }), null, 'no coach, no crest')
assert.equal(squadTeamIdentity({ slots: [...five.slice(0, 4), null], coach: coach.id }), null, 'an empty seat')
assert.equal(squadTeamIdentity({ slots: [...five.slice(0, 4), other.id], coach: coach.id }), null, 'one player from another club')
const otherCoach = COACH_CARDS.find((c) => c.clubId && c.clubId !== coach.clubId)!
assert.equal(squadTeamIdentity({ slots: five, coach: otherCoach.id }), null, "another club's coach")
// the same man twice (his base card and a legend card of the same club) is not five players
const twin = LEGEND_CARDS.find((l) => l.clubId === coach.clubId && five.slice(0, 4).some((id) => BASE_PLAYER_CARDS.find((b) => b.id === id)?.playerId === l.playerId))
if (twin) assert.equal(squadTeamIdentity({ slots: [...five.slice(0, 4), twin.id], coach: coach.id }), null, 'the same player twice')
assert(teamBackdrop(full.color).startsWith('data:image/svg+xml'))
// the club in a few lines: T1's lineage and what it has won since 2016, and this five
import { WORLD_TEAMS } from '../src/engine/teams.ts'
import { clubIntro } from '../src/engine/teamIdentity.ts'
const t1 = WORLD_TEAMS.find((t) => t.tag === 'T1')!
const t1Five = BASE_PLAYER_CARDS.filter((p) => p.clubId === t1.id).slice(0, 5)
const intro = clubIntro(t1, t1Five)
assert(intro[0].includes('LCK') && intro[0].includes('SKT → T1'), intro[0])
assert(/2016 年以来：世界赛冠军 \d+ 次/.test(intro[1]), intro[1])
assert(intro[2].startsWith('本阵容平均'), intro[2])
// a club with no finals says nothing about finals rather than 「0 次」
const quiet = WORLD_TEAMS.find((t) => !t.honours?.length && t.tier === 1)!
assert(!clubIntro(quiet, []).some((l) => l.includes('2016 年以来')))
// SillySilly Gaming (tag SSG) is not the Samsung Galaxy of 2017
assert(!WORLD_TEAMS.find((t) => t.name === 'SillySilly Gaming')?.honours)
console.log(`team identity: ${full.tag} (${full.name}) 6/6 shows its crest${full.crest ? '' : ' (no crest file)'}; missing coach, empty seat, mixed club${twin ? ', same player twice' : ''} do not`)
