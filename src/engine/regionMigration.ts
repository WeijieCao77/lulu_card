import type { GachaState } from './gacha'
import { gameRegionOf, type GameRegion } from './gameRegions'

/** Historical pack IDs are accepted only when migrating inventory or delivered mail. */
export const LEGACY_REGION_PACKS = ['ame', 'emea', 'lcp', 'cblol'] as const
export const isLegacyRegionPack = (raw: unknown): boolean =>
  typeof raw === 'string' && (LEGACY_REGION_PACKS as readonly string[]).includes(raw)
export const canonicalRegionPack = (raw: string): string => isLegacyRegionPack(raw) ? 'west' : raw

const count = (raw: unknown): number =>
  typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 0

/**
 * Destructive only to obsolete keys: quantities are added, never exchanged for coins.
 * Claim counts are contiguous tiers, so max preserves every already-paid tier.
 * Neither owned cards nor market/cup snapshots are part of this migration.
 */
export function migrateRegions(state: GachaState, rewardCount: number): void {
  if (state.series && typeof state.series === 'object') {
    const next: Partial<Record<GameRegion, number>> = {}
    for (const [rawKey, rawValue] of Object.entries(state.series)) {
      const region = gameRegionOf(rawKey)
      if (!region) continue
      const n = Math.min(rewardCount, count(rawValue))
      next[region] = Math.max(next[region] ?? 0, n)
    }
    state.series = next
  }
  if (state.packs && typeof state.packs === 'object') {
    const hasLegacy = LEGACY_REGION_PACKS.some(k => Object.hasOwn(state.packs, k))
    if (hasLegacy) {
      let west = count(state.packs.west)
      for (const key of LEGACY_REGION_PACKS) {
        west += count(state.packs[key])
        delete state.packs[key]
      }
      state.packs.west = west
    }
  }
}
