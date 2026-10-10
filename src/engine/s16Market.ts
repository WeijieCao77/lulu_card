/**
 * S16 世界赛交易区的开市时间 — the one rule the server and the market page both read.
 *
 * The owner's rules (2026-10-10): S16 cards trade in their own section, open every day 10:00–20:00 Beijing time
 * and closed the rest. A card listed in the small hours from an alt and bought by the same player's main with
 * nobody else awake is the thing it stops: every S16 auction runs inside the window and ends at that day's close,
 * so everybody who cares about the card had the afternoon to see it and bid.
 *
 *   - outside the window the server takes no new S16 listing and no bid on one; S16 cards are not swapped
 *   - an S16 listing has no 一口价, and it ends at the close of the day it was listed (no anti-snipe past it)
 *   - no new S16 listing in the last `lastListMinutes` before the close: a 20-minute auction is not an auction
 *
 * That holds until the final. From `freezeFrom` (the close of the last window before it) S16 trading stops
 * altogether, and from `normalFrom` — set once the final's results are in — S16 cards trade like any other card:
 * the ordinary shelf and rules, any length, 一口价 allowed, swaps allowed.
 *
 * The hours and both dates live in src/data/s16Market.json. The server decides with its own clock; the page runs
 * the same function on the server's `now` only to draw the banner and grey out the buttons.
 */
import CFG from '../data/s16Market.json'

const HOUR = 3_600_000
const DAY = 24 * HOUR

export const S16_MARKET = {
  utcOffsetHours: CFG.utcOffsetHours,
  openHour: CFG.openHour,
  closeHour: CFG.closeHour,
  lastListMinutes: CFG.lastListMinutes,
  /** S16 trading stops here (the close of the last window before the final) */
  freezeFrom: Date.parse(CFG.freezeFrom),
  /** …and comes back as ordinary trading here (once the final's results are in) */
  normalFrom: Date.parse(CFG.normalFrom),
} as const

/**
 * `window`: the daily section, open or shut; `frozen`: no S16 trading between the last window and the results;
 * `normal`: after the event, S16 cards trade like every other card.
 */
export type S16Mode = 'window' | 'frozen' | 'normal'

export interface S16Window {
  mode: S16Mode
  /** S16 cards can be listed and bid on right now (always, in `normal`) */
  open: boolean
  /** while open: when this window opened; while shut: when trading next opens (ms since the epoch) */
  opensAt: number
  /** the close of that window (ms) — the `ends` of every S16 auction listed in it; null when there is none */
  closesAt: number | null
  /** the last moment a new S16 listing is taken in that window (ms); null when there is no such limit */
  listUntil: number | null
  /** a new S16 listing would be taken now */
  canList: boolean
}

/** The S16 trading window as it stands at `nowMs`: the current one while open, the next one while shut. */
export function s16MarketWindow(nowMs: number): S16Window {
  const { freezeFrom, normalFrom } = S16_MARKET
  if (nowMs >= normalFrom) return { mode: 'normal', open: true, opensAt: normalFrom, closesAt: null, listUntil: null, canList: true }
  if (nowMs >= freezeFrom) return { mode: 'frozen', open: false, opensAt: normalFrom, closesAt: null, listUntil: null, canList: false }
  const off = S16_MARKET.utcOffsetHours * HOUR
  // midnight of the Beijing day `nowMs` falls in, as an epoch instant
  const midnight = Math.floor((nowMs + off) / DAY) * DAY - off
  let opensAt = midnight + S16_MARKET.openHour * HOUR
  let closesAt = midnight + S16_MARKET.closeHour * HOUR
  if (nowMs >= closesAt) { opensAt += DAY; closesAt += DAY }
  // the next window would open after trading has stopped for the final
  if (opensAt >= freezeFrom) return { mode: 'frozen', open: false, opensAt: normalFrom, closesAt: null, listUntil: null, canList: false }
  closesAt = Math.min(closesAt, freezeFrom)
  const listUntil = closesAt - S16_MARKET.lastListMinutes * 60_000
  const open = nowMs >= opensAt && nowMs < closesAt
  return { mode: 'window', open, opensAt, closesAt, listUntil, canList: open && nowMs < listUntil }
}

/** whether S16 cards are under the section's own rules at `nowMs` (false once they trade like ordinary cards) */
export const s16Gated = (nowMs: number): boolean => nowMs < S16_MARKET.normalFrom

const pad = (n: number) => String(n).padStart(2, '0')
const bj = (ms: number) => new Date(ms + S16_MARKET.utcOffsetHours * HOUR)
/** 「10:00」 in Beijing time, whatever the reader's own time zone */
export const s16Clock = (ms: number): string => { const d = bj(ms); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
/** 「11 月 15 日 12:00」 in Beijing time */
export const s16Date = (ms: number): string => { const d = bj(ms); return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日 ${s16Clock(ms)}` }
/** the Beijing calendar day of an instant, as a day number */
const bjDay = (ms: number) => Math.floor((ms + S16_MARKET.utcOffsetHours * HOUR) / DAY)

/** 「3 小时 12 分」 — never rounded to nothing, so the last minute reads 「1 分」 and not 「0 分」 */
export function s16Left(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000))
  const h = Math.floor(m / 60)
  return h ? `${h} 小时 ${m % 60} 分` : `${m} 分`
}

/** The hours of the section, for the banner: 「每天 10:00–20:00 开放」 */
export const S16_HOURS_TEXT = `每天 ${pad(S16_MARKET.openHour)}:00–${pad(S16_MARKET.closeHour)}:00 开放`

/**
 * The banner line: 「S16 交易区每天 10:00–20:00 开放 · 还有 3 小时 12 分休市」 while open,
 * 「已休市，明天 10:00 开市」 (or 「今天」 before the morning open) while shut, and the two lines after the event.
 */
export function s16WindowText(nowMs: number, w: S16Window = s16MarketWindow(nowMs)): string {
  if (w.mode === 'normal') return 'S16 世界赛已结束，S16 卡按普通卡交易：随时挂牌，时长自选，可设一口价。'
  if (w.mode === 'frozen') return `S16 交易区总决赛期间休市，${s16Date(w.opensAt)} 起 S16 卡按普通卡交易。`
  if (w.open) return `S16 交易区${S16_HOURS_TEXT} · 还有 ${s16Left((w.closesAt ?? nowMs) - nowMs)}休市`
  const when = bjDay(w.opensAt) === bjDay(nowMs) ? '今天' : '明天'
  return `已休市，${when} ${s16Clock(w.opensAt)} 开市`
}

/** What the server says when it refuses an S16 trade outside the window, or a listing too close to the close. */
export function s16ClosedWhy(nowMs: number, w: S16Window = s16MarketWindow(nowMs)): string {
  if (w.mode === 'frozen') return s16WindowText(nowMs, w)
  if (!w.open) return `S16 交易区${S16_HOURS_TEXT}（北京时间），${s16WindowText(nowMs, w)}。`
  const after = s16MarketWindow(w.closesAt ?? nowMs)
  const back = after.mode === 'window' ? `明天 ${s16Clock(after.opensAt)} 再来` : `${s16Date(after.opensAt)} 起 S16 卡按普通卡交易`
  return `S16 交易区 ${s16Clock(w.listUntil ?? nowMs)} 后不再接受新挂牌（当天的拍卖都在 ${s16Clock(w.closesAt ?? nowMs)} 结拍），${back}。`
}
