import { useId } from 'react'
import type { CSSProperties } from 'react'
import type { PlayerCard } from '../../../engine/cards'
import { RARITY_CN } from '../../../engine/cards'
import { crestUrl } from '../../../engine/dossier'
import { Flag } from '../../Card'
import './s16Card.css'

/**
 * S16 世界赛 card face (owner 2026-10-04, after 虎扑选手股; redesigned 2026-10-10 「S 系列要专门设计」).
 * 「冠军之夜」: a night arena — stadium beams falling from the roof, crowd lights, a lit horizon under the player —
 * inside a cut-corner plate set in a bevelled metal frame, with the cup as the series mark. Before a player has
 * played at Worlds the plate is gunmetal and every number reads 「?」; after his first game the frame takes his
 * current metal and an arrow says which way the last update moved him. The FMVP's card is the top tier: an
 * iridescent frame, holographic foil, and the cup above his name.
 */
interface S16CardProps {
  card: PlayerCard
  level?: number
  dupes?: number
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  footer?: string
}

const ROLE_SHORT: Record<string, string> = { 上单: 'TOP', 打野: 'JG', 中单: 'MID', 下路: 'BOT', 辅助: 'SUP' }

/**
 * The cup: a generic trophy silhouette (flared lip, bowl, two handles, knotted stem, stepped base), drawn once and
 * used as a CSS mask so any metal gradient can fill it — the face's mark, the back, the pack, the altar seal.
 */
const CUP_BODY = [
  'M15 5H85L83 10H17Z',
  'M18 10H82C80 34 70 49 57 56L56 60H44L43 56C30 49 20 34 18 10Z',
  'M42 60H58L57 65H43Z',
  'M46 65H54L53.2 77H46.8Z',
  'M46.8 85H53.2L54.5 100H45.5Z',
  'M45 100H55C56 108 64 113 73 116V121H27V116C36 113 44 108 45 100Z',
  'M23 121H77V127H23Z',
  'M27 127H73L76 133H24Z',
]
const CUP_KNOT = { cx: 50, cy: 81, rx: 6.5, ry: 4.5 }
const CUP_HANDLES = 'M19 12C6 10 3 24 9 34C14 42 24 47 33 50M81 12C94 10 97 24 91 34C86 42 76 47 67 50'
const CUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">${CUP_BODY.map((d) => `<path d="${d}"/>`).join('')}`
  + `<ellipse cx="${CUP_KNOT.cx}" cy="${CUP_KNOT.cy}" rx="${CUP_KNOT.rx}" ry="${CUP_KNOT.ry}"/>`
  + `<path d="${CUP_HANDLES}" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round"/></svg>`
const CUP_MASK = `url("data:image/svg+xml,${encodeURIComponent(CUP_SVG)}")`

/** the cup, filled by whatever background the class gives it */
export function S16Cup({ className = '' }: { className?: string }) {
  return <span className={`s16-cup ${className}`} style={{ WebkitMaskImage: CUP_MASK, maskImage: CUP_MASK }} aria-hidden="true" />
}

/** the cup as plain SVG in currentColor — for places that expect an <svg> (the altar's core, the deck's seal) */
export function S16CupGlyph({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 140" fill="currentColor" aria-hidden="true">
    {CUP_BODY.map((d) => <path key={d} d={d} />)}
    <ellipse {...CUP_KNOT} />
    <path d={CUP_HANDLES} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
  </svg>
}

/**
 * The plate's hairline: the cut-corner outline a little inside the plate's own edge. Units are cqw of the card
 * (plate = 94.8 wide), so the corners stay 45° at every size; heights are the ordinary card's at each size.
 */
const PLATE_W = 94.8
const PLATE_H = { sm: 176.05, md: 155.41, lg: 147.52, back: 134.5 } as const
function rimPoints(w: number, h: number, inset: number, cut: number) {
  const a = inset, b = cut - inset * 0.586
  return [[a + b, a], [w - a - b, a], [w - a, a + b], [w - a, h - a - b], [w - a - b, h - a], [a + b, h - a], [a, h - a - b], [a, a + b]]
    .map((p) => p.map((n) => +n.toFixed(2)).join(',')).join(' ')
}
function Rim({ h, className = 's16-rim' }: { h: number; className?: string }) {
  return <svg className={className} viewBox={`0 0 ${PLATE_W} ${h}`} preserveAspectRatio="none" aria-hidden="true">
    <polygon points={rimPoints(PLATE_W, h, 2.2, 8)} vectorEffect="non-scaling-stroke" />
  </svg>
}

export function S16Card({ card, level = 0, dupes = 0, size = 'md', selected, dimmed, onClick, footer }: S16CardProps) {
  const s = card.s16!
  const shown = s.revealed
  const fmvp = shown && s.fmvp
  const state = !shown ? 's16-hidden' : fmvp ? 's16-mythic' : `s16-${card.rarity}`
  const delta = shown && s.prev != null ? card.rating - s.prev : 0
  const crest = crestUrl(card.clubId)
  const role = ROLE_SHORT[card.role] ?? card.role
  const stats = [
    { label: '对线', value: card.attrs.reaction },
    { label: '团战', value: card.attrs.teamwork },
    { label: '决策', value: card.attrs.igl },
  ]
  // long names step down so the full name fits on one line (CSS: --s16-n)
  const style = { '--s16-n': Math.max(5, [...card.ign].length) } as CSSProperties
  // the small card drops the 「彩卡」 after FMVP (the <i>)
  const tier = !shown ? '?' : fmvp ? <>FMVP<i> 彩卡</i></> : RARITY_CN[card.rarity]
  return (
    <div
      className={`cardface s16card ${state} s-${size}${selected ? ' sel' : ''}${dimmed ? ' dim' : ''}${onClick ? ' tap' : ''}`}
      style={style}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      title={`S16 世界赛 · ${card.ign} · ${shown ? `${fmvp ? 'FMVP 彩卡' : RARITY_CN[card.rarity]} ${card.rating}` : '数值待揭晓'}`}
    >
      <div className="s16-inner">
        <span className="s16-sky" aria-hidden="true" />
        <span className="s16-beams" aria-hidden="true" />
        <span className="s16-crowd" aria-hidden="true" />
        <div className="s16-photo">
          {card.face && <img src={card.face} alt={card.ign} loading="lazy" decoding="async" />}
        </div>
        <span className="s16-floor" aria-hidden="true" />
        <div className="s16-rating">
          <strong>{shown ? card.rating : '?'}</strong>
          <span className="s16-pos">{role}</span>
          {!shown && <i className="s16-trend lock">待揭晓</i>}
          {shown && delta !== 0 && <i className={`s16-trend ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</i>}
          {level > 0 && <em className="s16-level">+{level}</em>}
        </div>
        <div className="s16-emblem" aria-hidden="true">
          <S16Cup />
          <b>{fmvp ? 'FMVP' : 'S16'}</b>
        </div>
        <span className="s16-side" aria-hidden="true">WORLDS 2026 · 全球总决赛</span>
        <div className="s16-copy">
          <div className="s16-team">
            {crest && <span className="s16-crest" style={{ backgroundImage: `url(${crest})` }} />}
            <span className="s16-tag">{card.clubTag}</span>
            <Flag nat={card.nat} />
            {dupes > 0 && <span className="s16-dupes">x{dupes + 1}</span>}
          </div>
          <strong className="s16-name" title={card.ign}>{card.ign}</strong>
          <div className="s16-stats">
            {stats.map(({ label, value }) => <span key={label}><b>{shown ? value : '?'}</b><small>{label}</small></span>)}
          </div>
          <div className="s16-foot">
            <span>{footer ?? (shown ? `S16 已赛 ${s.games} 场` : 'S16 开赛后揭晓')}</span>
            <b className="s16-tier">{tier}</b>
          </div>
        </div>
        <Rim h={PLATE_H[size]} />
        <span className="s16-foil" aria-hidden="true" />
      </div>
    </div>
  )
}

/**
 * The S16 card back's artwork. null draws the code-drawn back below. When the owner's art arrives, drop it next to
 * this file and point this at it — `import S16_BACK_ART from './s16Back.webp'` and `= S16_BACK_ART` — and every S16
 * card back changes with it: the pack page, the opening altar, the banner, the login cover.
 */
export const S16_BACK_IMAGE: string | null = null

/**
 * The night-arena artwork shared by the card back and the pack: roof beams, a cup on a lit plinth with light
 * pouring off it, the arena bowl below, and the S16 type. `pack` swaps the bottom lines for the pack's.
 */
export function S16Art({ variant = 'back', count = 3 }: { variant?: 'back' | 'pack'; count?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return <div className={`s16-art s16-art-${variant}`}>
    <span className="s16a-sky" />
    <span className="s16a-beams" />
    <span className="s16a-stars" />
    <span className="s16a-arena" />
    <span className="s16a-halo" />
    <span className="s16a-rays" />
    <div className="s16a-cupwrap">
      <S16Cup className="s16a-cup" />
      <svg className="s16a-engrave" viewBox="0 0 100 140" aria-hidden="true">
        <defs><linearGradient id={`${id}g`} x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
        <path d="M21 20C40 26 60 26 79 20M25 31C42 36 58 36 75 31" fill="none" stroke="#3a2606" strokeOpacity=".55" strokeWidth="1.2" />
        <path d="M30 13C32 30 38 42 46 50" fill="none" stroke={`url(#${id}g)`} strokeWidth="2" strokeLinecap="round" />
        <path d="M24 121H76" stroke="#3a2606" strokeOpacity=".5" strokeWidth="1" />
      </svg>
    </div>
    <div className="s16a-head"><span>WORLDS CHAMPIONSHIP</span></div>
    <div className="s16a-title"><b>S16</b><span>{variant === 'pack' ? '全球总决赛 · 选手股卡包' : '全球总决赛 · 2026'}</span></div>
    <div className="s16a-foot">
      {variant === 'pack'
        ? <><span>LULU CARDS<br /><small>S16 赛事选手收藏卡</small></span><strong>{count}<small>CARDS</small></strong></>
        : <><i /><span>LULU CARDS · 选手股</span><i /></>}
    </div>
    <Rim h={PLATE_H.back} className="s16a-rim" />
    <span className="s16a-foil" />
  </div>
}

/** S16 卡背 — S16_BACK_IMAGE when there is one, else the code-drawn arena */
export function S16CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div className={`cardback s16-back s-${size}`} aria-label="S16 世界赛卡背">
    {S16_BACK_IMAGE
      ? <img className="s16-back-img" src={S16_BACK_IMAGE} alt="" decoding="async" />
      : <S16Art />}
  </div>
}
