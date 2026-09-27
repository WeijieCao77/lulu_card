/**
 * 每周赛区折扣 (2026-09-27, as 开瓦包): one region pack is 20% off for everyone each week,
 * turning over Monday 00:00 Asia/Shanghai, LPL → LCK → LEC → LCS → 其他, starting LPL on 2026-09-28.
 * The old per-account pick is gone: series_pick is refused, and a stored pick changes no price.
 *
 *   npx tsx scripts/check_weekly_series.ts
 */
import { weekKey } from '../src/engine/weeklySeries'
import { FEATURE_FIRST_WEEK, featuredSeries, newGacha, openPack, packCost, PACK_ORDER, PACKS, seriesOfPack, SERIES } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { runAction } from '../src/engine/cardActions'
import type { ActEnv } from '../src/engine/cardActions'

const store = new Map<string, string>()
;(globalThis as never as { localStorage: unknown }) = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  key: () => null, clear: () => store.clear(), get length() { return store.size },
}

let bad = 0
const check = (ok: boolean, what: string, detail = '') => {
  if (!ok) { bad++; console.log(`FAIL ${what}${detail ? `  ${detail}` : ''}`) }
}
const env = (today: string, seed = 1): ActEnv => ({ now: Date.parse(`${today}T00:00:00+08:00`), today, seed })

// weekKey: Monday boundary, Sunday to previous Monday, invalid dates rejected with ''
check(weekKey('2026-09-07') === '2026-09-07', '周一就是周一', weekKey('2026-09-07'))
check(weekKey('2026-09-06') === '2026-08-31', '周日归上周一', weekKey('2026-09-06'))
check(weekKey('2027-01-01') === '2026-12-28', '周五向前到周一', weekKey('2027-01-01'))
check(weekKey('2026-09-07T00:00:00+08:00') === '', '带时间戳拒绝')
check(weekKey('garbage') === '', '非日期字符串拒绝')

// the rotation: first week LPL, then in SERIES order, a new region every Monday
check(FEATURE_FIRST_WEEK === '2026-09-28' && weekKey(FEATURE_FIRST_WEEK) === FEATURE_FIRST_WEEK, '第一周从周一 2026-09-28 开始')
check(featuredSeries('2026-09-27') === 'LPL', '上线前（本周日）也是 LPL')
check(featuredSeries('2026-09-28') === 'LPL', '第一周 LPL')
check(featuredSeries('2026-10-04') === 'LPL', '第一周周日仍是 LPL')
check(featuredSeries('2026-10-05') === 'LCK', '第二周 LCK')
check(featuredSeries('2026-10-12') === 'LEC', '第三周 LEC')
check(featuredSeries('2026-10-19') === 'LCS', '第四周 LCS')
check(featuredSeries('2026-10-26') === 'WEST', '第五周 其他')
check(featuredSeries('2026-11-02') === 'LPL', '第六周回到 LPL')
{
  const days = new Map<string, number>()
  let last = ''
  for (let d = 0; d < 350; d++) {
    const date = new Date(Date.UTC(2026, 8, 28) + d * 86_400_000).toISOString().slice(0, 10)
    const r = featuredSeries(date)
    days.set(r, (days.get(r) ?? 0) + 1)
    if (last && r !== last) check(new Date(`${date}T00:00:00Z`).getUTCDay() === 1, '换周固定在周一', date)
    last = r
    // exactly one pack is discounted each day, and it is the featured region's
    const off = PACK_ORDER.filter(k => packCost(k, date) < PACKS[k].cost)
    check(off.length === 1 && seriesOfPack(off[0]) === r, '每天恰好一个赛区包打折', `${date} ${off.join(',')}`)
    check(packCost(off[0], date) === Math.round(PACKS[off[0]].cost * .8), '八折', `${date}`)
  }
  check(days.size === SERIES.length && Math.max(...days.values()) === Math.min(...days.values()), '五个赛区轮流、天数相同', JSON.stringify([...days]))
}
for (const kind of PACK_ORDER) check(packCost(kind) === PACKS[kind].cost, '不传日期就是原价', kind)
check(packCost('scout', '2026-09-28') === PACKS.scout.cost, '非赛区包不打折')

// the same for everyone: a stored old pick neither adds a discount nor removes the week's
{
  const g = newGacha('VM-P', '审计', '2026-09-28') as GachaState
  g.weeklySeriesPick = { week: '2026-09-28', region: 'LCK' }
  check(packCost('pac', '2026-09-28', g) === 2600, '旧自选记录不再打折')
  check(packCost('cn', '2026-09-28', g) === 2080, '全服本周 LPL 八折')
  const r = runAction(g, 'series_pick', { region: 'LEC' }, env('2026-09-28'))
  check(!r.ok, '不再能自选赛区')
}

// the server charges the week's price; openPack and runAction agree
{
  const g = newGacha('VM-O', '审计', '2026-09-28')
  g.coins = 100000
  const before = g.coins
  check(openPack(g, 'cn', 'coins', '2026-09-28').length === 3, '开出 3 张')
  check(before - g.coins === 2080, '本周 LPL 包扣 2080')
}
const snapshot = (g: GachaState) => JSON.stringify({ coins: g.coins, packs: g.packs, cards: g.cards, seed: g.seed, pulls: g.pulls, pity: g.pity, mythicDry: g.mythicDry })
{
  const reject = (what: string, args: Record<string, unknown>, today = '2026-09-28') => {
    const g = newGacha('VM-E', '审计', today)
    g.coins = 100000
    const before = snapshot(g)
    const r = runAction(g, 'open', args, env(today))
    check(!r.ok, what)
    check(snapshot(g) === before, `${what} 不改变状态`)
  }
  reject('未传 expectedPrice 拒绝', { kind: 'cn', payWith: 'coins' })
  reject('低价 1 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: 1 })
  reject('字符串 2080 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: '2080' })
  reject('不相等 2600 拒绝（实际 2080）', { kind: 'cn', payWith: 'coins', expectedPrice: 2600 })
  reject('NaN 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: NaN })
  // the page was open across Monday: last week's price no longer holds
  reject('跨周过期 2080 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: 2080 }, '2026-10-05')
}
{
  const g = newGacha('VM-V', '审计', '2026-09-28')
  g.coins = 100000
  const before = g.coins
  // a forged args.today must not move the price: the server's env.today decides
  const r = runAction(g, 'open', { kind: 'cn', payWith: 'coins', today: '2026-10-05', expectedPrice: 2080 }, env('2026-09-28'))
  check(r.ok && before - g.coins === 2080, 'runAction 用服务器日期算价')
}
{
  const g = newGacha('VM-I', '审计', '2026-09-28')
  g.coins = 100000
  const before = g.coins
  const r = runAction(g, 'open', { kind: 'pac', payWith: 'coins', expectedPrice: 2600 }, env('2026-09-28'))
  check(r.ok && before - g.coins === 2600, '非本周赛区原价 2600')
}
{
  const g = newGacha('VM-J', '审计', '2026-09-28')
  g.packs.cn = 3
  const coinsBefore = g.coins
  const r = runAction(g, 'open', { kind: 'cn', payWith: 'pack' }, env('2026-09-28'))
  check(r.ok && g.packs.cn === 2 && g.coins === coinsBefore, '库存包不需要 expectedPrice、不扣金币')
}

console.log(bad ? `\n${bad} 项不通过` : '\n每周赛区折扣：全服统一，LPL 起，每周一轮换 — 全部通过')
process.exit(bad ? 1 : 0)
