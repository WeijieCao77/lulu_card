import type { CSSProperties } from 'react'
import type { PlayerCard } from '../../../engine/cards'
import { RARITY_CN } from '../../../engine/cards'
import FOCUS from '../../../data/echoPhotoFocus.json'
import './echoCard.css'

/**
 * 峡谷回响 card face and back — the double-thin-line design the owner confirmed on 2026-10-04
 * (峡谷回响/新版卡面交接-20261004/站长确认的目标效果.webp). The markup follows the designer's
 * RetiredEchoCard; the styles in echoCard.css are the confirmed ones, unscoped, so the card looks
 * the same wherever it is drawn.
 */
const MARK: Record<string, string> = { bronze: '铜', silver: '银', gold: '金' }
const BARS: Record<string, number> = { bronze: 1, silver: 2, gold: 3 }
const RARITY_CLASS: Record<string, string> = { bronze: 're-bronze', silver: 're-silver', gold: 're-gold' }
/**
 * Framing for one photograph (src/data/echoPhotoFocus.json): the face centre in the source image (fx fy, 0–1)
 * and a zoom. The image is placed so the face lands horizontally centred, a third of the way down the
 * portrait window, and a far-off figure is enlarged around that point. No entry: a face in the upper third.
 */
const PORTRAIT_AR = 0.737           // width / height of the portrait window (.re-portrait), the same at every size
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
function framing(ign: string, photo: { w: number; h: number } | null): { pos: string; origin: string; zoom: number } {
  const v = (FOCUS as Record<string, string>)[ign]
  if (!v || !photo) return { pos: 'center 22%', origin: 'center 22%', zoom: 1 }
  // "z0.8": a close-up that only needs to come back a step — shrink toward the top centre, face stays upper-centre
  if (v.startsWith('z')) return { pos: 'center 22%', origin: '50% 12%', zoom: Number(v.slice(1)) }
  const [fx, fy, z = 1] = v.split(/\s+/).map(Number)
  const ar = photo.w / photo.h
  let px = 0.5, py = 0.5, faceX = fx, faceY = fy
  if (ar > PORTRAIT_AR) {           // wider than the window: slide sideways
    const vis = PORTRAIT_AR / ar
    px = clamp01((fx - vis / 2) / (1 - vis))
    faceX = (fx - px * (1 - vis)) / vis
  } else {                          // taller: slide up or down
    const vis = ar / PORTRAIT_AR
    py = clamp01((fy - vis / 3) / (1 - vis))
    faceY = (fy - py * (1 - vis)) / vis
  }
  // scale about the point that carries the face to (0.5, 0.33); a point inside the frame keeps it covered
  const toward = (face: number, goal: number) => (z === 1 ? 0.5 : clamp01((goal - face * z) / (1 - z)))
  return { pos: `${pct(px)} ${pct(py)}`, origin: `${pct(toward(faceX, 0.5))} ${pct(toward(faceY, 0.33))}`, zoom: z }
}

export interface EchoCardProps {
  card: PlayerCard
  level?: number
  dupes?: number
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  footer?: string
}

export function EchoCard({ card, level = 0, dupes = 0, size = 'md', selected, dimmed, onClick, footer }: EchoCardProps) {
  const echo = card.echo!
  const f = framing(card.ign, echo.photo)
  const style = { '--re-portrait-position': f.pos, '--re-origin': f.origin, '--re-zoom': f.zoom } as CSSProperties
  const stats = [
    { label: '对线', value: card.attrs.reaction },
    { label: '团战', value: card.attrs.teamwork },
    { label: '决策', value: card.attrs.igl },
  ]
  const team = [echo.team, echo.span].filter(Boolean).join(' · ')
  return <div
    className={`cardface retired-echo ${RARITY_CLASS[card.rarity] ?? 're-bronze'} s-${size}${selected ? ' sel' : ''}${dimmed ? ' dim' : ''}${onClick ? ' tap' : ''}`}
    style={style} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
    title={`峡谷回响 · ${card.ign} · ${RARITY_CN[card.rarity]} ${card.rating}${level ? `（+${level}）` : ''}`}
    onClick={onClick}
    onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}>
    <div className="re-inner">
      <div className="re-terrain" aria-hidden="true" />
      <div className="re-energy" aria-hidden="true" />
      <div className="re-halo" aria-hidden="true" />
      <div className="re-header"><span>RIFT ECHOES</span></div>
      <div className="re-tier-stamp" aria-label={RARITY_CN[card.rarity]}>
        <b>{MARK[card.rarity]}</b>
        <span>{Array.from({ length: BARS[card.rarity] ?? 1 }, (_, i) => <i key={i} />)}</span>
      </div>
      <div className="re-rating"><strong>{card.rating}</strong><span>{card.role}</span>{level > 0 && <i>+{level}</i>}</div>
      <div className="re-portrait">
        {card.face && <img src={card.face} alt={card.ign} loading="lazy" decoding="async" />}
      </div>
      <div className="re-copy">
        <div className="re-edition"><span>峡谷回响</span><b>{RARITY_CN[card.rarity]}</b></div>
        <strong className="re-name" title={card.ign}>{card.ign}</strong>
        <div className="re-skill">{team}</div>
        <div className="re-stats">{stats.map(({ label, value }) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
        <div className="re-foot"><span>{footer ?? card.realName ?? ''}</span><b>{echo.group === 'WEST' ? '其他赛区' : echo.group}</b></div>
      </div>
      <div className="re-foil" aria-hidden="true" />
      {dupes > 0 && <span className="re-dupes">x{dupes + 1}</span>}
    </div>
  </div>
}

/** 卡背 — the owner's own artwork (2026-10-04): the Summoner's Cup with hands reaching for it; type and frame are in the image */
export function EchoCardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div className={`cardback echo-back-v2 s-${size}`} aria-label="峡谷回响卡背">
    <img className="echo-back-art" src="/lol/echo/back.webp" alt="" draggable={false} />
  </div>
}
