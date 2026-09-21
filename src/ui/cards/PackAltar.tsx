import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { playPackCue } from '../packAudio'

/** Mouse, pen and touch share the same drag-to-altar interaction. */
export default function PackAltar({ count, bursting, onOpen, seal }: {
  count: number; bursting: boolean; onOpen: () => void; seal: ReactNode
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
  const [hint, setHint] = useState('把卡包拖入祭坛')

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
    setHint('祭坛已激活 · 正在解封')
    onOpen()
  }
  const cancel = () => {
    if (placedRef.current) return
    drag.current = null; setHeld(false); setOver(false); setOffset({ x: 0, y: 0 })
    setHint('还没放入祭坛，再拖一次')
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
    <div ref={target} className="altar-dropzone" aria-label="卡包祭坛">
      <div className="altar-drop-rings" aria-hidden="true"><i /><i /><i /><span>✦</span></div>
      <span className="altar-drop-label">{placed ? '封 印 解 开' : over ? '松 手 开 启' : '将 卡 包 放 入 此 处'}</span>
    </div>
    <div className="altar-drag-path" aria-hidden="true"><span>·</span><span>·</span><span>·</span><b>↑</b></div>
    <div ref={source} className="altar-pack-source">
      <div className="altar-pack-carrier" style={{ '--drag-x': `${offset.x}px`, '--drag-y': `${offset.y}px` } as CSSProperties}>
        <button ref={pack} className="ritual-pack" autoFocus disabled={bursting} aria-label="拖动卡包到祭坛，或按回车放入"
          onClick={e => { if (e.detail === 0) place(); else if (!placedRef.current) setHint('按住卡包，拖进发光的祭坛') }}
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
            if (dropInside(d.cx + e.clientX - d.x, d.cy + e.clientY - d.y)) place()
            else cancel()
          }}
          onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel() }}>
          <span className="ritual-pack-half left" /><span className="ritual-pack-half right" />
          <span className="ritual-pack-seal">{seal}</span>
          <span className="ritual-pack-title">噜 噜 卡</span><span className="ritual-pack-count">{count} 张收藏卡</span>
        </button>
      </div>
    </div>
    <div className="altar-drop-burst" aria-hidden="true"><div className="ritual-burst">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div></div>
    <div className="ritual-open-hint" aria-live="polite"><b>{hint}</b><span>按住拖动 · 松手开启 · 也可按 Enter 放入</span></div>
  </div>
}
