import { useEffect, useState } from 'react'
import { Panel } from '../common'
import { GapOdds } from './GapOdds'

/**
 * 胜率表 — how often the higher 阵容分 wins, from real matches only (winrate-api.js).
 * The server cuts it once a day at Beijing midnight; nothing on this page is simulated.
 */
interface Band { lo: number; hi: number; n: number; w: number }
interface Table {
  ok: boolean
  why?: string
  cutoff?: number
  ladderDays?: number
  modes?: Record<'cup' | 'ladder_pvp' | 'ladder_club', Band[]>
}

/** below this many matches a percentage says more about luck than about the gap */
const MIN_N = 30

const COLUMNS: { key: 'cup' | 'ladder_pvp' | 'ladder_club'; label: string; note: string }[] = [
  { key: 'cup', label: '全服杯', note: '玩家对玩家' },
  { key: 'ladder_pvp', label: '天梯', note: '对真人卡组' },
  { key: 'ladder_club', label: '天梯', note: '对俱乐部' },
]

const bandName = (b: Band) => (b.hi >= 99 ? `${b.lo} 分以上` : b.lo === b.hi ? `${b.lo} 分` : `${b.lo}–${b.hi} 分`)

const cutoffText = (t: number) => {
  // the cut is Beijing midnight; show the Beijing date it closed
  const d = new Date(t + 8 * 3_600_000 - 1)
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
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

  return (
    <>
      <p className="tiny muted" style={{ margin: '0 0 12px' }}>
        阵容分高的一方，赢下整场比赛的比例。全部来自玩家的真实对局，每天北京时间零点更新一次。
      </p>

      <Panel
        title="分差胜率表"
        actions={t && t !== 'loading' && t.cutoff
          ? <span className="tiny muted">统计到 {cutoffText(t.cutoff)} 24:00</span>
          : undefined}
      >
        {t === 'loading' ? <p className="empty">读取中…</p>
          : !t?.modes ? (
            <div className="empty">
              <p>暂时读不到胜率表（离线或服务器忙）。</p>
              <button className="sm" onClick={() => setRetry((k) => k + 1)}>重试</button>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>分差</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className="num">
                          {c.label}<div className="tiny faint" style={{ fontWeight: 'normal' }}>{c.note}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.modes.cup.map((b, i) => (
                      <tr key={b.lo}>
                        <td>{bandName(b)}</td>
                        {COLUMNS.map((c) => {
                          const x = t.modes![c.key][i]
                          return (
                            <td key={c.key} className="num">
                              {x.n >= MIN_N
                                ? <b className="mono">{Math.round((100 * x.w) / x.n)}%</b>
                                : <span className="faint">样本不足</span>}
                              <div className="tiny faint mono">{x.n} 场</div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="tiny muted" style={{ lineHeight: 1.75, margin: '10px 0 0', paddingLeft: 18 }}>
                <li>百分比是<b>高分一方</b>赢下整场的比例；100% 减去它，就是低分一方爆冷的比例。</li>
                <li>全服杯算的是当前版本的全部场次；天梯算最近 {t.ladderDays ?? 30} 天。同分的对局没有高低之分，不计入。</li>
                <li>一格少于 {MIN_N} 场时只显示场次，不给百分比——场次太少，数字说明不了什么。</li>
                <li>天梯优先匹配阵容分相差 4 分以内的真人对手。这一段高分方优势不大，打得多了，输给低分对手也就常见。</li>
              </ul>
            </>
          )}
      </Panel>

      <Panel title="阵容分从哪里来">
        <GapOdds open />
      </Panel>
    </>
  )
}
