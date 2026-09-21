import { useEffect, useRef, useState } from 'react'
import { useCards } from './ctx'
import { mailLine, unreadMail } from '../../engine/market'
import FeedbackBoard from './FeedbackBoard'
import type { MailItem } from '../../engine/market'

const when = (ms: number): string => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MailButton({ onClick, active = false }: { onClick: () => void; active?: boolean }) {
  const { g } = useCards()
  const unread = unreadMail(g)
  return <button type="button" className={`chip mail-chip${unread ? ' own' : ''}`} onClick={onClick}
    aria-current={active ? 'page' : undefined} title="向作者提建议，查收官方奖励和交易通知">
    ✉ 信箱{unread > 0 && <b className="mail-badge">{unread}</b>}
  </button>
}

export default function MailBox() {
  const { g } = useCards()
  const [page, setPage] = useState<'feedback' | 'rewards'>(() => unreadMail(g) > 0 ? 'rewards' : 'feedback')
  return <>
    <div className="row inbox-filters" aria-label="信箱类型">
      <button className={page === 'feedback' ? 'primary' : 'ghost'} aria-pressed={page === 'feedback'} onClick={() => setPage('feedback')}>玩家建议</button>
      <button className={page === 'rewards' ? 'primary' : 'ghost'} aria-pressed={page === 'rewards'} onClick={() => setPage('rewards')}>奖励与交易通知{unreadMail(g) > 0 ? `（${unreadMail(g)}）` : ''}</button>
    </div>
    {page === 'feedback' ? <FeedbackBoard /> : <RewardInbox />}
  </>
}

function RewardInbox() {
  const { g, cloud, act, toast } = useCards()
  const [filter, setFilter] = useState<'all' | 'grant' | 'trade'>('all')
  const collecting = useRef(false)
  const entered = useRef(false)
  const [busy, setBusy] = useState(false)
  // what was unread the moment the box opened: reading marks it read on the
  // server at once, so without a snapshot the 「新」 tag would vanish before
  // anyone saw which entries it was on
  const [fresh, setFresh] = useState<Set<number>>(() => new Set())
  const all = g.mail ?? []
  const list = all.filter(m => filter === 'all' || (filter === 'grant' ? m.kind === 'grant' : m.kind !== 'grant'))

  // the server applies a delivery to the account and hands the account back
  const collect = async () => {
    if (!cloud || collecting.current) return
    collecting.current = true
    setBusy(true)
    try {
      const r = await act('mail_take')
      if (!r.ok) { toast(r.why); return }
      const got = ((r.result as { mail?: MailItem[] } | undefined)?.mail ?? [])
      if (got.length) {
        setFresh(prev => new Set([...prev, ...got.map(m => m.at)]))
        toast(got.length === 1 ? `${mailLine(got[0])}，已收下。` : `信箱收到 ${got.length} 条，已收下。`)
      }
      await act('mail_seen')
    } catch { toast('暂时无法收取，请稍后重试。') }
    finally { collecting.current = false; setBusy(false) }
  }

  useEffect(() => {
    if (entered.current || !cloud) return
    entered.current = true
    setFresh(new Set((g.mail ?? []).filter(m => !m.seen).map(m => m.at)))
    void collect()
    // Only enter once; state updates from collection must not collect again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud])

  return (
    <section className="panel inbox-page" aria-label="信箱">
      <div className="support-head">
        <h2>峡谷信使</h2>
        <span className="small muted">{all.length} 条到账记录</span>
        <button className="sm primary" disabled={!cloud || busy} onClick={() => void collect()}>
          {busy ? '收取中…' : '收取邮件'}
        </button>
      </div>
      <div className="row inbox-filters" aria-label="邮件分类">
        {([['all', '全部邮件'], ['grant', '官方奖励'], ['trade', '交易通知']] as const).map(([key, label]) =>
          <button key={key} className={`sm ${filter === key ? 'primary' : 'ghost'}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
            <p className="small muted" style={{ lineHeight: 1.8 }}>
              交易区的成交、退款和<b>官方发放</b>都从这里进来，下面显示的是<b>已经到账</b>的记录。每次最多收取100条；积压较多时可继续点收取。标「新」的是这次刚到的。
            </p>
            {!cloud && (
              <p className="small" style={{ color: 'var(--warn)' }}>服务器连不上，信箱暂时收不了。</p>
            )}
            {list.length === 0 ? (
              <div className="empty">这里还没有邮件。交易成交、退款或官方奖励到账后，会在这里留下记录。</div>
            ) : (
              <div className="mail-list">
                {list.map((m, i) => (
                  <div key={`${m.at}-${i}`} className={`mail-item${m.kind === 'grant' ? ' grant' : ''}`}>
                    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                      <span className="tiny faint mono">{when(m.at)}</span>
                      {m.kind === 'grant' && (
                        <span className="tag" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>官方</span>
                      )}
                      {fresh.has(m.at) ? (
                        <span className="tag" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>新 · 已到账</span>
                      ) : (
                        <span className="tiny faint">已到账</span>
                      )}
                    </div>
                    <div className="small" style={{ marginTop: 2 }}>{m.text}</div>
                    {m.note && <div className="small muted" style={{ marginTop: 2 }}>附言：{m.note}</div>}
                  </div>
                ))}
              </div>
            )}
    </section>
  )
}
