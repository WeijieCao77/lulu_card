import { useCallback, useEffect, useState } from 'react'
import { useCards } from './ctx'
import './feedback.css'

/** 赛事应援墙 (support-api.js): write to anyone you support; the owner reads it before it goes up. */
interface WallRow { id: string; author: string; target: string; body: string; created: string }
interface MineRow { id: string; target: string; body: string; status: 'pending' | 'approved' | 'rejected'; created: string; reason: string }
const STATUS_CN = { pending: '待审核', approved: '已上墙', rejected: '未通过' } as const
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, '')

async function call<T>(path: string, body?: unknown): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(`/api/support${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal })
    const data = await r.json().catch(() => ({ ok: false }))
    if (!data.ok) throw new Error(data.why || '应援墙暂时连不上，稍后再试。')
    return data as T
  } catch (e) {
    throw e instanceof Error && e.name !== 'AbortError' ? e : new Error('应援墙暂时连不上，稍后再试。')
  } finally { clearTimeout(timer) }
}

export default function SupportWall() {
  const { g, cloud } = useCards()
  const [tab, setTab] = useState<'wall' | 'mine'>('wall')
  const [title, setTitle] = useState('赛事应援')
  const [enabled, setEnabled] = useState(true)
  const [rows, setRows] = useState<WallRow[]>([])
  const [more, setMore] = useState(false)
  const [mine, setMine] = useState<MineRow[]>([])
  const [target, setTarget] = useState('')
  const [text, setText] = useState('')
  const [key, setKey] = useState(newKey)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (offset = 0) => {
    setError('')
    try {
      const cfg = await call<{ title: string; enabled: boolean }>('')
      setTitle(cfg.title); setEnabled(cfg.enabled)
      const page = await call<{ rows: WallRow[]; more: boolean }>(`/messages?offset=${offset}`)
      setRows(r => offset ? [...r, ...page.rows] : page.rows); setMore(page.more)
      const own = await call<{ rows: MineRow[] }>('/mine', { id: g.id })
      setMine(own.rows)
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
  }, [g.id])
  useEffect(() => { if (cloud) void load() }, [cloud, load])

  const send = async () => {
    if (sending) return
    const t = target.trim(), b = text.trim()
    if (!t || [...t].length > 40) { setError('写上你想支持的人或队伍，最多 40 字。'); return }
    if ([...b].length < 2 || [...b].length > 200) { setError('留言 2–200 字。'); return }
    setSending(true); setError('')
    try {
      await call('/messages', { id: g.id, target: t, body: b, requestId: key })
      setTarget(''); setText(''); setKey(newKey())
      setNotice('收到了。作者看过之后才会上墙——在「我的留言」里能看到审核状态。')
      setTab('mine')
      const own = await call<{ rows: MineRow[] }>('/mine', { id: g.id })
      setMine(own.rows)
    } catch (e) { setError(e instanceof Error ? e.message : '没发出去，稍后再试。') }
    finally { setSending(false) }
  }

  if (!cloud) return <div className="feedback-board"><p className="note">需要联网。</p></div>
  return (
    <div className="feedback-board">
      <div className="feedback-header">
        <h2>{title} · 应援墙</h2>
        <p className="note">写给你支持的选手、战队或赛区。留言经作者审核后公开，每分钟一条、每天最多五条。</p>
        <div className="tabs">
          <button className={tab === 'wall' ? 'active' : ''} onClick={() => setTab('wall')}>应援墙</button>
          <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>我的留言</button>
        </div>
      </div>

      {enabled ? (
        <div className="feedback-compose">
          <input value={target} onChange={e => setTarget(e.target.value)} maxLength={80} aria-label="致" placeholder="致：选手、战队或赛区，比如 Faker / BLG / LPL" disabled={sending} />
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={400} rows={3} aria-label="留言" placeholder="想对他们说的话（2–200 字）" disabled={sending} />
          <div className="compose-footer">
            <span className="char-count">{200 - [...text].length >= 0 ? `还能写 ${200 - [...text].length} 个字` : `超了 ${[...text].length - 200} 个字`}</span>
            <button onClick={send} disabled={sending}>{sending ? '正在发…' : '送上应援'}</button>
          </div>
        </div>
      ) : <p className="note">留言征集暂未开放，可以先看看大家的应援。</p>}

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      <div className="feedback-list">
        {tab === 'wall' && (rows.length === 0
          ? <div className="empty">墙上还是空的，第一条应援就等你了。</div>
          : rows.map(r => (
            <div key={r.id} className="feedback-item">
              <div className="item-header"><span className="status status-shown">致 {r.target}</span><span className="time">{new Date(r.created).toLocaleDateString()}</span></div>
              <div className="item-text">{r.body}</div>
              <div className="item-footer"><span className="mine-badge">— {r.author}</span></div>
            </div>
          )))}
        {tab === 'wall' && more && <button onClick={() => void load(rows.length)}>看更多</button>}
        {tab === 'mine' && (mine.length === 0
          ? <div className="empty">你还没留过言。</div>
          : mine.map(r => (
            <div key={r.id} className="feedback-item">
              <div className="item-header"><span className={`status status-${r.status === 'approved' ? 'shown' : r.status === 'rejected' ? 'hidden' : 'pending'}`}>{STATUS_CN[r.status]}</span><span className="time">{new Date(r.created).toLocaleDateString()}</span></div>
              <div className="item-text">致 {r.target}：{r.body}</div>
              {r.reason && <div className="note">作者说明：{r.reason}</div>}
            </div>
          )))}
      </div>
      <div className="feedback-actions"><button onClick={() => void load()}>刷新</button></div>
    </div>
  )
}
