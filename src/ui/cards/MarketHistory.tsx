import { useCallback, useEffect, useRef, useState } from 'react'
import { marketHistory, failText } from '../../engine/market'
import type { MarketHistoryReply } from '../../engine/market'

const money = (n: number) => n.toLocaleString('en-US')

/** Collapsed by default; loads only when opened. Aborts on close/unmount/card change. */
export function MarketHistory({ cardId, level }: { cardId: string; level: number | null }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<MarketHistoryReply | null>(null)
  const [fail, setFail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const ctlRef = useRef<AbortController | null>(null)

  const close = useCallback(() => {
    ctlRef.current?.abort()
    setOpen(false)
    setData(null)
    setFail(null)
    setLoading(false)
  }, [])

  const load = useCallback(async () => {
    ctlRef.current?.abort()
    const ctl = new AbortController()
    ctlRef.current = ctl
    setLoading(true)
    setFail(null)
    const r = await marketHistory(cardId, level, ctl.signal)
    if (ctl.signal.aborted) return
    setLoading(false)
    if (r.fail) setFail(failText(r.fail))
    else if (!r.data?.ok) setFail(r.data?.bad ? '没有这张卡。' : '记录读不出来。')
    else setData(r.data)
  }, [cardId, level])

  useEffect(() => () => ctlRef.current?.abort(), [])

  if (!open) {
    return <button className="sm ghost" onClick={() => { setOpen(true); void load() }}>成交记录</button>
  }

  return (
    <div style={{ marginTop: 6, fontSize: '12px', maxWidth: '100%' }}>
      <div className="row" style={{ gap: 4, alignItems: 'center' }}>
        <span>成交记录</span>
        <button className="sm ghost" onClick={close}>收起</button>
        {loading && <span className="tiny faint">加载中…</span>}
        {fail && <button className="sm ghost" onClick={() => void load()}>重试</button>}
      </div>
      {fail && <div className="tiny neg">{fail}</div>}
      {!fail && data?.ok && (
        <div>
          <div className="tiny faint" style={{ lineHeight: 1.8 }}>
            成交次数：{data.sold} · 均价：{data.avg != null ? money(data.avg) : '—'} · 中位：{data.median != null ? money(data.median) : '—'}
            <br />近7日：{data.week?.sold ?? 0} 次 · 均价 {data.week?.avg != null ? money(data.week.avg) : '—'}
            {data.level && <> · 同等级：{data.level.sold} 次 · 均价 {data.level.avg != null ? money(data.level.avg) : '—'}</>}
          </div>
          {data.recent && data.recent.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {data.recent.map((r, i) => (
                <div key={i} className="tiny" style={{ lineHeight: 1.6 }}>
                  {money(r.price)} · +{r.level} · {new Date(r.at).toLocaleDateString('zh-CN')}
                </div>
              ))}
            </div>
          )}
          {(!data.recent || data.recent.length === 0) && <div className="tiny faint">暂无成交。</div>}
        </div>
      )}
    </div>
  )
}
