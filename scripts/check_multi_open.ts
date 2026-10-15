/**
 * 连开 (gacha.ts openPacks, ported from 开瓦包): ten packs in one go are ten single
 * opens, pack for pack; every refusal is made before the first pack opens; 'auto'
 * spends the stock first and buys the rest; a series pack bought by 'auto' still
 * has to name its price.
 */
import { MULTI_OPEN_MAX, PACKS, newGacha, openPack, openPacks, packCost, featuredSeries } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { runAction } from '../src/engine/cardActions'

let bad = 0
const ok = (name: string, pass: boolean, detail = '') => { console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!pass) bad++ }
const twin = (s: GachaState) => JSON.parse(JSON.stringify(s)) as GachaState
const strip = (s: GachaState) => ({ ...s, log: s.log.map(l => l.text) })
const refuse = (f: () => unknown) => { try { f(); return '' } catch (e) { return (e as Error).message } }
const DAY = '2026-10-15'
const env = (seed: number) => ({ today: DAY, now: Date.parse(`${DAY}T04:00:00Z`), seed }) as never

for (const [kind, payWith] of [['elite', 'coins'], ['cn', 'coins'], ['west', 'coins'], ['ten', 'pack'], ['s16', 'coins']] as const) {
  const a = newGacha(`MULTI-${kind}`, '连开', DAY); a.coins = 1e6; a.packs.ten = 12; a.pity = 30; a.mythicDry = 1190
  const b = twin(a)
  const many = openPacks(a, kind, payWith, MULTI_OPEN_MAX, DAY)
  const one: string[][] = []
  for (let i = 0; i < MULTI_OPEN_MAX; i++) one.push(openPack(b, kind, payWith, DAY).map(p => p.card.id))
  ok(`连开 10 个${PACKS[kind].name}（${payWith === 'coins' ? '金币' : '库存'}）＝ 一包一包开 10 次`,
    JSON.stringify(many.map(p => p.map(x => x.card.id))) === JSON.stringify(one)
    && JSON.stringify(strip(a)) === JSON.stringify(strip(b)),
    `${many.flat().length} 张，彩卡保底 ${a.mythicDry}，金卡保底 ${a.pity}`)
}
{
  const price = packCost('elite', DAY)
  const a = newGacha('MULTI-BAD', '连开', DAY); a.coins = price * 2 + 100; a.packs.elite = 3
  const before = JSON.stringify(a)
  const why = [
    refuse(() => openPacks(a, 'elite', 'coins', 3, DAY)),
    refuse(() => openPacks(a, 'elite', 'pack', 4, DAY)),
    refuse(() => openPacks(a, 'elite', 'pack', 11, DAY)),
    refuse(() => openPacks(a, 'elite', 'pack', 0, DAY)),
    refuse(() => openPacks(a, 'elite', 'pack', 2.5, DAY)),
    refuse(() => openPacks(a, 'ten', 'coins', 2, DAY)),
    refuse(() => openPacks(a, 'seoul2024', 'pack', 2, DAY)),
    refuse(() => openPacks(a, 's16', 'coins', 2, '2026-12-01')),
  ]
  ok('钱不够、库存不够、超过 10、0、小数、非卖品、下架：一包都不开，账号不动', why.every(Boolean) && JSON.stringify(a) === before, why.join(' | '))
  ok('刚好够的时候开得了', openPacks(a, 'elite', 'coins', 2, DAY).length === 2 && a.coins === 100)
}
{
  const price = packCost('elite', DAY)
  const a = newGacha('MULTI-AUTO', '连开', DAY); a.packs.elite = 6; a.coins = 1e5
  const b = twin(a)
  const many = openPacks(a, 'elite', 'auto', 10, DAY)
  const one: string[][] = []
  for (let i = 0; i < 10; i++) one.push(openPack(b, 'elite', i < 6 ? 'pack' : 'coins', DAY).map(p => p.card.id))
  ok('库存 6 个、连开 10 包：先开库存 6 个，再花金币买 4 包',
    many.length === 10 && a.packs.elite === 0 && a.coins === 1e5 - 4 * price
    && JSON.stringify(many.map(p => p.map(x => x.card.id))) === JSON.stringify(one), `${a.coins}`)
  const c = newGacha('MULTI-AUTO2', '连开', DAY); c.packs.elite = 8; c.coins = 0
  ok('库存够的时候一个金币都不花', openPacks(c, 'elite', 'auto', 5, DAY).length === 5 && c.packs.elite === 3 && c.coins === 0)
  const d = newGacha('MULTI-AUTO3', '连开', DAY); d.packs.elite = 6; d.coins = price * 3
  const before = JSON.stringify(d)
  const why = refuse(() => openPacks(d, 'elite', 'auto', 10, DAY))
  ok('金币只够补 3 包时 10 包一包都不开，库存不动', /金币不够，4 包/.test(why) && JSON.stringify(d) === before, why)
  const e = newGacha('MULTI-AUTO4', '连开', DAY); e.packs.ten = 3; e.coins = 1e6
  ok('买不到的包库存不够就不开', /买不到/.test(refuse(() => openPacks(e, 'ten', 'auto', 4, DAY))) && e.packs.ten === 3)
  const f = newGacha('MULTI-AUTO5', '连开', DAY); f.packs.elite = 6; f.coins = 1e5
  const r = runAction(f, 'open', { kind: 'elite', payWith: 'auto', count: 10 }, env(3))
  ok('服务器动作认 auto', r.ok && f.packs.elite === 0 && f.coins === 1e5 - 4 * price)
  const g1 = newGacha('MULTI-AUTO6', '单开', DAY); g1.packs.elite = 1; g1.coins = 1e5
  ok('auto 单开有库存先用库存', runAction(g1, 'open', { kind: 'elite', payWith: 'auto' }, env(4)).ok && g1.packs.elite === 0 && g1.coins === 1e5)
}
{
  // a series pack bought by 'auto' names its price, as a coins purchase does
  const kind = 'pac'
  const price = packCost(kind, DAY)
  const a = newGacha('MULTI-SERIES', '连开', DAY); a.coins = 1e5
  const r0 = runAction(a, 'open', { kind, payWith: 'auto', count: 3 }, env(5))
  ok('赛区包 auto 买包不带价格被拒', !r0.ok && a.coins === 1e5, (r0 as { why?: string }).why)
  const r1 = runAction(a, 'open', { kind, payWith: 'auto', count: 3, expectedPrice: price + 1 }, env(5))
  ok('赛区包价格不对被拒', !r1.ok && a.coins === 1e5)
  const r2 = runAction(a, 'open', { kind, payWith: 'auto', count: 3, expectedPrice: price }, env(5))
  ok('赛区包价格对上就开', r2.ok && a.coins === 1e5 - 3 * price, `本周八折 ${featuredSeries(DAY)}，LCK 包 ${price}`)
  const b = newGacha('MULTI-SERIES2', '连开', DAY); b.packs[kind] = 3
  ok('赛区包全用库存时不用带价格', runAction(b, 'open', { kind, payWith: 'auto', count: 3 }, env(6)).ok && b.packs[kind] === 0)
}
{
  const a = newGacha('MULTI-ACT', '连开', DAY); a.packs.ten = 10
  const r = runAction(a, 'open', { kind: 'ten', payWith: 'pack', count: 10 }, env(99))
  const res = (r as { result?: { packs: number; pulled: unknown[] } }).result
  ok('服务器动作：10 个十连包 → 10 包 100 张，库存清空', r.ok && res?.packs === 10 && res.pulled.length === 100 && a.packs.ten === 0)
  a.packs.legend = 1
  const r2 = runAction(a, 'open', { kind: 'legend', payWith: 'pack', count: 2 }, env(99))
  ok('库存不够时动作失败，说清楚，一包都不开', !r2.ok && /库存只有 1 个/.test((r2 as { why: string }).why) && a.packs.legend === 1)
  const b = newGacha('SINGLE-ACT', '单开', DAY); b.packs.scout = 1
  const r3 = runAction(b, 'open', { kind: 'scout', payWith: 'pack' }, env(5))
  ok('不带 count 还是原来的单开回复', r3.ok && !('packs' in ((r3 as { result: object }).result)))
}
if (bad) { console.error(`${bad} 处不对`); process.exit(1) }
console.log('连开检查全部通过')
