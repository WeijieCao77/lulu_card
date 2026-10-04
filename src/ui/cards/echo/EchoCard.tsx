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
/** where each photograph's face sits, tuned card by card; the default keeps a face in the upper third */
const focusOf = (ign: string): string => (FOCUS as Record<string, string>)[ign] ?? 'center 22%'

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
  const style = { '--re-portrait-position': focusOf(card.ign) } as CSSProperties
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

function EchoGlyph() {
  return <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d="M50 7 82 29v42L50 93 18 71V29L50 7Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M50 17 73 33v34L50 83 27 67V33L50 17Z" stroke="currentColor" strokeWidth=".8" opacity=".55" />
    <path d="M15 52h16l12-15 12 26 8-12h22" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
    <circle cx="50" cy="50" r="34" stroke="currentColor" opacity=".3" />
  </svg>
}

export function EchoCardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div className={`cardback retired-echo-back s-${size}`} aria-label="峡谷回响卡背">
    <div className="re-back-terrain" aria-hidden="true" />
    <div className="re-back-frame" aria-hidden="true" />
    <span className="re-back-kicker">RIFT ECHOES · RETURNING LEGENDS</span>
    <div className="re-back-emblem"><span /><EchoGlyph /><span /></div>
    <div className="re-back-title">峡谷回响<strong>退役老将回归</strong></div>
    <div className="re-back-line">记忆仍在峡谷回荡</div>
    <div className="re-back-bottom"><span>LIMITED SERIES</span><b>RE / 01</b></div>
  </div>
}
