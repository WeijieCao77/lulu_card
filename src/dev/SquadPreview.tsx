import { createRoot } from 'react-dom/client'
import { BASE_PLAYER_CARDS, COACH_CARDS, ECHO_CARDS, LEGEND_CARDS, S16_CARDS } from '../engine/cards'
import { newGacha } from '../engine/gacha'
import { CardCtx } from '../ui/cards/ctx'
import SquadScreen from '../ui/cards/Squad'
import '../styles.css'

/** Vite-only fixture: the real squad screen with a stub account holding one club's five and coach. */
const tag = new URLSearchParams(location.search).get('team') ?? 'T1'
const coach = COACH_CARDS.find(c => c.clubTag === tag && !c.legend)!
const five = BASE_PLAYER_CARDS.filter(p => p.clubId === coach.clubId).slice(0, 5)
// ?mix=1: one of every face kind side by side (回响, 彩卡, S16, ordinary) — they must be the same shape
if (new URLSearchParams(location.search).get('mix')) {
  five[0] = ECHO_CARDS.find(c => c.role === five[0].role) ?? five[0]
  five[1] = LEGEND_CARDS.find(c => c.legend?.art && c.role === five[1].role) ?? five[1]
  five[2] = S16_CARDS.find(c => c.role === five[2].role) ?? five[2]
  five[3] = ECHO_CARDS.find(c => c.role === five[3].role && c.rarity === 'gold') ?? five[3]
}
const g = newGacha('VM-PREV-IEWX-XXXX-XXXX-XXXX', '预览', '2026-09-26') as never as Record<string, any>
for (const c of [...five, coach]) g.cards[c.id] = { id: c.id, level: 0, dupes: 0, seen: 1, got: '2026-09-26' }
g.squad = { slots: five.map(p => p.id), coach: coach.id }
const noop = async () => ({ ok: true }) as never
const ctx = { g, now: Date.now(), cloud: true, phone: null, bound: () => {}, commit: async () => {}, act: noop, toast: (m: string) => console.log(m), collect: async () => 0, openDossier: () => {}, go: () => {} } as never
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(
  <main className="cm" style={{ padding: 16, maxWidth: 1180, margin: 'auto' }}><CardCtx.Provider value={ctx}><SquadScreen /></CardCtx.Provider></main>)
