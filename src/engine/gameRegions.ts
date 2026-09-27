/** Game regions (2026-09-27): LPL, LCK, LEC, LCS, and 其他 = LCP + CBLOL. */
export type GameRegion = 'LPL' | 'LCK' | 'LEC' | 'LCS' | 'WEST'
export const GAME_REGIONS = ['LPL', 'LCK', 'LEC', 'LCS', 'WEST'] as const
export const GAME_REGION_CN = { LPL: 'LPL', LCK: 'LCK', LEC: 'LEC', LCS: 'LCS', WEST: '其他' } as const

export function gameRegionOf(raw: unknown): GameRegion | undefined {
  if (typeof raw !== 'string') return undefined
  switch (raw) {
    case 'LPL': return 'LPL'
    case 'LCK': return 'LCK'
    case 'LEC': return 'LEC'
    case 'LCS': return 'LCS'
    case 'LCP':
    case 'CBLOL':
    case 'WEST': return 'WEST'
    default: return undefined
  }
}

export function sameGameRegion(a: unknown, b: unknown): boolean {
  const left = gameRegionOf(a)
  return left !== undefined && left === gameRegionOf(b)
}
