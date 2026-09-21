import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CUP_TEAMS } from '../engine/cupTeams'
import { playRivalMatch } from '../engine/arena'
import { LEGEND_CARDS, COACH_CARDS } from '../engine/cards'
import Report from '../ui/cards/Report'
import CardFace from '../ui/Card'
import '../styles.css'
import '../ui/riftChrome.css'

// No account reads, mutations, rewards, or network calls. Vite-only fixture.
const squad = CUP_TEAMS[0].squad
const rival = { ...CUP_TEAMS[1].squad, name: '验收队伍', tag: 'QA', levels: {}, div: 0, points: 0 }
const result = playRivalMatch(squad, () => 0, rival, 5, 204, undefined, true)
function Preview() {
  const [open, setOpen] = useState(true)
  return <main style={{ padding: 16 }}>
    <h1>峡谷战报验收</h1><button onClick={() => setOpen(true)}>打开战报</button>
    <div className="row wrap" style={{ marginTop: 20 }}>
      <CardFace card={LEGEND_CARDS.find(c => c.legend?.id === 'msi-2021-gala')!} />
      <CardFace card={COACH_CARDS.find(c => c.name === 'kkOma')!} />
    </div>
    {open && <Report result={result} opponentId="" opponentName="验收队伍" mySquad={squad} level={() => 0} onClose={() => setOpen(false)} />}
  </main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
