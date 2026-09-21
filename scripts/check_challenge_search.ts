import assert from 'node:assert/strict'
import { allChoices, answerPool, type ChallengeKind, type Choice } from '../src/engine/challenge'
import { rankChallengeMatches, COMMON_PLAYER_ALIASES } from '../src/engine/challengeSearch'
import official from '../src/data/challengeChampionNames.json'
const all = allChoices()
let checks = 0
function finds(query: string, id: string) {
  assert(rankChallengeMatches(all, query).some(c => c.id === id), `${query} must find ${id}`)
  checks++
}
for (const choice of all) finds(choice.name, choice.id)
for (const kind of ['player','team','agent'] as ChallengeKind[]) {
  for (const id of answerPool(kind)) {
    const choice = all.find(c => c.id === id && c.kind === kind)
    assert(choice, `answer missing from choices: ${kind}/${id}`)
    finds(choice.name, id)
  }
}
for (const c of all.filter(c => c.kind === 'agent')) {
  const names = (official.names as Record<string,string[]>)[c.id]
  assert(names?.length, `official names missing: ${c.id}`)
  for (const q of [c.id,...names]) finds(q,c.id)
}
for (const [q,id] of Object.entries({'阿狸':'Ahri','亚索':'Yasuo','瞎子':'Lee Sin','石头人':'Malphite','女枪':'Miss Fortune','卡牌':'Twisted Fate','男枪':'Graves','剑姬':'Fiora','猴子':'Wukong','机器人':'Blitzcrank','小炮':'Tristana','狗头':'Nasus','鳄鱼':'Renekton','VN':'Vayne','ＥＺ':'Ezreal','Ｋａｉ’Ｓａ':"Kai'Sa",'烈娜塔':'Renata Glasc'})) finds(q,id)
for (const [name,aliases] of Object.entries(COMMON_PLAYER_ALIASES)) {
  for (const p of all.filter(c=>c.kind==='player' && c.name===name)) for(const alias of aliases) finds(alias,p.id)
}
const gen = all.find(c=>c.kind==='team' && c.name==='Gen.G')!
for (const q of ['GENG','gen.g','ＧＥＮＧ','GEN']) assert.equal(rankChallengeMatches(all,q)[0]?.id,gen.id)
const faker = all.find(c=>c.kind==='player' && c.name==='Faker')!
assert(!rankChallengeMatches(all.filter(c=>c.id!==faker.id),'Faker').some(c=>c.id===faker.id))
const accent:Choice={id:'test',name:'Léviatán',hint:'',kind:'team'}
assert.equal(rankChallengeMatches([accent],'Leviatan')[0],accent)
assert.deepEqual(rankChallengeMatches(all,'not-a-real-choice-anything'),[])
assert.deepEqual(rankChallengeMatches(all,'　！　'),[])
assert(rankChallengeMatches(all,'a').length<=8)
console.log(`Challenge search: ${checks} checks passed; ${all.length} choices, ${Object.keys(official.names).length} champion mappings`)
