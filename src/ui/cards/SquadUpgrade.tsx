import { useRef, useState } from 'react'
import { useCards } from './ctx'
import { cardById, isPlayerCard, cardPower, POWER_PER_LEVEL } from '../../engine/cards'
import { upgradeCost, levelOf } from '../../engine/gacha'
import CardActionDialog from './CardActionDialog'

const coin = (n: number) => n.toLocaleString('en-US')

export default function SquadUpgrade({ cardId }: { cardId: string }) {
  const { g, act, toast, cloud } = useCards()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<{ level: number; to: number | null; dupes: number; coins: number; can: boolean } | null>(null)
  const confirmRef = useRef(false)
  const card = cardById(cardId)
  if (!card) return null

  const level = levelOf(g, cardId)
  const cost = upgradeCost(g, cardId)
  const player = isPlayerCard(card)

  const openDialog = () => {
    setSnapshot({ level, to: cost.to, dupes: cost.dupes, coins: cost.coins, can: cost.can })
    setOpen(true)
  }

  const doUpgrade = async () => {
    if (confirmRef.current || busy || !snapshot) return
    if (!cloud) { toast('连接已断开，请恢复连接后再升级。'); setOpen(false); return }
    confirmRef.current = true
    setBusy(true)
    try {
      const fresh = upgradeCost(g, cardId)
      if (levelOf(g, cardId) !== snapshot.level || fresh.to !== snapshot.to || fresh.dupes !== snapshot.dupes || fresh.coins !== snapshot.coins || !fresh.can) {
        toast('升级条件已变化，请重新确认。')
        setOpen(false)
        return
      }
      const r = await act('upgrade', { cardId })
      if (!r.ok) { toast(r.why); setOpen(false); return }
      const newLevel = (r.result as { level?: number } | undefined)?.level ?? snapshot.to ?? snapshot.level
      toast(player ? `升级成功，+${newLevel}，战力 ${coin(cardPower(card, newLevel))}。` : `升级成功，现在是 +${newLevel}。`)
      setOpen(false)
    } catch {
      toast('升级结果不确定，请刷新后查看。')
      setOpen(false)
    } finally {
      confirmRef.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="sm"
        style={{ minHeight: 44, width: '100%', marginTop: 6 }}
        disabled={!cloud || !cost.can}
        title={
          !cloud ? '离线不可升级'
            : cost.to == null ? cost.why
              : `升到 +${cost.to}（${cost.dupes} 张重复 + ${coin(cost.coins)} 金币）`
        }
        onClick={openDialog}
      >
        {!cloud ? '离线不可升级' : cost.to == null ? cost.why : `升级到 +${cost.to}`}
      </button>
      <CardActionDialog
        open={open}
        title="确认升级"
        onClose={() => setOpen(false)}
        onConfirm={doUpgrade}
        confirmLabel={`确认升级到 +${snapshot?.to ?? ''}`}
        tone="primary"
        busy={busy}
      >
        <p style={{ margin: '0 0 8px' }}>
          <b>{player ? card.ign : card.name}</b>
        </p>
        <p style={{ margin: '0 0 8px' }}>
          当前：+{snapshot?.level ?? level} → 目标：+{snapshot?.to ?? '—'}
        </p>
        <p style={{ margin: 0 }}>
          成本：{snapshot?.dupes ?? cost.dupes} 张重复卡 + {coin(snapshot?.coins ?? cost.coins)} 金币
          {player && snapshot?.to != null ? `（战力 +${POWER_PER_LEVEL}）` : ''}
        </p>
      </CardActionDialog>
    </>
  )
}
