/**
 * S16 赛事预测 (owner 2026-10-04, after 开瓦包's 比赛预测, fitted to the S16 format; no single-match picks).
 *
 * Four pick sheets, each locked by the server's clock (owner 2026-10-10 added the first two: 「冠军预测…入围赛…后面其他比赛也是」):
 *   ⓪ 入围赛 — which of the four Play-In teams goes through to the Swiss stage; locks at the first Play-In match.
 *   ⓪ 冠军 — the champion, from every team at the event; open from launch, locks at the first Swiss match.
 *   ① 瑞士轮 — the eight teams that reach the knockout, plus two for 3-0 and two for 0-3. Swiss pairings are drawn
 *      round by round, so the whole stage is one sheet rather than a bracket.
 *   ② 淘汰赛 — once the eight are drawn into the bracket: the winner of every quarter-final, semi-final and the final.
 * Results are entered by hand in src/data/s16Predict.json (as 开瓦包 does: no action accepts a result from a player)
 * and a sheet pays once, its best tier, when the player claims it.
 */
import DATA from '../data/s16Predict.json'

export interface SwissPick { qual: string[]; threeZero: string[]; zeroThree: string[]; at: number; claimedAt?: number }
export interface KoPick { qf: string[]; sf: string[]; final: string; at: number; claimedAt?: number }
export interface OnePick { team: string; at: number; claimedAt?: number }
export interface S16PredictState { playin?: OnePick; champ?: OnePick; swiss?: SwissPick; ko?: KoPick }

interface SwissData { teams: string[] | null; lockAt: string | null; qualified: string[] | null; threeZero: string[] | null; zeroThree: string[] | null; confirmedAt: string | null }
interface KoData { bracket: string[][] | null; lockAt: string | null; qf: string[] | null; sf: string[] | null; final: string | null; confirmedAt: string | null }
interface PlayinData { teams: string[] | null; lockAt: string | null; winner: string | null; confirmedAt: string | null }
interface ChampData { teams: string[] | null; lockAt: string | null; champion: string | null; confirmedAt: string | null }
export const S16_PREDICT = DATA as { playin: PlayinData; champ: ChampData; swiss: SwissData; ko: KoData }

export interface PredictReward { label: string; packs: Record<string, number>; detail: string }

const t = (iso: string | null) => (iso ? Date.parse(iso) : NaN)
export const playinOpen = (now: number, d = S16_PREDICT.playin) => !!d.teams && d.teams.length === 4 && !!d.lockAt && now < t(d.lockAt)
export const champOpen = (now: number, d = S16_PREDICT.champ) => !!d.teams && d.teams.length >= 16 && !!d.lockAt && now < t(d.lockAt)
export const swissOpen = (now: number, d = S16_PREDICT.swiss) => !!d.teams && d.teams.length === 16 && !!d.lockAt && now < t(d.lockAt)
export const koOpen = (now: number, d = S16_PREDICT.ko) => !!d.bracket && d.bracket.length === 4 && !!d.lockAt && now < t(d.lockAt)
const confirmed = (now: number, iso: string | null) => !!iso && now >= t(iso)

const uniq = (xs: unknown[]) => new Set(xs).size === xs.length
const strs = (v: unknown, n: number): string[] | null =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'string') && uniq(v) ? (v as string[]) : null

/** check and store a one-team sheet (入围赛 / 冠军); returns a reason when it is refused */
export function setOne(s: S16PredictState, sheet: 'playin' | 'champ', raw: Record<string, unknown>, now: number,
  d: PlayinData | ChampData = sheet === 'playin' ? S16_PREDICT.playin : S16_PREDICT.champ): string | null {
  const name = sheet === 'playin' ? '入围赛' : '冠军'
  if (!d.teams || d.teams.length < (sheet === 'playin' ? 4 : 16)) return `${name}预测的队伍还没确定`
  if (!(sheet === 'playin' ? playinOpen(now, d as PlayinData) : champOpen(now, d as ChampData))) return `${name}预测已经锁定了`
  const team = typeof raw.team === 'string' ? raw.team : ''
  if (!d.teams.includes(team)) return '选一支参赛队'
  if (s[sheet]?.claimedAt) return '这张预测已经领过奖了'
  s[sheet] = { team, at: now }
  return null
}

/** 入围赛: the team that goes through. S16 世界赛包 ×2 */
export function playinReward(p: OnePick | undefined, now: number, d = S16_PREDICT.playin): PredictReward | null {
  if (!p || !confirmed(now, d.confirmedAt) || !d.winner || p.at >= t(d.lockAt)) return null
  return p.team === d.winner
    ? { label: '猜中入围赛晋级队', packs: { s16: 2 }, detail: '入围赛晋级队猜中' }
    : { label: '没猜中入围赛晋级队', packs: {}, detail: '入围赛晋级队没猜中' }
}

/** 冠军, picked before the Swiss stage: 十连包 ×3 + S16 世界赛包 ×2; the runner-up picked instead: 选拔包 ×3 */
export function champReward(p: OnePick | undefined, now: number, d = S16_PREDICT.champ, runnerUp: string | null = runnerUpOf()): PredictReward | null {
  if (!p || !confirmed(now, d.confirmedAt) || !d.champion || p.at >= t(d.lockAt)) return null
  if (p.team === d.champion) return { label: '猜中冠军', packs: { ten: 3, s16: 2 }, detail: '冠军猜中' }
  if (runnerUp && p.team === runnerUp) return { label: '猜中的是亚军', packs: { elite: 3 }, detail: '选了亚军' }
  return { label: '没猜中冠军', packs: {}, detail: '冠军没猜中' }
}
const runnerUpOf = (): string | null => {
  const ko = S16_PREDICT.ko
  return ko.final && ko.sf ? ko.sf.find((x) => x !== ko.final) ?? null : null
}

/** check and store the 瑞士轮 sheet; returns a reason when it is refused */
export function setSwiss(s: S16PredictState, raw: Record<string, unknown>, now: number, d = S16_PREDICT.swiss): string | null {
  if (!d.teams || d.teams.length !== 16) return '瑞士轮的 16 支队还没确定，入围赛打完就开放'
  if (!swissOpen(now, d)) return '瑞士轮已经开打，预测锁定了'
  const qual = strs(raw.qual, 8), three = strs(raw.threeZero, 2), zero = strs(raw.zeroThree, 2)
  if (!qual || !three || !zero) return '选 8 支晋级队、2 支 3-0、2 支 0-3'
  const all = new Set(d.teams)
  if (![...qual, ...three, ...zero].every((x) => all.has(x))) return '有队伍不在瑞士轮里'
  if (!three.every((x) => qual.includes(x))) return '3-0 的队必须在晋级的 8 支里'
  if (zero.some((x) => qual.includes(x))) return '0-3 的队不能是晋级队'
  if (s.swiss?.claimedAt) return '这张预测已经领过奖了'
  s.swiss = { qual, threeZero: three, zeroThree: zero, at: now }
  return null
}

/** check and store the 淘汰赛 sheet: qf winners in bracket order, sf winners from them, the champion from those */
export function setKo(s: S16PredictState, raw: Record<string, unknown>, now: number, d = S16_PREDICT.ko): string | null {
  if (!d.bracket || d.bracket.length !== 4) return '八强对阵还没抽出来'
  if (!koOpen(now, d)) return '淘汰赛已经开打，预测锁定了'
  const qf = strs(raw.qf, 4), sf = strs(raw.sf, 2)
  const final = typeof raw.final === 'string' ? raw.final : null
  if (!qf || !sf || !final) return '每场都要选一个胜者'
  if (!qf.every((w, i) => d.bracket![i].includes(w))) return '八强的胜者要从这场的两队里选'
  if (!(sf[0] === qf[0] || sf[0] === qf[1]) || !(sf[1] === qf[2] || sf[1] === qf[3])) return '四强的胜者要从你选的八强胜者里选'
  if (!sf.includes(final)) return '冠军要从你选的四强胜者里选'
  if (s.ko?.claimedAt) return '这张预测已经领过奖了'
  s.ko = { qf, sf, final, at: now }
  return null
}

/** what the 瑞士轮 sheet is worth once the results are in; null before */
export function swissReward(p: SwissPick | undefined, now: number, d = S16_PREDICT.swiss): PredictReward | null {
  if (!p || !confirmed(now, d.confirmedAt) || !d.qualified || p.at >= t(d.lockAt)) return null
  const hit = p.qual.filter((x) => d.qualified!.includes(x)).length
  const extra = p.threeZero.filter((x) => d.threeZero?.includes(x)).length + p.zeroThree.filter((x) => d.zeroThree?.includes(x)).length
  const packs: Record<string, number> = {}
  let label = '没有猜中够 4 支晋级队'
  if (hit === 8) { packs.ten = 2; label = '8 支晋级队全中' }
  else if (hit >= 6) { packs.ten = 1; label = `猜中 ${hit} 支晋级队` }
  else if (hit >= 4) { packs.elite = 3; label = `猜中 ${hit} 支晋级队` }
  if (extra) packs.s16 = extra
  return { label, packs, detail: `晋级猜中 ${hit}/8，3-0 / 0-3 猜中 ${extra}/4` }
}

/** what the 淘汰赛 sheet is worth once the final is in; null before */
export function koReward(p: KoPick | undefined, now: number, d = S16_PREDICT.ko): PredictReward | null {
  if (!p || !confirmed(now, d.confirmedAt) || !d.final || !d.sf || p.at >= t(d.lockAt)) return null
  const champ = d.final, runner = d.sf.find((x) => x !== d.final)!
  const myRunner = p.sf.find((x) => x !== p.final)!
  const packs: Record<string, number> = {}
  let label = '冠亚军都没猜中'
  if (p.final === champ && myRunner === runner) { packs.ten = 3; label = '冠亚军全中' }
  else if (p.final === champ) { packs.ten = 2; label = '猜中冠军' }
  else if (myRunner === runner) { packs.ten = 1; label = '猜中亚军' }
  else if (p.final === runner && myRunner === champ) { packs.elite = 5; label = '决赛两队都猜中，冠亚军猜反了' }
  else if ([p.final, myRunner].some((x) => x === champ || x === runner)) { packs.elite = 3; label = '猜中一支决赛队' }
  const right = p.qf.filter((x, i) => d.qf?.[i] === x).length + p.sf.filter((x, i) => d.sf?.[i] === x).length + (p.final === champ ? 1 : 0)
  return { label, packs, detail: `7 场猜中 ${right} 场` }
}

export function cleanS16Predict(raw: unknown): S16PredictState | undefined {
  const r = raw as S16PredictState | null
  if (!r || typeof r !== 'object') return undefined
  const out: S16PredictState = {}
  for (const k of ['playin', 'champ'] as const) {
    const one = r[k]
    if (one && typeof one.team === 'string' && one.team.length <= 16 && Number.isFinite(one.at)) out[k] = { team: one.team, at: one.at, ...(Number.isFinite(one.claimedAt) ? { claimedAt: one.claimedAt } : {}) }
  }
  const sw = r.swiss
  if (sw && strs(sw.qual, 8) && strs(sw.threeZero, 2) && strs(sw.zeroThree, 2) && Number.isFinite(sw.at)) out.swiss = { qual: sw.qual, threeZero: sw.threeZero, zeroThree: sw.zeroThree, at: sw.at, ...(Number.isFinite(sw.claimedAt) ? { claimedAt: sw.claimedAt } : {}) }
  const ko = r.ko
  if (ko && strs(ko.qf, 4) && strs(ko.sf, 2) && typeof ko.final === 'string' && Number.isFinite(ko.at)) out.ko = { qf: ko.qf, sf: ko.sf, final: ko.final, at: ko.at, ...(Number.isFinite(ko.claimedAt) ? { claimedAt: ko.claimedAt } : {}) }
  return out.playin || out.champ || out.swiss || out.ko ? out : undefined
}
