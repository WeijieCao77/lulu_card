import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { LEGEND_CARDS, BASE_PLAYER_CARDS, personOf, chemistry } from '../src/engine/cards'
import { LEGENDS } from '../src/engine/legends'
import { newGacha, openPack, MYTHIC_FLOOR, PACKS, setSlot, personTaken, FULL_SET_CARDS, fullSetProgress, claimFullSet } from '../src/engine/gacha'
import { buildArena, playArenaMatch, ARENA_TEAM } from '../src/engine/arena'
import { CUP_TEAMS } from '../src/engine/cupTeams'

const names = ['Faker','Mata','MaRin','Faker','Ruler','Ning','Tian','Canyon','Scout','Kingen','Zeus','Faker','Gumayusi']
assert.deepEqual(LEGEND_CARDS.slice(0,13).map(c => c.ign), names)
assert.deepEqual(LEGENDS.slice(0,13).map(l => l.year), Array.from({length:13},(_,i)=>2013+i))
assert.equal(LEGENDS[0].kind,'icon')
for (const c of LEGEND_CARDS) {
  assert(c.face && existsSync('public/'+c.face.replace(/^\.\//,'').split('?')[0]))
  assert(c.legend?.art?.source.startsWith('https://'))
  const face = readFileSync('public/'+c.face!.replace(/^\.\//,'').split('?')[0])
  assert(face.length > 20_000, `photo too small: ${c.ign}`)
  assert(Object.values(c.attrs).every(v=>v>=1&&v<=99))
  const base=BASE_PLAYER_CARDS.find(b=>b.ign===c.ign)
  if(base) assert.equal(personOf(c),personOf(base),'Same person must share duplicate identity')
}
for(const kind of ['scout','elite','ten','cn','pac','emea','ame'] as const) {
  const g=newGacha(kind,'test','2026-09-21');g.mythicDry=MYTHIC_FLOOR;g.packs[kind]=1
  const pulled=openPack(g,kind,'pack');assert(pulled.some(p=>p.card.rarity==='mythic'))
  const regions: Record<string,string> = {cn:'LPL',pac:'LCK',emea:'LEC',ame:'LCS'}
  if(regions[kind]) assert(pulled.every(p=>p.card.region===regions[kind]))
  assert(g.mythicDry<PACKS[kind].draws)
}
for(const kind of ['coach','lcp','cblol','duelist','initiator'] as const) {
  const g=newGacha(kind,'test','2026-09-21');g.mythicDry=MYTHIC_FLOOR;g.packs[kind]=1
  assert(openPack(g,kind,'pack').every(p=>p.card.rarity!=='mythic'));assert.equal(g.mythicDry,MYTHIC_FLOOR)
}
const g=newGacha('guaranteed','test','2026-09-21');g.packs.legend=1;g.pity=12;g.mythicDry=651
assert.equal(openPack(g,'legend','pack')[0].card.rarity,'mythic');assert.equal(g.pity,12);assert.equal(g.mythicDry,651)
assert.throws(()=>openPack(g,'legend','coins'))
const byName=(n:string)=>LEGEND_CARDS.find(c=>c.ign===n)!
const squad={slots:['MaRin','Ning','Faker','Ruler','Mata'].map(n=>byName(n).id),coach:null}
assert.equal(chemistry(squad).misfits.length,0)
const arena=buildArena(squad,()=>0,100)
assert.equal(Object.values(arena.state.players).filter(p=>p.teamId===ARENA_TEAM).length,5)
const result=playArenaMatch(squad,()=>0,CUP_TEAMS[0].id,3,42)
assert.equal(result.lines.length,5);assert.equal(Math.max(result.mapsWon,result.mapsLost),2)
assert(result.lines.some(l=>l.cardId===byName('Mata').id))
const fakers=LEGEND_CARDS.filter(c=>c.ign==='Faker')
assert.equal(new Set(fakers.map(personOf)).size,1)
setSlot(g,0,fakers[0].id)
assert(personTaken(g,fakers[1].id))
setSlot(g,1,fakers[1].id)
assert.equal(g.squad.slots[0],null)
assert.equal(g.squad.slots[1],fakers[1].id)
const baseFaker=BASE_PLAYER_CARDS.find(c=>c.ign==='Faker')!
setSlot(g,2,baseFaker.id)
assert.equal(g.squad.slots[1],null)
const collection=newGacha('collection','test','2026-09-21')
for(const id of FULL_SET_CARDS) collection.cards[id]={id,level:0,dupes:0,seen:1,got:'2026-09-21'}
assert(LEGEND_CARDS.every(c=>!FULL_SET_CARDS.has(c.id)))
assert(fullSetProgress(collection).ready)
assert(claimFullSet(collection));assert.equal(collection.packs.legend,1)
assert.equal(claimFullSet(collection),null);assert.equal(collection.packs.legend,1)
assert.equal(openPack(collection,'legend','pack')[0].card.rarity,'mythic')
console.log('PASS: 40 historical and Hall of Fame cards; photo assets; authentic award labels; canonical identities; guaranteed and regional mythic pools; isolated pity; retired-player BO3.')

assert.equal(LEGEND_CARDS.length,40)
const ig = LEGEND_CARDS.filter(c => c.legend?.year === 2018 && c.clubTag === 'IG')
assert.deepEqual(ig.map(c=>c.ign).sort(), ['Baolan','Duke','JackeyLove','Ning','Rookie','TheShy'])
assert.equal(ig.filter(c=>c.ign==='Ning').length,1)
const hall = LEGEND_CARDS.filter(c=>c.legend?.collection==='hall-of-fame')
assert.equal(hall.length,11)
assert.deepEqual(hall.slice(0,3).map(c=>c.ign),['Doublelift','Bjergsen','Perkz'])
assert(hall.every(c=>!LEGEND_CARDS.some(other=>other.ign===c.ign && other.legend?.competition!=='Career')), 'No duplicate award editions in the career pool')
const weights: Record<string,number[]> = {'上单':[.20,.24,.10,.12,.08,.16,.07,.03],'打野':[.16,.10,.22,.08,.08,.18,.12,.06],'中单':[.24,.20,.10,.12,.09,.16,.06,.03],'下路':[.26,.16,.06,.18,.09,.18,.05,.02],'辅助':[.08,.12,.24,.06,.06,.16,.20,.08]}
const keys = ['aim','reaction','awareness','utility','clutch','teamwork','communication','igl'] as const
const bands: Record<string,number[]> = {hall:[90,92],champion:[90,94],'msi-mvp':[93,95],'worlds-mvp':[94,97],special:[90,97]}
for (const c of LEGEND_CARDS) {
  const band=bands[c.legend!.ratingTier!]; assert(c.rating>=band[0] && c.rating<=band[1],c.id)
  assert.equal(Math.round(keys.reduce((sum,key,i)=>sum+c.attrs[key]*weights[c.role][i],0)),c.rating,c.id+' weighted overall')
  assert(!c.legend!.art!.source.includes('PLACEHOLDER'))
  const historic = buildArena({slots:[c.id,null,null,null,null],coach:null},()=>0,100)
  assert(Object.values(historic.state.players).some(p=>p.teamId===ARENA_TEAM && p.ign===c.ign),c.id+' playable')
}
assert.equal(LEGEND_CARDS.filter(c=>c.legend?.competition==='MSI').length,11)
assert(BASE_PLAYER_CARDS.every(c=>c.rating<=90))
assert.equal(Math.max(...BASE_PLAYER_CARDS.map(c=>c.rating)),90)
const data=JSON.parse(readFileSync('src/data/world.json','utf8'))
const ordered=data.players.slice().sort((a:any,b:any)=>a.sourceOverall-b.sourceOverall)
for(let i=1;i<ordered.length;i++) assert(ordered[i].overall>=ordered[i-1].overall,'Base ranking must not invert')
assert.equal(BASE_PLAYER_CARDS.filter(c=>c.rarity==='gold').length,163)
assert.equal(BASE_PLAYER_CARDS.filter(c=>c.rarity==='silver').length,245)
assert.equal(BASE_PLAYER_CARDS.filter(c=>c.rarity==='bronze').length,269)
for(const name of ['Uzi','Clearlove','Caps']) {
  const versions=LEGEND_CARDS.filter(c=>c.ign===name)
  assert.equal(versions.length,1)
  assert.equal(versions[0].legend?.competition,'MSI')
}
const igSquad={slots:['TheShy','Ning','Rookie','JackeyLove','Baolan'].map(n=>ig.find(c=>c.ign===n)!.id),coach:null}
assert.equal(chemistry(igSquad).misfits.length,0)
assert.equal(playArenaMatch(igSquad,()=>0,CUP_TEAMS[0].id,3,56).lines.length,5)
console.log('PASS: rating bands, weighted attributes, unchanged basic rarity pools, all 40 playable, complete IG, no duplicate champion career editions, same-player exclusivity.')
