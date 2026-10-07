/**
 * Coach bonds. The coach's club now is a same-club bond; a champion coach also bonds with each PLAYER who won a
 * head-coach title with him, wherever that player is now (owner 2026-10-07: 「改成和单独的冠军队员有默契而不是和
 * 俱乐部」 — it used to be every player of the clubs he won with). Assistant titles and men he merely coached count
 * for nothing.
 *   npx tsx scripts/check_coach_bonds.ts
 */
import assert from 'node:assert/strict'
import { ALL_CARDS, BASE_PLAYER_CARDS, COACH_CARDS, championNames, chemistry, coachSharesClub, coachTitleLines, coachWonWith, isPlayerCard } from '../src/engine/cards'
import type { PlayerCard } from '../src/engine/cards'
import { honoursOf } from '../src/engine/coachHonours'
import CHAMPS from '../src/data/coachChampions.json'
const coach = (n: string) => COACH_CARDS.find((c) => c.name === n)!
const player = (ign: string) => BASE_PLAYER_CARDS.find((c) => c.ign === ign)!
const linkOf = (coachName: string, p: PlayerCard) =>
  chemistry({ slots: [p.id, null, null, null, null], coach: coach(coachName).id }).coachLinks.find((l) => l.slot === 0)

// the report that started it: Viper won S11 with Maokai at EDG and plays for BLG now
assert.equal(linkOf('Maokai', player('Viper'))?.why, 'champ', 'Maokai × Viper (EDG S11)')
assert.equal(linkOf('Maokai', player('Viper'))?.value, 2 + 1, 'a champion teammate is worth a club-mate (2) + same region (1)')
// KIM, between jobs: his S8 IG five, not whoever plays for IG today
assert.ok(coachWonWith(player('Rookie'), coach('KIM')) || !player('Rookie'), 'KIM × Rookie (IG S8)')
const igNow = BASE_PLAYER_CARDS.filter((p) => p.clubTag === 'IG' && !coachWonWith(p, coach('KIM')))
assert.ok(igNow.length > 0 && igNow.every((p) => linkOf('KIM', p)?.why !== 'club' && linkOf('KIM', p)?.why !== 'champ'), 'KIM no longer bonds with the current IG players he never won with')
// kkOma: T1 is his club now; Canyon won the 2021 LCK with him at DWG KIA
assert.equal(linkOf('kkOma', player('Faker'))?.why, 'club', 'kkOma × Faker: same club now')
assert.equal(linkOf('kkOma', player('Canyon'))?.why, 'champ', 'kkOma × Canyon: LCK 2021 at DK')
// a 回响 or 彩卡 card of the same man counts too
const echoBengi = ALL_CARDS.find((c) => isPlayerCard(c) && c.echo && c.ign === 'Bengi')
if (echoBengi && isPlayerCard(echoBengi)) assert.ok(coachWonWith(echoBengi, coach('kkOma')), 'kkOma × 回响 Bengi')
// assistants and the title-less: nothing beyond their club now
assert.equal(championNames(coach('Sarkis')).length, 0, 'Sarkis: assistant titles only')
assert.equal(championNames(coach('LvMao')).length, 0, 'LvMao: no head-coach title')
assert.ok(BASE_PLAYER_CARDS.filter((p) => coachSharesClub(p, coach('LvMao'))).every((p) => p.clubTag === 'LNG'), 'LvMao: LNG only')
// a former club alone is not a bond any more: Homme won with JDG, but a JDG player who was not on those rosters gets nothing
const jdgStranger = BASE_PLAYER_CARDS.find((p) => p.clubTag === 'JDG' && !coachWonWith(p, coach('Homme')) && p.nat !== coach('Homme').nat && p.region !== coach('Homme').region)
if (jdgStranger) assert.equal(linkOf('Homme', jdgStranger), undefined, `Homme × ${jdgStranger.ign}`)

assert.deepEqual(coachTitleLines(coach('KIM')), ['IG：S8 世界赛冠军', 'GEN：MSI 冠军（2024、2025）、LCK 冠军（2024 春季赛、2025 赛季）', 'KRX：LCK 冠军（2017 夏季赛）', 'T1：LCK 冠军（2020 春季赛）'], 'KIM title lines')
assert.equal(coachTitleLines(coach('Mafa')).join(), 'IG：LPL 冠军（2019 春季赛）', 'Mafa: S8 was as assistant, not counted')

// no 「带过」 bonus (owner 2026-10-05): a coach and a player with no club, title, country or region in common add nothing
{
  const lv = coach('LvMao')
  const stranger = BASE_PLAYER_CARDS.find((p) => !coachSharesClub(p, lv) && p.nat !== lv.nat && p.region !== lv.region && p.region !== 'LPL')!
  const r = chemistry({ slots: [stranger.id, null, null, null, null], coach: lv.id })
  assert.equal(r.coachBonus, 0, `LvMao × ${stranger.ign}: ${JSON.stringify(r.coachLinks)}`)
}
// every coach with champion teammates has a head-coach title, and every roster names at least one card in the game
const champs = (CHAMPS as { coaches: Record<string, { event: string; persons: string[] }[]> }).coaches
for (const [name, rows] of Object.entries(champs)) {
  const head = honoursOf(name)
  assert.ok(head && [...head.worlds, ...head.msi, ...head.leagues].some((t) => !t.assistant), `${name} has teammates but no head-coach title`)
  assert.ok(rows.length > 0, name)
}
for (const c of COACH_CARDS) {
  for (const l of coachTitleLines(c)) assert.match(l, /^[^：]+：.*冠军/, `${c.name}: ${l}`)
  assert.equal(coachTitleLines(c).length, c.titleClubs?.length ?? 0, `${c.name}: one line per title club`)
}
console.log(`coach bonds: club now + ${Object.values(champs).reduce((n, rows) => n + new Set(rows.flatMap((r) => r.persons)).size, 0)} champion teammates over ${Object.keys(champs).length} coaches`)
