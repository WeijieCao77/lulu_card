import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { S16_CARDS } from '../engine/cards'
import type { PlayerCard, Rarity } from '../engine/cards'
import { S16Card, S16CardBack } from '../ui/cards/s16/S16Card'
import '../styles.css'
import S16Section from '../ui/cards/s16/S16Section'
import S16Predict from '../ui/cards/s16/S16Predict'
import { CardCtx } from '../ui/cards/ctx'
import type { CardCtxValue } from '../ui/cards/ctx'
import { newGacha } from '../engine/gacha'

const DEMO_PREDICT = {
  swiss: { teams: ['T18', 'T1', 'T26', 'T50', 'T20', 'T2', 'T29', 'T24', 'T12', 'T43', 'T17', 'T4', 'T42', 'T39', 'T35', 'T28'], lockAt: '2026-10-20T08:00:00+08:00', qualified: null, threeZero: null, zeroThree: null, confirmedAt: null },
  ko: { bracket: [['T18', 'T12'], ['T20', 'T2'], ['T24', 'T26'], ['T17', 'T4']], lockAt: '2026-10-29T08:00:00+08:00', qf: null, sf: null, final: null, confirmedAt: null },
}
function Demo({ children }: { children: React.ReactNode }) {
  const g = newGacha('review', '审核', '2026-10-12')
  g.packs.s16 = 2
  const ctx = { g, now: Date.parse('2026-10-19T12:00:00+08:00'), act: async () => ({ ok: false, why: '审核页，不会提交' }), toast: (m: string) => console.log(m) } as unknown as CardCtxValue
  return <CardCtx.Provider value={ctx}>{children}</CardCtx.Provider>
}

/** S16 世界赛审核页（vite dev only）：全部参赛选手卡的「?」状态，以及揭晓后的金/银/铜/FMVP 彩卡示例。 */
const SIZES = ['lg', 'md', 'sm'] as const
function revealed(c: PlayerCard, rating: number, rarity: Rarity, prev: number | null, games: number, fmvp = false): PlayerCard {
  const d = rating - c.rating
  const attrs = Object.fromEntries(Object.entries(c.attrs).map(([k, v]) => [k, Math.max(1, Math.min(99, v + d))])) as unknown as PlayerCard['attrs']
  return { ...c, rating, rarity: fmvp ? 'mythic' : rarity, attrs, s16: { ...c.s16!, revealed: true, prev, games, fmvp } }
}
function Review() {
  const [size, setSize] = useState<(typeof SIZES)[number]>('lg')
  const [predict, setPredict] = useState(false)
  const pick = (ign: string) => S16_CARDS.find((c) => c.ign === ign) ?? S16_CARDS[0]
  const samples = [
    revealed(pick('Chovy'), 90, 'gold', 88, 6),
    revealed(pick('Faker'), 87, 'gold', 89, 5),
    revealed(pick('Knight'), 85, 'silver', 85, 4),
    revealed(pick('Caps'), 79, 'silver', 74, 3),
    revealed(pick('Berserker'), 71, 'bronze', null, 1),
    revealed(pick('Canyon'), 90, 'gold', 89, 12, true),
  ]
  const w = size === 'lg' ? 184 : size === 'md' ? 132 : 96
  return <main style={{ padding: '24px 28px 80px', color: '#e8ece6', background: '#0d1417', minHeight: '100vh', fontFamily: 'Microsoft YaHei, sans-serif' }}>
    <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>S16 世界赛 · 卡面审核（初稿）</h1>
    <p style={{ color: '#9fb0a8', margin: '0 0 16px' }}>共 {S16_CARDS.length} 张（17 队首发；替补和巴西两队待定）。开赛前全部是「?」，打过比赛才揭晓数值；下面一排是揭晓后的样子（数值是示例）。</p>
    <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{SIZES.map((s) => <button key={s} onClick={() => setSize(s)} style={{ background: s === size ? '#57c7ff' : '#1b2a3b', color: s === size ? '#071425' : '#cfd8e8', border: 0, borderRadius: 6, padding: '5px 10px' }}>{s === 'lg' ? '大' : s === 'md' ? '中' : '小'}</button>)}</div>
    <h3 style={{ margin: '0 0 10px' }}>揭晓后（示例）：金 ▲ / 金 ▼ / 银 持平 / 银 ▲ / 铜 首次揭晓 / FMVP 彩卡 · 卡背</h3>
    <div id="s16-samples" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 28 }}>
      {samples.map((c, i) => <S16Card key={i} card={c} size={size} />)}
      <div style={{ width: w }}><S16CardBack size={size} /></div>
    </div>
    <h3 style={{ margin: '0 0 10px' }}>卡包页 · S16 专区</h3>
    <div id="s16-section" style={{ maxWidth: 900, marginBottom: 28 }}><Demo><S16Section open={() => {}} busy={false} today="2026-10-12" /></Demo></div>
    <button id="s16-predict-open" onClick={() => setPredict(true)} style={{ marginBottom: 20 }}>预览赛事预测（示例赛程）</button>
    {predict && <Demo><S16Predict onClose={() => setPredict(false)} data={DEMO_PREDICT} /></Demo>}
    <h3 style={{ margin: '0 0 10px' }}>全部参赛选手（开赛前）</h3>
    <div id="s16-all" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${w}px,1fr))`, gap: '18px 14px' }}>
      {S16_CARDS.map((c) => <S16Card key={c.id} card={c} size={size} />)}
    </div>
  </main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Review />)
