import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { newGacha, staminaNow, ladderPool, HARD_PITY } from '../src/engine/gacha'
import { runAction } from '../src/engine/cardActions'
import { CUP_TEAMS } from '../src/engine/cupTeams'
import { BASE_PLAYER_CARDS } from '../src/engine/cards'
import { WORLD_TEAMS } from '../src/engine/teams'
import { answerFor, kindFor, challengeSig, imgOf, answerPool } from '../src/engine/challenge'
import { reconPuzzle } from '../src/engine/minigame'
const today='2026-09-21',now=Date.parse(today+'T12:00Z')
for(const region of ['LPL','LCK','LEC','LCS','LCP','CBLOL']) {
 const team=CUP_TEAMS.find(t=>WORLD_TEAMS.find(w=>w.id===t.id)?.region===region)!
 assert(team)
 const g=newGacha('test-'+region,'测试',today)
 g.squad=structuredClone(team.squad)
 for(const id of [...g.squad.slots,g.squad.coach]) if(id)g.cards[id]={id,level:0,dupes:0,seen:1,got:today}
 const env={today,now,seed:12345}
 const before=staminaNow(g,now)
 const ranked=runAction(g,'ladder',{},env)
 assert(ranked.ok,JSON.stringify(ranked));assert.equal(staminaNow(g,now),before-2)
 const res=(ranked as any).result.res
 assert.equal(res.bo,5);assert.equal(Math.max(res.mapsWon,res.mapsLost),3)
 assert.equal(res.lines.length,5)
 assert(res.result.maps.every((m:any)=>m.map==='召唤师峡谷'))
 assert.equal(g.ladder.wins+g.ladder.losses,1)
 assert(runAction(g,'cup_enter',{},env).ok)
 assert.equal(staminaNow(g,now),before-7)
 let rounds=0
 while(g.cup && !g.cup.done && rounds++<20) {
   const out=runAction(g,'cup_play',{}, {...env,seed:12345+rounds})
   assert(out.ok,JSON.stringify(out));assert.equal(staminaNow(g,now),before-7)
 }
 assert(g.cup?.done,region+' cup must finish')
 console.log(region+' BO5 ladder and full cup settled; entry stamina charged once')
}
for(let div=0;div<9;div++)for(const id of ladderPool(div))assert(CUP_TEAMS.some(t=>t.id===id))
for(let d=1;d<=14;d++) {
 const date='2026-09-'+String(d).padStart(2,'0'),g=newGacha('challenge','test',date)
 const answer=answerFor(date,g.id),kind=kindFor(date,g.id)
 assert(answer);assert(imgOf(kind,answer));assert(existsSync('public/'+imgOf(kind,answer)))
 const r=runAction(g,'challenge',{guessId:answer,sig:challengeSig()},{today:date,now:Date.parse(date),seed:3})
 assert(r.ok,JSON.stringify(r));assert(g.challenge.solved)
 const coins=g.coins
 assert.equal(runAction(g,'challenge',{guessId:answer,sig:challengeSig()},{today:date,now:Date.parse(date),seed:3}).ok,false)
 assert.equal(coins,g.coins)
}
for(const kind of ['agent','team','player'] as const)for(const id of answerPool(kind))assert(existsSync('public/'+imgOf(kind,id)),kind+' '+id)
for(let seed=0;seed<200;seed++)assert.equal(reconPuzzle(seed).enemies.length,4)
console.log('PASS challenge answer artwork, reward idempotency and Rift memory puzzles')
