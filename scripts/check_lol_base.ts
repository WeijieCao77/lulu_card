import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as gacha from '../src/engine/gacha'
import * as original from '../../reference-val/src/engine/gacha'
import { ALL_CARDS, BASE_PLAYER_CARDS, COACH_CARDS, SEOUL_CARDS, DUPES_FOR, COINS_FOR, SALVAGE, chemistry } from '../src/engine/cards'
import { runAction } from '../src/engine/cardActions'

// Regression against the actual pinned game, not a second implementation of
// probability formulas. Different people, identical random rarity/economy path.
// Keep the original natural odds; this LoL set has no coach legends.
original.PACKS.coach.mythic = 0
assert.equal(ALL_CARDS.filter(c => c.rarity === 'mythic').length, 29)
assert.equal(gacha.PACKS.coach.mythic, 0)
for (const kind of ['scout', 'elite', 'ten', 'coach'] as const) {
  const a = gacha.newGacha('parity', 'test', '2026-09-21')
  const b = original.newGacha('parity', 'test', '2026-09-21')
  for (let i = 0; i < 500; i++) {
    a.packs[kind] = b.packs[kind] = 1
    const ap = gacha.openPack(a, kind, 'pack')
    const bp = original.openPack(b, kind, 'pack')
    assert.deepEqual(ap.map(p => p.card.rarity), bp.map(p => p.card.rarity), `${kind} rarity parity at ${i}`)
    assert.deepEqual([a.pity, a.mythicDry, a.seed, a.pulls, a.coins], [b.pity, b.mythicDry, b.seed, b.pulls, b.coins])
  }
}
assert.deepEqual(DUPES_FOR, [1,1,2,3,5])
assert.deepEqual(COINS_FOR, [400,900,2000,4200,9000])
assert.deepEqual(SALVAGE, { mythic:4000,gold:700,silver:200,bronze:60 })
assert.equal(SEOUL_CARDS.length,0)
assert.equal(new Set(ALL_CARDS.map(c => c.id)).size,ALL_CARDS.length)
for (const region of gacha.SERIES) {
  for (const rarity of ['bronze','silver','gold']) {
    assert(ALL_CARDS.some(c => c.kind === 'player' && c.region === region && c.rarity === rarity), `${region} missing ${rarity}`)
  }
  const kind = gacha.PACK_ORDER.find(k => gacha.seriesOfPack(k) === region)!
  assert(kind)
  const a=gacha.newGacha(region,'test','2026-09-21')
  for(let i=0;i<300;i++) {
    a.packs[kind]=1
    const pack=gacha.openPack(a,kind,'pack')
    assert.equal(pack.length,3)
    assert(pack.every(p=>p.card.kind==='player' && p.card.region===region))
    assert(pack.some(p=>p.card.rarity!=='bronze'))
  }
  a.packs[kind]=1;a.pity=gacha.HARD_PITY-1;a.mythicDry=gacha.MYTHIC_FLOOR
  assert(gacha.openPack(a,kind,'pack').some(p=>p.card.rarity==='gold' || p.card.rarity==='mythic'))
}

const a=gacha.newGacha('actions','test','2026-09-21')
const env={today:'2026-09-21',now:Date.parse('2026-09-21T10:00Z'),seed:234}
assert(runAction(a,'checkin',{},env).ok)
const afterCheckin=a.coins
runAction(a,'checkin',{},env) // original endpoint is idempotent; the balance must not change
assert.equal(a.coins,afterCheckin)
assert.equal(runAction(a,'open',{kind:'seoul2024',payWith:'coins'},env).ok,false)
a.packs.legend=1
assert.equal(runAction(a,'open',{kind:'legend',payWith:'pack'},env).ok,true)
assert.equal(runAction(a,'open',{kind:'ten',payWith:'coins'},env).ok,false)
const bronze=BASE_PLAYER_CARDS.find(c=>c.rarity==='bronze')!
a.cards[bronze.id]={id:bronze.id,level:0,dupes:12,seen:13,got:env.today};a.coins=100_000
for(let i=0;i<5;i++)assert(gacha.upgrade(a,bronze.id))
assert.equal(a.cards[bronze.id].level,5)
assert.equal(a.cards[bronze.id].dupes,0)
assert.equal(a.coins,100_000-COINS_FOR.reduce((x,y)=>x+y,0))
assert.equal(gacha.upgrade(a,bronze.id),false)
a.cards[bronze.id].dupes=2
assert.equal(gacha.salvage(a,bronze.id,20),120)
assert(a.cards[bronze.id])
const wrong=BASE_PLAYER_CARDS.find(c=>c.role==='中单')!
assert(chemistry({slots:[null,null,null,null,wrong.id],coach:null}).misfits.includes(4),'Support is a real position, not the old free slot')

let photos=0
for(const c of ALL_CARDS) {
  assert(Number.isFinite(c.rating) && c.rating>=1 && c.rating<=99,c.id)
  if(c.face) {
    assert(c.face.includes('lol/faces/'),`non-LoL photograph ${c.id}`)
    const path=fileURLToPath(new URL('../public/'+c.face.replace(/^\.\//,'').split('?')[0],import.meta.url))
    assert(existsSync(path),`missing portrait ${path}`);photos++
  }
}
const data=JSON.parse(readFileSync(new URL('../src/data/world.json',import.meta.url),'utf8'))
assert.equal(data.meta.competitiveSnapshot.unverifiedPrimaryTeams.length,0)
console.log(`PASS: 2,000 original-engine parity packs, 1,800 regional packs, six gold floors, 29 legend cards, account actions, upgrades, salvage and LoL photo isolation. ${ALL_CARDS.length} cards (${BASE_PLAYER_CARDS.length} players, ${COACH_CARDS.length} coaches), ${photos} card portraits.`)
