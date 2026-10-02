import { useState } from 'react'
import { useCards } from './ctx'
import CupLineup from './CupLineup'
import { Panel } from '../common'
import MatchReport from './Report'
import {
  CUP_MAX_ROUNDS, CUP_MIN_ROUNDS, PACKS, cupBo, cupExitPrize, cupRoundName, cupSquadOf, cupTitlePrize, levelOf,
} from '../../engine/gacha'
import type { CupOutcome, CupRegistration, PackKind } from '../../engine/gacha'
import type { ArenaResult } from '../../engine/arena'
import { cardById, cardName, squadRating } from '../../engine/cards'
import { canEnterRegionCup, regionName, regionOpponent, squadRegion } from '../../engine/regionCup'
import { track } from '../../engine/telemetry'

/**
 * 地区杯 (engine/regionCup.ts): five players and a coach from one 地区, once a day, no 体力. The draw,
 * every match and the purse are the server's; this screen shows the bracket and the scoreboards.
 */
export default function RegionCup() {
  const { g, today, act, toast, go } = useCards()
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<{ res: ArenaResult; opp: string; who: string; out: CupOutcome; levels: Record<string, number> } | null>(null)

  const lineup = cupSquadOf(g, 'region')
  const home = squadRegion(lineup)
  const cup = g.regionCup ?? null
  const live = !!cup && !cup.done
  const gate = canEnterRegionCup(cup, today)
  const rounds = cup?.path.length ?? 0

  const enter = async () => {
    if (!home.ok) { toast(home.why); go('squad', { target: 'region' }); return }
    setBusy(true)
    const r = await act('region_enter')
    setBusy(false)
    if (!r.ok) { toast(r.why); return }
    const n = (r.result as { cup?: { path: string[] } } | undefined)?.cup?.path.length ?? 0
    toast(`抽签完成：共 ${n} 轮双败，先打${cupRoundName(n, 0)}。`)
  }

  const play = async () => {
    if (!cup || !regionOpponent(cup)) return
    const round = cup.round
    setBusy(true)
    const r = await act('region_play')
    setBusy(false)
    if (!r.ok) { toast(r.why); return }
    const { res, opp, who, out, registration } = r.result as { res: ArenaResult; opp: string; who: string; out: CupOutcome; registration: CupRegistration }
    track('card_match', { mode: 'region', won: res.win, round, rating: squadRating(registration.squad, (id) => registration.levels[id] ?? 0), title: !!out.won })
    setShown({ res, opp, who, out, levels: registration.levels })
  }

  const reg = cup?.registration
  return (
    <>
      <Panel title="地区杯" actions={<span className="tiny muted">每天一次 · 不花体力</span>}>
        <CupLineup cup="region" />
        <p className="small muted" style={{ marginTop: 0, lineHeight: 1.75 }}>
          <b>五名选手加一名教练，六个人必须同一地区</b>（按选手国籍；香港、澳门算中国，中国台湾单独算）。
          <b>每天一次，不花体力</b>。对手是<b>其他玩家报名的地区阵容</b>，优先抽别的地区；你报名的阵容也会留给别人来打。
          报名的人不够时，由该地区现役选手组成的联队补位。
          {CUP_MIN_ROUNDS}～{CUP_MAX_ROUNDS} 轮双败，一轮比一轮强，决赛 BO5；奖励和俱乐部杯一样：
          出局按晋级轮数给金币（{cupExitPrize(0)} 起），冠军 {cupTitlePrize(CUP_MIN_ROUNDS)}～{cupTitlePrize(CUP_MAX_ROUNDS)} 金币 + {PACKS.elite.name}。
        </p>
        {!live && (
          <p className="small" style={{ margin: '6px 0' }}>
            {home.ok
              ? <>当前阵容代表 <b>{regionName(home.region)}</b> · {squadRating(lineup, (id) => levelOf(g, id))} 分</>
              : <span style={{ color: 'var(--loss)' }}>{home.why}</span>}
          </p>
        )}

        {!live && (
          <button className="primary" disabled={busy || !gate.ok} onClick={() => void enter()}>
            {!gate.ok ? '今天已经打过了，明天再来' : !home.ok ? '先去调整阵容' : '报名（免费）'}
          </button>
        )}

        {cup && (
          <>
            {reg && (
              <p className="small muted" style={{ lineHeight: 1.75 }}>
                {cup.day === today ? '今天' : cup.day}代表 <b>{regionName(cup.region)}</b>（{squadRating(reg.squad, (id) => reg.levels[id] ?? 0)} 分）：
                {[...reg.squad.slots, reg.squad.coach].filter((id): id is string => !!id).map((id) => {
                  const card = cardById(id)
                  return `${card ? cardName(card) : id} +${reg.levels[id] ?? 0}`
                }).join(' · ')}
              </p>
            )}
            {live && (
              <p className="small" style={{ margin: '6px 0' }}>
                {cup.dropped
                  ? <span style={{ color: 'var(--loss)' }}>已输一场 · 再输出局</span>
                  : <span style={{ color: 'var(--win)' }}>胜者组 · 还能输一场</span>}
              </p>
            )}
            <div className="grid" style={{ gap: 8, marginTop: 4 }}>
              {cup.path.flatMap((oppId, i) => {
                const final = i === rounds - 1
                const legs = cup.legs.filter((l) => l.round === i)
                const upper = legs.filter((l) => !l.lower)
                const lower = legs.filter((l) => l.lower)
                const isNow = live && cup.round === i
                const lowerNow = isNow && cup.lower ? cup.lower : null
                const rows: { key: string; id: string; lower: boolean; leg?: typeof legs[number]; now: boolean }[] = []
                rows.push({ key: `u${i}`, id: oppId, lower: false, leg: upper[0], now: isNow && !lowerNow && !upper.length })
                if (lower.length) rows.push({ key: `l${i}`, id: lower[0].opponent, lower: true, leg: lower[0], now: false })
                else if (lowerNow) rows.push({ key: `l${i}`, id: lowerNow, lower: true, now: true })
                if (upper.length > 1 || (final && isNow && !lowerNow && upper.length === 1)) {
                  rows.push({ key: `r${i}`, id: oppId, lower: false, leg: upper[1], now: isNow && !upper[1] })
                }
                return rows.map((row) => {
                  const rv = cup.rivals[row.id]
                  const cls = row.leg ? (row.leg.win ? 'won' : 'lost') : row.now ? 'now' : ''
                  return (
                    <div key={row.key} className={`bracket-leg ${cls}`}>
                      <b style={{ width: row.lower ? 84 : 48, whiteSpace: 'nowrap' }}>{row.lower ? (final ? '败者组决赛' : '败者组') : cupRoundName(rounds, i)}</b>
                      <span style={{ flex: 1 }}>
                        {rv ? `${rv.name}${rv.ai ? '' : ` ${rv.tag}`}` : '?'}
                        <span className="tiny faint"> · {rv ? regionName(rv.region) : '?'} · {rv?.score ?? '?'} 分{rv && !rv.ai ? ' · 玩家阵容' : ''}</span>
                        {final && !row.lower && <span className="tag t1" style={{ marginLeft: 6 }}>BO5</span>}
                      </span>
                      {row.leg ? (
                        <span className="mono" style={{ color: row.leg.win ? 'var(--win)' : 'var(--loss)' }}>{row.leg.mapsWon}–{row.leg.mapsLost}</span>
                      ) : row.now ? (
                        <span className="tiny" style={{ color: 'var(--accent)' }}>下一场</span>
                      ) : (
                        <span className="tiny faint">未开始</span>
                      )}
                    </div>
                  )
                })
              })}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              {live ? (
                <button className="primary" onClick={() => void play()} disabled={busy}>
                  {busy ? '比赛中…' : `打${cup.lower ? (cup.round === rounds - 1 ? '败者组决赛' : '败者组') : cupRoundName(rounds, cup.round)}（BO${cupBo(cup)}）`}
                </button>
              ) : (
                <div className="small">
                  {cup.won
                    ? <b style={{ color: 'var(--warn)' }}>🏆 地区杯冠军（{rounds} 轮）</b>
                    : <span className="muted">止步{cupRoundName(rounds, Math.min(rounds - 1, cup.round))}</span>}
                </div>
              )}
            </div>
          </>
        )}
      </Panel>

      {shown && (
        <MatchReport
          result={shown.res}
          opponentId={shown.opp}
          opponentName={shown.who}
          level={(id) => shown.levels[id] ?? 0}
          onClose={() => setShown(null)}
          extra={
            <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
              {shown.out.won && <span className="chiplet" style={{ color: 'var(--warn)' }}>🏆 地区杯冠军</span>}
              {shown.out.coins > 0 && <span className="chiplet">+{shown.out.coins} 金币</span>}
              {(Object.entries(shown.out.packs ?? {}) as [PackKind, number][]).map(([k, n]) => (
                <span key={k} className="chiplet" style={{ color: 'var(--warn)' }}>{PACKS[k].name} ×{n}</span>
              ))}
              {shown.out.dropped && <span className="chiplet" style={{ color: 'var(--warn)' }}>掉入败者组 · 还有一次机会</span>}
              {!shown.out.done && !shown.out.dropped && <span className="chiplet">晋级</span>}
            </div>
          }
        />
      )}
    </>
  )
}
