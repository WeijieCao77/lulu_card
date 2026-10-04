import type { PlayerCard } from '../../../engine/cards'
import { RARITY_CN } from '../../../engine/cards'
import { crestUrl } from '../../../engine/dossier'
import { Flag } from '../../Card'
import './s16Card.css'

/**
 * S16 世界赛 card face (owner 2026-10-04, after 虎扑选手股). Before a player has played at Worlds the card is the
 * man, his club and his position, and every number reads 「?」 on a steel frame. After his first game the numbers
 * come in, the frame takes his current metal, and an arrow says which way the last update moved him. The FMVP's
 * card becomes a 彩卡 at the end.
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

export function S16Card({ card, level = 0, dupes = 0, size = 'md', selected, dimmed, onClick, footer }: S16CardProps) {
  const s = card.s16!
  const shown = s.revealed
  const state = !shown ? 's16-hidden' : s.fmvp ? 's16-mythic' : `s16-${card.rarity}`
  const delta = shown && s.prev != null ? card.rating - s.prev : 0
  const crest = crestUrl(card.clubId)
  const stats = [
    { label: '对线', value: card.attrs.reaction },
    { label: '团战', value: card.attrs.teamwork },
    { label: '决策', value: card.attrs.igl },
  ]
  return (
    <div
      className={`cardface s16card ${state} s-${size}${selected ? ' sel' : ''}${dimmed ? ' dim' : ''}${onClick ? ' tap' : ''}`}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      title={`S16 世界赛 · ${card.ign} · ${shown ? `${s.fmvp ? 'FMVP 彩卡' : RARITY_CN[card.rarity]} ${card.rating}` : '数值待揭晓'}`}
    >
      <div className="s16-inner">
        <div className="s16-photo">
          {card.face && <img src={card.face} alt={card.ign} loading="lazy" decoding="async" />}
        </div>
        <div className="s16-top">
          <span className="s16-mark">WORLDS<b>2026</b></span>
          <span className="s16-role">{ROLE_SHORT[card.role] ?? card.role}</span>
        </div>
        <div className="s16-rating">
          <strong>{shown ? card.rating : '?'}</strong>
          {shown && delta !== 0 && <i className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</i>}
          {level > 0 && <em>+{level}</em>}
        </div>
        <div className="s16-copy">
          <div className="s16-team">
            {crest && <span className="s16-crest" style={{ backgroundImage: `url(${crest})` }} />}
            <span>{card.clubTag}</span>
            <Flag nat={card.nat} />
          </div>
          <strong className="s16-name" title={card.ign}>{card.ign}</strong>
          <div className="s16-stats">
            {stats.map(({ label, value }) => <span key={label}><b>{shown ? value : '?'}</b><small>{label}</small></span>)}
          </div>
          <div className="s16-foot">
            <span>{footer ?? (shown ? `S16 已赛 ${s.games} 场` : 'S16 开赛后揭晓')}</span>
            <b>{shown ? (s.fmvp ? 'FMVP' : RARITY_CN[card.rarity]) : '?'}</b>
          </div>
        </div>
        {dupes > 0 && <span className="s16-dupes">x{dupes + 1}</span>}
      </div>
    </div>
  )
}

/** S16 卡背 — a placeholder until the owner's artwork arrives: the emblem on night navy */
export function S16CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div className={`cardback s16-back s-${size}`} aria-label="S16 世界赛卡背">
    <div className="s16-back-inner"><span>WORLDS</span><b>S16</b><small>2026 · 选手股</small></div>
  </div>
}
