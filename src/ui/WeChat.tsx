/**
 * The way into the group from the front page and the card game.
 *
 * Almost everything in this game came out of that group — the bugs, the
 * balance complaints, half the features — and until now the only way in was
 * knowing somebody who was already in it.
 *
 * The QR is fetched, not bundled: WeChat's group codes expire after seven days
 * (the image says so on its own bottom line), so one checked into the repo
 * would be wrong more often than right. It lives in the database and the owner
 * swaps it from the admin page, which is a Monday job rather than a deploy.
 *
 * The button only appears once the server says there is a code to show, so a
 * week where nobody has uploaded one is a week with no button, rather than a
 * button that opens an empty box.
 */
import { useEffect, useState } from 'react'
import { Panel } from './common'

interface Group { on: boolean; note: string | null; v: number }

function useGroup() {
  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void fetch('/api/site/wechat')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Group | null) => { if (alive) setGroup(j?.on ? j : null) })
      .catch(() => { /* offline, or served from a static host with no server */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])
  return { group, loading }
}

function GroupPicture({ group }: { group: Group }) {
  const [broke, setBroke] = useState(false)
  return broke ? (
    <p className="empty" style={{ padding: '30px 10px' }}>二维码没加载出来，刷新一下试试。</p>
  ) : (
    <img
      className="wechat-qr"
      src={`/api/site/wechat.img?v=${group.v}`}
      alt="微信群二维码"
      width={300}
      height={300}
      onError={() => setBroke(true)}
    />
  )
}

function GroupDescription({ group }: { group: Group | null }) {
  return <>
    <p className="small muted" style={{ margin: 0, lineHeight: 1.8 }}>
      游戏的大部分改动来自群里的反馈。有问题、有想法，或者想找人打好友房，都可以进来。
    </p>
    {group ? <GroupPicture group={group} /> : <p className="empty">群二维码暂未开放，请稍后再来。</p>}
    {group && <p className="tiny faint" style={{ margin: 0, textAlign: 'center', lineHeight: 1.7 }}>
      {group.note || '微信扫码进群。二维码过期后会在这里更新。'}
    </p>}
  </>
}

export function WeChatPage() {
  const { group, loading } = useGroup()
  return <Panel title="微信群" className="wechat-page">
    {loading ? <p className="small muted">正在读取群二维码…</p> : <GroupDescription group={group} />}
  </Panel>
}

export default function WeChat({ dock = false }: { dock?: boolean }) {
  const { group, loading } = useGroup()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!dock && !group) return null

  return (
    <>
      <button
        className={`support-fab wechat-fab${open ? ' on' : ''}`}
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        title="扫码进微信群"
      >
        <span className="ico" aria-hidden="true">💬</span>
        <span className="lbl">微信群</span>
      </button>

      {open && (
        <>
          <div className="support-veil" onClick={() => setOpen(false)} />
          <div className="support-card" role="dialog" aria-label="微信群">
            <div className="support-head">
              <h3>进群一起玩</h3>
              <button className="sm ghost" onClick={() => setOpen(false)}>关闭 ✕</button>
            </div>
            {loading ? <p className="small muted">正在读取群二维码…</p> : <GroupDescription group={group} />}
          </div>
        </>
      )}
    </>
  )
}
