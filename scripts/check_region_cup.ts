/**
 * 地区杯: a 全服杯 division like 不限赛 whose five and coach must be one 地区 — 中国台湾 its own,
 * 香港 / 澳门 in 中国 — checked by leagueEntry, which the server runs at sign-up and at the start.
 *
 *   npx tsx scripts/check_region_cup.ts
 */
import { CUP_LEAGUES, OPEN_CUP_TABS, leagueEntry } from '../src/engine/gacha'
import { BASE_PLAYER_CARDS, COACH_CARDS, LEGEND_CARDS, SQUAD_SLOTS, personOf } from '../src/engine/cards'
import type { Squad } from '../src/engine/cards'
import { regionName, regionOf } from '../src/engine/nationRegion'

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
function fiveOf(region: string, pool = BASE_PLAYER_CARDS as readonly { id: string; nat?: string | null; rating: number; roles: string[] }[]): Squad {
  const list = pool.filter((c) => regionOf(c.nat) === region).slice().sort((a, b) => b.rating - a.rating)
  const used = new Set<string>()
  const slots = SQUAD_SLOTS.map((slot) => {
    const p = list.find((c) => !used.has(personOf(c as never)) && c.roles.includes(slot))
    if (p) used.add(personOf(p as never))
    return p?.id ?? null
  })
  return { slots, coach: COACH_CARDS.find((c) => regionOf((c as { nat?: string }).nat) === region)?.id ?? null }
}
const why = (r: ReturnType<typeof leagueEntry>) => (r.ok ? '' : r.why)

check('地区杯是全服杯的一个赛制，有自己的标签页', CUP_LEAGUES.includes('region') && !(OPEN_CUP_TABS as readonly string[]).includes('region'))
check('香港、澳门算中国', regionOf('HK') === 'cn' && regionOf('mo') === 'cn')
check('中国台湾单独一个地区', regionOf('tw') === 'tw' && regionName('tw') === '中国台湾')
const kr = fiveOf('kr'), tw = fiveOf('tw'), cn = fiveOf('cn')
check('全韩国阵容能报', leagueEntry(kr, 'region').ok, why(leagueEntry(kr, 'region')))
check('全中国台湾阵容能报', leagueEntry(tw, 'region').ok, why(leagueEntry(tw, 'region')))
check('全中国阵容能报', leagueEntry(cn, 'region').ok, why(leagueEntry(cn, 'region')))
const mixed = { slots: [...cn.slots.slice(0, 4), tw.slots[4]], coach: cn.coach }
const m = leagueEntry(mixed, 'region')
check('中国阵容里混一个中国台湾选手就不行', !m.ok && why(m).includes('中国台湾'), why(m))
const foreignCoach = { slots: kr.slots, coach: cn.coach }
check('教练也要同一地区', !leagueEntry(foreignCoach, 'region').ok, why(leagueEntry(foreignCoach, 'region')))
check('没有教练不行', !leagueEntry({ slots: kr.slots, coach: null }, 'region').ok)
check('不限赛不管地区', leagueEntry(mixed, 'free').ok)
// 卡色不限: a 彩卡 of the right 地区 is fine
const legendKr = LEGEND_CARDS.find((c) => regionOf(c.nat) === 'kr' && c.roles.includes(SQUAD_SLOTS[2]))
if (legendKr) {
  const withLegend = { slots: kr.slots.map((id, i) => (i === 2 ? legendKr.id : id)), coach: kr.coach }
  check('同地区的彩卡也能上', leagueEntry(withLegend, 'region').ok, why(leagueEntry(withLegend, 'region')))
}
console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
