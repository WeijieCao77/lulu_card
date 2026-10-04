import { useState } from 'react'
import { useCards } from '../ctx'
import { ECHO_SET_REWARDS, echoSetProgress } from '../../../engine/gacha'

/**
 * 峡谷回响图鉴 progress (engine/gacha.ts ECHO_SET_REWARDS): the bar, the four marks and the claim button.
 * Shown on the pack page's 峡谷回响 section and above the collection.
 */
export default function EchoSet({ onBrowse }: { onBrowse?: () => void }) {
  const { g, act, toast } = useCards()
  const [busy, setBusy] = useState(false)
  const p = echoSetProgress(g)
  const claim = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await act('echo_set', {})
      if (!r.ok) { toast(r.why ?? '没领成，稍后再试。'); return }
      toast(`峡谷回响图鉴奖励已领取：${(r.result as { got: string }).got}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="echo-set">
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        <b className="small">峡谷回响图鉴</b>
        <span className="mono small">{p.owned}/{p.total}</span>
        <span className="tiny faint">单独收集，不计入全图鉴</span>
        <span style={{ flex: 1 }} />
        {onBrowse && <button className="sm" onClick={onBrowse}>只看回响卡</button>}
        <button className="sm primary" disabled={busy || !p.ready.length} onClick={() => void claim()}>
          {p.ready.length ? `领取奖励（${p.ready.length} 档）` : p.next ? `再收 ${p.next.need} 张领下一档` : '已全部领取'}
        </button>
      </div>
      <div className="echo-set-bar"><i style={{ width: `${Math.min(100, (p.owned / p.total) * 100)}%` }} /></div>
      <div className="echo-set-marks">
        {ECHO_SET_REWARDS.map((r, i) => (
          <span key={i} className={i < p.claimed ? 'done' : p.owned >= p.marks[i] ? 'ready' : ''}>
            <b>{Math.round(r.at * 100)}%（{p.marks[i]} 张）</b>{r.label}{i < p.claimed ? ' ✓' : ''}
          </span>
        ))}
      </div>
      <style>{`
        .echo-set{display:flex;flex-direction:column;gap:8px}
        .echo-set-bar{height:6px;border-radius:3px;background:#ffffff14;overflow:hidden}
        .echo-set-bar i{display:block;height:100%;background:linear-gradient(90deg,#8f7a45,#d6bd7c)}
        .echo-set-marks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
        .echo-set-marks span{font-size:11px;line-height:1.5;color:var(--muted);border:1px solid #ffffff14;border-radius:4px;padding:5px 7px}
        .echo-set-marks span b{display:block;color:var(--text,#e8ece6);font-weight:600}
        .echo-set-marks span.ready{border-color:#d6bd7c;color:#e3cb8c}
        .echo-set-marks span.done{opacity:.55}
        @media (max-width:560px){.echo-set-marks{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </div>
  )
}
