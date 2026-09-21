import assert from 'node:assert/strict'
import { BASE_PLAYER_CARDS, COACH_CARDS, LEGEND_CARDS, chemistry, personOf } from '../src/engine/cards'
import { clubLineage, sameClubLineage, TEAM_LINEAGES } from '../src/engine/teamLineage'
import { buildArena, ARENA_TEAM } from '../src/engine/arena'
const old = (clubTag: string, region = 'LCK') => ({clubId:`H:${clubTag}`,clubTag,region})
for (const f of TEAM_LINEAGES) for (const tag of f.aliases) assert(sameClubLineage(old(tag,f.region), old(f.aliases[0],f.region)),tag)
assert(!sameClubLineage({},{}))
assert(!sameClubLineage(old('TSM','LCS'),old('SR','LCS')))
assert(!sameClubLineage(old('SSW'),old('SSB')))
assert(!sameClubLineage(old('DK'),old('DNS')))
assert(!sameClubLineage(old('SSG'),{clubId:'T92',clubTag:'SSG',region:'LCP'}))
assert(!sameClubLineage({clubId:'T15',clubTag:'BFX',region:'LCK'},{clubId:'T59',clubTag:'BFX',region:'LCK'}),'Academy shares tag but not team')
assert.equal(clubLineage({clubId:'T1',clubTag:'AL',region:'LPL'}),'club:T1','T1 team tag is not database ID T1')
const marin=LEGEND_CARDS.find(c=>c.ign==='MaRin')!
const oldFaker=LEGEND_CARDS.find(c=>c.id==='worlds-2013-faker')!
const oner=BASE_PLAYER_CARDS.find(c=>c.ign==='Oner')!
const keria=BASE_PLAYER_CARDS.find(c=>c.ign==='Keria')!
const coach=COACH_CARDS.find(c=>c.clubId==='T24')!
assert(marin&&oldFaker&&oner&&keria&&coach)
const squad={slots:[marin.id,oner.id,oldFaker.id,null,keria.id],coach:coach.id}
const report=chemistry(squad)
assert.equal(report.links.length,6)
assert(report.links.every(l=>l.why==='club'&&l.value===3))
assert(report.links.some(l=>l.inherited))
assert.equal(report.coachBonus,12)
assert(report.coachLinks.every(l=>l.why==='club'&&l.value===3))
assert.equal(report.misfits.length,0)
const ruler=LEGEND_CARDS.find(c=>c.id==='worlds-2017-ruler')!
assert.equal(ruler.clubId,'H:SSG')
const chovy=BASE_PLAYER_CARDS.find(c=>c.ign==='Chovy')!
assert(sameClubLineage(ruler,chovy))
const kingen=LEGEND_CARDS.find(c=>c.id==='worlds-2022-kingen')!
const drx=BASE_PLAYER_CARDS.find(c=>c.clubId==='T22')!
assert(sameClubLineage(kingen,drx))
assert(!sameClubLineage(LEGEND_CARDS.find(c=>c.id==='worlds-2023-zeus')!,LEGEND_CARDS.find(c=>c.id==='msi-2026-zeus')!),'Transfers do not merge T1 and HLE')
assert.equal(personOf(oldFaker),personOf(BASE_PLAYER_CARDS.find(c=>c.ign==='Faker')!))
const arena=buildArena(squad,()=>0,100)
assert.equal(Object.values(arena.state.players).filter(p=>p.teamId===ARENA_TEAM).length,4)
console.log('PASS: 10 sourced lineages; SKT/T1 players and coach; SSG/GenG and DRX/KRX; no academy/tag/transfer collisions; arena integration.')
