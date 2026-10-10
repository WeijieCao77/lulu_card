import { useEffect, useState } from 'react'
import { useCards } from '../ctx'
import { Panel } from '../../common'
import { PACKS, S16_SET_REWARDS, s16SetProgress } from '../../../engine/gacha'
import type { PackKind } from '../../../engine/gacha'
import { GOLD_AT, S16_CARDS, SILVER_AT } from '../../../engine/cards'
import { S16CardBack } from './S16Card'
import S16Predict from './S16Predict'
import { S16_PREDICT_EVENT, S16_SECTION_ID } from './S16Banner'

/**
 * The pack page's S16 世界赛 section: what the series is, the pack (until it comes off sale), and the S16 图鉴 marks.
 * Owner 2026-10-04: every player equally likely, the FMVP's card becomes a 彩卡. Owner 2026-10-10: a team's five cards
 * stay 「?」 until the team is knocked out, then reveal and freeze (scripts/s16_ratings.py).
 */
export default function S16Section({ open, busy, today }: { open: (kind: PackKind, pay: 'pack' | 'coins') => void; busy: boolean; today: string }) {
  const { g, act, toast } = useCards()
  const [claiming, setClaiming] = useState(false)
  const [predict, setPredict] = useState(false)
  // the banner's 「赛事预测」 button (S16Banner) lives outside this page
  useEffect(() => {
    const show = () => setPredict(true)
    window.addEventListener(S16_PREDICT_EVENT, show)
    return () => window.removeEventListener(S16_PREDICT_EVENT, show)
  }, [])
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
  return (<>
    <div id={S16_SECTION_ID} />
    <Panel title="S16 世界赛" actions={<span className="tiny muted">限时 · 卖到 {def.until?.slice(5).replace('-', '/')} · {def.cost} 金币三张</span>}>
      <div className="s16-hero">
        <div className="s16-hero-art"><S16CardBack size="sm" /></div>
        <div className="s16-hero-copy">
          <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>
            S16 参赛的 {S16_CARDS.length} 位选手。战队还在比赛时，这支队五个人的卡都是「?」，不能上阵；<b>战队被淘汰时，这支队五个人的卡揭晓最终数值和金银铜，并永久定格</b>，以后普通卡调整也不再跟着变。走得越远越晚揭晓：入围赛出局的最先，冠亚军决赛后最后揭晓。
            评分以他的普通卡为底，按世界赛表现（和对面同位置的人比，对手越强越算数）和战队名次（冠军 +4、亚军 +3、四强 +2、八强 +1、瑞士轮出局 0、入围赛出局 −1）加减，最高 90（入围赛出局最高 87、瑞士轮出局最高 88、八强出局最高 89，四强以上才能到 90）；金银铜和普通卡同一条线（{GOLD_AT} 金、{SILVER_AT} 银）。卡面上的箭头表示比他的普通卡高或低多少。
            冠军队全员再 +2，<b>FMVP 的卡自动升级成彩卡</b>（评分 94–97，对标历届 S 赛 FMVP 彩卡）；<b>每个账号只有一张升级成彩卡，同一个人多出来的每张换 1 个十连包</b>。<b>整个 S16 一场没上的选手（包括替补），战队出局时按他联赛里的数值（普通卡数值）揭晓</b>，不会一直是「?」。<br />交易：比赛期间 S16 卡在市场的「S16 世界赛」交易区竞拍，每天 10:00–20:00 开放、当天 20:00 统一结拍，不能一口价、不能换卡；决赛前一天 20:00 起暂停，决赛后按普通卡交易。比赛期间我们会严查小号倒卡、自买自卖，一经核实回收卡牌并封号。<br />S 赛结束后 S16 包继续卖一段时间，数值都已定格，改成按金银铜爆率开卡，也有机会开出 FMVP 彩卡；下架时间另行公告。<br />卡面照片目前是各选手 2026 赛季的定妆照，S16 官方定妆照发布后会统一更换，已经抽到的卡也会自动换新照片。
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
  </>)
}
