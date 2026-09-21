import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import CardFace from '../Card'
import { cardName, RARITY_CN } from '../../engine/cards'
import type { Pulled } from '../../engine/gacha'
import type { PackPosition } from './positionPackDesign'
import { POSITION_PACKS } from './positionPackDesign'
import { playPackCue } from '../packAudio'
import './packStage.css'
import PackAltar from './PackAltar'
import MythicReveal from './MythicReveal'

/** Original pig-house seal; shared by the pack and its face-down cards. */
function Seal() {
  return <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d="M50 4 91 27v46L50 96 9 73V27Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="m50 12 34 20v36L50 88 16 68V32Z" stroke="currentColor" opacity=".45" />
    <path d="M29 39 25 23l19 9M71 39l4-16-19 9" fill="currentColor" opacity=".8" />
    <path d="M25 51c0-14 10-23 25-23s25 9 25 23c0 17-11 27-25 27S25 68 25 51Z" stroke="currentColor" strokeWidth="2" />
    <path d="m34 46 7 3m25-3-7 3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <rect x="36" y="54" width="28" height="16" rx="8" stroke="currentColor" strokeWidth="2" />
    <path d="M44 60v4m12-4v4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M50 0v8m0 84v8M0 50h10m80 0h10" stroke="currentColor" />
  </svg>
}

function Back() {
  return <div className="ritual-back" aria-hidden="true">
    <span className="ritual-back-corner tl" /><span className="ritual-back-corner br" />
    <div className="ritual-back-ring"><Seal /></div>
    <span className="ritual-back-brand">噜噜卡</span><span className="ritual-back-edition">猪之家出品</span>
  </div>
}

export interface PackStageProps {
  pulled: Pulled[]
  packName?: string
  position?: PackPosition
  onDone: () => void
  onSellAll: () => void
}

/** Presentation only: the server already awarded these cards before this mounts. */
export default function PackStage({ pulled, packName = '选手卡包', position, onDone, onSellAll }: PackStageProps) {
  const [phase, setPhase] = useState<'sealed' | 'burst' | 'cards'>('sealed')
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set())
  const revealedRef = useRef(new Set<number>())
  const [mythics, setMythics] = useState<number[]>([])
  const mythicBusy = useRef(false)
  const [inspect, setInspect] = useState<number | null>(null)
  const [layout, setLayout] = useState({ width: 120, columns: 3 })
  const stage = useRef<HTMLDivElement>(null)
  const previousFocus = useRef(document.activeElement as HTMLElement | null)
  const board = useRef<HTMLDivElement>(null)
  const detailClose = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | null>(null)
  const touch = useRef<{ id: number; x: number; y: number; index: number; wasOpen: boolean; moved: boolean } | null>(null)
  const ignoreClickUntil = useRef(0)
  const openingRef = useRef(false)
  const all = revealed.size === pulled.length
  const dupes = pulled.filter(p => p.dupe).length
  const title = position ? `${POSITION_PACKS[position].label}奖励卡包` : packName
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const previous = previousFocus.current
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    stage.current?.querySelector<HTMLButtonElement>('.ritual-pack')?.focus({ preventScroll: true })

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      document.body.style.overflow = oldOverflow
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  useEffect(() => {
    if (phase !== 'cards' || !board.current) return
    const el = board.current
    const resize = () => {
      const { width, height } = el.getBoundingClientRect()
      const count = pulled.length
      const gap = parseFloat(getComputedStyle(el.querySelector('.ritual-spread')!).gap) || 12
      const candidates = count === 1 ? [1] : count <= 3 ? [1, 2, 3] : [2, 3, 5]
      const options = candidates.map(columns => {
        const rows = Math.ceil(count / columns)
        const cardWidth = Math.min(184, (width - 24 - (columns - 1) * gap) / columns, (height - 24 - (rows - 1) * gap) / rows * 184 / 282)
        return { columns, cardWidth }
      })
      const { columns, cardWidth } = options.sort((a, b) => b.cardWidth - a.cardWidth)[0]
      setLayout({ width: cardWidth, columns })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el); resize()
    return () => observer.disconnect()
  }, [phase, pulled.length])

  useEffect(() => {
    if (phase === 'cards') board.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [phase])
  useEffect(() => {
    if (inspect !== null) detailClose.current?.focus({ preventScroll: true })
  }, [inspect])

  const openPack = () => {
    if (openingRef.current) return
    openingRef.current = true
    playPackCue('burst')
    setPhase('burst')
    stage.current?.focus({ preventScroll: true })
    timer.current = window.setTimeout(() => setPhase('cards'), reduced() ? 60 : 1550)
  }
  const skip = () => {
    openingRef.current = true
    if (timer.current !== null) window.clearTimeout(timer.current)
    setPhase('cards')
  }
  const reveal = (index: number, sound = true) => {
    if (phase !== 'cards' || !pulled[index] || revealedRef.current.has(index)) return
    revealedRef.current.add(index)
    setRevealed(new Set(revealedRef.current))
    const rarity = pulled[index].card.rarity
    if (rarity === 'mythic') {
      mythicBusy.current = true
      touch.current = null
      setMythics(q => [...q, index])
    } else if (sound) playPackCue(rarity === 'bronze' ? 'reveal' : rarity)
  }
  const revealAll = () => {
    const hidden = pulled.filter((_, i) => !revealedRef.current.has(i))
    if (!hidden.length) return
    const rarity = hidden.some(p => p.card.rarity === 'mythic') ? 'mythic' : hidden.some(p => p.card.rarity === 'gold') ? 'gold' : 'reveal'
    if (rarity !== 'mythic') playPackCue(rarity)
    pulled.forEach((_, i) => reveal(i, false))
  }
  const continueMythic = () => {
    const index = mythics[0]
    mythicBusy.current = mythics.length > 1
    setMythics(q => q.slice(1))
    if (mythics.length === 1) window.requestAnimationFrame(() => board.current?.querySelector<HTMLButtonElement>(`[data-pack-card="${index}"]`)?.focus({ preventScroll: true }))
  }
  const closeDetail = () => {
    const index = inspect
    setInspect(null)
    if (index !== null) window.requestAnimationFrame(() => board.current?.querySelector<HTMLButtonElement>(`[data-pack-card="${index}"]`)?.focus({ preventScroll: true }))
  }
  const cardAt = (target: EventTarget | null) => {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-pack-card]') : null
    return el && board.current?.contains(el) ? Number(el.dataset.packCard) : null
  }

  return createPortal(<div className={`ritual-stage phase-${phase}`} ref={stage} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${title}开包`} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); mythics.length ? continueMythic() : inspect !== null ? closeDetail() : onDone() }
    if (e.key === 'Tab') {
      const scope = mythics.length ? stage.current?.querySelector('.mythic-entrance') : inspect === null ? stage.current : stage.current?.querySelector('.ritual-detail')
      const buttons = Array.from(scope?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []).filter(b => !b.closest('[inert]'))
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (!buttons.includes(document.activeElement as HTMLButtonElement)) { e.preventDefault(); first?.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }}>
    <div className="ritual-scenery" aria-hidden="true"><div className="ritual-orbit" /><div className="ritual-orbit inner" /><div className="ritual-dust">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div></div>
    <header className="ritual-header" inert={inspect !== null || mythics.length > 0}>
      <div><span className="ritual-eyebrow">猪之家出品 · 噜噜卡</span><h2>{title}</h2></div>
      <button className="ritual-dismiss" onClick={onDone} aria-label="收下卡牌并关闭">✕</button>
    </header>

    {phase !== 'cards' ? <PackAltar count={pulled.length} bursting={phase === 'burst'} onOpen={openPack} seal={<Seal />} /> : <div className={`ritual-board count-${pulled.length}`} ref={board} inert={inspect !== null || mythics.length > 0}
      style={{ '--card-width': `${layout.width}px`, '--card-scale': layout.width / 184, '--columns': layout.columns } as CSSProperties}
      onPointerDown={e => {
        if (mythicBusy.current) return
        if ((e.pointerType !== 'touch' && e.pointerType !== 'pen') || touch.current) return
        const index = cardAt(e.target); if (index === null) return
        ignoreClickUntil.current = Date.now() + 700
        touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, index, wasOpen: revealedRef.current.has(index), moved: false }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer remains usable inside the card table */ }
        reveal(index)
      }}
      onPointerMove={e => {
        const t = touch.current; if (mythicBusy.current || !t || t.id !== e.pointerId) return
        if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10 && !t.moved) return
        t.moved = true
        const index = cardAt(document.elementFromPoint(e.clientX, e.clientY))
        if (index !== null) reveal(index)
      }}
      onPointerUp={e => {
        const t = touch.current; if (mythicBusy.current || !t || t.id !== e.pointerId) return
        ignoreClickUntil.current = Date.now() + 700
        if (!t.moved && t.wasOpen) setInspect(t.index)
        touch.current = null
      }}
      onPointerCancel={() => { touch.current = null }}>
      <div className="ritual-spread">
        {pulled.map((p, i) => {
          const up = revealed.has(i)
          return <div className="ritual-deal" key={`${p.card.id}-${i}`} style={{ gridColumn: i === pulled.length - 1 && pulled.length % layout.columns === 1 ? '1 / -1' : undefined, justifySelf: 'center', '--order': i, '--fan': `${(i - (pulled.length - 1) / 2) * 9}deg` } as CSSProperties}>
            <button className={`ritual-card rarity-${p.card.rarity}${up ? ' is-revealed' : ''}`} data-pack-card={i} aria-label={up ? `查看${cardName(p.card)}，${RARITY_CN[p.card.rarity]}，${p.dupe ? '重复卡' : '新卡'}` : `翻开第 ${i + 1} 张卡`} aria-pressed={up}
              onClick={e => { if (mythicBusy.current) return; if (e.detail !== 0 && Date.now() < ignoreClickUntil.current) return; up ? setInspect(i) : reveal(i) }}>
              <span className="ritual-card-light" aria-hidden="true" />
              <div className="ritual-flipper">
                <div className="ritual-card-back" aria-hidden={up}><Back /></div>
                <div className="ritual-card-front" aria-hidden={!up}><div className="ritual-face-scale"><CardFace card={p.card} size="lg" footer={p.dupe ? '重复卡' : '新卡'} /></div></div>
              </div>
              {up && <span className="ritual-flip-sparks" aria-hidden="true">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ '--i': k } as CSSProperties} />)}</span>}
            </button>
          </div>
        })}
      </div>
    </div>}

    <footer className="ritual-footer" inert={inspect !== null || mythics.length > 0}>
      <div className="ritual-progress" role="status">{phase === 'cards' ? <><b>{revealed.size}</b> / {pulled.length} 已翻开<span>{all ? '全部揭晓 · 点击卡牌放大查看' : <><span className="ritual-desktop-hint">点击任意卡背，按自己的顺序揭晓</span><span className="ritual-touch-hint">轻点翻面，也可滑过卡背连续翻牌</span></>}</span></> : <span>卡牌已存入收藏，随时可以收下</span>}</div>
      <div className="ritual-actions">{phase !== 'cards' ? <button onClick={skip}>跳过动画</button> : <>
        {!all && <button onClick={revealAll}>全部翻开</button>}
        {all && dupes > 0 && <button onClick={onSellAll}>分解重复卡（{dupes}）</button>}
        <button className="ritual-collect" onClick={onDone}>{all ? '收下卡牌' : '收下并关闭'}</button>
      </>}</div>
    </footer>
    {inspect !== null && <div className="ritual-detail" role="dialog" aria-modal="true" aria-label="卡牌详情" onClick={closeDetail}>
      <div className={`ritual-detail-card rarity-${pulled[inspect].card.rarity}`} onClick={e => e.stopPropagation()}>
        <span className="ritual-eyebrow">{RARITY_CN[pulled[inspect].card.rarity]} · {pulled[inspect].dupe ? '重复卡' : '新卡入藏'}</span>
        <CardFace card={pulled[inspect].card} size="lg" />
        {pulled[inspect].card.legend && <p>{pulled[inspect].card.legend!.title}</p>}
        <button ref={detailClose} onClick={closeDetail}>返回卡桌</button>
      </div>
    </div>}
    {mythics.length > 0 && <MythicReveal key={mythics[0]} pulled={pulled[mythics[0]]} remaining={mythics.length} onContinue={continueMythic} />}
  </div>, document.body)
}
