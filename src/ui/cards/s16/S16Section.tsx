import { useState } from 'react'
import { useCards } from '../ctx'
import { Panel } from '../../common'
import { PACKS, S16_SET_REWARDS, s16SetProgress } from '../../../engine/gacha'
import type { PackKind } from '../../../engine/gacha'
import { S16_CARDS } from '../../../engine/cards'
import { S16CardBack } from './S16Card'
import S16Predict from './S16Predict'

/**
 * The pack page's S16 世界赛 section: what the series is, the pack (until it comes off sale), and the S16 图鉴 marks.
 * Owner 2026-10-04: every player equally likely, numbers 「?」 until he plays, the FMVP's card becomes a 彩卡.
 */
export default function S16Section({ open, busy, today }: { open: (kind: PackKind, pay: 'pack' | 'coins') => void; busy: boolean; today: string }) {
  const { g, act, toast } = useCards()
  const [claiming, setClaiming] = useState(false)
  const [predict, setPredict] = useState(false)
  const def = PACKS.s16
  const onSale = !def.until || today <= def.until
  const p = s16SetProgress(g)
  const revealed = S16_CARDS.filter((c) => c.s16!.revealed).length
  const claim = async () => {
    if (claiming) return
    setClaiming(true)
    try {
      const r = await act('s16_set', {})
      if (!r.ok) { toast(r.why ?? '没领成，稍后再试。'); return }
      toast(`S16 图鉴奖励已领取：${(r.result as { got: string }).got}`)
    } finally { setClaiming(false) }
  }
  return (
    <Panel title="S16 世界赛" actions={<span className="tiny muted">限时 · 卖到 {def.until?.slice(5).replace('-', '/')} · {def.cost} 金币三张</span>}>
      <div className="s16-hero">
        <div className="s16-hero-art"><S16CardBack size="sm" /></div>
        <div className="s16-hero-copy">
          <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>
            S16 参赛的 {S16_CARDS.length} 位选手。开赛前所有数值都是「?」，选手打过 S16 的比赛才揭晓，之后每个比赛日按他的表现更新，金银铜也跟着排名变；没揭晓的卡不能上阵。
            决赛后数值定格，冠军队全员 +2，<b>FMVP 的卡自动升级成彩卡</b>。S16 卡交易不用等待，单价最高 1 万金币。
          </p>
          <p className="tiny faint" style={{ margin: 0 }}>目前已揭晓 {revealed}/{S16_CARDS.length} 位选手。每个选手抽中的机会一样。</p>
          <div className="pack-shelf-actions">
            <button className="primary sm" onClick={() => open('s16', 'pack')} disabled={busy || (g.packs.s16 ?? 0) < 1}>打开（{g.packs.s16 ?? 0}）</button>
            {onSale
              ? <button className="sm" onClick={() => open('s16', 'coins')} disabled={busy || g.coins < def.cost}>花 {def.cost} 金币</button>
              : <span className="tiny faint" style={{ alignSelf: 'center' }}>已下架，手里的包还能打开</span>}
            <button className="sm" onClick={() => setPredict(true)}>S16 赛事预测</button>
          </div>
        </div>
      </div>
      <div className="s16-set">
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <b className="small">S16 图鉴</b>
          <span className="mono small">{p.owned}/{p.total}</span>
          <span className="tiny faint">单独收集，不计入全图鉴</span>
          <span style={{ flex: 1 }} />
          <button className="sm primary" disabled={claiming || !p.ready.length} onClick={() => void claim()}>
            {p.ready.length ? `领取奖励（${p.ready.length} 档）` : p.next ? `再收 ${p.next.need} 张领下一档` : '已全部领取'}
          </button>
        </div>
        <div className="s16-set-bar"><i style={{ width: `${Math.min(100, (p.owned / Math.max(1, p.total)) * 100)}%` }} /></div>
        <div className="s16-set-marks">
          {S16_SET_REWARDS.map((r, i) => (
            <span key={i} className={i < p.claimed ? 'done' : p.owned >= p.marks[i] ? 'ready' : ''}>
              <b>{Math.round(r.at * 100)}%（{p.marks[i]} 张）</b>{r.label}{i < p.claimed ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>
      {predict && <S16Predict onClose={() => setPredict(false)} />}
      <style>{`
        .s16-hero{display:flex;gap:16px;align-items:center}.s16-hero-art{width:76px;flex:none}
        .s16-hero-copy{display:flex;flex-direction:column;gap:10px;min-width:0}
        .s16-set{display:flex;flex-direction:column;gap:8px;margin-top:14px}
        .s16-set-bar{height:6px;border-radius:3px;background:#ffffff14;overflow:hidden}
        .s16-set-bar i{display:block;height:100%;background:linear-gradient(90deg,#2b6fb0,#57c7ff)}
        .s16-set-marks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
        .s16-set-marks span{font-size:11px;line-height:1.5;color:var(--muted);border:1px solid #ffffff14;border-radius:4px;padding:5px 7px}
        .s16-set-marks span b{display:block;color:var(--text,#e8ece6);font-weight:600}
        .s16-set-marks span.ready{border-color:#57c7ff;color:#9fdcff}.s16-set-marks span.done{opacity:.55}
        @media (max-width:560px){.s16-set-marks{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </Panel>
  )
}
