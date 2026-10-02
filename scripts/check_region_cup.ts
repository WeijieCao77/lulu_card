/**
 * 地区杯: who may enter, once a day, the draw (players' fives from another 地区 first, 联队 where
 * nobody fits), 双败 to the end, and the 地区 rule (中国台湾 its own, 香港 / 澳门 in 中国).
 *
 *   npx tsx scripts/check_region_cup.ts
 */
import { runAction } from '../src/engine/cardActions'
import { newGacha } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { BASE_PLAYER_CARDS, COACH_CARDS, SQUAD_SLOTS, personOf } from '../src/engine/cards'
import type { Squad } from '../src/engine/cards'
import { playableRegions, regionName, regionOf, squadRegion } from '../src/engine/regionCup'
import type { RegionEntry } from '../src/engine/regionCup'

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const DAY = '2026-10-02'
const env = (today = DAY, seed = 7, regionPool: RegionEntry[] = []) => ({ now: Date.parse(`${today}T12:00:00+08:00`), today, seed, regionPool })

/** the best five and a coach a 地区 can field from ordinary cards */
function fiveOf(region: string, skip = 0): Squad {
  const list = BASE_PLAYER_CARDS.filter((c) => regionOf(c.nat) === region).sort((a, b) => b.rating - a.rating).slice(skip)
  const used = new Set<string>()
  const slots = SQUAD_SLOTS.map((slot) => {
    const p = list.find((c) => !used.has(personOf(c)) && c.roles.includes(slot))
    if (p) used.add(personOf(p))
    return p?.id ?? null
  })
  const coach = COACH_CARDS.find((c) => regionOf((c as { nat?: string }).nat) === region)?.id ?? null
  return { slots, coach }
}
function account(squad: Squad, id = 'VM-REGN-REGN-REGN-REGN-RG01'): GachaState {
  const g = newGacha(id, '地区', DAY)
  for (const c of [...squad.slots, squad.coach]) if (c) g.cards[c] = { id: c, level: 0, dupes: 0, seen: 1, got: DAY }
  g.squad = structuredClone(squad)
  return g
}

console.log('=== 地区 ===')
check('香港、澳门算中国', regionOf('HK') === 'cn' && regionOf('mo') === 'cn')
check('中国台湾单独一个地区', regionOf('tw') === 'tw' && regionName('tw') === '中国台湾')
check('韩国、中国、中国台湾都凑得出联队', ['kr', 'cn', 'tw'].every((r) => playableRegions().includes(r)), playableRegions().map(regionName).join('、'))
const kr = fiveOf('kr'), tw = fiveOf('tw')
check('一套韩国阵容是韩国', (() => { const r = squadRegion(kr); return r.ok && r.region === 'kr' })())
const mixed = { slots: [...kr.slots.slice(0, 4), tw.slots[4]], coach: kr.coach }
const why = squadRegion(mixed)
check('混了中国台湾的选手就进不了', !why.ok && why.why.includes('中国台湾'), why.ok ? '' : why.why)
check('没有教练进不了', !squadRegion({ slots: kr.slots, coach: null }).ok)

console.log('\n=== 报名与对阵 ===')
{
  const g = account(kr)
  const coins = g.coins
  const r = runAction(g, 'region_enter', {}, env())
  check('报名成功', r.ok, r.ok ? '' : (r as { why: string }).why)
  const cup = g.regionCup!
  check('三到五轮', cup.path.length >= 3 && cup.path.length <= 5, `${cup.path.length} 轮`)
  check('没人报名时全是联队', cup.path.every((id) => cup.rivals[id]?.ai))
  check('联队优先别的地区', cup.path.every((id) => cup.rivals[id].region !== 'kr'), cup.path.map((id) => cup.rivals[id].name).join(' / '))
  check('不花体力也不花金币', g.coins === coins && g.daily.stamina === newGacha('x', 'x', DAY).daily.stamina)
  check('一轮比一轮强', cup.path.every((id, i) => i === 0 || cup.rivals[id].score >= cup.rivals[cup.path[i - 1]].score))
  const again = runAction(g, 'region_enter', {}, env())
  check('没打完再点报名，还是这一届', again.ok && g.regionCup === cup)
  let n = 0
  while (!g.regionCup!.done && n < 12) {
    const p = runAction(g, 'region_play', {}, env(DAY, 100 + n++))
    if (!p.ok) { check('每场都打得了', false, (p as { why: string }).why); break }
  }
  check('打得完', g.regionCup!.done, `${n} 场`)
  check('双败：至少打满轮数或输两场', n >= (g.regionCup!.won ? g.regionCup!.path.length : 1))
  check('拿到奖励', g.coins > coins, `+${g.coins - coins}`)
  const third = runAction(g, 'region_enter', {}, env())
  check('同一天不能再报', !third.ok)
  const next = runAction(g, 'region_enter', {}, env('2026-10-03'))
  check('第二天可以再报', next.ok && g.regionCup!.day === '2026-10-03')
  check('俱乐部杯没被碰', g.cup === null)
}

console.log('\n=== 真人对手 ===')
{
  const g = account(kr)
  const entry = (id: string, region: string, squad: Squad, score: number): RegionEntry =>
    ({ id, name: `玩家${id}`, tag: '#0000', region, slots: squad.slots, coach: squad.coach, levels: {}, score })
  // a pool around every target, half Korean, half from 中国台湾
  const pool: RegionEntry[] = []
  for (let s = 60; s <= 110; s++) { pool.push(entry(`k${s}`, 'kr', kr, s)); pool.push(entry(`t${s}`, 'tw', tw, s)) }
  runAction(g, 'region_enter', {}, env(DAY, 9, pool))
  const cup = g.regionCup!
  const all = [...cup.path, ...cup.lowers].map((id) => cup.rivals[id])
  check('池子里有人时抽真人', all.every((r) => !r.ai))
  check('别的地区优先：一个韩国队都没抽到', all.every((r) => r.region === 'tw'), all.map((r) => regionName(r.region)).join(' '))
  const p = runAction(g, 'region_play', {}, env(DAY, 11, pool))
  check('和真人阵容打得起来', p.ok && !!(p as { result: { res: { opp?: unknown } } }).result.res.opp)
}

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
