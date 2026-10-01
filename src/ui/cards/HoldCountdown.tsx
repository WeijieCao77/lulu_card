/**
 * How long until a bought, swapped-in or shop-bought copy may trade again (owner, 2026-10-01: players want to
 * see the hours and minutes, not 「3 天后」). Server time, ticking every 30 seconds.
 */
import { useEffect, useState } from 'react'
import type { OwnedCard } from '../../engine/gacha'
import { HOLD_DAYS, releaseText, releasesOf, waitText } from '../../engine/tradeLock'
import { serverNow } from '../../engine/account'

export function useTick(ms = 30_000): number {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** One line per held copy; nothing when no copy is held. */
export default function HoldCountdown({ owned }: { owned: OwnedCard | undefined }) {
  const now = useTick()
  const releases = releasesOf(owned, now)
  if (!releases.length) return null
  return (
    <div className="tiny" style={{ marginTop: 6, lineHeight: 1.7 }}>
      <b>交易冷却</b>
      <span className="faint">（买来、换来或商店买的卡，{HOLD_DAYS} 天后才能挂牌或交换）</span>
      {releases.map((at, i) => (
        <div key={`${at}-${i}`}>
          {releases.length > 1 ? `第 ${i + 1} 张：` : ''}还要 <b>{waitText(at - now)}</b>
          <span className="faint">（{releaseText(at)} 起可交易）</span>
        </div>
      ))}
    </div>
  )
}
