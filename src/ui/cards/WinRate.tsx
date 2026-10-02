import { useEffect, useState } from 'react'
import { Panel } from '../common'
import { GapOdds } from './GapOdds'

/**
 * 胜率表 — how often the higher 阵容分 wins, from real matches only (winrate-api.js).
 * The server cuts it once a day at Beijing midnight; nothing on this page is simulated.
 * Players see only the 总表, every kind of match added together (owner, 2026-10-02); the API keeps the modes apart.
 */
type Mode = 'cup' | 'cup_club' | 'ladder_pvp' | 'ladder_club'
interface Band { lo: number; hi: number; n: number; w: number }
interface Table {
  ok: boolean
  why?: string
  cutoff?: number
  ladderDays?: number
  modes?: Partial<Record<Mode, Band[]>>
}

/** below this many matches a percentage says more about luck than about the gap */
const MIN_N = 30

const bandName = (b: Band) => (b.hi >= 99 ? `${b.lo} 分以上` : b.lo === b.hi ? `${b.lo} 分` : `${b.lo}–${b.hi} 分`)

const cutoffText = (t: number) => {
  // the cut is Beijing midnight; show the Beijing date it closed
  const d = new Date(t + 8 * 3_600_000 - 1)
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
}

/** every mode's bands added together, band by band (a mode a snapshot does not have counts as empty) */
function totals(modes: Partial<Record<Mode, Band[]>>): Band[] {
  const base = Object.values(modes).find((m) => m?.length) ?? []
  return base.map((b, i) => {
    let n = 0, w = 0
    for (const m of Object.values(modes)) { n += m?.[i]?.n ?? 0; w += m?.[i]?.w ?? 0 }
    return { lo: b.lo, hi: b.hi, n, w }
  })
}

function Cell({ b, big = false }: { b?: Band; big?: boolean }) {
  const n = b?.n ?? 0
  return (
    <>
      {n >= MIN_N && b
        ? <b className="mono" style={big ? { fontSize: 18 } : undefined}>{Math.round((100 * b.w) / n)}%</b>
        : <span className="faint">样本不足</span>}
      <div className="tiny faint mono">{n} 场</div>
    </>
  )
}

export default function WinRate() {
  const [t, setT] = useState<Table | 'loading' | null>('loading')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    setT('loading')
    fetch('/api/winrate', { signal: ctl.signal })
      .then((r) => r.json() as Promise<Table>)
      .then((body) => setT(body.ok ? body : null))
      .catch(() => setT(null))
      .finally(() => clearTimeout(timer))
    return () => { clearTimeout(timer); ctl.abort() }
  }, [retry])

  const loaded = t && t !== 'loading' && t.modes ? t : null
  const all = loaded ? totals(loaded.modes!) : []
  const stamp = loaded?.cutoff ? <span className="tiny muted">统计到 {cutoffText(loaded.cutoff)} 24:00</span> : undefined

  return (
    <>
      <p className="tiny muted" style={{ margin: '0 0 12px' }}>
        阵容分高的一方，赢下整场比赛的比例。全部来自玩家的真实对局，每天北京时间零点更新一次。
      </p>

      {t === 'loading' ? <Panel title="分差胜率总表"><p className="empty">读取中…</p></Panel>
        : !loaded ? (
          <Panel title="分差胜率总表">
            <div className="empty">
              <p>暂时读不到胜率表（离线或服务器忙）。</p>
              <button className="sm" onClick={() => setRetry((k) => k + 1)}>重试</button>
            </div>
          </Panel>
        ) : (
          <>
            <Panel title="分差胜率总表" actions={stamp}>
              <p className="tiny faint" style={{ margin: '0 0 8px' }}>天梯、全服杯、俱乐部杯的所有对局合在一起。</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>分差</th><th className="num">高分方胜率</th></tr>
                  </thead>
                  <tbody>
                    {all.map((b) => (
                      <tr key={b.lo}>
                        <td>{bandName(b)}</td>
                        <td className="num"><Cell b={b} big /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="tiny muted" style={{ lineHeight: 1.75, margin: '10px 0 0', paddingLeft: 18 }}>
                <li>百分比是<b>高分一方</b>赢下整场的比例；100% 减去它，就是低分一方爆冷的比例。</li>
                <li>天梯和俱乐部杯算最近 {loaded.ladderDays ?? 30} 天（从 10 月 2 日开始记录），全服杯算当前版本的全部场次；对俱乐部时用比赛里显示的俱乐部综合分。同分的对局不计入。</li>
                <li>一格少于 {MIN_N} 场时只显示场次，不给百分比——场次太少，数字说明不了什么。</li>
                <li>天梯优先匹配阵容分相差 4 分以内的真人对手。这一段高分方优势不大，打得多了，输给低分对手也就常见。</li>
              </ul>
            </Panel>
          </>
        )}

      <Panel title="阵容分从哪里来">
        <GapOdds open />
      </Panel>
    </>
  )
}
