import { createRoot } from 'react-dom/client'
import { BASE_PLAYER_CARDS, COACH_CARDS, LEGEND_CARDS } from '../engine/cards'
import type { Card } from '../engine/cards'
import { newGacha } from '../engine/gacha'
import { CardCtx } from '../ui/cards/ctx'
import CardFace from '../ui/Card'
import SquadScreen from '../ui/cards/Squad'
import WorldsGallery from '../ui/cards/WorldsGallery'
import Market from '../ui/cards/Market'
import Packs from '../ui/cards/Packs'
import { RiftNavigation } from '../ui/RiftChrome'
import { TABS } from '../ui/CardMode'
import Dossier from '../ui/Dossier'
import MusicPlayer from '../ui/MusicPlayer'
import '../styles.css'

/**
 * Vite-only fixture for promotional screenshots (promo-preview.html?view=...): the real components with a
 * stub account and, for the market, a stub shelf. No server, account or player data is read or written.
 *   legends  — a row of 彩卡 at full size      gallery — the 名人堂 as a player sees it
 *   team     — the squad screen, one full club market  — the trading post with a lively shelf
 *   packs    — the pack shop: region packs and the week's discount
 *   nav      — the grouped sidebar          dossier — 图鉴 with the rating explainer
 *   music    — the background-music player (dev only until launch)
 */
const params = new URLSearchParams(location.search)
const view = params.get('view') ?? 'legends'
const tag = params.get('team') ?? 'T1'
const byName = (ign: string) => LEGEND_CARDS.find(c => c.ign === ign || c.legend?.id === ign)

const g = newGacha('VM-PROM-OXXX-XXXX-XXXX-XXXX', '噜噜卡玩家', '2026-09-26') as never as Record<string, any>
const own = (cards: Card[]) => { for (const c of cards) g.cards[c.id] = { id: c.id, level: 2, dupes: 1, seen: 3, got: '2026-09-20' } }
g.coins = 128_600; g.pulls = 420
if (view === 'team' || view === 'gallery') {
  const coach = COACH_CARDS.find(c => c.clubTag === tag && !c.legend)!
  const five = BASE_PLAYER_CARDS.filter(p => p.clubId === coach.clubId).slice(0, 5)
  own([...five, coach]); g.squad = { slots: five.map(p => p.id), coach: coach.id }
  own(LEGEND_CARDS.filter((_, i) => i % 3 === 0))
}

// a believable shelf: gold and legend cards up top, prices in line with the floors, some bidding under way
if (view === 'market') {
  const now = Date.now()
  const pick = [...LEGEND_CARDS.slice(0, 3), ...BASE_PLAYER_CARDS.filter(c => c.rarity === 'gold').slice(0, 9), ...BASE_PLAYER_CARDS.filter(c => c.rarity === 'silver').slice(0, 6)]
  const listings = pick.map((c, i) => {
    const ask = c.rarity === 'mythic' ? 6000 + i * 900 : c.rarity === 'gold' ? 900 + i * 110 : 260 + i * 20
    const best = i % 3 === 2 ? null : Math.round(ask * (1.15 + (i % 4) * .1))
    return { id: String(9000 + i), cardId: c.id, level: i % 4, ask, seller: ['峡谷老玩家 #1A2B', '小龙 #9C0D', '猪之家 #7E11', '北极星 #33F0'][i % 4], mine: false,
      offers: best ? 1 : 0, best, bid: false, ends: now + (1 + i) * 37 * 60_000, buyout: i % 2 ? Math.round(ask * 1.8) : null, bids: best ? 1 + (i % 5) : 0,
      min: best ? Math.ceil(best * 1.05) : ask, drawAt: null, hours: 24 }
  })
  const shelf = { ok: true, listings, own: [], next: null, sort: 'hot', gate: null, haggle: 0, total: 312, pool: listings.map(l => [l.cardId, 1 + (Number(l.id) % 3)]),
    protectSec: 60, hours: 24, step: .05, snipe: 10, buyoutMin: 1.2, now, page: 1 }
  globalThis.fetch = (async (url: string) => {
    const path = String(url)
    const body = path.includes('/market/browse') ? shelf : path.includes('/market/') ? { ok: true, listings: [], offers: [], rows: [], mine: [], inbound: [], outbound: [], waiting: 0, ids: [] } : { ok: true }
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}

const noop = async () => ({ ok: true }) as never
const ctx = { g, now: Date.now(), today: params.get('today') ?? '2026-09-28', cloud: true, phone: '8000', bound: () => {}, commit: async () => {}, act: noop, toast: () => {}, collect: async () => 0, openDossier: () => {}, go: () => {} } as never
const showcase = (params.get('names')?.split(',') ?? ['Faker', 'Uzi', 'Clearlove', 'Caps', 'Rookie', 'TheShy']).map(byName).filter(Boolean) as Card[]

function Legends() {
  const cols = Number(params.get('cols')) || 3
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, max-content)`, gap: 18, justifyContent: 'center', padding: '12px 0' }}>
    {showcase.map(c => <CardFace key={c.id} card={c} level={3} size="lg" />)}
  </div>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(
  <main className="cm" style={{ padding: 16, maxWidth: 1180, margin: 'auto' }}>
    <CardCtx.Provider value={ctx}>
      {view === 'legends' ? <Legends /> : view === 'gallery' ? <WorldsGallery />
        : view === 'team' ? <div className="promo-team"><style>{'.promo-team > .panel:first-of-type { display: none }'}</style><SquadScreen /></div>
        : view === 'packs' ? <Packs />
        : view === 'dossier' ? <Dossier playerId={null} onOpen={() => {}} />
        : view === 'music' ? <div className="cardmode rift-ui" style={{ minHeight: 500 }}><MusicPlayer /></div>
        : view === 'nav' ? <div className="cardmode rift-ui" style={{ width: 240 }}><RiftNavigation tabs={TABS} active="packs" onSelect={() => {}} /></div> : <Market />}
    </CardCtx.Provider>
  </main>)
// ?at=<css selector>: scroll that part of the screen to the top before the screenshot is taken
const at = params.get('at')
if (at) setTimeout(() => document.querySelector(at)?.scrollIntoView({ block: 'start' }), 2500)
