import type { Attrs } from './types'
import { gameRegionOf } from './gameRegions'
import { clamp } from './rng'

/** Card data version; independent of the match win-probability curve. */
export const CARD_BALANCE_VERSION = 4

interface RegionParams {
  min: number
  silver: number
  gold: number
  max: number
  top: number
}

const REGION_PARAMS: Record<string, RegionParams> = {
  LPL: { min: 63, silver: 75, gold: 78, max: 85, top: 90 },
  LCK: { min: 55, silver: 70, gold: 80, max: 93, top: 90 },
  WEST: { min: 50, silver: 66, gold: 71, max: 77, top: 88 }
}

function interpolateRating(s: number, params: RegionParams): number {
  if (s >= params.gold) {
    return 84 + (s - params.gold) * (params.top - 84) / (params.max - params.gold)
  } else if (s >= params.silver) {
    return 72 + (s - params.silver) * 11 / (params.gold - 1 - params.silver)
  } else {
    return 50 + (s - params.min) * 21 / (params.silver - 1 - params.min)
  }
}

export function ordinaryRating(source: number, region: unknown): number {
  const group = gameRegionOf(region)
  if (!group || !Number.isFinite(source)) return source
  const params = REGION_PARAMS[group]
  return clamp(Math.round(interpolateRating(source, params)), 50, params.top)
}

export function ordinaryCardStats(p: {
  overall: number; sourceOverall?: number; attrs: Attrs; region: string
}): { attrs: Attrs; rating: number } {
  if (!gameRegionOf(p.region) || !Number.isFinite(p.sourceOverall)) {
    return { attrs: { ...p.attrs }, rating: p.overall }
  }
  const rating = ordinaryRating(p.sourceOverall!, p.region)
  const delta = rating - p.overall
  const attrs = { ...p.attrs }
  for (const key of Object.keys(attrs) as (keyof Attrs)[]) {
    attrs[key] = clamp(Math.round(attrs[key] + delta), 1, 99)
  }
  return { attrs, rating }
}
