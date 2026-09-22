import type { GachaState, Series } from './gacha'
import { GAME_REGIONS, gameRegionOf } from './gameRegions'

/**
 * The week is keyed by its Monday, in the server's Asia/Shanghai calendar.
 * env.today is already a YYYY-MM-DD date in that calendar. This is a pure
 * calendar computation: the `T00:00:00Z` suffix is only used to obtain UTC
 * weekday/day methods on that calendar date, not to interpret it as a real
 * instant. No +08:00 offset is applied.
 */
export function weekKey(today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return ''
  const d = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  if (d.toISOString().slice(0, 10) !== today) return ''
  const dow = d.getUTCDay() // 0=Sun, calendar day of the server date
  const diff = dow === 0 ? -6 : 1 - dow // days since Monday
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

export interface WeeklySeriesPick {
  /** the Monday that owns this selection, YYYY-MM-DD (Asia/Shanghai calendar week) */
  week: string
  /** the series chosen that week */
  region: Series
}

export function cleanWeeklySeriesPick(
  raw: unknown,
  regions: readonly string[] = GAME_REGIONS,
): WeeklySeriesPick | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const week = typeof r.week === 'string' ? r.week : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return undefined
  if (weekKey(week) !== week) return undefined // must be a real Monday
  const mapped = gameRegionOf(r.region)
  const region = mapped && regions.includes(mapped) ? mapped : undefined
  if (!region) return undefined
  return { week, region }
}

/**
 * The chosen series for the week containing `today`, if one has been made.
 * A pick from a past week is ignored; the record stays and can be replaced
 * next week by the player's new choice.
 */
export function selectedWeeklySeries(
  g: Pick<GachaState, 'weeklySeriesPick'>,
  today: string,
  regions: readonly string[] = GAME_REGIONS,
): Series | undefined {
  const pick = cleanWeeklySeriesPick(g.weeklySeriesPick, regions)
  if (!pick) return undefined
  return pick.week === weekKey(today) ? pick.region : undefined
}

export function selectWeeklySeries(
  g: Pick<GachaState, 'weeklySeriesPick'> & { weeklySeriesPick?: WeeklySeriesPick },
  today: string,
  region: Series,
  regions: readonly string[] = GAME_REGIONS,
): { ok: true; region: Series } | { ok: false; why: string } {
  if (!regions.includes(region)) return { ok: false, why: '没有这个赛区' }
  const current = selectedWeeklySeries(g, today, regions)
  if (current && current !== region) {
    return { ok: false, why: '本周已经选过赛区，不能换' }
  }
  const week = weekKey(today)
  if (!week) return { ok: false, why: '日期无效' }
  if (!current) g.weeklySeriesPick = { week, region }
  return { ok: true, region }
}
