/**
 * 进修: past +5, one attribute at a time, paid in cards (ported from 开瓦包, 2026-10-07).
 *
 * A card can only be raised five levels, and once every card a player cares about is at +5 there was nothing
 * left to do with it. 进修 is a place where a finished card keeps growing in ONE direction, fed five spare
 * copies that are either of its position or strong in the thing being trained.
 *
 * The number that moves is the attribute itself. What that is worth in a match is what the attribute was always
 * worth: a player's rating IS the role-weighted sum of his attributes (ROLE_WEIGHT in player.ts, the same table the
 * world was built with), so +3 操作 on a 上单 is 0.84 of a rating point and +3 运营 on him is 0.06. Choosing what to
 * train is the decision, and the card's position makes it.
 *
 * That rating goes where a level's goes: through the level callback every match and every 阵容分 already reads
 * (`playLevel` adds it as a fraction of a level above +5), so paper, the arena, 战力, cup registrations and the
 * fives other players meet all carry it without a second channel.
 *
 * Which cards (owner, 2026-10-07): ordinary player cards and 峡谷回响 cards train and feed; a 彩卡 and a coach
 * card do neither. Materials are spare copies (duplicates) only — the card in the collection is never eaten, so
 * a 进修 can not empty a squad, a preset or a 图鉴. A trained card trades with its 进修 (inbox.ts escrowCard).
 */
import { EVO_LEVEL_ROOM, LEVEL_GAIN, MAX_LEVEL, cardById, cardName, isPlayerCard } from './cards'
import type { Card, PlayerCard } from './cards'
import { ROLE_WEIGHT } from './player'
import { ATTR_CN, ATTR_KEYS } from './types'
import type { Attrs } from './types'
import type { GachaState } from './gacha'
import { spendDupes } from './tradeLock'

export type AttrKey = keyof Attrs

/** what 进修 has added to one card */
export interface Evo {
  /** how many times it has been trained */
  n: number
  /** points added, per attribute */
  add: Partial<Record<AttrKey, number>>
}

/** 进修 a card can take */
export const EVO_STEPS = 5
/** cards eaten by one */
export const EVO_FEED = 5
/** a material of another position still qualifies when it is at least this good at the attribute */
export const EVO_HIGH = 80
/**
 * Points one 进修 adds, from the five materials' average in the attribute: five weak copies of the position
 * buy a point, five that are good at it three.
 */
export const EVO_GAIN = [
  { at: 88, gain: 3 },
  { at: 78, gain: 2 },
  { at: 0, gain: 1 },
] as const
export const evoGainFor = (avg: number): number => (EVO_GAIN.find((t) => avg >= t.at) ?? EVO_GAIN[EVO_GAIN.length - 1]).gain

/**
 * A card 进修 works on, and a card that may be fed to one: an ordinary player card or a 峡谷回响 card.
 * Never a 彩卡 (a night's snapshot, rarity mythic) and never a coach.
 */
export const canEvolve = (c: Card | undefined): c is PlayerCard =>
  isPlayerCard(c) && c.rarity !== 'mythic' && !c.legend

const whole = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}

/** A stored evo, or nothing — never NaN, never more than the rules allow. */
export function cleanEvo(raw: unknown): Evo | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as { n?: unknown; add?: unknown }
  const n = Math.min(EVO_STEPS, whole(r.n))
  const add: Partial<Record<AttrKey, number>> = {}
  const src = r.add && typeof r.add === 'object' && !Array.isArray(r.add) ? (r.add as Record<string, unknown>) : {}
  let total = 0
  for (const k of ATTR_KEYS) {
    const v = Math.min(99, whole(src[k]))
    if (v > 0) { add[k] = v; total += v }
  }
  if (!n || !total) return undefined
  return { n, add }
}

/** the role a card is judged on — its first */
const weights = (card: PlayerCard) => ROLE_WEIGHT[card.role] ?? ROLE_WEIGHT.辅助

/** Room left in an attribute before 99. */
const roomIn = (card: PlayerCard, evo: Evo | undefined, k: AttrKey): number =>
  Math.max(0, 99 - card.attrs[k] - (evo?.add[k] ?? 0))

/** The card's attributes after 进修. */
export function evoAttrs(card: PlayerCard, evo: Evo | undefined): Attrs {
  const out = { ...card.attrs }
  for (const k of ATTR_KEYS) out[k] = Math.min(99, out[k] + (evo?.add[k] ?? 0))
  return out
}

/** What 进修 is worth in rating: the attributes it raised, weighted the way the card's position is judged. */
export function evoRating(card: PlayerCard, evo: Evo | undefined): number {
  if (!evo) return 0
  const w = weights(card)
  let r = 0
  for (const k of ATTR_KEYS) r += w[k] * (evo.add[k] ?? 0)
  return r
}

/** One attribute point on this card, in rating. */
export const evoWorth = (card: PlayerCard, k: AttrKey): number => weights(card)[k]

/**
 * The level a match reads: the card's own 0–5, and at +5 the 进修 on top as a fraction of a level. Integer and
 * identical to the old level for every card that has not been trained, and for every card 进修 does not apply to.
 */
export function playLevel(cardId: string, owned: { level?: unknown; evo?: unknown } | undefined | null): number {
  if (!owned) return 0
  const level = Math.min(MAX_LEVEL, whole(owned.level))
  if (level < MAX_LEVEL) return level
  const card = cardById(cardId)
  if (!canEvolve(card)) return level
  const evo = cleanEvo(owned.evo)
  return evo ? level + Math.min(EVO_LEVEL_ROOM, evoRating(card, evo) / LEVEL_GAIN) : level
}

/** Why a spare copy can feed this 进修: it plays the position, it is good at the attribute, or it cannot. */
export function feedReason(target: PlayerCard, attr: AttrKey, material: Card | undefined): 'role' | 'attr' | null {
  if (!canEvolve(material)) return null
  if (material.roles.some((r) => target.roles.includes(r))) return 'role'
  if (material.attrs[attr] >= EVO_HIGH) return 'attr'
  return null
}

export interface EvoPreview {
  ok: boolean
  why?: string
  /** points this would add (after the 99 ceiling) */
  gain: number
  /** the five's average in the attribute */
  avg: number
  /** rating it would add */
  rating: number
}

/** What feeding these five would do — the page shows it before the button, the action applies it. */
export function evoPreview(g: GachaState, targetId: string, attr: string, feed: readonly string[]): EvoPreview {
  const no = (why: string): EvoPreview => ({ ok: false, why, gain: 0, avg: 0, rating: 0 })
  const target = cardById(targetId)
  const owned = g.cards[targetId]
  if (!owned || !isPlayerCard(target)) return no('只有自己的选手卡能进修')
  if (!canEvolve(target)) return no('彩卡不能进修')
  if (whole(owned.level) < MAX_LEVEL) return no(`先升到 +${MAX_LEVEL} 才能进修`)
  if (!(ATTR_KEYS as string[]).includes(attr)) return no('先选一项能力')
  const k = attr as AttrKey
  const evo = cleanEvo(owned.evo)
  if ((evo?.n ?? 0) >= EVO_STEPS) return no(`已经进修 ${EVO_STEPS} 次，满了`)
  if (roomIn(target, evo, k) <= 0) return no(`${ATTR_CN[k]}已经 99`)
  if (feed.length !== EVO_FEED) return no(`要放 ${EVO_FEED} 张卡`)
  // the same card may be fed more than once, as long as there are that many spare copies of it
  const want = new Map<string, number>()
  for (const id of feed) want.set(id, (want.get(id) ?? 0) + 1)
  let sum = 0
  for (const [id, n] of want) {
    const c = cardById(id)
    if (!isPlayerCard(c)) return no('只能用选手卡')
    if (!canEvolve(c)) return no(`${cardName(c)} 是彩卡，不能用来进修`)
    if (whole(g.cards[id]?.dupes) < n) return no(`${cardName(c)} 的重复卡不够 ${n} 张`)
    if (!feedReason(target, k, c)) return no(`${cardName(c)} 不是同位置，${ATTR_CN[k]}也不到 ${EVO_HIGH}`)
    sum += c.attrs[k] * n
  }
  const avg = sum / EVO_FEED
  const gain = Math.min(evoGainFor(avg), roomIn(target, evo, k))
  return { ok: true, gain, avg, rating: gain * evoWorth(target, k) }
}

/** 进修 once: the five spare copies go, the attribute goes up. */
export function evolve(
  g: GachaState, targetId: string, attr: string, feed: readonly string[], now = Date.now(),
): { ok: true; gain: number; attr: AttrKey; evo: Evo } | { ok: false; why: string } {
  const p = evoPreview(g, targetId, attr, feed)
  if (!p.ok) return { ok: false, why: p.why ?? '进修不了' }
  const k = attr as AttrKey
  const want = new Map<string, number>()
  for (const id of feed) want.set(id, (want.get(id) ?? 0) + 1)
  for (const [id, n] of want) {
    const o = g.cards[id]
    o.dupes = whole(o.dupes) - n
    // used up inside the account: locked copies (bound, on hold) go first, as levelling spends them (tradeLock.ts)
    spendDupes(o, n, now)
  }
  const owned = g.cards[targetId]
  const was = cleanEvo(owned.evo) ?? { n: 0, add: {} }
  const evo: Evo = { n: was.n + 1, add: { ...was.add, [k]: (was.add[k] ?? 0) + p.gain } }
  owned.evo = evo
  return { ok: true, gain: p.gain, attr: k, evo }
}

/** 「+5↑」: a play level as text — the whole level, and an arrow when 进修 rides above it (as on the card face). */
export const levelText = (lv: number): string =>
  `+${Math.max(0, Math.min(MAX_LEVEL, Math.floor(lv)))}${lv > MAX_LEVEL ? '↑' : ''}`
