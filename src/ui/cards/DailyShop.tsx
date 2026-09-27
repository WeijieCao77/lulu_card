import { useEffect, useRef, useState } from 'react'
import { useCards } from './ctx'
import { Panel } from '../common'
import CardFace from '../Card'
import { cardById } from '../../engine/cards'
import { HOLD_DAYS } from '../../engine/tradeLock'
import { SHOP_PRICE } from '../../engine/dailyShop'

const RARITY_CN: Record<string, string> = { gold: '金卡', silver: '银卡', bronze: '铜卡' }

/** Hours and minutes to the next 00:00 in Beijing. */
function untilRefresh(now: number): string {
  const day = 86_400_000, bj = 8 * 3_600_000
  const left = day - ((now + bj) % day)
  const h = Math.floor(left / 3_600_000), m = Math.floor((left % 3_600_000) / 60_000)
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`
}

/**
 * 每日商店: five cards a day for this account (engine/dailyShop.ts). The shelf is the server's; the page asks
 * for today's the first time it is shown each day, and buying is one action per slot.
 */
export default function DailyShop() {
  const { g, today, now, act, toast } = useCards()
  const [busy, setBusy] = useState(false)
  const asked = useRef('')
  const shop = g.shop && g.shop.day === today ? g.shop : null

  useEffect(() => {
    if (shop || asked.current === today) return
    asked.current = today
    void act('shop')
  }, [shop, today, act])

  const buy = async (slot: number) => {
    if (busy || !shop) return
    const s = shop.slots[slot]
    const card = cardById(s.cardId)
    if (!card) return
    setBusy(true)
    try {
      const r = await act('shop_buy', { slot })
      if (!r.ok) { toast(r.why ?? '没买成，稍后再试。'); return }
      toast(`买到了 ${card.kind === 'player' ? card.ign : card.name}，已放进收藏；${HOLD_DAYS} 天后才能挂牌或交换。`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="每日商店" actions={<span className="tiny muted">北京时间 0 点刷新 · 还有 {untilRefresh(now)}</span>}>
      <p className="tiny faint" style={{ marginTop: 0, lineHeight: 1.7 }}>
        每天为你随机上架 4 张选手卡和 1 张教练卡，每人不同，每张限买一次。铜卡 {SHOP_PRICE.bronze}、银卡 {SHOP_PRICE.silver}、金卡 {SHOP_PRICE.gold} 金币，不出彩卡；
        其中一格优先出你还没有的卡。买到的卡马上能用，和市场买的一样，{HOLD_DAYS} 天后才能挂牌或交换。
      </p>
      {!shop ? <p className="small muted">正在上架……</p> : (
        <div className="shop-shelf">
          {shop.slots.map((s, i) => {
            const card = cardById(s.cardId)
            if (!card) return null
            const owned = g.cards[s.cardId]
            return (
              <div key={s.cardId} className={`shop-slot${s.bought ? ' sold' : ''}`}>
                <div className="shop-tags">
                  {s.fresh && !owned && <span className="tag win">未拥有</span>}
                  {owned && !s.bought && <span className="tag">已有 ×{1 + owned.dupes}</span>}
                </div>
                <CardFace card={card} size="md" />
                <button
                  className={`sm ${s.bought ? 'ghost' : 'primary'}`}
                  disabled={busy || !!s.bought || g.coins < s.price}
                  onClick={() => void buy(i)}
                  title={g.coins < s.price && !s.bought ? '金币不够' : undefined}
                >
                  {s.bought ? '已购买' : `${s.price.toLocaleString('en-US')} 金币`}
                </button>
                <span className="tiny faint">{RARITY_CN[card.rarity] ?? ''}{card.kind === 'coach' ? ' · 教练' : ''}</span>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
