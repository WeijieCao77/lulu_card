/**
 * 峡谷回响问答 — the launch quiz for the retired-player series.
 *
 * One time per account (owner, 2026-10-04: 「一次性回答五道题，每道题送一个三连」): five
 * questions drawn from the bank, one answer each, and every right answer is a
 * 回响包 in the pack bag. Nothing to retry and nothing daily.
 *
 * The bank lives in echo-quiz.js at the repo root, which only the server
 * reads — it is not under src/, so the answers never reach a browser. The
 * server hands it to the rules in `env.echoQuiz`; the save keeps only which
 * questions this account drew, the order their options were shown in (shuffled
 * per account, so 「第三题选 A」 is not worth passing round) and what was picked.
 */
import { Rng } from './rng'

export interface EchoQuizQ {
  id: string
  q: string
  /** four options, the right one at `answer` */
  options: string[]
  answer: number
}

export const ECHO_QUIZ_COUNT = 5

export interface EchoQuizState {
  ids: string[]
  /** order[i][k] = which bank option is shown in slot k of question i */
  order: number[][]
  /** the slot picked for each question, null until answered */
  picks: (number | null)[]
  /** packs paid */
  won: number
}

/** a question as the page sees it: options in this account's order, the answer only once it has been given */
export interface EchoQuizView {
  q: string
  options: string[]
  pick: number | null
  right: number | null
}

export function startEchoQuiz(bank: readonly EchoQuizQ[], seed: number): EchoQuizState {
  const rng = new Rng(seed >>> 0)
  const ids = rng.shuffle(bank.map((x) => x.id)).slice(0, ECHO_QUIZ_COUNT)
  return {
    ids,
    order: ids.map(() => rng.shuffle([0, 1, 2, 3])),
    picks: ids.map(() => null),
    won: 0,
  }
}

export function viewEchoQuiz(s: EchoQuizState, bank: readonly EchoQuizQ[]): EchoQuizView[] | null {
  const out: EchoQuizView[] = []
  for (let i = 0; i < s.ids.length; i++) {
    const q = bank.find((x) => x.id === s.ids[i])
    if (!q) return null
    const pick = s.picks[i]
    out.push({
      q: q.q,
      options: s.order[i].map((k) => q.options[k]),
      pick,
      right: pick == null ? null : s.order[i].indexOf(q.answer),
    })
  }
  return out
}

export const echoQuizDone = (s: EchoQuizState | undefined): boolean => !!s && s.picks.every((p) => p != null)

/** a save edited by hand, or written before a bank change, comes back as nothing rather than as something half-valid */
export function cleanEchoQuiz(raw: unknown): EchoQuizState | undefined {
  const s = raw as EchoQuizState | null
  if (!s || typeof s !== 'object' || !Array.isArray(s.ids) || !Array.isArray(s.order) || !Array.isArray(s.picks)) return undefined
  const n = s.ids.length
  if (n !== ECHO_QUIZ_COUNT || s.order.length !== n || s.picks.length !== n) return undefined
  if (!s.ids.every((x) => typeof x === 'string')) return undefined
  if (!s.order.every((o) => Array.isArray(o) && o.length === 4 && [...o].sort().join() === '0,1,2,3')) return undefined
  if (!s.picks.every((p) => p === null || (Number.isInteger(p) && p >= 0 && p < 4))) return undefined
  const won = Number.isInteger(s.won) ? Math.max(0, Math.min(n, s.won)) : 0
  return { ids: s.ids, order: s.order, picks: s.picks, won }
}
