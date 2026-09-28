import CardFace from '../Card'
import TeamBoard from './TeamBoard'
import { cardById, chemistry, squadRating } from '../../engine/cards'
import { WORLD_TEAMS } from '../../engine/teams'
import type { ArenaLine, ArenaResult } from '../../engine/arena'
import type { Squad } from '../../engine/cards'
import { useState } from 'react'

export default function MatchReport({
  result, opponentId, opponentName, mySquad, mineTitle, level, onClose, extra, neutral,
}: {
  neutral?: boolean
  result: ArenaResult
  opponentId: string
  opponentName?: string
  mySquad?: Squad
  mineTitle?: string
  level: (id: string) => number
  onClose: () => void
  extra?: React.ReactNode
}) {
  const opp = WORLD_TEAMS.find((t) => t.id === opponentId)
  const them = result.opp
  const theirLevel = (id: string) => them?.levels[id] ?? 0
  const isLoL = result.result.format === 'lol-v1'
  const [selectedGame, setSelectedGame] = useState<number>(0)

  const currentMap = result.result.maps[selectedGame]
  const isSeriesView = selectedGame === -1
  const perGame = (ls: ArenaLine[]) => !isLoL || isSeriesView ? ls : ls.map(l => {
    const ml = l.playerId ? currentMap?.lines?.[l.playerId] : undefined
    return ml ? { ...l, ...ml, maps: 1 } : l
  })
  const mergedLines = perGame(result.lines)
  const mergedOppLines = perGame(them?.lines ?? [])

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal lol-match-report" style={{ maxWidth: them ? 860 : 700 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            {neutral
              ? <>{mineTitle} <span style={{ whiteSpace: 'nowrap' }}>{result.mapsWon}–{result.mapsLost}</span> {opponentName}</>
              : <>{result.win ? '赢了' : '输了'} · <span style={{ whiteSpace: 'nowrap' }}>{result.mapsWon}–{result.mapsLost}</span> vs{' '}
                {opponentName ?? opp?.tag ?? '?'}</>}
          </h2>
          {result.bo && result.bo > 1 && <span className="tag" style={{ marginLeft: 8 }}>BO{result.bo}</span>}
          <div className="spacer" />
          <button className="ghost sm" onClick={onClose}>关闭</button>
        </div>
        <div className="modal-body">
          {extra}

          {isLoL ? (
            <>
              <p className="tiny faint">英雄联盟模拟对战 · 摧毁基地获胜。以下为模拟对局数据。</p>
              <div className="row wrap" style={{ gap: 6, margin: '8px 0 12px' }}>
                <button className={`ghost sm ${isSeriesView ? 't1' : ''}`} onClick={() => setSelectedGame(-1)}>系列赛合计</button>
                {result.result.maps.map((_m, i) => (
                  <button key={i} className={`ghost sm ${selectedGame === i ? 't1' : ''}`} onClick={() => setSelectedGame(i)}>
                    第{i + 1}局
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="tiny faint">旧版战报 · 历史模拟数据（旧版比分）</p>
          )}

          {isLoL ? <LoLMapStrip result={result} selectedGame={selectedGame} mineLabel={mineTitle ?? '我方'} theirLabel={opponentName ?? them?.name ?? opp?.tag ?? '对方'} /> : <MapStrip result={result} />}

          {them ? (
            <>
              {/* League stacks blue over red; the old two-column layout cut the 伤害 column off */}
              <div className={isLoL ? '' : 'grid c2'} style={{ alignItems: 'start', marginTop: 4, ...(isLoL ? { display: 'flex', flexDirection: 'column', gap: 14 } : {}) }}>
                <Board side="a" title={neutral ? `${mineTitle ?? ''} 数据` : '我方数据'} lines={isLoL ? mergedLines : result.lines} mvp={result.mvpCard} level={level} isLoL={isLoL} />
                <Board side="b" title={neutral ? `${them.name} 数据` : '对方数据'} lines={isLoL ? mergedOppLines : them.lines} mvp={them.mvpCard} level={theirLevel} isLoL={isLoL} />
              </div>
              <details style={{ marginTop: 12 }}><summary>查看双方卡组与阵容分</summary>
              <SquadRow
                title={mineTitle ?? '我的卡组'}
                slots={mySquad?.slots ?? result.lines.map((l) => l.cardId)}
                coach={mySquad?.coach ?? null}
                level={level}
                mvp={result.mvpCard}
                won={result.win}
              />
              <SquadRow
                title={`${them.name} ${them.tag}`}
                slots={them.slots}
                coach={them.coach}
                level={theirLevel}
                mvp={them.mvpCard}
                won={!result.win}
              />
              </details>
            </>
          ) : (
            <TeamBoard squad={mySquad ?? { slots: result.lines.map((l) => l.cardId), coach: null }}><Board title="" lines={isLoL ? mergedLines : result.lines} mvp={result.mvpCard} level={level} isLoL={isLoL} /></TeamBoard>
          )}

          {(!isLoL || isSeriesView) && !!result.result.highlights.length && (
            <ul className="tiny muted" style={{ margin: '14px 0 0', paddingLeft: 16, lineHeight: 1.9 }}>
              {result.result.highlights.slice(0, 5).map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

const kGold = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

function LoLMapStrip({ result, selectedGame, mineLabel, theirLabel }: { result: ArenaResult; selectedGame: number; mineLabel: string; theirLabel: string }) {
  if (selectedGame === -1) {
    // Series total view
    return (
      <div className="row wrap" style={{ gap: 10, margin: '4px 0 14px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 200 }}>
          <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
            <b style={{ fontSize: 13 }}>系列赛合计</b>
            <span className="mono" style={{ fontWeight: 800 }}>
              总比分 {result.mapsWon}–{result.mapsLost}
            </span>
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            击杀总数 {result.result.maps.reduce((s, m) => s + m.scoreA, 0)}–{result.result.maps.reduce((s, m) => s + m.scoreB, 0)}
          </div>
        </div>
      </div>
    )
  }

  const m = result.result.maps[selectedGame]
  if (!m?.lol) return null
  const lol = m.lol
  const winner = lol.winner
  const mins = `${Math.floor(lol.durationSeconds / 60)}:${(lol.durationSeconds % 60).toString().padStart(2, '0')}`
  // League's post-game: blue side left, red side right, every figure shown for both and compared on one bar
  const rows: [string, number, number, (n: number) => string][] = [
    ['击杀', m.scoreA, m.scoreB, String],
    ['经济', lol.goldA, lol.goldB, kGold],
    ['推塔', lol.towersA, lol.towersB, String],
    ['小龙', lol.dragonsA, lol.dragonsB, String],
    ['大龙', lol.baronsA, lol.baronsB, String],
  ]

  return (
    <div style={{ margin: '4px 0 14px' }}>
      <div className="pg-head">
        <div className="pg-side a">
          <b>{mineLabel}</b>
          <span className={`pg-result ${winner === 'A' ? 'won' : 'lost'}`}>{winner === 'A' ? '胜利' : '失败'}</span>
        </div>
        <div className="pg-mid">
          <span className="tiny faint">{m.map}</span>
          <b className="mono">{mins}</b>
        </div>
        <div className="pg-side b">
          <span className={`pg-result ${winner === 'B' ? 'won' : 'lost'}`}>{winner === 'B' ? '胜利' : '失败'}</span>
          <b>{theirLabel}</b>
        </div>
      </div>

      <div className="pg-compare">
        {rows.map(([label, a, b, fmt]) => {
          const pct = a + b > 0 ? (100 * a) / (a + b) : 50
          return (
            <div key={label} className="pg-row">
              <span className="mono pg-num a">{fmt(a)}</span>
              <div className="pg-bar-wrap">
                <span className="tiny pg-label">{label}</span>
                <div className="pg-bar">
                  <i className="a" style={{ width: `${pct}%` }} />
                  <i className="b" style={{ width: `${100 - pct}%` }} />
                </div>
              </div>
              <span className="mono pg-num b">{fmt(b)}</span>
            </div>
          )
        })}
      </div>

      {lol.events?.length > 0 && (
        <details className="tiny muted" style={{ marginTop: 8, lineHeight: 1.7 }}><summary>本局关键事件</summary>
          {lol.events.map((e, i) => (
            <div key={i}>
              <span className="mono" style={{ marginRight: 6 }}>{e.minute}'</span>
              {e.text}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

function MapStrip({ result }: { result: ArenaResult }) {
  return (
    <div className="row wrap" style={{ gap: 10, margin: '4px 0 14px', alignItems: 'flex-start' }}>
      {result.result.maps.map((m, i) => {
        const mine = m.lol ? m.lol.winner === 'A' : m.scoreA > m.scoreB
        return (
          <div key={i} style={{ minWidth: 148 }}>
            <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
              <b style={{ fontSize: 13 }}>{m.map}</b>
              <span className="mono" style={{ color: mine ? 'var(--win)' : 'var(--loss)', fontWeight: 800 }}>
                {m.scoreA}–{m.scoreB}
              </span>
            </div>
            {m.rounds?.length ? (
              <div className="rd-strip" title="每一格是一个回合，左边是上半场">
                {m.rounds.map((r) => (
                  <i
                    key={r.n}
                    className={r.winner === 'A' ? 'a' : 'b'}
                    data-buy={(r.winner === 'A' ? r.buyA : r.buyB) === 'eco' ? 'eco' : undefined}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function SquadRow({
  title, slots, coach, level, mvp, won,
}: {
  title: string
  slots: (string | null)[]
  coach: string | null
  level: (id: string) => number
  mvp: string | null
  won: boolean
}) {
  const ids = [...slots.filter((x): x is string => !!x)]
  const squad = { slots, coach }
  const paper = ids.length ? squadRating(squad, level) : 0
  const chem = chemistry(squad).score
  return (
    <TeamBoard squad={squad}><div style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
        <b style={{ fontSize: 13 }}>{title}</b>
        <span className={`tag ${won ? 't1' : ''}`}>{won ? '胜' : '负'}</span>
        {paper > 0 && (
          <span className="tiny muted">阵容分 <b>{paper}</b> · 默契 <b>{chem}</b></span>
        )}
      </div>
      <div className="report-cards">
        {ids.map((id) => {
          const card = cardById(id)
          if (!card) return null
          return (
            <CardFace
              key={id}
              card={card}
              level={level(id)}
              footer={id === mvp ? '全场最佳' : undefined}
              selected={id === mvp}
            />
          )
        })}
        {coach && cardById(coach) && (
          <CardFace card={cardById(coach)!} level={level(coach)} footer="教练" />
        )}
      </div>
    </div></TeamBoard>
  )
}

const ROLE_ORDER = ['上单', '打野', '中单', '下路', '辅助']

function Board({ title, lines, mvp, isLoL, side }: {
  title: string; lines: ArenaLine[]; mvp: string | null; level: (id: string) => number; isLoL: boolean; side?: 'a' | 'b'
}) {
  // top to support, as League lists a team
  const rows = isLoL ? lines.slice().sort((x, y) => {
    const rx = ROLE_ORDER.indexOf(cardRole(x.cardId)), ry = ROLE_ORDER.indexOf(cardRole(y.cardId))
    return (rx < 0 ? 9 : rx) - (ry < 0 ? 9 : ry)
  }) : lines
  return (
    <div className={side ? `pg-board ${side}` : undefined}>
      {title && <div className="tiny pg-board-title" style={{ marginBottom: 4 }}>{title}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>选手</th>
              {isLoL ? <>
                <th>位置</th><th className="right">K / D / A</th><th className="right">KDA</th>
                <th className="right" title="补刀：击杀小兵和野怪的数量">补刀</th><th className="right">经济</th><th className="right" title="对英雄造成的伤害（单局）">伤害</th>
              </> : <>
                <th className="right">K</th><th className="right">D</th><th className="right">A</th><th className="right">KDA</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const card = cardById(l.cardId)
              if (!card) return null
              const kda = ((l.kills + l.assists) / Math.max(1, l.deaths)).toFixed(2)
              const damage = (l as ArenaLine & { damage?: number }).damage
              return (
                <tr key={l.cardId} className={l.cardId === mvp ? 'me' : ''}>
                  <td>
                    {card.kind === 'player' ? card.ign : card.name}
                    {l.cardId === mvp && <span className="tag t1" style={{ marginLeft: 6 }}>MVP</span>}
                  </td>
                  {isLoL ? <>
                    <td className="tiny muted">{cardRole(l.cardId) || '–'}</td>
                    <td className="right mono">{l.kills} / {l.deaths} / {l.assists}</td>
                    <td className="right mono">{kda}</td>
                    <td className="right mono">{l.cs ?? '–'}</td>
                    <td className="right mono">{l.gold != null ? kGold(l.gold) : '–'}</td>
                    <td className="right mono">{damage != null && l.maps === 1 ? damage.toLocaleString('en-US') : '–'}</td>
                  </> : <>
                    <td className="right mono">{l.kills}</td>
                    <td className="right mono">{l.deaths}</td>
                    <td className="right mono">{l.assists}</td>
                    <td className="right mono">{kda}</td>
                  </>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** the position a card played in this report: its first listed position */
function cardRole(id: string): string {
  const c = cardById(id)
  return c && c.kind === 'player' ? c.roles[0] ?? c.role : ''
}
