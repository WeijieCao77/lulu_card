import { useCards } from './ctx'
import { cupSquadOf, CUP_SQUAD_NAMES, levelOf } from '../../engine/gacha'
import type { CupSquadKey, GachaState } from '../../engine/gacha'
import type { Squad } from '../../engine/cards'
import { squadRating } from '../../engine/cards'

/**
 * The account seen through one cup's lineup (owner, 2026-09-27: a lineup of its own for every cup). The squad
 * screen edits `g.squad`; handed this view it edits the cup's lineup instead, with everything else — the
 * collection, the presets, the coins — read and written on the real account. The cup's lineup starts as a copy
 * of the 卡组 the first time it is opened.
 */
export function cupView(g: GachaState, key: CupSquadKey): GachaState {
  const own = (): Squad => {
    g.cupSquads ??= {}
    return (g.cupSquads[key] ??= { slots: [...g.squad.slots], coach: g.squad.coach })
  }
  return new Proxy(g, {
    get(target, prop, receiver) {
      if (prop === 'squad') return own()
      return Reflect.get(target, prop, receiver)
    },
    set(target, prop, value, receiver) {
      if (prop === 'squad') {
        target.cupSquads ??= {}
        target.cupSquads[key] = value as Squad
        return true
      }
      return Reflect.set(target, prop, value, receiver)
    },
  })
}

/** One line on a cup: which lineup it plays with, and the button to edit it. */
export default function CupLineup({ cup }: { cup: CupSquadKey }) {
  const { g, go, commit, toast } = useCards()
  const own = !!g.cupSquads?.[cup]
  const squad = cupSquadOf(g, cup)
  const filled = squad.slots.filter(Boolean).length
  const score = filled === 5 ? squadRating(squad, (id) => levelOf(g, id)) : null
  return (
    <div className="cup-lineup">
      <span className="tiny">
        本杯阵容：<b>{own ? '专用阵容' : '跟随卡组'}</b>
        {' · '}{filled}/5 人{score != null ? ` · ${score} 分` : ''}{squad.coach ? ' · 有教练' : ''}
      </span>
      <button className="sm" onClick={() => go('squad', { target: cup })}>
        {own ? '调整本杯阵容' : '设置本杯专用阵容'}
      </button>
      {own && (
        <button
          className="sm ghost"
          title="删掉这个杯赛的专用阵容，之后跟随卡组"
          onClick={() => {
            if (g.cupSquads) delete g.cupSquads[cup]
            if (g.cupSquads && !Object.keys(g.cupSquads).length) delete g.cupSquads
            void commit(true)
            toast(`${CUP_SQUAD_NAMES[cup]}改回跟随卡组。`)
          }}
        >
          改回跟随卡组
        </button>
      )}
    </div>
  )
}
