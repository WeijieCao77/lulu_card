import {
  cleanWeeklySeriesPick, selectWeeklySeries, selectedWeeklySeries, weekKey,
} from '../src/engine/weeklySeries'
import {
  mergeClientFields, migrateGacha, newGacha, openPack, packCost, takeServerFields,
} from '../src/engine/gacha'
import type { GachaState, Series } from '../src/engine/gacha'
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
check(weekKey('2027-01-04') === '2027-01-04', '新年第一个周一', weekKey('2027-01-04'))
check(weekKey('2026-09-07T00:00:00+08:00') === '', '带时间戳拒绝')
check(weekKey('2026-99-99') === '', '非法日期拒绝')
check(weekKey('garbage') === '', '非日期字符串拒绝')

// cleanWeeklySeriesPick validates real Mondays and exact field shape
check(cleanWeeklySeriesPick(undefined) === undefined, '无记录清洗为无')
check(cleanWeeklySeriesPick(null) === undefined, 'null 清洗为无')
check(cleanWeeklySeriesPick({ week: 'bad', region: 'LPL' }) === undefined, '周格式非法拒绝')
check(cleanWeeklySeriesPick({ week: '2026-99-99', region: 'LPL' }) === undefined, '不存在的日期拒绝')
check(cleanWeeklySeriesPick({ week: '2026-09-07T00:00:00+08:00', region: 'LPL' }) === undefined, '带时间戳拒绝')
check(cleanWeeklySeriesPick({ week: '2026-09-08', region: 'LPL' }) === undefined, '非周一拒绝')
check(cleanWeeklySeriesPick({ week: '2026-09-07', region: 'XX' }) === undefined, '赛区非法拒绝')
check(cleanWeeklySeriesPick({ week: '2026-09-07', region: 'LPL' })?.region === 'LPL', '正常选择清洗通过')

// state machine: no selection -> choose -> same week idempotent, change fails, next week rechoose
{
  const g = newGacha('VM-W', '审计', '2026-09-07') as GachaState
  check(selectedWeeklySeries(g, '2026-09-07') === undefined, '新号未选无赛区')
  const r = selectWeeklySeries(g, '2026-09-07', 'LPL')
  check(r.ok && r.region === 'LPL', '首次选择成功')
  check(selectedWeeklySeries(g, '2026-09-07') === 'LPL', '同周读到选择')
  check(selectWeeklySeries(g, '2026-09-07', 'LPL').ok, '同赛区同周幂等成功')
  check(!selectWeeklySeries(g, '2026-09-07', 'LCK').ok, '同周换赛区失败')
  check(selectedWeeklySeries(g, '2026-09-14') === undefined, '下周未选为空')
  const r2 = selectWeeklySeries(g, '2026-09-14', 'LCK')
  check(r2.ok && r2.region === 'LCK', '下周可重新选')
}

// server authority: old save no pick still full price
{
  const g = newGacha('VM-A', '审计', '2026-09-07')
  check(packCost('cn', '2026-09-07', g) === 2600, '旧存档无选择仍原价')
  const r = selectWeeklySeries(g, '2026-09-07', 'LPL')
  check(r.ok, '选择成功')
  check(packCost('cn', '2026-09-07', g) === 2080, '自选后 LPL 2080')
  check(packCost('pac', '2026-09-07', g) === 2600, '未选赛区原价')
  check(packCost('scout', '2026-09-07', g) === 750, '非赛区包原价')
  check(packCost('cn', '2026-09-07') === 2600, '不传 g 不折')
}

// server action: series_pick uses env.today, not args.today/week
{
  const g = newGacha('VM-S', '审计', '2026-09-07')
  const r1 = runAction(g, 'series_pick', { region: 'LPL', today: '2026-09-14' }, env('2026-09-07'))
  check(r1.ok, '动作使用 env.today 忽略伪造 today')
  const rSame = runAction(g, 'series_pick', { region: 'LPL', week: '2026-09-14' }, env('2026-09-07'))
  check(rSame.ok, '动作忽略伪造 week 幂等成功')
  const rChange = runAction(g, 'series_pick', { region: 'LCK' }, env('2026-09-07'))
  check(!rChange.ok, '动作同周换赛区失败')
  const rNext = runAction(g, 'series_pick', { region: 'LCK' }, env('2026-09-14'))
  check(rNext.ok, '动作下周可换')
  const rBad = runAction(g, 'series_pick', { region: 'XX' }, env('2026-09-14'))
  check(!rBad.ok, '非法赛区拒绝')
  const rNo = runAction(g, 'series_pick', {}, env('2026-09-14'))
  check(!rNo.ok, '缺赛区字段拒绝')
}

// forged client state must not alter server-owned pick; takeServerFields removes local fake
{
  const server = newGacha('VM-C', '审计', '2026-09-07')
  selectWeeklySeries(server, '2026-09-07', 'LPL')
  const forged = { ...server, weeklySeriesPick: { week: '2026-09-07', region: 'LCK' as Series } }
  const merged = mergeClientFields(server, forged)
  check(merged.weeklySeriesPick?.region === 'LPL', 'mergeClientFields 不读伪造字段')
  const mine = takeServerFields({ ...server, weeklySeriesPick: { week: '2026-09-07', region: 'LCK' as Series } }, server)
  check(mine.weeklySeriesPick?.region === 'LPL', 'takeServerFields 清除本地伪造')
}

// migration cleans malformed pick, preserves valid one
{
  const good = migrateGacha({ ...newGacha('VM-M', '审计', '2026-09-07'), weeklySeriesPick: { week: '2026-09-07', region: 'LPL' } } as GachaState, 'VM-M')
  check(good.weeklySeriesPick?.region === 'LPL', '迁移保留合法选择')
  const badWeek = migrateGacha({ ...newGacha('VM-M2', '审计', '2026-09-07'), weeklySeriesPick: { week: 'bad', region: 'LPL' } } as GachaState, 'VM-M2')
  check(badWeek.weeklySeriesPick === undefined, '迁移清洗畸形周')
  const badDate = migrateGacha({ ...newGacha('VM-M3', '审计', '2026-09-07'), weeklySeriesPick: { week: '2026-99-99', region: 'LPL' } } as GachaState, 'VM-M3')
  check(badDate.weeklySeriesPick === undefined, '迁移清洗非法日期')
  const notMonday = migrateGacha({ ...newGacha('VM-M4', '审计', '2026-09-06'), weeklySeriesPick: { week: '2026-09-08', region: 'LPL' } } as GachaState, 'VM-M4')
  check(notMonday.weeklySeriesPick === undefined, '迁移清洗非周一')
}

// openPack deducts discounted price from server path
{
  const g = newGacha('VM-O', '审计', '2026-09-07')
  g.coins = 100000
  selectWeeklySeries(g, '2026-09-07', 'LPL')
  const before = g.coins
  const out = openPack(g, 'cn', 'coins', '2026-09-07')
  check(out.length === 3, '开出 3 张')
  check(before - g.coins === 2080, '自选赛区扣 2080')
}

// runAction open must not use forged args.today to alter price
{
  const g = newGacha('VM-V', '审计', '2026-09-07')
  g.coins = 100000
  selectWeeklySeries(g, '2026-09-07', 'LPL')
  const before = g.coins
  const r = runAction(g, 'open', { kind: 'cn', payWith: 'coins', price: 1, today: '2026-09-14', expectedPrice: 2080 }, env('2026-09-07'))
  check(r.ok, 'runAction open 成功')
  check(before - g.coins === 2080, 'runAction open 扣除自选赛区折后价')
}

// series pack coins purchase requires expectedPrice exactly matching server cost
const snapshot = (g: GachaState) => JSON.stringify({
  coins: g.coins, packs: g.packs, cards: g.cards, seed: g.seed,
  pulls: g.pulls, pity: g.pity, mythicDry: g.mythicDry,
})
{
  const reject = (what: string, args: Record<string, unknown>, today = '2026-09-07') => {
    const g = newGacha('VM-E', '审计', today)
    g.coins = 100000
    if (today === '2026-09-07') selectWeeklySeries(g, today, 'LPL')
    const before = snapshot(g)
    const r = runAction(g, 'open', args, env(today))
    check(!r.ok, what)
    check(snapshot(g) === before, `${what} 不改变状态`)
  }
  reject('未传 expectedPrice 拒绝', { kind: 'cn', payWith: 'coins' })
  reject('低价 1 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: 1 })
  reject('字符串 2080 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: '2080' })
  reject('不相等 2600 拒绝（实际 2080）', { kind: 'cn', payWith: 'coins', expectedPrice: 2600 })
  reject('Infinity 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: Infinity })
  reject('NaN 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: NaN })
  reject('null 拒绝', { kind: 'cn', payWith: 'coins', expectedPrice: null })
}

// correct expectedPrice succeeds
{
  const g = newGacha('VM-F', '审计', '2026-09-07')
  g.coins = 100000
  selectWeeklySeries(g, '2026-09-07', 'LPL')
  const before = g.coins
  const r = runAction(g, 'open', { kind: 'cn', payWith: 'coins', expectedPrice: 2080 }, env('2026-09-07'))
  check(r.ok, '正确 2080 成功')
  check(before - g.coins === 2080, '正确 2080 扣 2080')
}

// stale old price across week boundary rejected
{
  const g = newGacha('VM-G', '审计', '2026-09-07')
  g.coins = 100000
  selectWeeklySeries(g, '2026-09-07', 'LPL')
  const before = snapshot(g)
  const r = runAction(g, 'open', { kind: 'cn', payWith: 'coins', expectedPrice: 2080 }, env('2026-09-14'))
  check(!r.ok, '跨周过期 2080 拒绝')
  check(snapshot(g) === before, '跨周过期拒绝不改变状态')
}

// stale old displayed full price after another device chose discount rejected
{
  const g = newGacha('VM-H', '审计', '2026-09-07')
  g.coins = 100000
  selectWeeklySeries(g, '2026-09-07', 'LPL')
  const before = snapshot(g)
  const r = runAction(g, 'open', { kind: 'cn', payWith: 'coins', expectedPrice: 2600 }, env('2026-09-07'))
  check(!r.ok, '另一设备已选择折扣后旧展示 2600 拒绝')
  check(snapshot(g) === before, '旧展示 2600 拒绝不改变状态')
}

// unpicked full price succeeds with correct expectedPrice
{
  const g = newGacha('VM-I', '审计', '2026-09-07')
  g.coins = 100000
  const before = g.coins
  const r = runAction(g, 'open', { kind: 'cn', payWith: 'coins', expectedPrice: 2600 }, env('2026-09-07'))
  check(r.ok, '未选原价 2600 成功')
  check(before - g.coins === 2600, '未选原价 2600 扣 2600')
}

// stock packs need no expectedPrice
{
  const g = newGacha('VM-J', '审计', '2026-09-07')
  g.packs.cn = 3
  const coinsBefore = g.coins
  const packsBefore = g.packs.cn
  const r = runAction(g, 'open', { kind: 'cn', payWith: 'pack' }, env('2026-09-07'))
  check(r.ok, '库存 cn 没有 expectedPrice 成功')
  check(g.packs.cn === packsBefore - 1, '库存 cn 精确少 1')
  check(g.coins === coinsBefore, '库存打开 coins 不变')
}

// non-series pack needs no expectedPrice
{
  const g = newGacha('VM-K', '审计', '2026-09-07')
  g.coins = 100000
  const before = g.coins
  const r = runAction(g, 'open', { kind: 'scout', payWith: 'coins' }, env('2026-09-07'))
  check(r.ok, '非赛区 scout 没有 expectedPrice 成功')
  check(before - g.coins === 750, '非赛区 scout 金币精确少 750')
}

// successful repeated selection does not change coins or packs
{
  const g = newGacha('VM-R', '审计', '2026-09-07')
  g.coins = 100000
  const coinsBefore = g.coins
  const packsBefore = JSON.stringify(g.packs)
  selectWeeklySeries(g, '2026-09-07', 'LPL')
  const r = runAction(g, 'series_pick', { region: 'LPL' }, env('2026-09-07'))
  check(r.ok, '重复同赛区选择成功')
  check(g.coins === coinsBefore, '重复选择不改变 coins')
  check(JSON.stringify(g.packs) === packsBefore, '重复选择不改变 packs')
}

// Sunday still belongs to previous week; Monday can choose a new region
{
  const g = newGacha('VM-D', '审计', '2026-09-06')
  selectWeeklySeries(g, '2026-09-06', 'LPL')
  check(selectedWeeklySeries(g, '2026-09-06') === 'LPL', '周日选择属于本周')
  const r = selectWeeklySeries(g, '2026-09-07', 'LCK')
  check(r.ok && r.region === 'LCK', '周一可以重新选择新赛区')
}

console.log(bad ? `\n${bad} 项不通过` : '\n全部通过')
process.exit(bad ? 1 : 0)
