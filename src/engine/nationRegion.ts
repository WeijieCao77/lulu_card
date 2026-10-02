/**
 * 地区杯's 地区 (owner, 2026-10-02): a player's nationality, with Hong Kong and Macau counted as
 * 中国 and Taiwan as its own 地区, named 中国台湾. The cup is called 地区杯 and never 国家 on screen.
 */
import { cardById, isCoachCard, isPlayerCard } from './cards'
import type { Squad } from './cards'
import { natName } from './nat'

/** A 地区 code: the nationality, lower case, with hk and mo folded into cn; tw stays its own. */
export const regionOf = (nat: string | null | undefined): string | null => {
  const k = (nat ?? '').toLowerCase()
  if (!k) return null
  return k === 'hk' || k === 'mo' ? 'cn' : k
}

/** 中国 / 中国台湾 / 韩国 … */
export const regionName = (r: string): string => natName(r)

/** The 地区 a lineup plays for — five players and a coach, all one 地区 — or why it cannot. */
export function squadRegion(squad: Squad): { ok: true; region: string } | { ok: false; why: string } {
  const ids = [...squad.slots, squad.coach]
  if (ids.some((id) => !id)) return { ok: false, why: '地区杯要五名选手加一名教练，六个人都要上。' }
  const cards = ids.map((id) => cardById(id!))
  if (cards.some((c) => !c || !(isPlayerCard(c) || isCoachCard(c)))) return { ok: false, why: '阵容里有认不出的卡。' }
  const regions = cards.map((c) => regionOf((c as { nat?: string | null }).nat))
  if (regions.some((r) => !r)) return { ok: false, why: '阵容里有国籍未知的卡，进不了地区杯。' }
  const set = [...new Set(regions as string[])]
  if (set.length > 1) return { ok: false, why: `地区杯要六个人同一地区，现在有 ${set.map(regionName).join('、')}。` }
  return { ok: true, region: set[0] }
}
