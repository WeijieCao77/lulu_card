export type GameRegion = 'LPL' | 'LCK' | 'WEST'
export const GAME_REGIONS = ['LPL', 'LCK', 'WEST'] as const
export const GAME_REGION_CN = { LPL: 'LPL', LCK: 'LCK', WEST: '欧美' } as const

export function gameRegionOf(raw: unknown): GameRegion | undefined {
  if (typeof raw !== 'string') return undefined
  switch (raw) {
    case 'LPL': return 'LPL'
    case 'LCK': return 'LCK'
    case 'LEC':
    case 'LCS':
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
