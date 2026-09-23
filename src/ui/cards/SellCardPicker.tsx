import { useEffect, useMemo, useState } from 'react'
import { CardPicker } from './Picker'
import type { PickRow } from './Picker'
import { marketSaleLevel, hasMarketDuplicates } from '../../engine/marketGuidance'
import type { Card } from '../../engine/cards'

export interface SellCardRow {
  card: Card
  owned: { level: number; dupes: number; spares?: unknown }
}

/**
 * Wrapper around CardPicker that can filter to only cards the server would
 * list as duplicates or upgraded spares. Defaults to all sellable rows; the
 * toggle narrows to repeated cards only.
 */
export function SellCardPicker({
  rows,
  value,
  onChange,
  disabled,
}: {
  rows: SellCardRow[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [dupesOnly, setDupesOnly] = useState(false)

  const pickerRows: PickRow[] = useMemo(() => {
    const valid = rows.filter((row) => marketSaleLevel(row.owned) != null)
    const source = dupesOnly ? valid.filter((row) => hasMarketDuplicates(row.owned)) : valid
    return source.map((row) => {
      const saleLevel = marketSaleLevel(row.owned)
      const note = row.owned.dupes > 0
        ? `重复 ${row.owned.dupes} 张，本次出售 +0`
        : hasMarketDuplicates(row.owned) ? `本次出售强化备用 +${saleLevel}` : `仅此一张 +${saleLevel}`
      return { card: row.card, note }
    })
  }, [rows, dupesOnly])

  useEffect(() => {
    if (!value) return
    const row = rows.find((r) => r.card.id === value)
    if (!row || marketSaleLevel(row.owned) == null || (dupesOnly && !hasMarketDuplicates(row.owned))) onChange('')
  }, [dupesOnly, rows, value, onChange])

  return (
    <div>
      <button
        type="button"
        className="sm ghost"
        aria-pressed={dupesOnly}
        disabled={disabled}
        onClick={() => {
          const next = !dupesOnly
          if (next && value && !hasMarketDuplicates(rows.find((r) => r.card.id === value)?.owned)) onChange('')
          setDupesOnly(next)
        }}
      >
        只看重复卡
      </button>
      <CardPicker rows={pickerRows} value={value} onChange={onChange} placeholder="选择要出售的卡" disabled={disabled} />
    </div>
  )
}
