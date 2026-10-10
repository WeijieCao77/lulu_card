/**
 * S16 世界赛交易区 (owner, 2026-10-10): S16 cards trade in their own section, open every day 10:00–20:00 Beijing
 * time; outside it no S16 listing and no bid; an S16 listing has no 一口价 and ends at that day's 20:00; no new
 * S16 listing after 19:30; S16 cards are not swapped. From the close of the last window before the final S16
 * trading stops, and from `normalFrom` (src/data/s16Market.json) S16 cards trade like ordinary cards. Ordinary
 * cards are untouched throughout.
 *
 *   npx tsx scripts/check_s16_market.ts
 *
 * The market's clock is injected (`clock`), the database's is not: an S16 listing's `ends` is checked against the
 * window's close, then pushed into the database's future so the bids that follow are judged on the window alone,
 * whatever day the check happens to run on.
 */
import { AUTO_VERIFY } from './verified-fixture.mjs'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { CARD_SCHEMA, engine, normalizeId } from '../cards-api.js'
import { makeMarketApi, TRADE_DAYS, TRADE_PULLS } from '../market-api.js'
import { displayName } from '../names.js'
import { S16_MARKET, s16MarketWindow, s16WindowText, s16ClosedWhy } from '../src/engine/s16Market'
import CFG from '../src/data/s16Market.json'
process.env.PHONE_GATE = '0'

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const bj = (s: string) => Date.parse(`${s}+08:00`)
const H = 3_600_000

// ---------------------------------------------------------------- the window, by itself
check('数据文件：10:00 开市、20:00 休市、休市前 30 分钟停挂', CFG.openHour === 10 && CFG.closeHour === 20 && CFG.lastListMinutes === 30 && CFG.utcOffsetHours === 8)
check('数据文件：决赛前休市、录入结果后恢复的两个时间', S16_MARKET.freezeFrom === bj('2026-11-14T20:00:00') && S16_MARKET.normalFrom === bj('2026-11-15T12:00:00'))
{
  const w = s16MarketWindow(bj('2026-10-12T09:00:00'))
  check('10-12 09:00：未开市，今天 10:00 开、20:00 休', !w.open && w.mode === 'window' && w.opensAt === bj('2026-10-12T10:00:00') && w.closesAt === bj('2026-10-12T20:00:00'))
  check('  文案：已休市，今天 10:00 开市', s16WindowText(bj('2026-10-12T09:00:00')) === '已休市，今天 10:00 开市', s16WindowText(bj('2026-10-12T09:00:00')))
}
{
  const t = bj('2026-10-15T16:48:00')
  const w = s16MarketWindow(t)
  check('比赛日 10-15 16:48：开市，20:00 休市，能挂', w.open && w.canList && w.closesAt === bj('2026-10-15T20:00:00') && w.listUntil === bj('2026-10-15T19:30:00'))
  check('  文案：每天 10:00–20:00 开放 · 还有 3 小时 12 分休市', s16WindowText(t) === 'S16 交易区每天 10:00–20:00 开放 · 还有 3 小时 12 分休市', s16WindowText(t))
}
{
  const w = s16MarketWindow(bj('2026-10-19T12:00:00'))
  check('没有比赛的 10-19：同样 10:00–20:00', w.open && w.opensAt === bj('2026-10-19T10:00:00') && w.closesAt === bj('2026-10-19T20:00:00'))
}
check('19:29 还能挂，19:30 起不能挂但还能出价', s16MarketWindow(bj('2026-10-20T19:29:00')).canList && !s16MarketWindow(bj('2026-10-20T19:30:00')).canList && s16MarketWindow(bj('2026-10-20T19:30:00')).open)
{
  const w = s16MarketWindow(bj('2026-10-20T20:00:00'))
  check('20:00 整：休市，下次明天 10:00', !w.open && w.opensAt === bj('2026-10-21T10:00:00') && w.closesAt === bj('2026-10-21T20:00:00'))
  check('  文案：已休市，明天 10:00 开市', s16WindowText(bj('2026-10-20T23:30:00')) === '已休市，明天 10:00 开市', s16WindowText(bj('2026-10-20T23:30:00')))
}
check('凌晨 3 点：休市，今天 10:00 开', (() => { const w = s16MarketWindow(bj('2026-10-21T03:00:00')); return !w.open && w.opensAt === bj('2026-10-21T10:00:00') })())
// the night before the final (11-15 03:00 Beijing) and after
{
  const w = s16MarketWindow(bj('2026-11-13T21:00:00'))
  check('11-13 晚：明天 11-14 10:00 照常开', !w.open && w.mode === 'window' && w.opensAt === bj('2026-11-14T10:00:00'))
  const last = s16MarketWindow(bj('2026-11-14T12:00:00'))
  check('决赛前一天 11-14：最后一个交易日，20:00 休市', last.open && last.mode === 'window' && last.closesAt === bj('2026-11-14T20:00:00'))
  check('  11-14 19:45 停挂的提示说 11-15 12:00 起按普通卡交易', /11 月 15 日 12:00 起 S16 卡按普通卡交易/.test(s16ClosedWhy(bj('2026-11-14T19:45:00'))), s16ClosedWhy(bj('2026-11-14T19:45:00')))
  const night = s16MarketWindow(bj('2026-11-14T21:00:00'))
  check('11-14 21:00（决赛前夜）：停止交易', night.mode === 'frozen' && !night.open && !night.canList && night.opensAt === S16_MARKET.normalFrom)
  check('11-15 03:00 决赛进行中：停止交易', s16MarketWindow(bj('2026-11-15T03:00:00')).mode === 'frozen')
  check('11-15 11:59：还停着', s16MarketWindow(bj('2026-11-15T11:59:00')).mode === 'frozen')
  check('  文案：总决赛期间休市', /总决赛期间休市/.test(s16WindowText(bj('2026-11-15T03:00:00'))), s16WindowText(bj('2026-11-15T03:00:00')))
  const after = s16MarketWindow(bj('2026-11-15T12:00:00'))
  check('11-15 12:00（normalFrom）起：按普通卡交易，随时开', after.mode === 'normal' && after.open && after.canList && after.closesAt === null)
  check('11-16 凌晨 3 点也开（不再分时段）', s16MarketWindow(bj('2026-11-16T03:00:00')).open)
}
// the table for the report
console.log('\n  10-12..10-19（北京时间）:')
for (let d = 12; d <= 19; d++) {
  const w = s16MarketWindow(bj(`2026-10-${d}T00:30:00`))
  const f = (ms: number | null) => (ms == null ? '-' : new Date(ms + 8 * H).toISOString().slice(5, 16).replace('T', ' '))
  console.log(`  10-${d}  开 ${f(w.opensAt)}  休 ${f(w.closesAt)}  停挂 ${f(w.listUntil)}`)
}
console.log('')

// ---------------------------------------------------------------- the server
const db = new PGlite()
await db.exec(CARD_SCHEMA)
await db.exec(AUTO_VERIFY)
const sql = makeSql(db)
let now = bj('2026-10-20T03:00:00')
const api = makeMarketApi(sql, {
  engine, normalizeId, displayName, rateLimited: () => false, timer: false, pairPerDay: 1000, highValuePerDay: 1000,
  clock: () => now,
  readBody: async (req: { body: unknown }) => JSON.stringify(req.body),
  json: (res: { body?: any }, _status: number, body: any) => { res.body = body },
} as never)
async function call(action: string, body: object) {
  const res: { body?: any } = {}
  await api.route({ body }, res, `/api/market/${action}`, 'test')
  return res.body
}
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const S16 = engine.ALL_CARDS.filter((c: any) => c.s16 && ['bronze', 'silver'].includes(c.rarity)).slice(0, 6).map((c: any) => c.id)
const ORD = engine.ALL_CARDS.filter((c: any) => c.kind === 'player' && !c.s16 && c.rarity === 'silver').slice(0, 2).map((c: any) => c.id)
check('有 6 张铜/银 S16 卡和普通银卡可测', S16.length === 6 && ORD.length === 2)
const ids = { A: 'VM-5161-0000-0000-0000-0001', B: 'VM-5161-0000-0000-0000-0002', C: 'VM-5161-0000-0000-0000-0003', D: 'VM-5161-0000-0000-0000-0004', E: 'VM-5161-0000-0000-0000-0005' }
async function account(id: string, cards: string[]) {
  const state = engine.newGacha(id, 'test', '2026-09-14')
  state.pulls = TRADE_PULLS
  state.coins = 1_000_000
  state.cards = Object.fromEntries(cards.map((c) => [c, { id: c, level: 0, dupes: 2, seen: 3, got: '2026-09-14' }]))
  await sql`insert into card_accounts (id_hash, state, created)
            values (${hash(id)}, ${sql.json(state)}, now() - make_interval(days => ${TRADE_DAYS + 1}))
            on conflict (id_hash) do update set state = excluded.state`
}
await account(ids.A, [...S16, ...ORD])
await account(ids.B, [...S16, ...ORD])
await account(ids.C, [...ORD])
await account(ids.D, [...S16])
await account(ids.E, [...S16, ...ORD])
/** the database's `now()` is the real one: keep a listing alive there, after its `ends` has been checked */
const keepAlive = (id: string) => sql`update card_listings set ends = greatest(ends, now() + interval '3 hours') where id = ${id}::bigint`

// 3 a.m.: the S16 section is shut, ordinary cards trade as always
now = bj('2026-10-20T03:00:00')
const night = await call('list', { id: ids.A, cardId: S16[0], ask: 1000 })
check('凌晨 3 点：S16 卡挂不上', night.ok === false && night.s16Closed === true && /今天 10:00 开市/.test(night.why), JSON.stringify(night))
const ord = await call('list', { id: ids.C, cardId: ORD[0], ask: 1000, buyout: 1500, hours: 24 })
check('凌晨 3 点：普通卡照常挂（24 小时、一口价）', ord.ok === true && Math.abs(ord.ends - Date.now() - 24 * H) < 60_000 && ord.hours === 24, JSON.stringify(ord).slice(0, 120))
const ordBid = await call('offer', { id: ids.B, listing: ord.id, price: 1000 })
check('凌晨 3 点：普通卡照常出价', ordBid.ok === true, JSON.stringify(ordBid).slice(0, 120))

// noon: S16 listings go up, without a buy-now, ending at 20:00
now = bj('2026-10-20T12:00:00')
const withBuyout = await call('list', { id: ids.A, cardId: S16[0], ask: 1000, buyout: 1500 })
check('S16 卡不能设一口价', withBuyout.ok === false && withBuyout.s16NoBuyout === true, JSON.stringify(withBuyout))
const s1 = await call('list', { id: ids.A, cardId: S16[0], ask: 1000, hours: 24 })
check('中午：S16 卡能挂，结拍时间 = 当天 20:00（不按卖家选的时长）', s1.ok === true && s1.ends === bj('2026-10-20T20:00:00') && s1.hours === 8, JSON.stringify(s1).slice(0, 160))
const row = (await sql`select buyout, ends from card_listings where id = ${s1.id}::bigint`)[0]
check('  数据库里没有一口价，ends 是 20:00', row.buyout == null && new Date(row.ends).getTime() === bj('2026-10-20T20:00:00'))
await keepAlive(s1.id)

// the shelf: two sections
const shelfOrd = await call('browse', { id: ids.D })
const shelf16 = await call('browse', { id: ids.D, s16: true })
const has = (r: any, id: string) => r.listings.some((l: any) => l.id === id)
check('普通货架不显示 S16 挂牌', has(shelfOrd, ord.id) && !has(shelfOrd, s1.id) && shelfOrd.pool.every(([c]: [string]) => !S16.includes(c)))
check('S16 交易区只显示 S16 挂牌', has(shelf16, s1.id) && !has(shelf16, ord.id) && shelf16.pool.every(([c]: [string]) => S16.includes(c)))
check('  两边的总数各算各的', shelfOrd.total === 1 && shelf16.total === 1, `${shelfOrd.total}/${shelf16.total}`)
check('  回复带着服务器算的开市时间', shelf16.s16Window?.open === true && shelf16.s16Window.closesAt === bj('2026-10-20T20:00:00') && shelf16.now === now)
check('  S16 交易区也能按筛选、搜索收窄（只在 S16 卡里找）', (await call('browse', { id: ids.D, s16: true, rarity: 'gold' })).listings.length === 0)

// bids: in the window yes, outside no
const bid = await call('offer', { id: ids.B, listing: s1.id, price: 1000 })
check('开市时能出价', bid.ok === true, JSON.stringify(bid).slice(0, 160))
// the last minutes: an ordinary auction stretches, an S16 one does not
await sql`update card_listings set ends = now() + interval '5 minutes' where id in (${s1.id}::bigint, ${ord.id}::bigint)`
const before16 = (await sql`select ends from card_listings where id = ${s1.id}::bigint`)[0].ends
const late16 = await call('offer', { id: ids.D, listing: s1.id, price: 1100 })
const after16 = (await sql`select ends from card_listings where id = ${s1.id}::bigint`)[0].ends
check('S16 拍卖最后几分钟有人出价：不延时', late16.ok === true && new Date(after16).getTime() === new Date(before16).getTime(), JSON.stringify(late16).slice(0, 100))
const beforeOrd = (await sql`select ends from card_listings where id = ${ord.id}::bigint`)[0].ends
const lateOrd = await call('offer', { id: ids.D, listing: ord.id, price: 1100 })
const afterOrd = (await sql`select ends from card_listings where id = ${ord.id}::bigint`)[0].ends
check('普通拍卖最后几分钟有人出价：照常延时', lateOrd.ok === true && new Date(afterOrd).getTime() > new Date(beforeOrd).getTime())
await keepAlive(s1.id)
check('已经有同一名选手的 S16 卡也能出价（一人一张的规则已取消）', late16.ok === true)

now = bj('2026-10-20T19:45:00')
const tooLate = await call('list', { id: ids.A, cardId: S16[1], ask: 1000 })
check('19:45：不再接受新的 S16 挂牌', tooLate.ok === false && tooLate.s16Closed === true && /19:30 后不再接受新挂牌/.test(tooLate.why), JSON.stringify(tooLate))
check('19:45：已有的 S16 拍卖还能出价', (await call('offer', { id: ids.B, listing: s1.id, price: 1200 })).ok === true)

now = bj('2026-10-20T21:00:00')
const closedBid = await call('offer', { id: ids.D, listing: s1.id, price: 1300 })
check('21:00：休市，S16 卡不能出价', closedBid.ok === false && closedBid.s16Closed === true && /明天 10:00 开市/.test(closedBid.why), JSON.stringify(closedBid))
now = bj('2026-10-21T03:00:00')
check('凌晨 3 点：S16 卡不能出价', (await call('offer', { id: ids.D, listing: s1.id, price: 1300 })).s16Closed === true)
check('凌晨 3 点：普通卡照常出价', (await call('offer', { id: ids.B, listing: ord.id, price: 1300 })).ok === true)

// swaps: S16 cards are not swapped, either way, while the section's rules hold
const code = (id: string) => hash(id).slice(0, 8)
const sw = await call('swap', { id: ids.E, code: code(ids.B), giveId: S16[2], wantId: S16[3] })
check('S16 卡不能换卡（提出）', sw.ok === false && sw.s16 === true && /S16 卡只能在 S16 交易区拍卖/.test(sw.why), JSON.stringify(sw))
const sw2 = await call('swap', { id: ids.E, code: code(ids.B), giveId: ORD[1], wantId: S16[3] })
check('拿普通卡换 S16 卡也不行', sw2.ok === false && sw2.s16 === true)
const swOrd = await call('swap', { id: ids.E, code: code(ids.C), giveId: ORD[1], wantId: ORD[1] })
check('普通卡照常换卡', swOrd.ok === true, JSON.stringify(swOrd).slice(0, 120))
const planted = (await sql`insert into card_swaps (from_h, to_h, give_id, give_level, want_id) values (${hash(ids.E)}, ${hash(ids.B)}, ${S16[2]}, 0, ${S16[3]}) returning id`)[0].id
const acc = await call('swap_answer', { id: ids.B, swap: String(planted), accept: true })
check('已有的 S16 换卡不能接受', acc.ok === false && acc.s16 === true)
check('  但能拒绝（卡退回）', (await call('swap_answer', { id: ids.B, swap: String(planted), accept: false })).ok === true)

// the settler pays the top bid when the S16 auction closes, as for any auction
await sql`update card_listings set ends = now() - interval '1 second' where id = ${s1.id}::bigint`
await api.settleDue()
const sold = await sql`select status from card_listings where id = ${s1.id}::bigint`
const got = await sql`select 1 from card_mail where to_h = ${hash(ids.B)} and kind = 'bought' and card_id = ${S16[0]}`
check('到点结拍：最高价成交，卡进买家信箱', sold[0].status === 'sold' && got.length === 1, sold[0].status)

// the final: closed from 11-14 20:00 until normalFrom
now = bj('2026-11-14T12:00:00')
const lastDay = await call('list', { id: ids.A, cardId: S16[1], ask: 1000 })
check('11-14 中午：最后一个交易日，20:00 结拍', lastDay.ok === true && lastDay.ends === bj('2026-11-14T20:00:00'), JSON.stringify(lastDay).slice(0, 120))
await keepAlive(lastDay.id)
now = bj('2026-11-15T03:00:00')
const frozenList = await call('list', { id: ids.E, cardId: S16[4], ask: 1000 })
check('决赛期间（11-15 03:00）：S16 卡挂不上', frozenList.ok === false && frozenList.s16Closed === true && /总决赛期间休市/.test(frozenList.why), JSON.stringify(frozenList))
check('决赛期间：S16 卡不能出价', (await call('offer', { id: ids.B, listing: lastDay.id, price: 1000 })).s16Closed === true)
check('决赛期间：S16 卡不能换', (await call('swap', { id: ids.E, code: code(ids.B), giveId: S16[2], wantId: S16[3] })).s16 === true)
const frozenShelf = await call('browse', { id: ids.D })
check('决赛期间：普通货架仍不显示 S16 挂牌', !has(frozenShelf, lastDay.id))

// after the results: ordinary cards
now = bj('2026-11-16T03:00:00')
const normal = await call('list', { id: ids.E, cardId: S16[4], ask: 1000, buyout: 1500, hours: 6 })
check('normalFrom 之后：S16 卡凌晨也能挂，时长自选、可设一口价', normal.ok === true && normal.hours === 6 && Math.abs(normal.ends - Date.now() - 6 * H) < 60_000, JSON.stringify(normal).slice(0, 160))
const normalRow = (await sql`select buyout from card_listings where id = ${normal.id}::bigint`)[0]
check('  一口价存进去了', normalRow.buyout === 1500)
check('  凌晨能出价', (await call('offer', { id: ids.D, listing: lastDay.id, price: 1000 })).ok === true)
const after = await call('browse', { id: ids.C })
const after16b = await call('browse', { id: ids.C, s16: true })
check('  普通货架也显示 S16 挂牌，S16 分区照样能看', has(after, normal.id) && has(after16b, normal.id) && after16b.s16Window?.mode === 'normal')
const swAfter = await call('swap', { id: ids.E, code: code(ids.D), giveId: S16[2], wantId: S16[3] })
check('  S16 卡能换卡了', swAfter.ok === true, JSON.stringify(swAfter).slice(0, 120))

// the summary-backed shelf (the fast path) sorts the two sections the same way
now = bj('2026-10-22T12:00:00')
for (let tick = 0; tick < 400 && !api.summaryLive(); tick++) await api.settleDue({ chores: true })
check('切到汇总表货架', api.summaryLive() === true)
const s5 = await call('list', { id: ids.B, cardId: S16[5], ask: 1000 })
await keepAlive(s5.id)
for (const sort of ['ends', 'new', 'price', 'price_desc']) {
  const o = await call('browse', { id: ids.C, sort })
  const x = await call('browse', { id: ids.C, sort, s16: true })
  check(`  汇总表货架（${sort}）：普通货架没有 S16，S16 区只有 S16`,
    !has(o, s5.id) && o.listings.every((l: any) => !S16.includes(l.cardId)) && has(x, s5.id) && x.listings.every((l: any) => S16.includes(l.cardId)))
}

await db.close()
if (bad) { console.log(`\n${bad} FAILED`); process.exit(1) }
console.log('\nS16 交易区：每天 10:00–20:00、当天 20:00 结拍、19:30 后不挂、没有一口价、不能换；决赛期间停、结果出来后按普通卡；普通卡不受影响')
