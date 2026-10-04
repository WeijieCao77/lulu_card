import { useState } from 'react'
import { useCards } from '../ctx'
import { Modal } from '../../common'
import { WORLD_TEAMS } from '../../../engine/teams'
import { crestUrl } from '../../../engine/dossier'
import { S16_PREDICT, koOpen, koReward, swissOpen, swissReward } from '../../../engine/s16Predict'

const tagOf = (id: string) => WORLD_TEAMS.find((t) => t.id === id)?.tag ?? id
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }) : '待定')

function Team({ id, on, dim, onClick }: { id: string; on?: boolean; dim?: boolean; onClick?: () => void }) {
  const crest = crestUrl(id)
  return <button className={`sm s16p-team${on ? ' on' : ''}${dim ? ' dim' : ''}`} onClick={onClick} disabled={!onClick}>
    {crest && <span className="s16p-crest" style={{ backgroundImage: `url(${crest})` }} />}{tagOf(id)}
  </button>
}

/**
 * S16 赛事预测 (engine/s16Predict.ts): the 瑞士轮 sheet — eight qualifiers, two 3-0, two 0-3 — and, once the eight are
 * drawn, the 淘汰赛 bracket. Each locks at its stage's first match; rewards are claimed after the results are in.
 */
export default function S16Predict({ onClose, data = S16_PREDICT }: { onClose: () => void; data?: typeof S16_PREDICT }) {
  const { g, now, act, toast } = useCards()
  const mine = g.s16Predict ?? {}
  const sw = data.swiss, ko = data.ko
  const [qual, setQual] = useState<string[]>(mine.swiss?.qual ?? [])
  const [three, setThree] = useState<string[]>(mine.swiss?.threeZero ?? [])
  const [zero, setZero] = useState<string[]>(mine.swiss?.zeroThree ?? [])
  const [qf, setQf] = useState<string[]>(mine.ko?.qf ?? ['', '', '', ''])
  const [sf, setSf] = useState<string[]>(mine.ko?.sf ?? ['', ''])
  const [final, setFinal] = useState<string>(mine.ko?.final ?? '')
  const [busy, setBusy] = useState(false)
  const swOpen = swissOpen(now, sw), kOpen = koOpen(now, ko)
  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list)
  const send = async (action: string, args: Record<string, unknown>, ok: string) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await act(action, args)
      toast(r.ok ? ok : r.why ?? '没成功，稍后再试。')
    } finally { setBusy(false) }
  }
  const swR = swissReward(mine.swiss, now, sw), koR = koReward(mine.ko, now, ko)
  return (
    <Modal title="S16 赛事预测" onClose={onClose} onBgClose={() => {}}>
      <p className="tiny faint" style={{ marginTop: 0, lineHeight: 1.7 }}>
        两张预测单：瑞士轮（选晋级八强的 8 支队，再猜 2 支 3-0、2 支 0-3）和淘汰赛（八强抽签后填整张对阵）。每张在该阶段第一场开打时锁定，赛果确认后来这里领奖，每张只领最高一档。
      </p>

      <h4 style={{ margin: '12px 0 6px' }}>① 瑞士轮 <span className="tiny faint">锁定：{when(sw.lockAt)}</span></h4>
      {!sw.teams ? <p className="small muted">16 支队要等入围赛打完才确定，到时候开放。</p> : <>
        <div className="tiny faint">选 8 支晋级（已选 {qual.length}/8）</div>
        <div className="s16p-grid">{sw.teams.map((id) => <Team key={id} id={id} on={qual.includes(id)} onClick={swOpen ? () => { toggle(qual, setQual, id, 8); setThree(three.filter((x) => x !== id || !qual.includes(id))); setZero(zero.filter((x) => x !== id)) } : undefined} />)}</div>
        <div className="tiny faint">其中 2 支 3-0（已选 {three.length}/2）</div>
        <div className="s16p-grid">{qual.map((id) => <Team key={id} id={id} on={three.includes(id)} onClick={swOpen ? () => toggle(three, setThree, id, 2) : undefined} />)}</div>
        <div className="tiny faint">没晋级的里 2 支 0-3（已选 {zero.length}/2）</div>
        <div className="s16p-grid">{sw.teams.filter((id) => !qual.includes(id)).map((id) => <Team key={id} id={id} on={zero.includes(id)} onClick={swOpen ? () => toggle(zero, setZero, id, 2) : undefined} />)}</div>
        {swOpen && <button className="primary sm" disabled={busy || qual.length !== 8 || three.length !== 2 || zero.length !== 2} onClick={() => void send('s16_predict', { stage: 'swiss', picks: { qual, threeZero: three, zeroThree: zero } }, '瑞士轮预测已保存，锁定前可以随时改。')}>{mine.swiss ? '更新预测' : '提交预测'}</button>}
        {!swOpen && !mine.swiss && <p className="small muted">已锁定，你没有提交这张预测。</p>}
        {swR && <p className="small">结果：{swR.detail}。{swR.label}。{!mine.swiss?.claimedAt && Object.keys(swR.packs).length > 0 && <button className="primary sm" disabled={busy} onClick={() => void send('s16_predict_claim', { stage: 'swiss' }, '奖励已领取，放进卡包里了。')}>领取奖励</button>}{mine.swiss?.claimedAt && ' 已领取。'}</p>}
      </>}
      <p className="tiny faint">奖励：8 支全中十连包 ×2；6–7 支十连包 ×1；4–5 支选拔包 ×3；3-0 / 0-3 每猜中一支另送 1 个 S16 世界赛包。</p>

      <h4 style={{ margin: '16px 0 6px' }}>② 淘汰赛 <span className="tiny faint">锁定：{when(ko.lockAt)}</span></h4>
      {!ko.bracket ? <p className="small muted">瑞士轮结束、八强抽签后开放。</p> : <div className="s16p-bracket">
        <div>{ko.bracket.map((pair, i) => <div key={i} className="s16p-match">{pair.map((id) => <Team key={id} id={id} on={qf[i] === id} onClick={kOpen ? () => { const n = [...qf]; n[i] = id; setQf(n); setSf(['', '']); setFinal('') } : undefined} />)}</div>)}</div>
        <div>{[0, 1].map((i) => <div key={i} className="s16p-match">{[qf[i * 2], qf[i * 2 + 1]].map((id, k) => id ? <Team key={id} id={id} on={sf[i] === id} onClick={kOpen ? () => { const n = [...sf]; n[i] = id; setSf(n); setFinal('') } : undefined} /> : <span key={k} className="tiny faint">先选八强</span>)}</div>)}</div>
        <div><div className="s16p-match">{sf.map((id, k) => id ? <Team key={id} id={id} on={final === id} onClick={kOpen ? () => setFinal(id) : undefined} /> : <span key={k} className="tiny faint">先选四强</span>)}</div><div className="tiny faint">冠军</div></div>
      </div>}
      {ko.bracket && kOpen && <button className="primary sm" disabled={busy || qf.some((x) => !x) || sf.some((x) => !x) || !final} onClick={() => void send('s16_predict', { stage: 'ko', picks: { qf, sf, final } }, '淘汰赛预测已保存，锁定前可以随时改。')}>{mine.ko ? '更新预测' : '提交预测'}</button>}
      {koR && <p className="small">结果：{koR.detail}。{koR.label}。{!mine.ko?.claimedAt && Object.keys(koR.packs).length > 0 && <button className="primary sm" disabled={busy} onClick={() => void send('s16_predict_claim', { stage: 'ko' }, '奖励已领取，放进卡包里了。')}>领取奖励</button>}{mine.ko?.claimedAt && ' 已领取。'}</p>}
      <p className="tiny faint">奖励：冠亚军全中十连包 ×3；猜中冠军 ×2；猜中亚军 ×1；决赛两队都对但冠亚军反了选拔包 ×5；猜中一支决赛队选拔包 ×3。</p>
      <style>{`
        .s16p-grid{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
        .s16p-team{display:inline-flex;align-items:center;gap:5px;min-width:64px}
        .s16p-team.on{border-color:#57c7ff;color:#9fdcff;background:#57c7ff1a}
        .s16p-team:disabled{opacity:1;cursor:default}
        .s16p-crest{width:16px;height:16px;background:center/contain no-repeat}
        .s16p-bracket{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:center;margin:8px 0}
        .s16p-match{display:flex;flex-direction:column;gap:4px;padding:6px;border:1px solid #ffffff14;border-radius:6px;margin-bottom:6px}
      `}</style>
    </Modal>
  )
}
