/**
 * Coach bonds (owner 2026-10-05): a champion coach has a same-club bond with every club he won a title with as head
 * coach; a coach with no head-coach title bonds only with the club he coaches now — never with a former club.
 *   npx tsx scripts/check_coach_bonds.ts
 */
import assert from 'node:assert/strict'
import { BASE_PLAYER_CARDS, COACH_CARDS, chemistry, coachSharesClub, coachTitleLines } from '../src/engine/cards'
import { honoursOf } from '../src/engine/coachHonours'
const coach = (n: string) => COACH_CARDS.find((c) => c.name === n)!
const bondsWith = (n: string) => new Set(BASE_PLAYER_CARDS.filter((p) => coachSharesClub(p, coach(n))).map((p) => p.clubTag))
assert.deepEqual([...bondsWith('KIM')].sort(), ['GEN', 'IG', 'KRX', 'T1'], 'KIM: IG / Longzhu(DRX) / T1 / Gen.G')
assert.ok(bondsWith('kkOma').has('DK') && bondsWith('kkOma').has('T1'), 'kkOma: T1 and DWG KIA (2021)')
assert.ok(bondsWith('Homme').has('JDG'), 'Homme: JDG titles')
assert.equal(bondsWith('Sarkis').size, 0, 'Sarkis: assistant titles only, no bond')
assert.deepEqual([...bondsWith('LvMao')], ['LNG'], 'no head title: current club only')
assert.deepEqual(coachTitleLines(coach('KIM')), ['IG：S8 世界赛冠军', 'GEN：MSI 冠军（2024、2025）、LCK 冠军（2024 春季赛、2025 赛季）', 'KRX：LCK 冠军（2017 夏季赛）', 'T1：LCK 冠军（2020 春季赛）'], 'KIM title lines')
assert.equal(coachTitleLines(coach('Mafa')).join(), 'IG：LPL 冠军（2019 春季赛）', 'Mafa: S8 was as assistant, not counted')
// no 「带过」 bonus (owner 2026-10-05): a coach and a player with no club, title club, country or region in common add nothing
{
  const lv = coach('LvMao')
  const stranger = BASE_PLAYER_CARDS.find((p) => !coachSharesClub(p, lv) && p.nat !== lv.nat && p.region !== lv.region && p.region !== 'LPL')!
  const r = chemistry({ slots: [stranger.id, null, null, null, null], coach: lv.id })
  assert.equal(r.coachBonus, 0, `LvMao × ${stranger.ign}: ${JSON.stringify(r.coachLinks)}`)
  assert.ok(!r.notes.some((n) => n.includes('带过')), r.notes.join(' | '))
}
for (const c of COACH_CARDS) {
  // every title club names at least one title, and no line is left untranslated
  for (const l of coachTitleLines(c)) assert.match(l, /^[^：]+：.*冠军/, `${c.name}: ${l}`)
  assert.equal(coachTitleLines(c).length, c.titleClubs?.length ?? 0, `${c.name}: one line per title club`)
  const head = honoursOf(c.name)
  const hasHead = !!head && [...head.worlds, ...head.msi, ...head.leagues].some((t) => !t.assistant)
  if (!hasHead) assert.ok(!c.titleClubs?.length, `${c.name} has no head-coach title but has title clubs`)
}
console.log('coach bonds: champion coaches bond with their title clubs; others only with their current club')
