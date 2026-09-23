import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LEGEND_CARDS, personOf, cardPower } from '../src/engine/cards'
import { LEGENDS, legendEdition } from '../src/engine/legends'

// DeepSeek's candidate test was audited: use real exports, old committed baseline,
// and independent expected facts rather than self-comparisons or current-data fixtures.
const old = JSON.parse(readFileSync(new URL('./fixtures/legend-cards-v3.json', import.meta.url), 'utf8'))
const expected = [
  ['doublelift',2018,'TL','下路',92], ['bjergsen',2017,'TSM','中单',92],
  ['perkz',2019,'G2','下路',92], ['rekkles',2018,'FNC','下路',92],
  ['sneaky',2018,'C9','下路',91], ['jensen',2018,'C9','中单',91],
  ['xmithie',2019,'TL','打野',90], ['aphromoo',2018,'100T','辅助',91],
  ['froggen',2014,'ALL','中单',91], ['diamondprox',2013,'GMB','打野',91],
  ['soaz',2017,'FNC','上单',90],
] as const
const hall = LEGEND_CARDS.filter(c => c.legend?.kind === 'hall')
assert.equal(LEGEND_CARDS.length,40)
assert.equal(hall.length,11)
assert.deepEqual(LEGEND_CARDS.filter(c=>c.legend?.kind!=='hall'),old.filter((c:any)=>c.legend.kind!=='hall'),'29 award/IG cards unchanged')
const weights: Record<string,number[]> = {'上单':[.20,.24,.10,.12,.08,.16,.07,.03],'打野':[.16,.10,.22,.08,.08,.18,.12,.06],'中单':[.24,.20,.10,.12,.09,.16,.06,.03],'下路':[.26,.16,.06,.18,.09,.18,.05,.02],'辅助':[.08,.12,.24,.06,.06,.16,.20,.08]}
const keys=['aim','reaction','awareness','utility','clutch','teamwork','communication','igl'] as const
for(const [suffix,year,team,role,rating] of expected){
  const id=`career-${suffix}`, c=hall.find(c=>c.id===id)!, l=LEGENDS.find(l=>l.id===id)!, prev=old.find((c:any)=>c.id===id)
  assert(c && l && prev,id)
  assert.deepEqual([l.year,c.clubTag,c.role,c.rating],[year,team,role,rating],id)
  assert.deepEqual(c.roles,[role]); assert.deepEqual(l.person!.roles,[role])
  assert.equal(personOf(c),personOf(prev),'real-person identity preserved')
  assert.equal(c.playerId,prev.playerId); assert.equal(c.nat,prev.nat)
  assert.equal(l.person!.overall,rating); assert.deepEqual(c.attrs,l.person!.attrs)
  assert.equal(Math.round(keys.reduce((s,k,i)=>s+c.attrs[k]*weights[role][i],0)),rating,id)
  assert.equal(cardPower(c,5),(rating+5)*100)
  const peak=l.peakSeason!;assert(peak,id+' missing season evidence')
  assert.equal(peak.year,year);assert.equal(peak.role,role);assert(peak.basis.length>10)
  assert.equal(peak.selection,'game-design')
  assert.equal(legendEdition(l),`${year} 巅峰`)
  assert(peak.evidence.length>0)
  for(const e of peak.evidence){assert(e.url.startsWith('https://'));assert(!e.url.includes('flickr.com'));assert(e.claim.length>5)}
  assert.equal(l.source,peak.evidence[0].url);assert.notEqual(l.source,l.art!.source)
  assert(!l.note.includes('生涯纪念') && !l.note.includes('art.year') && !l.note.includes('待复核') && !l.note.includes('配图为'))
  if(!['career-perkz','career-aphromoo'].includes(id)){
    assert.deepEqual(c.attrs,prev.attrs,id+' no unsupported attribute changes')
    assert.equal(c.rating,prev.rating)
    if(id==='career-froggen') {
      assert.equal(l.art!.year,2014); assert.notEqual(c.face,prev.face,'Replace old Echo Fox jersey with 2014 Alliance portrait')
    } else assert.deepEqual(l.art,prev.legend.art)
  } else { assert.equal(l.art!.year,year);assert.notEqual(c.face,prev.face) }
  assert(Number.isInteger(l.art!.year),id+' preserve explicit photo year separately from season')
}
assert.equal(hall.reduce((n,c)=>n+c.rating,0),1003,'only Aphromoo gains one rating point')
assert.deepEqual(['上单','打野','中单','下路','辅助'].map(r=>hall.filter(c=>c.role===r).length),[1,2,3,4,1])
assert.equal(hall.find(c=>c.id==='career-aphromoo')!.clubId,'H:100T')
assert(!hall.find(c=>c.id==='career-perkz')!.roles.includes('中单'),'2019 Perkz cannot borrow 2018 mid role')
console.log('PASS: 11 selected single seasons; all 40 identities and 29 other editions stable; two role/rating revisions; dated photo provenance.')
