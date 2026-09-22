/**
 * The published rates.
 *
 * Every number on this page is measured, not typed: it opens thirty thousand
 * of each pack with the same `openPack` the game uses and counts what comes
 * out. Nothing here can drift out of step with the packs, because there is no
 * second copy of the numbers to drift.
 *
 * It shows the base rates beside the measured ones on purpose. They differ —
 * sometimes by a lot — and a disclosure that quietly published the smaller of
 * the two would be the kind of thing a player works out for themselves and
 * stops trusting you over. The mechanics that move them are named underneath.
 *
 * There is no page any more — the tab was the tenth on a phone, and nobody
 * leaves a pack they just opened to go and read a table somewhere else. These
 * two pieces are what the floating 概率 button shows, one tap from wherever
 * the player is, which is the only moment anybody actually wants them.
 */
import { useEffect, useState } from 'react'
import type { PackOdds } from '../../engine/odds'
import { HARD_PITY, SOFT_PITY, MYTHIC_FLOOR, MYTHIC_PACK_NAMES } from '../../engine/gacha'
import { GOLD_AT, SILVER_AT, COACH_GOLD_AT, COACH_SILVER_AT } from '../../engine/cards'

const METALS = [
  { key: 'mythic', label: '彩卡', cls: 'r-mythic' },
  { key: 'gold', label: '金卡', cls: 'r-gold' },
  { key: 'silver', label: '银卡', cls: 'r-silver' },
  { key: 'bronze', label: '铜卡', cls: 'r-bronze' },
] as const

const pct = (n: number) => `${(n * 100).toFixed(n < 0.001 ? 3 : 2)}%`
/** "about one in N packs", which is the form people actually think in */
const oneIn = (n: number) => (n > 0 ? `约 ${Math.round(1 / n).toLocaleString()} 包一张` : '—')

/** One pack's table. Thirty thousand packs are opened once, on mount. */
let cachedRows: PackOdds[] | null = null

export function OddsTables() {
  const [rows, setRows] = useState<PackOdds[] | null>(cachedRows)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (cachedRows) return
    let worker: Worker | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null
    let finished = false
    try {
      worker = new Worker(new URL('./odds.worker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      if (worker) worker.terminate()
      worker = null
      finished = true
    }
    worker.onmessage = (e: MessageEvent<PackOdds[] | { error: string }>) => {
      if (finished) return
      cleanup()
      if (Array.isArray(e.data)) {
        cachedRows = e.data
        setRows(e.data)
      } else {
        setError(e.data.error || '计算失败')
      }
    }
    worker.onmessageerror = () => {
      if (finished) return
      cleanup()
      setError('计算结果无法解析')
    }
    worker.onerror = (e) => {
      if (finished) return
      cleanup()
      setError(e.message || '计算线程出错')
    }
    timeout = setTimeout(() => {
      if (finished) return
      cleanup()
      setError('计算超时，请重试')
    }, 30000)
    worker.postMessage(30000)
    return cleanup
  }, [retryKey])

  if (error) return <div className="small faint"><p>{error}</p><button className="sm" onClick={() => { setError(null); setRows(null); setRetryKey(k => k + 1) }}>重试</button></div>
  if (!rows) return <p className="small faint">正在计算概率…</p>

  return (
    <>
      {rows.map((r) => (
        <div key={r.kind} className="odds-pack">
          <div className="odds-head">
            <b>{r.name}</b>
            <span className="tiny muted">
              每包 {r.draws} 张 · {r.shop ? `${r.cost.toLocaleString()} 金币` : '非卖品：从玩法与活动奖励获得'}
            </span>
          </div>
          <p className="tiny faint" style={{ margin: '4px 0 8px' }}>实测为抽样估计，包含保底，不代表下一张的即时概率。</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>稀有度</th>
                  <th className="num">每张卡的概率（抽样估计）</th>
                  <th className="num">每包至少一张（抽样估计）</th>
                  <th className="num">基础值</th>
                </tr>
              </thead>
              <tbody>
                {METALS.map((m) => {
                  const per = r.perCard[m.key]
                  const pack = r.perPack[m.key]
                  const base = r.base[m.key]
                  if (m.key === 'mythic' && base === 0) {
                    return (
                      <tr key={m.key}>
                        <td><span className={`tag ${m.cls}`}>{m.label}</span></td>
                        <td className="num faint" colSpan={3}>这种包不出彩卡</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={m.key}>
                      <td><span className={`tag ${m.cls}`}>{m.label}</span></td>
                      <td className="num mono">{pct(per)}</td>
                      <td className="num mono">
                        {pct(pack)}
                        {m.key !== 'bronze' && (
                          <em className="tiny faint" style={{ marginLeft: 6, fontStyle: 'normal' }}>
                            {oneIn(pack)}
                          </em>
                        )}
                      </td>
                      <td className="num mono faint">{pct(base)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  )
}

/** Why the measured column is not the配置表 column. */
export function OddsWhy() {
  return (
    <>
      <ul className="odds-why">
        <li>
          <b>金卡保底</b>：连续 {SOFT_PITY} 抽没出金卡后概率递增，第 {HARD_PITY} 抽必出，所以实测金卡率高于基础值。
        </li>
        <li>
          <b>彩卡保底</b>：{MYTHIC_PACK_NAMES} 共享 {MYTHIC_FLOOR} 抽保底，LPL、LCK、欧美三个赛区包均可出本大区彩卡并共享此保底；教练包和位置包不出本系列彩卡，不推进此保底。
        </li>
        <li>
          <b>普通选手卡基础评分</b>：金卡 {GOLD_AT}—90，银卡 {SILVER_AT}—{GOLD_AT - 1}，铜卡低于 {SILVER_AT}；强化后可超过基础上限。<br /><b>教练基础评分</b>：金卡 {COACH_GOLD_AT} 起，银卡 {COACH_SILVER_AT}—{COACH_GOLD_AT - 1}，铜卡低于 {COACH_SILVER_AT}。
        </li>
        <li>
          <b>保底进度挂在账号上</b>，换一种包开不重置。
        </li>
        <li>
          <b>选拔包保底银卡、十连包保底金卡</b>：一包里最好的一张不够档就补到该档。
        </li>
      </ul>
      <p className="tiny faint" style={{ marginBottom: 0 }}>
        对战按卡组阵容分结算，强化、位置和队伍搭配都会影响实力。
      </p>
    </>
  )
}
