import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BASE_PLAYER_CARDS, COACH_CARDS, cardById } from '../engine/cards'
import CardFace from '../ui/Card'
import TeamBoard from '../ui/cards/TeamBoard'
import '../styles.css'

/** Vite-only visual fixture for 完整战队阵容 6/6. Does not read accounts or call the server. */
const clubs = new Map<string, string[]>()
for (const p of BASE_PLAYER_CARDS) if (p.clubId) clubs.set(p.clubId, [...(clubs.get(p.clubId) ?? []), p.id])
const complete = COACH_CARDS.filter(c => c.clubId && !c.legend && (clubs.get(c.clubId)?.length ?? 0) >= 5)
  .filter((c, i, all) => all.findIndex(x => x.clubId === c.clubId) === i)

function Preview() {
  const [tag, setTag] = useState(new URLSearchParams(location.search).get('team') ?? complete[0]?.clubTag ?? '')
  const coach = complete.find(c => c.clubTag === tag) ?? complete[0]
  const squad = { slots: clubs.get(coach.clubId!)!.slice(0, 5), coach: coach.id }
  return <main style={{ padding: 16, maxWidth: 980, margin: 'auto' }}>
    <select value={coach.clubTag ?? ''} onChange={e => setTag(e.target.value)} aria-label="俱乐部">
      {complete.map(c => <option key={c.id} value={c.clubTag ?? ''}>{c.clubTag}</option>)}
    </select>
    <div className="panel" style={{ marginTop: 12 }}>
      <TeamBoard squad={squad}>
        <div className="cm-squad">
          {squad.slots.map(id => <div key={id} style={{ minWidth: 0, width: '100%', maxWidth: 150, margin: '0 auto' }}><CardFace card={cardById(id)!} size="sm" /></div>)}
        </div>
        <div style={{ marginTop: 12, maxWidth: 150 }}><CardFace card={coach} size="sm" /></div>
      </TeamBoard>
    </div>
  </main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
