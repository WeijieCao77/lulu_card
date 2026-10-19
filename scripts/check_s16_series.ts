/**
 * S16 世界赛: the rules the owner set (2026-10-04, reveal model 2026-10-10), checked against the engine and
 * scripts/s16_ratings.py (run on a made-up event; needs python3 or python).
 *
 *   npx tsx scripts/check_s16_series.ts
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALL_CARDS, BASE_PLAYER_CARDS, GOLD_AT, PLAYER_CARDS, S16_CARDS, SILVER_AT, buildS16Cards, cardById, isS16Card, personOf, rarityOf, s16Hidden, s16Suspended } from '../src/engine/cards'
import { FULL_SET_CARDS, PACKS, S16_SET_REWARDS, autoSquad, collectionProgress, mergeClientFields, migrateGacha, newGacha, openPack, s16SetProgress, settleS16Fmvp, s16PackDef, S16_PACK_AFTER_DAY, upgradeCost } from '../src/engine/gacha'
import { runAction, squadForPlay } from '../src/engine/cardActions'
import { matchesFilter } from '../src/engine/cardFilter'
import { rollShop } from '../src/engine/dailyShop'
import { champReward, cleanS16Predict, koReward, playinReward, setKo, setOne, setSwiss, swissReward } from '../src/engine/s16Predict'
import type { S16PredictState } from '../src/engine/s16Predict'
import { capOf, priceCap } from '../market-api.js'
import { applyMail } from '../src/engine/inbox'
import { tradeableCopies } from '../src/engine/tradeLock'
import S16 from '../src/data/s16.json'
import S16_RATINGS from '../src/data/s16Ratings.json'
import S16_RESULTS from '../src/data/s16Results.json'

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
// owner 2026-10-10: a team's five cards stay 「?」 until the team is out (s16Results.json), then freeze
{
  const out = (S16_RESULTS as { teams: Record<string, { placement: string; out: string }> }).teams
  const stored = (S16_RATINGS as unknown as { ratings: Record<string, { rating: number; rarity: string; prev: number | null; placement?: string }> }).ratings
  const fmvp = (S16_RATINGS as { fmvp: string | null }).fmvp
  const shown = S16_CARDS.filter((c) => !s16Hidden(c))
  check('只有已出局（s16Results.json 登记了）的队揭晓，其余都是「?」',
    S16_CARDS.every((c) => s16Hidden(c) === !(c.ign in stored)) && shown.every((c) => c.s16!.club in out), `${shown.length} 张已揭晓`)
  check('揭晓的卡：评分 50–90、金银铜按普通卡的线、箭头是普通卡评分、名次和登记一致', Object.entries(stored).every(([ign, r]) => {
    const card = S16_CARDS.find((c) => c.ign === ign)
    return !!card && r.rating >= 50 && r.rating <= 90 && r.rarity === rarityOf(r.rating) && typeof r.prev === 'number' &&
      r.placement === out[card.s16!.club]?.placement && (ign === fmvp || card.rarity === r.rarity)
  }))
}
check('不进全图鉴、不算主图鉴进度', !S16_CARDS.some((c) => FULL_SET_CARDS.has(c.id)) && collectionProgress(newGacha('a', 'a', day)).total === ALL_CARDS.filter((c) => !c.id.startsWith('echo:') && !c.id.startsWith('s16:')).length)
let inShop = false
for (let i = 0; i < 1000; i++) { const g = newGacha('s' + i, 's', day); if (rollShop(g, day, i * 7919).slots.some((s) => s.cardId.startsWith('s16:'))) inShop = true }
check('每日商店不出 S16 卡', !inShop)

// the pack
const def = PACKS.s16
check('S16 包：2600 金币三张、比赛期间等概率、S 赛结束后还卖一阵（暂定 11/28 下架）', def.cost === 2600 && def.draws === 3 && def.uniform === true && def.until === '2026-11-28' && def.shop === true)
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
  try { openPack(g, 's16', 'coins', '2026-11-29') } catch { refused = true }
  g.packs.s16 = 1
  let opened = false
  try { opened = openPack(g, 's16', 'pack', '2026-11-29').length === 3 } catch { opened = false }
  check('下架后买不到，手里的包还能开', refused && opened)
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
  const frozenAttrs = Object.fromEntries(Object.keys(a.attrs).map((k) => [k, 77])) as unknown as typeof a.attrs
  const built = buildS16Cards({ [a.ign]: { rating: 88, rarity: 'gold', games: 3, prev: 85, attrs: frozenAttrs, placement: 'sf' }, [b.ign]: { rating: 80, rarity: 'silver', games: 2, prev: null } }, b.ign)
  const A = built.find((c) => c.ign === a.ign)!, B = built.find((c) => c.ign === b.ign)!
  check('有条目就揭晓：数值、金银铜、场数、箭头（普通卡评分）、名次', A.s16!.revealed && A.rating === 88 && A.rarity === 'gold' && A.s16!.games === 3 && A.s16!.prev === 85 && A.s16!.placement === 'sf')
  // a frozen card shows what the file says, whatever his ordinary card says today
  check('定格的卡不跟普通卡走：评分和八项属性都用文件里的', A.rating === 88 && Object.values(A.attrs).every((v) => v === 77))
  check('FMVP 的卡变成彩卡', B.rarity === 'mythic' && B.s16!.fmvp)
  // owner 2026-10-07: the FMVP's 彩卡 leaves the 90 cap, in the band of the Worlds FMVP 彩卡 (94–97), 95 until set
  check('FMVP 彩卡评分没定之前是 95', B.rating === 95, `${B.rating}`)
  const set97 = buildS16Cards({ [b.ign]: { rating: 80, rarity: 'silver', games: 2, prev: null } }, b.ign, 97).find((c) => c.ign === b.ign)!
  const set120 = buildS16Cards({ [b.ign]: { rating: 80, rarity: 'silver', games: 2, prev: null } }, b.ign, 120).find((c) => c.ign === b.ign)!
  const set90 = buildS16Cards({ [b.ign]: { rating: 80, rarity: 'silver', games: 2, prev: null } }, b.ign, 90).find((c) => c.ign === b.ign)!
  check('FMVP 彩卡评分只在 94–97 之间', set97.rating === 97 && set120.rating === 97 && set90.rating === 94, `${set97.rating} ${set120.rating} ${set90.rating}`)
  const lifted = Object.keys(set97.attrs).every((k) => set97.attrs[k as keyof typeof set97.attrs] >= B.attrs[k as keyof typeof B.attrs])
  check('能力随评分一起抬高', lifted)
  check('普通 S16 卡仍然封 90', built.filter((c) => !c.s16!.fmvp).every((c) => c.rating <= 90))
  check('没打的还是「?」', built.filter((c) => c.ign !== a.ign && c.ign !== b.ign).every((c) => !c.s16!.revealed))
}

// market and trading
check('限价：揭晓后按自己的金银铜；「?」卡没有金银铜，不限价', S16_CARDS.every((c) => capOf(c) === (c.s16!.revealed ? priceCap(c.rarity) : priceCap('gold'))) && capOf(BASE_PLAYER_CARDS.find((c) => c.rarity === 'bronze')) === 2000)

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

// 一视同仁 (owner 2026-10-07): an S16 card bought on the market waits like any other before it can be sold on
{
  const g = newGacha('S16-HOLD', 'h', day)
  g.cards = {}
  const id = S16_CARDS[0].id
  applyMail(g, [{ kind: 'bought', cardId: id, level: 0, coins: 0, pack: null, count: 1, body: {}, at: Date.now() }])
  check('买来的 S16 卡和普通卡一样要等才能再卖', !!g.cards[id] && tradeableCopies(g.cards[id], Date.now()) === 0)
}

// 入围赛 and 冠军 sheets (owner 2026-10-10)
{
  const pi = { teams: ['T35', 'T28', 'T49', 'T55'], lockAt: '2026-10-15T18:00:00Z', winner: 'T28', confirmedAt: '2026-10-19T00:00:00Z' }
  const ch = { teams: S16.teams.map((t) => t.club), lockAt: '2026-10-23T17:00:00Z', champion: 'T18', confirmedAt: '2026-11-15T00:00:00Z' }
  const before = Date.parse('2026-10-12T04:00:00Z'), afterPi = Date.parse('2026-10-15T18:00:01Z')
  const s: S16PredictState = {}
  check('入围赛：只能选那 4 支队', setOne(s, 'playin', { team: 'T18' }, before, pi) !== null)
  check('入围赛：合法预测能存', setOne(s, 'playin', { team: 'T28' }, before, pi) === null && s.playin?.team === 'T28')
  check('入围赛：第一场开打后锁定', setOne(s, 'playin', { team: 'T35' }, afterPi, pi) !== null && s.playin?.team === 'T28')
  check('入围赛：赛果确认前不能领', playinReward(s.playin, afterPi, pi) === null)
  check('入围赛：猜中送十连包 ×1', playinReward(s.playin, Date.parse('2026-10-19T01:00:00Z'), pi)?.packs.ten === 1)
  check('冠军：所有参赛队都能选，入围赛的也能', ch.teams.length === 19 && setOne(s, 'champ', { team: 'T55' }, before, ch) === null)
  check('冠军：入围赛开打前 1 小时锁定', setOne(s, 'champ', { team: 'T18' }, Date.parse('2026-10-15T17:00:01Z'), { ...ch, lockAt: '2026-10-15T17:00:00Z' }) !== null)
  setOne(s, 'champ', { team: 'T18' }, before, ch)
  const r = champReward(s.champ, Date.parse('2026-11-15T01:00:00Z'), ch, 'T24')
  check('冠军：猜中送十连包 ×3 + S16 包 ×2', r?.packs.ten === 3 && r?.packs.s16 === 2)
  const s2: S16PredictState = {}; setOne(s2, 'champ', { team: 'T24' }, before, ch)
  check('冠军：选中亚军送选拔包 ×3', champReward(s2.champ, Date.parse('2026-11-15T01:00:00Z'), ch, 'T24')?.packs.elite === 3)
  check('读档后预测还在', cleanS16Predict(JSON.parse(JSON.stringify(s)))?.playin?.team === 'T28' && cleanS16Predict(JSON.parse(JSON.stringify(s)))?.champ?.team === 'T18')
}

// FMVP (owner 2026-10-10): each account keeps one copy, the 彩卡; every extra copy becomes a 十连包, once
{
  const b = S16_CARDS[1]
  const fm = buildS16Cards({ [b.ign]: { rating: 88, rarity: 'gold', games: 9, prev: 86 } }, b.ign).find((c) => c.ign === b.ign)!
  const g = newGacha('S16-FMVP', 'f', day)
  g.cards = { [fm.id]: { id: fm.id, level: 0, dupes: 4, seen: 5, got: day } as never }
  g.packs.ten = 0
  const r = settleS16Fmvp(g, fm)
  check('FMVP：多出来的 4 张换十连包 ×4，自己留一张', r?.packs === 4 && g.packs.ten === 4 && g.cards[fm.id].dupes === 0 && g.s16FmvpPaid === 4)
  check('FMVP：再读一次不会重复发', settleS16Fmvp(g, fm) === null && g.packs.ten === 4)
  g.cards[fm.id].dupes = 1
  const coins = g.coins
  const late = settleS16Fmvp(g, fm)
  check('FMVP：发过之后再来的同一张换彩卡分解价，不再给十连包', late?.packs === 0 && g.coins === coins + 4000 && g.packs.ten === 4 && g.cards[fm.id].dupes === 0)
  const h = newGacha('S16-FMVP-1', 'f', day)
  h.cards = { [fm.id]: { id: fm.id, level: 0, dupes: 0, seen: 1, got: day } as never }
  check('FMVP：只有一张的什么都不用换，但记为已结算', settleS16Fmvp(h, fm) === null && h.s16FmvpPaid === 0)
  h.cards[fm.id].dupes = 2
  const hc = h.coins
  check('FMVP：结算后才买到/开到的同一张，换分解价金币，不给十连包', settleS16Fmvp(h, fm)?.packs === 0 && (h.packs.ten ?? 0) === 0 && h.coins === hc + 8000)
  check('FMVP 没确定之前不动重复卡', settleS16Fmvp(g, undefined) === null)
}

// scripts/s16_ratings.py end to end on a made-up event (owner 2026-10-10): reveal on elimination, freeze, metals, clamp
{
  const py = ['python3', 'python'].find((cmd) => { try { execFileSync(cmd, ['--version'], { stdio: 'ignore' }); return true } catch { return false } })
  check('有 Python 可以跑 s16_ratings.py', !!py)
  if (py) s16Script(py)
}
function s16Script(py: string) {
  const dir = mkdtempSync(join(tmpdir(), 's16-'))
  try {
    const POS = ['top', 'jng', 'mid', 'bot', 'sup'] as const
    const ROLE = { top: '上单', jng: '打野', mid: '中单', bot: '下路', sup: '辅助' } as const
    const teams = ['AA', 'BB', 'CC', 'DD']
    const attrs = { aim: 80, reaction: 80, awareness: 80, utility: 80, clutch: 80, teamwork: 80, communication: 80, igl: 80 }
    const base: Record<string, { base: string; role: string; club: string; rating: number; attrs: typeof attrs }> = {}
    const roster = { meta: { start: '2030-10-01' }, teams: teams.map((t) => ({ club: t, tag: t, name: `Team ${t}`, stage: 'main' })), players: [] as { ign: string; club: string; role: string; starter: boolean }[] }
    for (const t of teams) for (const p of POS) {
      const ign = `${t}${p}`
      // everyone 80, except AA's mid 89 (has to stop at 90 as champion) and DD's sup 52 (has to stop at 50 after feeding)
      const rating = ign === 'AAmid' ? 89 : ign === 'DDsup' ? 52 : 80
      base[ign] = { base: 'p:x', role: ROLE[p], club: t, rating, attrs }
      roster.players.push({ ign, club: t, role: ROLE[p], starter: true })
    }
    base.AAsub = { base: 'p:x', role: '辅助', club: 'AA', rating: 77, attrs }
    roster.players.push({ ign: 'AAsub', club: 'AA', role: '辅助', starter: false })
    // identical lines for everyone (so equal stats), except DD's sup, who feeds
    const cols = ['gameid', 'datacompleteness', 'league', 'year', 'date', 'side', 'position', 'playername', 'teamname', 'result', 'kills', 'deaths', 'assists', 'teamkills', 'damageshare', 'vspm', 'earnedgoldshare', 'golddiffat15', 'xpdiffat15', 'csdiffat15']
    const lines = [cols.join(',')]
    const games: [string, string, string][] = [['2030-10-02', 'DD', 'CC'], ['2030-10-02', 'AA', 'BB'], ['2030-10-03', 'CC', 'AA'], ['2030-10-04', 'BB', 'AA'], ['2030-10-05', 'AA', 'BB']]
    games.forEach(([d, x, y], gi) => {
      for (const [t, side, win] of [[x, 'Blue', 0], [y, 'Red', 1]] as const) for (const p of POS) {
        const feed = `${t}${p}` === 'DDsup'
        lines.push([`g${gi}`, 'complete', 'WLDs', '2030', `${d} 04:00:00`, side, p, `${t}${p}`, `Team ${t}`, win, 2, feed ? 12 : 2, 4, 10, 0.2, feed ? 0.5 : 1.5, 0.2, feed ? -3000 : 0, feed ? -3000 : 0, feed ? -60 : 0].join(','))
      }
    })
    const W = (f: string, v: unknown) => writeFileSync(join(dir, f), typeof v === 'string' ? v : JSON.stringify(v))
    W('oe.csv', lines.join('\n') + '\n')
    W('base.json', base)
    W('roster.json', roster)
    const stages = { playin: ['2030-10-02', '2030-10-02'], swiss: ['2030-10-03', '2030-10-04'], final: ['2030-10-05', '2030-10-05'] }
    const results = (t: Record<string, [string, string]>) => W('results.json', { stages, teams: Object.fromEntries(Object.entries(t).map(([k, [placement, out]]) => [k, { placement, out }])) })
    const run = (...extra: string[]) => execFileSync(py, [join('scripts', 's16_ratings.py'), '--oe', join(dir, 'oe.csv'), '--year', '2030', '--base', join(dir, 'base.json'), '--roster', join(dir, 'roster.json'), '--results', join(dir, 'results.json'), '--out', join(dir, 'out.json'), ...extra], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    type Entry = { rating: number; rarity: string; games: number; prev: number; attrs: Record<string, number>; placement: string; perf: number }
    const read = () => JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')) as { ratings: Record<string, Entry>; champion: string | null; fmvp: string | null }
    const metalOk = (r: Record<string, Entry>) => Object.values(r).every((e) => e.rarity === (e.rating >= GOLD_AT ? 'gold' : e.rating >= SILVER_AT ? 'silver' : 'bronze'))
    const dd = (r: Record<string, Entry>) => JSON.stringify(Object.entries(r).filter(([k]) => k.startsWith('DD')))

    // 10-02: DD goes out of the play-in
    results({ DD: ['playin', '2030-10-02'] })
    run()
    let r = read().ratings
    check('脚本：只揭晓已出局的队', Object.keys(r).sort().join() === POS.map((p) => `DD${p}`).sort().join(), Object.keys(r).join())
    check('脚本：金银铜按普通卡的线', metalOk(r))
    check('脚本：箭头 prev = 当时的普通卡评分', Object.entries(r).every(([ign, e]) => e.prev === base[ign].rating))
    check('脚本：评分不低于 50（DD 辅助普通卡 52、每局送）', r.DDsup.rating === 50 && r.DDsup.perf < 0, `${r.DDsup.rating} perf ${r.DDsup.perf}`)
    const frozen = dd(r)

    // the ordinary cards are re-rated: a frozen card must not move
    for (const p of POS) base[`DD${p}`].rating = 60
    W('base.json', base)
    run()
    check('脚本：普通卡改了，已定格的卡一点都不动', dd(read().ratings) === frozen)
    for (const p of POS) base[`DD${p}`].rating = p === 'sup' ? 52 : 80
    W('base.json', base)

    // CC out on 10-03, BB on 10-05 — but OE only reaches 10-04, so BB has to wait
    results({ DD: ['playin', '2030-10-02'], CC: ['swiss', '2030-10-03'], BB: ['runnerup', '2030-10-05'] })
    run('--until', '2030-10-04')
    r = read().ratings
    check('脚本：OE 还没更新到出局那天的队先不定格', !Object.keys(r).some((k) => k.startsWith('BB')) && POS.every((p) => `CC${p}` in r) && dd(r) === frozen)

    // --dry-run writes nothing
    const before = readFileSync(join(dir, 'out.json'), 'utf8')
    results({ DD: ['playin', '2030-10-02'], CC: ['swiss', '2030-10-03'], BB: ['runnerup', '2030-10-05'], AA: ['champion', '2030-10-05'] })
    run('--dry-run')
    check('脚本：--dry-run 不写文件', readFileSync(join(dir, 'out.json'), 'utf8') === before)

    // after the final
    run('--final', '--fmvp', 'AAbot')
    const doc = read()
    r = doc.ratings
    check('脚本：决赛后全部揭晓，冠军和 FMVP 记下', Object.keys(r).length === roster.players.length && doc.champion === 'AA' && doc.fmvp === 'AAbot')
    check('脚本：评分不超过 90（AA 中单普通卡 89 + 冠军）', r.AAmid.rating === 90, String(r.AAmid.rating))
    // same ordinary card, same (neutral) games: the deeper run is never lower
    const order = [['DDtop', 'playin', 68], ['CCtop', 'swiss', 75], ['BBtop', 'runnerup', 84], ['AAtop', 'champion', 86]] as const
    check('脚本：同样的表现，走得越远分越高（普通卡 80 落在档中心：入围赛 68 < 瑞士轮 75 < 亚军 84 < 冠军 86）', order.every(([ign, pl, want]) => r[ign].placement === pl && r[ign].perf === 0 && r[ign].rating === want),
      order.map(([ign]) => `${ign} ${r[ign].rating}`).join(' '))
    check('脚本：一局没上的替补表现按 0、和队友同一档（冠军档 86 + 0.6 × (77 − 80)）', r.AAsub.rating === 84 && r.AAsub.games === 0 && r.AAsub.prev === 77, String(r.AAsub.rating))
    check('脚本：入围赛出局封顶 74', (() => { const e = Object.entries(r).filter(([, v]) => v.placement === 'playin'); return e.length > 0 && e.every(([, v]) => v.rating <= 74) })())
    check('脚本：八项属性随评分平移', r.AAtop.attrs.aim === 86 && r.CCtop.attrs.aim === 75)
    check('脚本：金银铜按普通卡的线（决赛后）', metalOk(r))
  } catch (e) {
    check('脚本跑得通', false, String((e as { stdout?: string }).stdout || e).slice(-800))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// after the event (owner 2026-10-10): still on sale, numbers frozen, odds by metal like 峡谷回响 plus the FMVP 彩卡
{
  check('比赛期间：每位选手机会一样', s16PackDef('2026-10-20').uniform === true)
  const after = s16PackDef(S16_PACK_AFTER_DAY)
  check('S 赛结束后：按金银铜爆率（金 12%、银 38%、保底银）+ 彩卡爆率', !after.uniform && after.gold === 0.12 && after.silver === 0.38 && after.floor === 'silver' && after.mythic > 0)
  check('S 赛结束后还在卖（下架日在决赛之后）', !!PACKS.s16.until && PACKS.s16.until > S16_PACK_AFTER_DAY)
}

// owner 2026-10-11 fixes: 「?」 cards uncapped, an eliminated team's cards pause until revealed, no levelling during the event
{
  const hidden = S16_CARDS.find((c) => !c.s16!.revealed)!
  check('「?」卡不限价', S16_CARDS.filter((c) => !c.s16!.revealed).every((c) => capOf(c) > 100000))
  check('出局登记了、还没揭晓：暂停交易', s16Suspended(hidden, { teams: { [hidden.s16!.club]: { placement: 'playin' } } }) && !s16Suspended(hidden, { teams: {} }))
  const g = newGacha('S16-LV', 'l', day)
  g.cards = { [hidden.id]: { id: hidden.id, level: 0, dupes: 9, seen: 10, got: day } as never }
  g.coins = 99999
  const during = upgradeCost(g, hidden.id, Date.parse('2026-10-20T12:00:00+08:00'))
  const after = upgradeCost(g, hidden.id, Date.parse('2026-11-16T12:00:00+08:00'))
  check('S 赛期间 S16 卡不能升级，决赛后可以', !during.can && /不能升级/.test(during.why ?? '') && after.can)
}

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
