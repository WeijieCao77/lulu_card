import type { CSSProperties } from 'react'
import type { CardFaceProps } from '../Card'
import { isPlayerCard } from '../../engine/cards'
import { LEGEND_KIND_CN, legendEdition } from '../../engine/legends'
import { ATTR_CN } from '../../engine/types'
import './worlds.css'

export default function WorldsCard({ card, size = 'md', level = 0, dupes = 0, selected, dimmed, onClick, footer }: CardFaceProps) {
  const l = card.legend!
  if (!isPlayerCard(card) || !l.art) return null
  const style = { '--wc-accent': l.art.accent, '--wc-position': l.art.position, '--wc-zoom': l.art.zoom ?? 1 } as CSSProperties
  const msi = l.competition === 'MSI'
  const hall = l.competition === 'Career'
  return <div className={`cardface worlds-card ${hall ? 'hall-card' : msi ? 'msi-card' : l.collection === 'ig-2018' ? 'ig-card' : ''} s-${size}${selected ? ' sel' : ''}${dimmed ? ' dim' : ''}${onClick ? ' tap' : ''}`}
    style={style} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
    aria-label={`${legendEdition(l)} ${card.ign} ${LEGEND_KIND_CN[l.kind]} 彩卡 ${card.rating}${level ? `，强化 ${level}` : ''}`}
    onClick={onClick} onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}>
    <div className="wc-window">
      <img className="wc-photo" src={card.face!} alt={`${card.ign} · ${l.art.year ?? l.year} ${hall ? '职业' : msi ? 'MSI' : '世界赛'}影像`} loading="lazy" decoding="async" />
      <div className="wc-shade" />
      <div className="wc-engraving" aria-hidden="true">{l.year}</div>
      <div className="wc-top"><span>{hall ? 'HALL OF FAME' : msi ? 'MSI LEGACY' : l.collection === 'ig-2018' ? 'INVICTUS · 2018' : 'WORLDS ARCHIVE'}</span><b>{hall ? 'HOF' : msi ? l.year : `S${l.year - 2010}`}</b></div>
      <div className="wc-rating"><strong>{card.rating}</strong><span>{card.role}</span>{level > 0 && <i>+{level}</i>}</div>
      <div className="wc-side" aria-hidden="true">{hall ? 'PLAYER LEGACY' : msi ? 'MID-SEASON INVITATIONAL' : 'WORLD CHAMPIONSHIP'} · {l.year}</div>
      <div className="wc-copy">
        <div className="wc-award"><span>✦</span> {LEGEND_KIND_CN[l.kind]} <span>✦</span></div>
        <div className="wc-name" style={{ fontSize: card.ign.length > 7 ? '13cqw' : undefined }}>{card.ign}</div>
        <div className="wc-title">{l.short}</div>
        <div className="wc-rule" />
        <div className="wc-stats">{(['aim', 'clutch', 'teamwork'] as const).map(key => <span key={key}><b>{card.attrs[key]}</b><small>{ATTR_CN[key]}</small></span>)}</div>
        <div className="wc-bottom"><b>{l.clubTag}</b><span>{footer || (dupes > 0 ? `重复 ×${dupes}` : `${String(l.art.serial).padStart(2, '0')} / ${String(l.art.total ?? 13).padStart(2, '0')} · 彩卡`)}</span></div>
      </div>
      <div className="wc-foil" aria-hidden="true" />
    </div>
  </div>
}
