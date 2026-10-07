/**
 * S16 世界赛: the rules the owner set (2026-10-04), checked against the engine.
 *
 *   npx tsx scripts/check_s16_series.ts
 */
import { ALL_CARDS, BASE_PLAYER_CARDS, PLAYER_CARDS, S16_CARDS, buildS16Cards, cardById, isS16Card, personOf, s16Hidden } from '../src/engine/cards'
import { FULL_SET_CARDS, PACKS, S16_SET_REWARDS, autoSquad, collectionProgress, mergeClientFields, migrateGacha, newGacha, openPack, s16SetProgress } from '../src/engine/gacha'
import { runAction, squadForPlay } from '../src/engine/cardActions'
import { matchesFilter } from '../src/engine/cardFilter'
import { rollShop } from '../src/engine/dailyShop'
import { koReward, setKo, setSwiss, swissReward } from '../src/engine/s16Predict'
import type { S16PredictState } from '../src/engine/s16Predict'
import { capOf, S16_PRICE_CAP } from '../market-api.js'
import S16 from '../src/data/s16.json'

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const day = '2026-10-12'

// the pool
check('卡池 = s16.json 里的选手，每人一张', S16_CARDS.length === S16.players.length && new Set(S16_CARDS.map((c) => c.id)).size === S16_CARDS.length, String(S16_CARDS.length))
check('每张都是普通卡的同一个人（同人不能同时上阵）', S16_CARDS.every((c) => { const b = BASE_PLAYER_CARDS.find((x) => x.id === S16.players.find((p) => p.id === c.id)!.base)!; return personOf(b) === personOf(c) }))
check('俱乐部按 S16 参赛队', S16_CARDS.every((c) => c.clubId === c.s16!.club))
check('都在总卡表里，不在普通卡池', S16_CARDS.every((c) => cardById(c.id) === c) && !PLAYER_CARDS.some(isS16Card))
check('开赛前全部未揭晓（卡面是「?」）', S16_CARDS.every((c) => s16Hidden(c)))
check('不进全图鉴、不算主图鉴进度', !S16_CARDS.some((c) => FULL_SET_CARDS.has(c.id)) && collectionProgress(newGacha('a', 'a', day)).total === ALL_CARDS.filter((c) => !c.id.startsWith('echo:') && !c.id.startsWith('s16:')).length)
let inShop = false
for (let i = 0; i < 1000; i++) { const g = newGacha('s' + i, 's', day); if (rollShop(g, day, i * 7919).slots.some((s) => s.cardId.startsWith('s16:'))) inShop = true }
check('每日商店不出 S16 卡', !inShop)

// the pack
const def = PACKS.s16
check('S16 包：2600 金币三张、等概率、卖到 11/21', def.cost === 2600 && def.draws === 3 && def.uniform === true && def.until === '2026-11-21' && def.shop === true)
{
  const g = newGacha('p', 'p', day); g.coins = 2600 * 3000
  const pity = g.pity, dry = g.mythicDry
  const seen = new Map<string, number>()
  for (let i = 0; i < 2000; i++) for (const p of openPack(g, 's16', 'coins', day)) seen.set(p.card.id, (seen.get(p.card.id) ?? 0) + 1)
  const counts = [...seen.values()]
  check('只出 S16 卡', [...seen.keys()].every((id) => id.startsWith('s16:')))
  check('每位选手都抽得到，次数接近（等概率）', seen.size === S16_CARDS.length && Math.min(...counts) > 6000 / S16_CARDS.length * 0.6 && Math.max(...counts) < 6000 / S16_CARDS.length * 1.4, `${Math.min(...counts)}–${Math.max(...counts)}`)
  check('不动保底计数', g.pity === pity && g.mythicDry === dry)
  let refused = false
  try { openPack(g, 's16', 'coins', '2026-11-22') } catch { refused = true }
  g.packs.s16 = 1
  let opened = false
  try { opened = openPack(g, 's16', 'pack', '2026-11-22').length === 3 } catch { opened = false }
  check('11/22 起买不到，手里的包还能开', refused && opened)
}

// benched until revealed
{
  const g = migrateGacha(JSON.parse(JSON.stringify(newGacha('b', 'b', day))), 'b')
  const hidden = S16_CARDS.slice(0, 5)
  for (const c of hidden) g.cards[c.id] = { id: c.id, level: 0, dupes: 0, seen: 1, got: day } as never
  const merged = mergeClientFields(g, { squad: { slots: hidden.map((c) => c.id), coach: null } } as never)
  check('「?」卡放不进阵容（服务器清掉）', merged.squad.slots.every((x) => x === null))
  check('自动组队不选「?」卡', autoSquad(g).slots.every((x) => !x || !x.startsWith('s16:')))
  g.squad = { slots: hidden.map((c) => c.id), coach: null }
  check('比赛时也不认「?」卡', !squadForPlay(g).ok)
  check('「?」卡不归在金/银/铜任何一档', !hidden.some((c) => ['gold', 'silver', 'bronze'].some((r) => matchesFilter(c, { rarity: r as never, region: 'all', role: 'all', club: 'all' }))))
  check('筛选「S16 世界赛」能找到', hidden.every((c) => matchesFilter(c, { rarity: 's16', region: 'all', role: 'all', club: 'all' })))
}

// reveal, metals, FMVP
{
  const a = S16_CARDS[0], b = S16_CARDS[1]
  const built = buildS16Cards({ [a.ign]: { rating: 88, rarity: 'gold', games: 3, prev: 85 }, [b.ign]: { rating: 80, rarity: 'silver', games: 2, prev: null } }, b.ign)
  const A = built.find((c) => c.ign === a.ign)!, B = built.find((c) => c.ign === b.ign)!
  check('打过比赛就揭晓：数值、金银铜、场数、涨跌', A.s16!.revealed && A.rating === 88 && A.rarity === 'gold' && A.s16!.games === 3 && A.s16!.prev === 85)
  check('FMVP 的卡变成彩卡', B.rarity === 'mythic' && B.s16!.fmvp)
  // owner 2026-10-07: still tradeable, but no longer under the S16 cap — priced like any 彩卡
  check('FMVP 彩卡照常交易，单价不再封 1 万（按彩卡）', capOf(B) > S16_PRICE_CAP && capOf(B) === capOf(BASE_PLAYER_CARDS.find((c) => c.rarity === 'gold')) && capOf(A) === S16_PRICE_CAP)
  check('没打的还是「?」', built.filter((c) => c.ign !== a.ign && c.ign !== b.ign).every((c) => !c.s16!.revealed))
}

// market and trading
check('市场单价上限：S16 卡 1 万，不看金银铜', capOf(S16_CARDS[0]) === 10000 && S16_PRICE_CAP === 10000 && capOf(BASE_PLAYER_CARDS.find((c) => c.rarity === 'bronze')) === 2000)

// S16 图鉴
{
  const g = migrateGacha(JSON.parse(JSON.stringify(newGacha('set', 'set', day))), 'set')
  const p0 = s16SetProgress(g)
  check('S16 图鉴四档 25/50/75/100%', p0.marks.length === 4 && p0.total === S16_CARDS.length && S16_SET_REWARDS[3].pack === 'ten', p0.marks.join('/'))
  for (const c of S16_CARDS.slice(0, p0.marks[0])) g.cards[c.id] = { id: c.id, level: 0, dupes: 0, seen: 1, got: day } as never
  const coins = g.coins
  check('收到第一档领 1500 金币', runAction(g, 's16_set', {}, { now: Date.parse(day), today: day, seed: 1 }).ok && g.coins === coins + 1500)
}

// 赛事预测
{
  const teams = ['T18', 'T1', 'T26', 'T50', 'T20', 'T2', 'T29', 'T24', 'T12', 'T43', 'T17', 'T4', 'T42', 'T39', 'T35', 'T28']
  const lockAt = '2026-10-20T08:00:00+08:00', confirmedAt = '2026-10-26T00:00:00+08:00'
  const sw = { teams, lockAt, qualified: teams.slice(0, 8), threeZero: ['T18', 'T1'], zeroThree: ['T35', 'T28'], confirmedAt }
  const before = Date.parse('2026-10-19T12:00:00+08:00'), after = Date.parse('2026-10-27T00:00:00+08:00')
  const s: S16PredictState = {}
  check('瑞士轮：3-0 必须在晋级队里', setSwiss(s, { qual: teams.slice(0, 8), threeZero: ['T35', 'T18'], zeroThree: ['T28', 'T42'] }, before, sw) !== null)
  check('瑞士轮：0-3 不能是晋级队', setSwiss(s, { qual: teams.slice(0, 8), threeZero: ['T18', 'T1'], zeroThree: ['T18', 'T42'] }, before, sw) !== null)
  check('瑞士轮：开打后锁定', setSwiss(s, { qual: teams.slice(0, 8), threeZero: ['T18', 'T1'], zeroThree: ['T35', 'T28'] }, Date.parse(lockAt) + 1, sw) !== null)
  check('瑞士轮：合法预测能存', setSwiss(s, { qual: teams.slice(0, 8), threeZero: ['T18', 'T1'], zeroThree: ['T35', 'T28'] }, before, sw) === null)
  const r1 = swissReward(s.swiss, after, sw)!
  check('8 支全中 + 3-0/0-3 全中：十连包 ×2 + S16 包 ×4', r1.packs.ten === 2 && r1.packs.s16 === 4, JSON.stringify(r1.packs))
  check('赛果确认前领不了', swissReward(s.swiss, Date.parse(confirmedAt) - 1, sw) === null)
  const six = { ...sw, qualified: [...teams.slice(0, 6), 'T42', 'T39'] }
  check('猜中 6 支：十连包 ×1', swissReward(s.swiss, after, six)!.packs.ten === 1)
  const ko = { bracket: [['T18', 'T1'], ['T26', 'T50'], ['T20', 'T2'], ['T29', 'T24']], lockAt: '2026-10-29T08:00:00+08:00', qf: ['T18', 'T26', 'T20', 'T24'], sf: ['T18', 'T24'], final: 'T18', confirmedAt: '2026-11-15T00:00:00+08:00' }
  const k: S16PredictState = {}
  const kb = Date.parse('2026-10-28T00:00:00+08:00'), ka = Date.parse('2026-11-16T00:00:00+08:00')
  check('淘汰赛：四强要从自己选的八强胜者里选', setKo(k, { qf: ['T18', 'T26', 'T20', 'T24'], sf: ['T1', 'T24'], final: 'T24' }, kb, ko) !== null)
  check('淘汰赛：合法预测能存', setKo(k, { qf: ['T18', 'T26', 'T20', 'T24'], sf: ['T18', 'T24'], final: 'T18' }, kb, ko) === null)
  check('冠亚军全中：十连包 ×3', koReward(k.ko, ka, ko)!.packs.ten === 3)
  check('冠亚军猜反：选拔包 ×5', koReward({ ...k.ko!, final: 'T24' }, ka, ko)!.packs.elite === 5)
  const g = migrateGacha(JSON.parse(JSON.stringify(newGacha('pr', 'pr', day))), 'pr')
  const forged = mergeClientFields(g, { s16Predict: { swiss: s.swiss } } as never)
  check('客户端改不了预测', !forged.s16Predict)
  check('没有赛程时提交会被拒', !runAction(g, 's16_predict', { stage: 'swiss', picks: { qual: teams.slice(0, 8), threeZero: ['T18', 'T1'], zeroThree: ['T35', 'T28'] } }, { now: before, today: day, seed: 1 }).ok)
}

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
