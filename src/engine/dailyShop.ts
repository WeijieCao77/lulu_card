/**
 * 每日商店 (owner, 2026-09-27, a player's idea after VALORANT's store): five cards a day, each account its
 * own — four players and one coach — at fixed prices, refreshed at 00:00 Beijing time.
 *
 * The shelf is rolled on the server the first time an account asks for it that day and kept in the save
 * (a server-owned key), so a client cannot reroll it by editing its copy. No 彩卡: those stay with packs and
 * the floor. One player slot prefers a card the account does not have yet, to help a collection along.
 * Each slot sells once. A card bought here goes in like one bought on the market: it plays, levels and
 * salvages at once, and may be listed or swapped after the same hold (engine/tradeLock.ts).
 */
import { BASE_PLAYER_CARDS, COACH_CARDS } from './cards'
import type { Card, Rarity } from './cards'
import type { GachaState } from './gacha'
import { Rng } from './rng'
import { noteTradedIn } from './tradeLock'

export const SHOP_PLAYERS = 4
export const SHOP_COACHES = 1
export const SHOP_PRICE: Record<'bronze' | 'silver' | 'gold', number> = { bronze: 300, silver: 900, gold: 3500 }
/** a slot's metal: gold 12%, silver 33%, bronze 55% */
export const SHOP_ODDS: [Rarity, number][] = [['gold', 0.12], ['silver', 0.33], ['bronze', 0.55]]

export interface ShopSlot {
  cardId: string
  price: number
  /** the slot that looked for a card this account did not have when the shelf was rolled */
  fresh?: boolean
  bought?: boolean
}
export interface DailyShop {
  /** YYYY-MM-DD, Asia/Shanghai */
  day: string
  slots: ShopSlot[]
}

type Metal = 'bronze' | 'silver' | 'gold'
const metals = (cards: readonly Card[]) => ({
  gold: cards.filter((c) => c.rarity === 'gold'),
  silver: cards.filter((c) => c.rarity === 'silver'),
  bronze: cards.filter((c) => c.rarity === 'bronze'),
})
const PLAYERS = metals(BASE_PLAYER_CARDS.filter((c) => !c.legend))
const COACHES = metals(COACH_CARDS.filter((c) => !c.legend))

function rollMetal(rng: Rng): Metal {
  let r = rng.next()
  for (const [m, p] of SHOP_ODDS) {
    if (r < p) return m as Metal
    r -= p
  }
  return 'bronze'
}

/** Roll a shelf. `seed` is the server's entropy; nothing about it has to be reproducible. */
export function rollShop(g: GachaState, day: string, seed: number): DailyShop {
  const rng = new Rng((seed >>> 0) ^ 0x5b0a7)
  const taken = new Set<string>()
  const slots: ShopSlot[] = []
  const pick = (pool: Record<Metal, Card[]>, metal: Metal, prefer?: (c: Card) => boolean): Card | null => {
    for (const m of [metal, 'silver', 'bronze'] as Metal[]) {
      const all = pool[m].filter((c) => !taken.has(c.id))
      const want = prefer ? all.filter(prefer) : []
      const list = want.length ? want : all
      if (list.length) return rng.pick(list)
    }
    return null
  }
  for (let i = 0; i < SHOP_PLAYERS; i++) {
    const metal = rollMetal(rng)
    const fresh = i === 0
    const card = pick(PLAYERS, metal, fresh ? (c) => !g.cards[c.id] : undefined)
    if (!card) continue
    taken.add(card.id)
    slots.push({ cardId: card.id, price: SHOP_PRICE[card.rarity as Metal] ?? SHOP_PRICE.bronze, ...(fresh && !g.cards[card.id] ? { fresh: true } : {}) })
  }
  for (let i = 0; i < SHOP_COACHES; i++) {
    const card = pick(COACHES, rollMetal(rng))
    if (!card) continue
    taken.add(card.id)
    slots.push({ cardId: card.id, price: SHOP_PRICE[card.rarity as Metal] ?? SHOP_PRICE.bronze })
  }
  // the fresh slot shows first among the players, then the rest, the coach last
  return { day, slots }
}

/** Today's shelf, rolled if the account has none for today yet. Returns whether it changed. */
export function ensureShop(g: GachaState, today: string, seed: number): boolean {
  if (g.shop && g.shop.day === today && g.shop.slots.length) return false
  g.shop = rollShop(g, today, seed)
  return true
}

/** Buy a slot of today's shelf. */
export function buyShop(g: GachaState, slot: number, today: string, now: number): { ok: true; cardId: string; price: number } | { ok: false; why: string } {
  const shop = g.shop
  if (!shop || shop.day !== today) return { ok: false, why: '商店已经刷新了，刷新页面再看看。' }
  const s = shop.slots[slot]
  if (!s) return { ok: false, why: '没有这件商品。' }
  if (s.bought) return { ok: false, why: '这张卡今天已经买过了。' }
  if (!Number.isFinite(g.coins) || g.coins < s.price) return { ok: false, why: '金币不够。' }
  g.coins -= s.price
  s.bought = true
  const had = g.cards[s.cardId]
  if (had) {
    had.dupes++
    had.seen++
  } else {
    g.cards[s.cardId] = { id: s.cardId, level: 0, dupes: 0, seen: 1, got: today }
  }
  // like a card bought on the market: tradeable after the hold
  noteTradedIn(g.cards[s.cardId], now)
  return { ok: true, cardId: s.cardId, price: s.price }
}

/** Keep only a well-formed shelf from a save. */
export function cleanShop(raw: unknown): DailyShop | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const day = typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : ''
  if (!day || !Array.isArray(r.slots)) return undefined
  const slots = r.slots.slice(0, SHOP_PLAYERS + SHOP_COACHES).flatMap((x): ShopSlot[] => {
    if (!x || typeof x !== 'object') return []
    const o = x as Record<string, unknown>
    const cardId = typeof o.cardId === 'string' ? o.cardId : ''
    const price = Number(o.price)
    if (!cardId || !Number.isFinite(price) || price <= 0) return []
    return [{ cardId, price: Math.trunc(price), ...(o.fresh ? { fresh: true } : {}), ...(o.bought ? { bought: true } : {}) }]
  })
  return slots.length ? { day, slots } : undefined
}
