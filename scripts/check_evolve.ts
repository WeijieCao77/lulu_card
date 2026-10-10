/**
 * 进修 (engine/evolve.ts): a +5 player card, one attribute, five spare copies eaten. Ported from 开瓦包 2026-10-07.
 *
 *   npx tsx scripts/check_evolve.ts          rules, the +0…+5 identity, which cards may train, the server paths
 *   npx tsx scripts/check_evolve.ts 600      and what a trained five is worth, over 600 BO3
 */
process.env.ENGINE_FROM_SOURCE = '1'
process.env.PHONE_GATE = '0'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { migrateGacha, newGacha, playLevelOf, registerCupSquad } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { runAction } from '../src/engine/cardActions'
import {
  BASE_PLAYER_CARDS, COACH_CARDS, ECHO_CARDS, EVO_LEVEL_ROOM, LEGEND_CARDS, LEVEL_GAIN, MAX_LEVEL, POWER_PER_POINT,
  cardPower, squadPaper, squadPower, squadRating,
} from '../src/engine/cards'
import type { PlayerCard } from '../src/engine/cards'
import { EVO_FEED, EVO_STEPS, canEvolve, evoRating, playLevel } from '../src/engine/evolve'
import { escrowCard } from '../src/engine/inbox'
import { playRivalMatch } from '../src/engine/arena'
import { ROLE_WEIGHT } from '../src/engine/player'
import type { Role } from '../src/engine/types'

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const env = (n = 1) => ({ now: Date.parse('2026-10-07T06:00:00Z') + n * 1000, today: '2026-10-07', seed: 7 + n })
const byRole = (role: Role) => BASE_PLAYER_CARDS.filter((c) => c.role === role).sort((a, b) => b.rating - a.rating)
const own = (g: GachaState, id: string, level = 0, dupes = 0) => {
  g.cards[id] = { id, level, dupes, seen: 1 + dupes, got: '2026-09-20' }
}
const fresh = (n: string, name = '进修') => {
  const g = newGacha(`VM-TEST-EVO-${n}`, name, '2026-09-20')
  g.cards = {}
  return g
}

// ---- the rules
const mids = byRole('中单')
const target = mids[3] // a strong 中单, not at 99 操作
const g = fresh('0001')
own(g, target.id, 4)
const golds = mids.filter((c) => c.id !== target.id && c.attrs.aim >= 88).slice(0, 3)
const bronzeMid = mids.filter((c) => c.rarity === 'bronze').slice(0, 2)
const offRole = BASE_PLAYER_CARDS.find((c) => !c.roles.includes('中单') && c.attrs.aim < 80)!
const offRoleAim = BASE_PLAYER_CARDS.find((c) => !c.roles.includes('中单') && c.attrs.aim >= 85)!
for (const c of [...golds, ...bronzeMid, offRole, offRoleAim]) own(g, c.id, 0, 12)
const five = (ids: string[]) => ids.slice(0, EVO_FEED)
const goldFeed = five([golds[0].id, golds[0].id, golds[1].id, golds[1].id, golds[2].id])
check('三张 操作 88 以上的金卡中单可用作材料', golds.length === 3, golds.map((c) => `${c.ign} ${c.attrs.aim}`).join(' · '))

const notMax = runAction(g, 'evolve', { cardId: target.id, attr: 'aim', feed: goldFeed }, env(1))
check('+4 的卡不能进修', !notMax.ok && /\+5/.test(notMax.why), notMax.ok ? '' : notMax.why)
g.cards[target.id].level = MAX_LEVEL
check('没进修过：比赛等级就是 +5（整数）', playLevelOf(g, target.id) === MAX_LEVEL)
const four = runAction(g, 'evolve', { cardId: target.id, attr: 'aim', feed: goldFeed.slice(0, 4) }, env(2))
check('只放 4 张：不行', !four.ok)
const wrong = runAction(g, 'evolve', { cardId: target.id, attr: 'aim', feed: [...goldFeed.slice(0, 4), offRole.id] }, env(3))
check('混进一张不同位置、操作也不到 80 的：不行，说出是哪张', !wrong.ok && wrong.why.includes(offRole.ign), wrong.ok ? '' : wrong.why)
const notAttr = runAction(g, 'evolve', { cardId: target.id, attr: 'luck', feed: goldFeed }, env(4))
check('不存在的能力：不行', !notAttr.ok)
g.cards[golds[2].id].dupes = 0
const noDupes = runAction(g, 'evolve', { cardId: target.id, attr: 'aim', feed: goldFeed }, env(5))
check('重复卡不够：不行', !noDupes.ok && /重复卡不够/.test(noDupes.why))
g.cards[golds[2].id].dupes = 12

const aimBefore = target.attrs.aim
const dupesBefore = goldFeed.map((id) => g.cards[id].dupes)
const r1 = runAction(g, 'evolve', { cardId: target.id, attr: 'aim', feed: goldFeed }, env(6))
const e1 = g.cards[target.id].evo
check('五张金卡操作都 88 以上：操作 +3', r1.ok && (r1.result as { gain: number }).gain === Math.min(3, 99 - aimBefore) && e1?.add.aim === Math.min(3, 99 - aimBefore), JSON.stringify(e1))
check('吃掉的正好是那五张重复卡', golds[0].id in g.cards && g.cards[golds[0].id].dupes === dupesBefore[0] - 2 && g.cards[golds[2].id].dupes === dupesBefore[4] - 1)
check('收藏里的卡本身没动', golds.every((c) => !!g.cards[c.id] && g.cards[c.id].level === 0))
const pl = playLevelOf(g, target.id)
check(`比赛等级 = +5 加进修（操作 +3 × 中单权重 ${ROLE_WEIGHT.中单.aim} ÷ ${LEVEL_GAIN}）`, Math.abs(pl - (MAX_LEVEL + (3 * ROLE_WEIGHT.中单.aim) / LEVEL_GAIN)) < 1e-9, pl.toFixed(4))
const bronzeFeed = five([bronzeMid[0].id, bronzeMid[0].id, bronzeMid[1].id, bronzeMid[1].id, bronzeMid[1].id])
const r2 = runAction(g, 'evolve', { cardId: target.id, attr: 'clutch', feed: bronzeFeed }, env(7))
check('五张铜卡同位置（关键发挥平均 < 78）：+1', r2.ok && (r2.result as { gain: number }).gain === 1, r2.ok ? JSON.stringify(r2.result) : r2.why)
const r3 = runAction(g, 'evolve', { cardId: target.id, attr: 'aim', feed: five([offRoleAim.id, offRoleAim.id, offRoleAim.id, offRoleAim.id, offRoleAim.id]) }, env(8))
check('不同位置但操作 80 以上：可以用', r3.ok, r3.ok ? '' : r3.why)
for (let i = 0; i < 5; i++) runAction(g, 'evolve', { cardId: target.id, attr: 'reaction', feed: goldFeed }, env(9 + i))
check(`最多进修 ${EVO_STEPS} 次`, g.cards[target.id].evo?.n === EVO_STEPS)
const over = runAction(g, 'evolve', { cardId: target.id, attr: 'reaction', feed: goldFeed }, env(20))
check('第六次：不行', !over.ok && /满了/.test(over.why))
const worth = evoRating(target, g.cards[target.id].evo)
check('进修的比赛等级不超过上限', playLevelOf(g, target.id) <= MAX_LEVEL + EVO_LEVEL_ROOM && worth / LEVEL_GAIN <= EVO_LEVEL_ROOM, worth.toFixed(2))
// the room is sized so a full 进修 always fits: five of three points on the heaviest weight there is
const heaviest = Math.max(...Object.values(ROLE_WEIGHT).flatMap((w) => Object.values(w)))
check(`EVO_LEVEL_ROOM ${EVO_LEVEL_ROOM} 装得下最重的满进修（5×3×${heaviest} = ${(15 * heaviest).toFixed(2)} 分 = ${(15 * heaviest / LEVEL_GAIN).toFixed(2)} 级）`,
  (EVO_STEPS * 3 * heaviest) / LEVEL_GAIN <= EVO_LEVEL_ROOM)

// ---- 99 is a ceiling
const high = mids.filter((c) => !golds.includes(c)).sort((a, b) => b.attrs.aim - a.attrs.aim)[0]
const h = fresh('0002', '满')
own(h, high.id, MAX_LEVEL)
for (const c of golds) own(h, c.id, 0, 12)
const room = 99 - high.attrs.aim
const hr = runAction(h, 'evolve', { cardId: high.id, attr: 'aim', feed: goldFeed }, env(30))
check(`操作 ${high.attrs.aim} 的卡：最多加到 99`, room === 0 ? !hr.ok : hr.ok && (hr.result as { gain: number }).gain === Math.min(3, room), `${high.ign} ${high.attrs.aim}`)

// ---- which cards: ordinary and 峡谷回响 yes; 彩卡 and coaches no, neither trained nor fed
{
  const legendMid = LEGEND_CARDS.find((c) => c.roles.includes('中单'))!
  const coach = COACH_CARDS.find((c) => !c.legend)!
  const echoMids = ECHO_CARDS.filter((c) => c.roles.includes('中单'))
  check('有中单彩卡、教练卡、两张以上中单回响卡可测', !!legendMid && !!coach && echoMids.length >= 2, `${legendMid?.id} ${coach?.id} ${echoMids.length}`)
  check('canEvolve：普通卡、回响卡可以，彩卡、教练卡不行',
    canEvolve(target) && canEvolve(echoMids[0]) && !canEvolve(legendMid) && !canEvolve(coach))
  const w = fresh('0005', '谁能进修')
  own(w, legendMid.id, MAX_LEVEL, 6)
  own(w, coach.id, MAX_LEVEL, 6)
  for (const c of golds) own(w, c.id, 0, 12)
  const lr = runAction(w, 'evolve', { cardId: legendMid.id, attr: 'aim', feed: goldFeed }, env(40))
  check('彩卡不能进修', !lr.ok && /彩卡/.test(lr.why), lr.ok ? 'ok?!' : lr.why)
  const cr = runAction(w, 'evolve', { cardId: coach.id, attr: 'aim', feed: goldFeed }, env(41))
  check('教练卡不能进修', !cr.ok, cr.ok ? 'ok?!' : cr.why)
  // a forged 进修 on either is read as nothing
  ;(w.cards[legendMid.id] as unknown as { evo: unknown }).evo = { n: 5, add: { aim: 15 } }
  ;(w.cards[coach.id] as unknown as { evo: unknown }).evo = { n: 5, add: { aim: 15 } }
  check('彩卡、教练卡身上的进修不算比赛等级', playLevelOf(w, legendMid.id) === MAX_LEVEL && playLevelOf(w, coach.id) === MAX_LEVEL)

  // as material: a 彩卡 or a coach card is refused, by name
  own(w, target.id, MAX_LEVEL)
  const withLegend = runAction(w, 'evolve', { cardId: target.id, attr: 'aim', feed: [...goldFeed.slice(0, 4), legendMid.id] }, env(42))
  check('彩卡的重复卡不能当材料', !withLegend.ok && /彩卡/.test(withLegend.why), withLegend.ok ? 'ok?!' : withLegend.why)
  const withCoach = runAction(w, 'evolve', { cardId: target.id, attr: 'aim', feed: [...goldFeed.slice(0, 4), coach.id] }, env(43))
  check('教练卡的重复卡不能当材料', !withCoach.ok && /选手卡/.test(withCoach.why), withCoach.ok ? 'ok?!' : withCoach.why)
  check('被拒时一张重复卡都没吃', w.cards[legendMid.id].dupes === 6 && w.cards[coach.id].dupes === 6 && w.cards[golds[0].id].dupes === 12)

  // a 峡谷回响 card trains, and 峡谷回响 copies feed (an ordinary card or another 回响 card)
  const echo = echoMids[0]
  const e = fresh('0006', '回响')
  own(e, echo.id, MAX_LEVEL)
  own(e, echoMids[1].id, 0, 3)
  for (const c of golds) own(e, c.id, 0, 12)
  const er = runAction(e, 'evolve', { cardId: echo.id, attr: 'awareness', feed: [echoMids[1].id, echoMids[1].id, echoMids[1].id, golds[0].id, golds[1].id] }, env(44))
  check(`峡谷回响卡 ${echo.ign} 能进修，回响卡的重复卡也能当材料`, er.ok && e.cards[echo.id].evo?.n === 1 && e.cards[echoMids[1].id].dupes === 0, er.ok ? JSON.stringify(e.cards[echo.id].evo) : er.why)
  check('回响卡进修后比赛等级在 +5 之上', playLevelOf(e, echo.id) > MAX_LEVEL)
}

// ---- the stored shape
const junk = fresh('0003', 'x')
own(junk, target.id, MAX_LEVEL)
;(junk.cards[target.id] as unknown as { evo: unknown }).evo = { n: 99, add: { aim: 'NaN', igl: 5, hax: 40 } }
own(junk, mids[5].id, MAX_LEVEL)
;(junk.cards[mids[5].id] as unknown as { evo: unknown }).evo = 'lots'
const clean = migrateGacha(structuredClone(junk), 'VM-TEST-EVO-0003')
check('读档：进修次数不超过 5，坏字段丢掉', clean.cards[target.id].evo?.n === EVO_STEPS && JSON.stringify(clean.cards[target.id].evo?.add) === '{"igl":5}')
check('读档：不是对象的进修整个丢掉', !clean.cards[mids[5].id].evo)
check('没进修的卡：playLevel 就是等级', [0, 1, 2, 3, 4, 5].every((lv) => playLevel(target.id, { level: lv }) === lv))
check('存档里的等级超过 5 也只算 +5', playLevel(target.id, { level: 9 }) === MAX_LEVEL && playLevel(target.id, { level: 20, evo: 'x' }) === MAX_LEVEL)
const reg = registerCupSquad({ slots: [target.id, null, null, null, null], coach: null }, (id) => playLevelOf(g, id))
check('杯赛报名记下带进修的等级', Math.abs(reg.levels[target.id] - playLevelOf(g, target.id)) < 1e-12)

// ---- the market: duplicates leave first; the evolved card itself leaves last, its 进修 with it
// (the whole trade path is scripts/check_evo_trade.ts)
const m = fresh('0004', 'm')
own(m, target.id, MAX_LEVEL, 1)
m.cards[target.id].evo = { n: 1, add: { aim: 2 } }
const e1st = escrowCard(m, target.id)
check('进修过的卡：先挂出去的是重复卡', e1st.ok && e1st.level === 0 && !!m.cards[target.id]?.evo)
const e2nd = escrowCard(m, target.id)
check('进修过的卡本身：挂得出去，进修跟着走', e2nd.ok && e2nd.evo?.add.aim === 2 && !m.cards[target.id])

// ---- what it is worth: a five at +5, against itself after five 进修 each, every one spent greedily on the attribute
// that adds most with room left under 99 (a top card's best attributes are near 99 already, so it spreads)
type K = keyof PlayerCard['attrs']
const greedy = (c: PlayerCard, gain = 3): Partial<Record<K, number>> => {
  const add: Partial<Record<K, number>> = {}
  for (let step = 0; step < EVO_STEPS; step++) {
    const pick = (Object.keys(ROLE_WEIGHT[c.role]) as K[])
      .map((k) => ({ k, g: Math.min(gain, 99 - c.attrs[k] - (add[k] ?? 0)) }))
      .sort((a, b) => b.g * ROLE_WEIGHT[c.role][b.k] - a.g * ROLE_WEIGHT[c.role][a.k])[0]
    if (pick.g > 0) add[pick.k] = (add[pick.k] ?? 0) + pick.g
  }
  return add
}
const N = Number(process.argv[2]) || 0
const roles: Role[] = ['上单', '打野', '中单', '下路', '辅助']
const topFive = roles.map((r) => byRole(r)[0])
const midFive = roles.map((r) => byRole(r).filter((c) => c.rating <= 80)[0])
const fullEvo = (c: PlayerCard, gain = 3) => ({ n: EVO_STEPS, add: greedy(c, gain) })

console.log('\n一张顶级卡满进修（5 次，每次 +3，挑最值钱的能力）：')
for (const role of ['中单', '下路'] as Role[]) {
  const c = byRole(role)[0]
  const evo = fullEvo(c)
  const rating = evoRating(c, evo)
  const lv = playLevel(c.id, { level: MAX_LEVEL, evo })
  const squad = { slots: topFive.map((x) => x.id), coach: null }
  const base = (id: string) => (squad.slots.includes(id) ? MAX_LEVEL : 0)
  const one = (id: string) => (id === c.id ? lv : base(id))
  // the top five's own card for that role is this card, so swapping its level is exactly "this card trained"
  const paper = squadPaper(squad, one).score - squadPaper(squad, base).score
  console.log(`  ${role} ${c.ign} ${c.rating}：${JSON.stringify(evo.add)} → 评分 +${rating.toFixed(2)}（${(rating / LEVEL_GAIN).toFixed(2)} 级），`
    + `卡牌战力 +${Math.round(cardPower(c, lv) - cardPower(c, MAX_LEVEL))}（= ${rating.toFixed(2)} × ${POWER_PER_POINT}），`
    + `阵容分 +${paper.toFixed(2)}（四舍五入 ${squadRating(squad, base)} → ${squadRating(squad, one)}），阵容战力 +${squadPower(squad, one) - squadPower(squad, base)}`)
  check(`${role} 满进修的评分 = 卡牌战力 ÷ 100 = 阵容分 × 5`, Math.abs(paper * 5 - rating) < 1e-9 && Math.abs((cardPower(c, lv) - cardPower(c, MAX_LEVEL)) / POWER_PER_POINT - rating) < 1e-9)
}

const measure = (label: string, squadCards: PlayerCard[], gain: number) => {
  const squad = { slots: squadCards.map((c) => c.id), coach: null }
  const base = (id: string) => (squad.slots.includes(id) ? MAX_LEVEL : 0)
  const trained = Object.fromEntries(squadCards.map((c) => [c.id, playLevel(c.id, { level: MAX_LEVEL, evo: fullEvo(c, gain) })]))
  const tLevel = (id: string) => trained[id] ?? 0
  const paperGain = squadPaper(squad, tLevel).score - squadPaper(squad, base).score
  let line = `${label}（每次 +${gain}）：阵容分 +${paperGain.toFixed(2)}，阵容战力 +${squadPower(squad, tLevel) - squadPower(squad, base)}`
  if (N) {
    let w = 0
    const rival = { name: 'B', tag: '#0', slots: squad.slots, coach: null, levels: Object.fromEntries(squad.slots.map((id) => [id, MAX_LEVEL])), div: 0, points: 0 }
    for (let i = 0; i < N; i++) if (playRivalMatch(squad, tLevel, rival, 3, 1000 + i, undefined, true).win) w++
    line += `，对没进修的自己 ${N} 场 BO3 赢 ${(100 * w / N).toFixed(1)}%`
  }
  console.log(line)
  return paperGain
}
console.log('\n满进修（5 次）的五人，对比同一套只到 +5：')
console.log(`  顶级：${topFive.map((c) => `${c.ign} ${c.rating}`).join(' · ')}`)
console.log(`  中游：${midFive.map((c) => `${c.ign} ${c.rating}`).join(' · ')}`)
for (const gain of [3, 1]) {
  measure('  顶级', topFive, gain)
  measure('  中游', midFive, gain)
}

// ---- through the server: the action, a forged save, the five a friend meets, the 全服杯 sign-up
const { CARD_SCHEMA, makeCardApi, normalizeId } = await import('../cards-api.js')
const { TRADE_PULLS } = await import('../market-api.js')
const { OPEN_CUP_SCHEMA, OPEN_CUP_V2_SCHEMA, OPEN_CUP_LEAGUE_SCHEMA, makeOpenCupApi } = await import('../opencup-api.js')
const { TEAM_CUP_SCHEMA, makeTeamCupApi } = await import('../teamcup-api.js')
const { displayName } = await import('../names.js')
const engine = await import('../src/engine/server.ts')
const db = new PGlite()
const sql = makeSql(db)
await db.exec(CARD_SCHEMA)
await db.exec((await import('./verified-fixture.mjs')).AUTO_VERIFY)
await db.exec(OPEN_CUP_SCHEMA); await db.exec(OPEN_CUP_V2_SCHEMA); await db.exec(OPEN_CUP_LEAGUE_SCHEMA); await db.exec(TEAM_CUP_SCHEMA)
interface Res { code: number; body: Record<string, any> }
const readBody = (req: { body: string }) => Promise.resolve(req.body)
const json = (res: Res, code: number, body: Record<string, unknown>) => { res.code = code; res.body = body }
const api = makeCardApi(sql, { rateLimited: () => false, readBody, json } as never)
const now = Date.parse('2026-10-07T03:20:00Z')
const open = makeOpenCupApi(sql, { readBody, json, normalizeId, displayName, rateLimited: () => false, engine, clock: () => now, timer: false } as never)
const team = makeTeamCupApi(sql, { readBody, json, normalizeId, displayName, rateLimited: () => false, engine, clock: () => now, timer: false, minDays: 0 } as never)
const call = async (path: string, body: unknown): Promise<Res> => {
  const res: Res = { code: 0, body: {} }
  await (path.startsWith('/api/card/opencup') ? open : path.startsWith('/api/card/teamcup') ? team : api).route({ body: JSON.stringify(body), method: 'POST' } as never, res as never, path, 'test')
  return res
}
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const A = 'VM-1111-2222-3333-4444-5555'
const s = fresh('SERV', '进修服')
for (const c of golds) own(s, c.id, 0, 12)
// the gold 中单 may be in the five too: they keep their spare copies and go to +5
for (const c of topFive) if (s.cards[c.id]) s.cards[c.id].level = MAX_LEVEL; else own(s, c.id, MAX_LEVEL)
s.squad = { slots: topFive.map((c) => c.id), coach: null }
s.pulls = TRADE_PULLS + 5
const midTop = topFive[2]
await sql`insert into card_accounts (id_hash, name, state, created, seen)
  values (${hash(A)}, ${s.name}, ${sql.json({ ...s, id: A })}, now() - interval '9 days', now())`
const feedFor = golds.filter((c) => c.id !== midTop.id)
const serverFeed = [feedFor[0].id, feedFor[0].id, feedFor[1].id, feedFor[1].id, feedFor[0].id]
const acted = await call('/api/card/act', { id: A, action: 'evolve', args: { cardId: midTop.id, attr: 'awareness', feed: serverFeed } })
check('服务器上进修成功', acted.body.ok === true && acted.body.state?.cards?.[midTop.id]?.evo?.n === 1, JSON.stringify(acted.body).slice(0, 200))
const forged = await call('/api/card/save', { id: A, baseRev: acted.body.rev, client: { name: '改名',  cards: { [topFive[3].id]: { id: topFive[3].id, level: 5, dupes: 0, seen: 1, evo: { n: 5, add: { aim: 15 } } } } } })
const after = await call('/api/card/load', { id: A })
check('客户端存档写不进进修（存档本身被接受）', forged.body.ok === true && after.body.state?.name === '改名' && !after.body.state?.cards?.[topFive[3].id]?.evo && after.body.state?.cards?.[midTop.id]?.evo?.n === 1, JSON.stringify(forged.body).slice(0, 80))
const friend = await call('/api/card/friend', { code: hash(A).slice(0, 8) })
const lv = friend.body.friend?.levels?.[midTop.id]
check('好友/天梯对手看到的是带进修的等级', typeof lv === 'number' && lv > MAX_LEVEL && Math.abs(lv - playLevel(midTop.id, acted.body.state.cards[midTop.id])) < 1e-9, String(lv))
// every card of the five fully trained (written as the server would hold it): the 全服杯 reads the 进修 too
const trainedState = after.body.state as GachaState
for (const c of topFive) trainedState.cards[c.id].evo = fullEvo(c)
await sql`update card_accounts set state = ${sql.json(trainedState)} where id_hash = ${hash(A)}`
const joined = await call('/api/card/opencup/join', { id: A, league: 'free' })
const want = squadRating(trainedState.squad, (id) => playLevelOf(trainedState, id))
const plain = squadRating(trainedState.squad, (id) => (trainedState.cards[id] ? MAX_LEVEL : 0))
check(`全服杯报名的阵容分算上进修（${plain} → ${want}）`, joined.body.ok === true && joined.body.score === want && want > plain, JSON.stringify(joined.body).slice(0, 160))
const teamJoined = await call('/api/card/teamcup/join', { id: A })
check(`组队杯报名的阵容分也算上进修（${want}）`, teamJoined.body.ok === true && teamJoined.body.score === want, JSON.stringify(teamJoined.body).slice(0, 160))
await db.close()

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
