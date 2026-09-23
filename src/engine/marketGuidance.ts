import type { MarketHistoryReply } from './market'
import { MAX_LEVEL } from './cards'
import { sparesOf } from './inbox'

const MIN_PRICE = 1
const MAX_PRICE = 500_000
const DAY_MS = 86_400_000

const ensureFinitePositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= MIN_PRICE && value <= MAX_PRICE

const ensureValidTime = (value: unknown, now: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now && value >= now - 30 * DAY_MS

/**
 * Suggest from same-level samples among the newest 8 sales for this card.
 * The history endpoint returns the newest 8 matching sales overall; we never
 * mix levels or fall back to an all-time average.
 */
export function suggestMarketPrice(
  data: MarketHistoryReply | null | undefined,
  cardId: string,
  level: number,
  floor: number | null,
  now: number = Date.now(),
): { price: number; median: number; sample: number; days: 7 | 30; floorApplied: boolean } | null {
  if (!data || data.ok !== true || data.cardId !== cardId) return null
  if (!cardId || typeof cardId !== 'string') return null
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return null
  if (floor === null || !Number.isFinite(floor) || !Number.isInteger(floor) || floor < MIN_PRICE || floor > MAX_PRICE) return null
  if (!Number.isFinite(now) || now <= 0) return null

  const recent = Array.isArray(data.recent) ? data.recent : []
  const typedRecent = recent.filter((entry): entry is { price: number; level: number; at: string } => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as { price?: unknown; level?: unknown; at?: unknown }
    return typeof candidate.price === 'number' && typeof candidate.level === 'number' && typeof candidate.at === 'string' && Number.isFinite(Date.parse(candidate.at))
  })

  const sorted = typedRecent.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  const newest8 = sorted.slice(0, 8)

  const validSameLevel = newest8.filter((entry): entry is { price: number; level: number; at: string } => {
    if (!ensureFinitePositiveInteger(entry.price)) return false
    if (!Number.isInteger(entry.level) || entry.level !== level) return false
    const time = Date.parse(entry.at)
    if (!Number.isFinite(time) || !ensureValidTime(time, now)) return false
    return true
  })

  if (validSameLevel.length < 3) return null

  const sevenDayCutoff = now - 7 * DAY_MS
  const sevenDaySales = validSameLevel.filter((entry) => Date.parse(entry.at) >= sevenDayCutoff)
  const days: 7 | 30 = sevenDaySales.length >= 3 ? 7 : 30
  const sample = days === 7 ? sevenDaySales : validSameLevel

  if (sample.length < 3) return null

  const prices = sample.map((entry) => entry.price).sort((a, b) => a - b)
  const median = prices.length % 2 === 1
    ? prices[(prices.length - 1) / 2]
    : Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)

  const effectiveFloor = floor
  const clampedMedian = Math.min(MAX_PRICE, Math.max(effectiveFloor, median))

  return {
    price: clampedMedian,
    median,
    sample: sample.length,
    days,
    floorApplied: clampedMedian !== median,
  }
}

/**
 * The level a sale should use for this owned card. Kept in sync with the
 * server's escrow rules: duplicate count first, otherwise the lowest upgraded
 * spare, otherwise the main card level.
 */
export function marketSaleLevel(owned: { level: number; dupes: number; spares?: unknown } | undefined): number | null {
  if (!owned) return null
  const level = Number(owned.level)
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return null
  const dupes = Number(owned.dupes) || 0
  if (dupes > 0) return 0
  const spares = sparesOf(owned)
  if (spares.length > 0) return spares[0]
  return level
}

export function hasMarketDuplicates(owned: { level: number; dupes: number; spares?: unknown } | undefined): boolean {
  if (!owned) return false
  const level = Number(owned.level)
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return false
  const dupes = Number(owned.dupes) || 0
  return dupes > 0 || sparesOf(owned).length > 0
}
