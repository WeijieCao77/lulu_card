import { createRoot } from 'react-dom/client'
import { BASE_PLAYER_CARDS, COACH_CARDS, ECHO_CARDS, LEGEND_CARDS, S16_CARDS, SEOUL_CARDS } from '../engine/cards'
import type { Card } from '../engine/cards'
import CardFace, { CardSlot } from '../ui/Card'
import '../styles.css'

/**
 * Vite-only fixture: every face kind at every size and in the grids that hand a card a column.
 * Every card is one 5:7 canvas (CardScale), so each row must line up exactly.
 */
const kinds: [string, Card][] = [
  ['金卡', BASE_PLAYER_CARDS.find(c => c.rarity === 'gold')!],
  ['银卡', BASE_PLAYER_CARDS.find(c => c.rarity === 'silver')!],
  ['铜卡', BASE_PLAYER_CARDS.find(c => c.rarity === 'bronze')!],
  ['彩卡', LEGEND_CARDS.find(c => c.legend?.art)!],
  ['回响', ECHO_CARDS.find(c => c.rarity === 'gold')!],
  ['S16', S16_CARDS[0]],
  ['首尔', SEOUL_CARDS[0]],
  ['教练', COACH_CARDS.find(c => !c.legend)!],
].filter(([, c]) => !!c) as [string, Card][]
const row = { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' } as const
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(
  <main className="cm" style={{ padding: 16, maxWidth: 1180, margin: 'auto' }}>
    <h1>卡面尺寸预览</h1>
    {(['sm', 'md', 'lg'] as const).map(size => <section key={size}><h3>{size}</h3><div style={row}>
      {kinds.map(([k, c]) => <CardFace key={k} card={c} size={size} level={2} dupes={1} />)}
      {size === 'md' && <CardSlot label="上单" />}
    </div></section>)}
    <h3>收藏格（cm-grid）</h3>
    <div className="cm-grid">{kinds.map(([k, c]) => <CardFace key={k} card={c} onClick={() => {}} />)}</div>
    <h3>战报（report-cards）</h3>
    <div className="report-cards">{kinds.map(([k, c], i) => <CardFace key={k} card={c} footer={i === 0 ? '全场最佳' : undefined} selected={i === 0} />)}</div>
    <h3>交易区（market-box）</h3>
    <div className="market-shelf" style={row}>{kinds.slice(0, 6).map(([k, c]) => <div key={k} className="market-box"><CardFace card={c} /><div className="tiny">{k}</div></div>)}</div>
  </main>)
