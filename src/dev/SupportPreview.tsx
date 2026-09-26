import { createRoot } from 'react-dom/client'
import { CardCtx } from '../ui/cards/ctx'
import SupportWall from '../ui/cards/SupportWall'
import '../styles.css'

/** Vite-only visual fixture for the 赛事应援墙: answers come from a stub, no account or server is touched. */
const wall = [
  { id: '1', author: '峡谷老玩家 #1A2B', target: 'Faker', body: '十年如一日，再拿一个！', created: '2026-09-26T10:00:00Z' },
  { id: '2', author: '小龙 #9C0D', target: 'BLG', body: '今年一定要把奖杯带回家。', created: '2026-09-26T09:00:00Z' },
]
const mine = [
  { id: '3', target: 'LPL', body: 'LPL 冲冲冲', status: 'pending', created: '2026-09-26T11:00:00Z', reason: '' },
  { id: '4', target: 'T1', body: '加油', status: 'rejected', created: '2026-09-25T11:00:00Z', reason: '内容太短，写多一点吧' },
]
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const path = String(url)
  const body = path.includes('/mine') ? { ok: true, rows: mine }
    : path.includes('/messages') && init?.method === 'POST' ? { ok: true, row: { id: '5', status: 'pending' } }
      : path.includes('/messages') ? { ok: true, rows: wall, more: false }
        : { ok: true, title: '2026 英雄联盟全球总决赛', enabled: true }
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}) as typeof fetch
const ctx = { g: { id: 'VM-PREV-IEWX-XXXX-XXXX-XXXX' }, cloud: true } as never
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(
  <main style={{ padding: 16, maxWidth: 760, margin: 'auto' }}><CardCtx.Provider value={ctx}><SupportWall /></CardCtx.Provider></main>)
