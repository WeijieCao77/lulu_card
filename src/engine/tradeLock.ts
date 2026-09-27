/**
 * Which copies of a card may leave the account through the market or a swap (owner, 2026-09-27).
 *
 * Two locks, both counted per card rather than pinned to a particular copy — every plain copy of a
 * card is the same thing, so what matters is how many of them may go:
 *
 *   bound  a copy pulled in the account's first BOUND_PULLS pulls. The starter packs and the starter
 *          coins are spent there, so a throwaway account made for its free pulls has nothing it can
 *          pass to a main. Bound copies play, level and salvage like any other; they never trade.
 *          Counted among the card itself and its plain duplicates (a pull is always a plain copy).
 *   holds  a copy that arrived by trade — bought on the market or received in a swap — may not be
 *          listed or swapped again for HOLD_MS, so a card cannot be walked through a ring of accounts
 *          in an afternoon. One expiry time per such copy.
 *
 * Using copies up inside the account (levelling, salvage) spends locked ones first: the player loses
 * nothing to the lock, and the free copies are the ones left to trade.
 */
import type { GachaState, OwnedCard } from './gacha'

/**
 * How many of an account's first pulls are bound. OFF (0) for now (owner, 2026-09-27: binding every card a
 * new account pulls is too strict — kept here, not live, while the rule is rethought). 50 would match the
 * market's pull gate (release-policy tradePulls).
 */
export const BOUND_PULLS = 0
export const HOLD_DAYS = 3
export const HOLD_MS = HOLD_DAYS * 86_400_000

const count = (raw: unknown): number => {
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}
const sparesCount = (owned: OwnedCard): number => (Array.isArray(owned.spares) ? owned.spares.length : 0)

/** Every copy the account holds of this card: the card, its plain duplicates, its upgraded spares. */
export const copiesOf = (owned: OwnedCard): number => 1 + count(owned.dupes) + sparesCount(owned)

/** Bound copies, never more than the card and its plain duplicates. */
export const boundOf = (owned: OwnedCard): number => Math.min(count(owned.bound), 1 + count(owned.dupes))

/** Traded-in copies still inside their hold at `now`. */
export const heldOf = (owned: OwnedCard, now: number): number =>
  (Array.isArray(owned.holds) ? owned.holds : []).filter((t) => Number(t) > now).length

/** How many copies may be listed or swapped right now. */
export function tradeableCopies(owned: OwnedCard | undefined, now: number): number {
  if (!owned) return 0
  return Math.max(0, copiesOf(owned) - boundOf(owned) - heldOf(owned, now))
}

/** When the next held copy is free to trade, if a hold is what stands in the way. */
export function nextRelease(owned: OwnedCard | undefined, now: number): number | null {
  const live = (Array.isArray(owned?.holds) ? owned!.holds : []).map(Number).filter((t) => t > now).sort((a, b) => a - b)
  return live.length ? live[0] : null
}

/** A pulled copy just landed on this card; bind it if the account is still inside its first pulls. */
export function notePull(owned: OwnedCard, pullIndex: number, limit = BOUND_PULLS): void {
  if (pullIndex < limit) owned.bound = count(owned.bound) + 1
}

/** A copy arrived by trade at `at`: hold it. Expired holds are dropped while we are here. */
export function noteTradedIn(owned: OwnedCard, at: number): void {
  const live = (Array.isArray(owned.holds) ? owned.holds : []).map(Number).filter((t) => t > at)
  live.push(at + HOLD_MS)
  owned.holds = live
}

/**
 * `n` plain duplicates were used up inside the account (levelling, salvage): locked copies go first.
 * Bound duplicates are the bound count beyond the card itself.
 */
export function spendDupes(owned: OwnedCard, n: number, now: number): void {
  let left = count(n)
  const b = count(owned.bound)
  const boundDupes = Math.max(0, b - 1)
  const fromBound = Math.min(left, boundDupes)
  if (fromBound) owned.bound = b - fromBound
  left -= fromBound
  if (left > 0 && Array.isArray(owned.holds)) {
    const live = owned.holds.map(Number).filter((t) => t > now).sort((a, b) => a - b)
    owned.holds = live.slice(Math.min(left, live.length))
  }
  tidy(owned, now)
}

/** Clamp the locks to what the card actually holds and drop the empty fields. */
export function tidy(owned: OwnedCard, now: number): void {
  const b = boundOf(owned)
  if (b > 0) owned.bound = b
  else delete owned.bound
  // never more holds than copies that are not already bound; the latest expiries are the ones kept
  const room = Math.max(0, copiesOf(owned) - b)
  const live = (Array.isArray(owned.holds) ? owned.holds : []).map(Number)
    .filter((t) => Number.isFinite(t) && t > now).sort((a, b) => a - b).slice(-room)
  if (room > 0 && live.length) owned.holds = live
  else delete owned.holds
}

/** A message for a card that has copies but none that may trade now. */
export function lockedWhy(owned: OwnedCard | undefined, now: number): string | null {
  if (!owned || tradeableCopies(owned, now) > 0) return null
  const release = nextRelease(owned, now)
  if (heldOf(owned, now) > 0 && release) {
    const hours = Math.ceil((release - now) / 3_600_000)
    return `这张卡是交易得来的，${hours >= 24 ? `${Math.ceil(hours / 24)} 天` : `${hours} 小时`}后才能再挂牌或交换`
  }
  return `这张卡是开局前 ${BOUND_PULLS} 抽开出的绑定卡，可以使用、升级和分解，不能交易`
}

export type { GachaState }
