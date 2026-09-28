import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { playPackCue } from '../packAudio'

/** Mouse, pen and touch share the same drag-to-altar interaction. */
export default function PackAltar({ count, packName, bursting, onOpen, seal }: {
  count: number; packName: string; bursting: boolean; onOpen: () => void; seal: ReactNode
}) {
  const scene = useRef<HTMLDivElement>(null)
  const source = useRef<HTMLDivElement>(null)
  const target = useRef<HTMLDivElement>(null)
  const pack = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; cx: number; cy: number } | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [held, setHeld] = useState(false)
  const [over, setOver] = useState(false)
  const [placed, setPlaced] = useState(false)
  const placedRef = useRef(false)
  const ignoreClickUntil = useRef(0)
  const [hint, setHint] = useState('将卡包投入峡谷仪式台')

  const deltaToAltar = () => {
    const a = source.current!.getBoundingClientRect(), b = target.current!.getBoundingClientRect()
    return { x: b.x + b.width / 2 - (a.x + a.width / 2), y: b.y + b.height / 2 - (a.y + a.height / 2) }
  }
  const dropInside = (x: number, y: number) => {
    const r = target.current!.getBoundingClientRect()
    return Math.hypot((x - r.x - r.width / 2) / (r.width / 2), (y - r.y - r.height / 2) / (r.height / 2)) <= 1.15
  }
  const place = () => {
    if (placedRef.current) return
    placedRef.current = true
    drag.current = null
    setHeld(false); setOver(true); setPlaced(true); setOffset(deltaToAltar())
    setHint('卡包正在解封')
    onOpen()
  }
  const cancel = () => {
    if (placedRef.current) return
    drag.current = null; setHeld(false); setOver(false); setOffset({ x: 0, y: 0 })
    setHint('拖到仪式台，或轻点卡包自动投入')
  }
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (placedRef.current) setOffset(deltaToAltar())
      else { drag.current = null; setHeld(false); setOver(false); setOffset({ x: 0, y: 0 }) }
    })
    observer.observe(scene.current!)
    return () => observer.disconnect()
  }, [])

  return <div ref={scene} className={`ritual-opening altar-opening${held ? ' is-dragging' : ''}${over ? ' is-over' : ''}${placed ? ' is-placed' : ''}`}>
    <div ref={target} className="altar-dropzone" aria-label="峡谷开包仪式台">
      <div className="altar-plinth" aria-hidden="true">
        <div className="altar-plinth-wall" />
        <div className="altar-plinth-top">
          <span className="altar-plinth-inset" />
          <span className="altar-channel horizontal" /><span className="altar-channel vertical" />
          <span className="altar-rune rune-n">✦</span><span className="altar-rune rune-e">✦</span>
          <span className="altar-rune rune-s">✦</span><span className="altar-rune rune-w">✦</span>
          <span className="altar-core"><span className="altar-core-mark">{seal}</span></span>
          <span className="altar-charge" />
        </div>
      </div>
      <span className="altar-drop-label">{placed ? '封 印 解 开' : over ? '松 手 开 启' : '卡 包 投 入 此 处'}</span>
    </div>
    <div className="altar-drag-path" aria-hidden="true"><span>·</span><span>·</span><span>·</span><b>→</b></div>
    <div ref={source} className="altar-pack-source">
      <div className="altar-pack-carrier" style={{ '--drag-x': `${offset.x}px`, '--drag-y': `${offset.y}px` } as CSSProperties}>
        <button ref={pack} className="ritual-pack" autoFocus disabled={bursting} aria-label={`拖动或点击${packName}，放入仪式台`}
          onClick={() => { if (Date.now() >= ignoreClickUntil.current) place() }}
          onPointerDown={e => {
            if (placedRef.current || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return
            e.preventDefault()
            const r = source.current!.getBoundingClientRect()
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
            e.currentTarget.focus({ preventScroll: true })
            try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* use local pointer events */ }
            setHeld(true); playPackCue('grab')
          }}
          onPointerMove={e => {
            const d = drag.current; if (!d || e.pointerId !== d.id) return
            const x = e.clientX - d.x, y = e.clientY - d.y
            setOffset({ x, y }); setOver(dropInside(d.cx + x, d.cy + y))
          }}
          onPointerUp={e => {
            const d = drag.current; if (!d || e.pointerId !== d.id) return
            const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
            if (dropInside(d.cx + e.clientX - d.x, d.cy + e.clientY - d.y) || moved < 8) place()
            else { ignoreClickUntil.current = Date.now() + 600; cancel() }
          }}
          onPointerCancel={() => { ignoreClickUntil.current = Date.now() + 600; cancel() }} onLostPointerCapture={() => { if (drag.current) cancel() }}>
          <span className="ritual-pack-shadow" aria-hidden="true" />
          <span className="ritual-pack-half left" /><span className="ritual-pack-half right" />
          <span className="ritual-pack-side left" /><span className="ritual-pack-side right" />
          <span className="ritual-pack-crimp top" /><span className="ritual-pack-crimp bottom" />
          <span className="ritual-pack-foil" />
          <span className="ritual-pack-kicker">LULU CARDS · RIFT COLLECTION</span>
          <span className="ritual-pack-seal">{seal}</span>
          <span className="ritual-pack-title">{packName}</span><span className="ritual-pack-count">{count} 张收藏卡 · 猪之家出品</span>
        </button>
      </div>
    </div>
    <div className="altar-drop-burst" aria-hidden="true"><div className="ritual-burst">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div></div>
    <div className="ritual-open-hint" aria-live="polite"><b>{hint}</b><span>拖动卡包或轻点投入 · 键盘按 Enter</span></div>
  </div>
}
