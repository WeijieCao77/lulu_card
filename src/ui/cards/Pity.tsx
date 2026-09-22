import type { CSSProperties } from 'react'
import { useCards } from './ctx'
import { Panel } from '../common'
import { HARD_PITY, SOFT_PITY, MYTHIC_FLOOR, MYTHIC_PACK_NAMES } from '../../engine/gacha'

/**
 * The two guarantees, as two bars.
 *
 * The pack panel's header said 「距保底 N 抽」 and meant the gold one; the
 * 彩卡 floor was a sentence on the odds page and nowhere else, so nobody
 * knew how far along it they were. Two bars, separately, because they are
 * separate counters: a gold resets the gold count and leaves the 彩卡 count
 * where it was; a 彩卡 resets both. Both live on the account, not on a
 * pack — see gacha.ts — and coach packs move neither.
 */
const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const head: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }
const track: CSSProperties = { position: 'relative', height: 8, minWidth: 0, flex: 'none', width: '100%' }
const tick: CSSProperties = { position: 'absolute', top: -3, width: 2, height: 14, background: 'var(--text)', opacity: .35, borderRadius: 1 }

export default function Pity() {
  const { g } = useCards()
  const gold = Math.min(HARD_PITY, g.pity ?? 0)
  const soft = gold >= SOFT_PITY
  const mythic = Math.min(MYTHIC_FLOOR, g.mythicDry ?? 0)
  const mythicRemaining = Math.max(1, MYTHIC_FLOOR - mythic)
  return (
    <Panel
      title="保底进度"
      actions={<span className="tiny muted">换包不重置</span>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px 28px' }}>
        <div style={row}>
          <div style={head}><b>彩卡</b><span className="tiny muted">{mythic}/{MYTHIC_FLOOR} · {mythic >= MYTHIC_FLOOR ? '下一张必出' : `最多再 ${mythicRemaining} 张必出`}</span></div>
          <div className="bar" style={track}><i style={{ width: `${mythic / MYTHIC_FLOOR * 100}%`, background: 'linear-gradient(90deg,#86d9e9,#b89be3,#edc98d)' }} /></div>
          <span className="tiny faint">仅{ MYTHIC_PACK_NAMES }累计此进度。</span>
        </div>
        <div style={row}>
          <div style={head}>
            <b>金卡</b>
            <span className="tiny muted">
              {gold}/{HARD_PITY} · 还差 <b>{HARD_PITY - gold}</b> 抽必出
              {soft ? '，概率递增中' : `，第 ${SOFT_PITY} 抽起概率递增`}
            </span>
          </div>
          <div className="bar" style={track} title={`第 ${SOFT_PITY} 抽起概率递增，第 ${HARD_PITY} 抽必出`}>
            <i style={{ width: `${(gold / HARD_PITY) * 100}%`, background: soft ? 'var(--warn)' : '#d4a53a' }} />
            <span style={{ ...tick, left: `${(SOFT_PITY / HARD_PITY) * 100}%` }} aria-hidden />
          </div>
        </div>
      </div>
    </Panel>
  )
}
