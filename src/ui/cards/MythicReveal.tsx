import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Pulled } from '../../engine/gacha'
import { cardName } from '../../engine/cards'
import CardFace from '../Card'
import { playPackCue } from '../packAudio'

/** One entrance per newly revealed mythic, including every mythic in reveal-all. */
export default function MythicReveal({ pulled, remaining, onContinue }: { pulled: Pulled; remaining: number; onContinue: () => void }) {
  const [ready, setReady] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const skip = useRef<HTMLButtonElement>(null)
  const played = useRef(false)
  useEffect(() => {
    if (!played.current) { playPackCue('mythic'); played.current = true }
    skip.current?.focus({ preventScroll: true })
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'vibrate' in navigator) navigator.vibrate([25, 55, 55])
    const t = window.setTimeout(() => setReady(true), 1500)
    return () => window.clearTimeout(t)
  }, [])
  return <div className="mythic-entrance" role="dialog" aria-modal="true" aria-label={`彩卡降临：${cardName(pulled.card)}`}>
    <div className="mythic-cosmos" aria-hidden="true"><div className="mythic-rays" /><div className="mythic-halo" /><div className="mythic-shockwave" /><div className="mythic-pillar" />
      {Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
    </div>
    <button ref={skip} className="mythic-skip" onClick={onContinue}>跳过特效</button>
    <div className="mythic-spotlight">
      <div className="mythic-announcement"><span>HALL OF FAME</span><h2>彩 卡 降 临</h2><i /></div>
      <div className="mythic-hero-card"><CardFace card={pulled.card} size="lg" /></div>
      <div className="mythic-identity"><strong>{cardName(pulled.card)}</strong><span>{pulled.card.legend?.title ?? '名人堂彩卡'} · {pulled.dupe ? '再次相逢' : '新卡入藏'}</span></div>
      <button className="mythic-continue" disabled={!ready} onClick={onContinue}>{ready ? remaining > 1 ? `下一张彩卡（还有 ${remaining - 1} 张）` : '继续翻牌' : '传奇正在登场…'}</button>
    </div>
  </div>
}
