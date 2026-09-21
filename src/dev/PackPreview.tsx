import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BASE_PLAYER_CARDS, COACH_CARDS, LEGEND_CARDS } from '../engine/cards'
import type { Pulled } from '../engine/gacha'
import PackStage from '../ui/cards/PackStage'
import '../styles.css'

/** Vite-only visual fixture. Does not read accounts or call the server. */
function Preview() {
  const [cards, setCards] = useState<Pulled[] | null>(null)
  const [collected, setCollected] = useState(0)
  const [message, setMessage] = useState('')
  const sample = (count: number, coach = false) => {
    const bronze = BASE_PLAYER_CARDS.filter(c => c.rarity === 'bronze')
    const silver = BASE_PLAYER_CARDS.filter(c => c.rarity === 'silver')
    const gold = BASE_PLAYER_CARDS.filter(c => c.rarity === 'gold')
    const pool = coach ? COACH_CARDS.slice(0, count) : [bronze[0], silver[0], gold[0], bronze[1], LEGEND_CARDS[8], bronze[0], silver[1], bronze[2], gold[1], LEGEND_CARDS[10]].slice(0, count)
    setCards(pool.map((card, i) => ({ card, dupe: i === 5, salvage: 100 })))
  }
  return <main style={{ padding: 28, maxWidth: 720, margin: 'auto' }}>
    <h1>开包动画预览</h1><p>固定样例卡牌，不消耗金币、卡包，也不会改变账号。</p>
    <div className="row wrap" style={{ gap: 12 }}>
      <button onClick={() => setCards([{card: LEGEND_CARDS.find(c=>c.ign==='Caps')!, dupe: false, salvage: 100}])}>彩卡特效预览</button><button onClick={() => sample(1)}>单卡包预览</button><button onClick={() => sample(3)}>三张卡预览</button>
      <button onClick={() => sample(10)}>十连包预览</button><button onClick={() => sample(1, true)}>教练包预览</button>
    </div><p role="status">已完成 {collected} 次预览。{message}</p>
    {cards && <PackStage pulled={cards} packName={cards.every(p => p.card.kind === 'coach') ? '教练包' : cards.length === 10 ? '十连包' : cards.length === 3 ? '选拔包' : '试训包'} onDone={() => { setCards(null); setCollected(n => n + 1) }} onSellAll={() => setMessage('预览不执行分解。')} />}
  </main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
