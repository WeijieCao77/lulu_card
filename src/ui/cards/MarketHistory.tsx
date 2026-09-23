import { useCallback, useEffect, useRef, useState } from 'react'
import { marketHistory, failText } from '../../engine/market'
import type { MarketHistoryReply } from '../../engine/market'
import { suggestMarketPrice } from '../../engine/marketGuidance'

const money = (n: number) => n.toLocaleString('en-US')

/** Collapsed by default; loads only when opened. Aborts on close/unmount/card change. */
export function MarketHistory({
  cardId,
  level,
  onUsePrice,
  priceFloor,
  disabled,
}: {
  cardId: string
  level: number | null
  onUsePrice?: (price: number) => void
  priceFloor?: number
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<{ key: string; data: MarketHistoryReply | null }>({ key: '', data: null })
  const [fail, setFail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const ctlRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  const key = JSON.stringify([cardId, level])

  const close = useCallback(() => {
    ++seqRef.current
    ctlRef.current?.abort()
    setOpen(false)
    setPayload({ key: '', data: null })
    setFail(null)
    setLoading(false)
  }, [])

  const load = useCallback(async (loadKey: string) => {
    const seq = ++seqRef.current
    ctlRef.current?.abort()
    const ctl = new AbortController()
    ctlRef.current = ctl
    setLoading(true)
    setFail(null)
    setPayload({ key: loadKey, data: null })
    try {
      const r = await marketHistory(cardId, level, ctl.signal)
      if (seq !== seqRef.current || ctl.signal.aborted) return
      setLoading(false)
      if (r.fail) setFail(failText(r.fail))
      else if (!r.data?.ok) setFail(r.data?.bad ? '没有这张卡。' : '记录读不出来。')
      else setPayload({ key: loadKey, data: r.data })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      if (seq !== seqRef.current) return
      setLoading(false)
      setFail('请求失败，请重试。')
      setPayload({ key: loadKey, data: null })
    }
  }, [cardId, level])

  useEffect(() => {
    return () => {
      ++seqRef.current
      ctlRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    ++seqRef.current
    ctlRef.current?.abort()
    setOpen(false)
    setPayload({ key: '', data: null })
    setFail(null)
    setLoading(false)
  }, [key])

  if (!open) {
    return (
      <button
        className="sm ghost"
        disabled={disabled}
        onClick={() => { setOpen(true); void load(key) }}
      >
        {onUsePrice ? '查看成交记录 / 参考起拍价' : '成交记录'}
      </button>
    )
  }

  const currentData = payload.key === key ? payload.data : null
  const suggestion = onUsePrice && !loading && !fail && currentData?.ok && level != null && priceFloor != null
    ? suggestMarketPrice(currentData, cardId, level, priceFloor, Date.now())
    : null

  return (
    <div style={{ marginTop: 6, fontSize: '12px', maxWidth: '100%' }}>
      <div className="row" style={{ gap: 4, alignItems: 'center' }}>
        <span>成交记录</span>
        <button className="sm ghost" disabled={disabled} onClick={close}>收起</button>
        {loading && <span className="tiny faint">加载中…</span>}
        {fail && <button className="sm ghost" disabled={disabled} onClick={() => void load(key)}>重试</button>}
      </div>
      {fail && <div className="tiny neg">{fail}</div>}
      {!fail && !loading && currentData?.ok && (
        <div>
          <div className="tiny faint" style={{ lineHeight: 1.8 }}>
            成交次数：{currentData.sold} · 均价：{currentData.avg != null ? money(currentData.avg) : '—'} · 中位：{currentData.median != null ? money(currentData.median) : '—'}
            <br />近7日：{currentData.week?.sold ?? 0} 次 · 均价 {currentData.week?.avg != null ? money(currentData.week.avg) : '—'}
            {currentData.level && <> · 同等级：{currentData.level.sold} 次 · 均价 {currentData.level.avg != null ? money(currentData.level.avg) : '—'}</>}
          </div>
          {currentData.recent && currentData.recent.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {currentData.recent.map((r, i) => (
                <div key={i} className="tiny" style={{ lineHeight: 1.6 }}>
                  {money(r.price)} · +{r.level} · {new Date(r.at).toLocaleDateString('zh-CN')}
                </div>
              ))}
            </div>
          )}
          {(!currentData.recent || currentData.recent.length === 0) && <div className="tiny faint">暂无成交。</div>}
          {onUsePrice && level != null && priceFloor != null && (
            <div style={{ marginTop: 6 }}>
              {suggestion ? (
                <div className="tiny" style={{ lineHeight: 1.8 }}>
                  依据最新8笔中同等级 +{level} 的样本：近{suggestion.days}日{suggestion.sample}笔，中位价 {money(suggestion.median)}（仅供参考）
                  {suggestion.floorApplied ? `，已按底价调整为 ${money(suggestion.price)}` : ''}
                  <div>
                    <button className="sm ghost" disabled={disabled} onClick={() => {
                      if (disabled || loading || fail || payload.key !== key || level == null) return
                      const fresh = suggestMarketPrice(currentData, cardId, level, priceFloor, Date.now())
                      if (!fresh) { setFail('参考记录已过期，请刷新后再试。'); return }
                      onUsePrice(fresh.price)
                    }}>一键填入起拍价</button>
                  </div>
                </div>
              ) : (
                <div className="tiny faint">同等级近期样本不足或已过期，暂不提供参考价。</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
