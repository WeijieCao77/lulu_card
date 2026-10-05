/**
 * Coach bonds (owner 2026-10-05): a champion coach has a same-club bond with every club he won a title with as head
 * coach; a coach with no head-coach title bonds only with the club he coaches now — never with a former club.
 *   npx tsx scripts/check_coach_bonds.ts
 */
import assert from 'node:assert/strict'
import { BASE_PLAYER_CARDS, COACH_CARDS, coachSharesClub } from '../src/engine/cards'
import { honoursOf } from '../src/engine/coachHonours'
const coach = (n: string) => COACH_CARDS.find((c) => c.name === n)!
const bondsWith = (n: string) => new Set(BASE_PLAYER_CARDS.filter((p) => coachSharesClub(p, coach(n))).map((p) => p.clubTag))
assert.deepEqual([...bondsWith('KIM')].sort(), ['GEN', 'IG', 'KRX', 'T1'], 'KIM: IG / Longzhu(DRX) / T1 / Gen.G')
assert.ok(bondsWith('kkOma').has('DK') && bondsWith('kkOma').has('T1'), 'kkOma: T1 and DWG KIA (2021)')
assert.ok(bondsWith('Homme').has('JDG'), 'Homme: JDG titles')
assert.equal(bondsWith('Sarkis').size, 0, 'Sarkis: assistant titles only, no bond')
assert.deepEqual([...bondsWith('LvMao')], ['LNG'], 'no head title: current club only')
for (const c of COACH_CARDS) {
  const head = honoursOf(c.name)
  const hasHead = !!head && [...head.worlds, ...head.msi, ...head.leagues].some((t) => !t.assistant)
  if (!hasHead) assert.ok(!c.titleClubs?.length, `${c.name} has no head-coach title but has title clubs`)
}
console.log('coach bonds: champion coaches bond with their title clubs; others only with their current club')
