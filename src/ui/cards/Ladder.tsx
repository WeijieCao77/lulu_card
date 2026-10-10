import { useEffect, useState } from 'react'
import { useCards } from './ctx'
import { Panel } from '../common'
import MatchReport from './Report'
import {
  DIVISIONS, MASTER_DIV, MASTER_TITLES, PACKS, STAMINA_COST, STAMINA_MAX, canPlay,
  ladderOpponent, ladderOf, playLevelOf, masterTitle, oppBumpFor, pendingOpponent,
  leagueEntry, ladderName, ladderSquadOf, LADDER_LEAGUES, LEAGUE_RULES,
  rankName, staminaFillHours, staminaNow, staminaRate, starsOnTier, tierStars,
  SEASON_DAYS, seasonDaysLeft, seasonFirstDay, seasonLastDay, seasonName, seasonOf,
} from '../../engine/gacha'
import { LADDER_BO, RIVAL_MERCY_GAP } from '../../engine/gacha'
import type { LadderLeague, LadderOutcome, LadderState } from '../../engine/gacha'
import type { ArenaResult, RivalSquad } from '../../engine/arena'
import { arenaOpponentRating } from '../../engine/arena'
import { chemistry, squadRating } from '../../engine/cards'
import { WORLD_TEAMS } from '../../engine/teams'
import { REGION_CN } from '../../engine/types'
import { track } from '../../engine/telemetry'
import { fetchLastTop, fetchTop } from '../../engine/account'
import type { LastBoard, TopRow } from '../../engine/account'
import { GapOdds } from './GapOdds'
import CupLineup from './CupLineup'

/**
 * 天梯: the open ladder, where the game is ranked, and one for each metal (after 开瓦包, 2026-10-02).
 *
 * The opponent is drawn there and pinned to the match, the five that walks
 * out is the five the server knows this account owns, the seed is one the
 * client never held, and the record moves only when the server says it did.
 * What this screen does is ask, and show the scoreboard it is handed.
 */
export default function Ladder() {
  const { g, now, today, cloud, act, toast, go } = useCards()
  // 天梯赛季 (gacha.ts rollSeason): the record on screen is this season's; 赛季前 (0) is everything before S1
  const season = seasonOf(today)
  const record = (r: LadderState) => (season > 0 ? `${r.sWins ?? r.wins}–${r.sLosses ?? r.losses}` : `${r.wins}–${r.losses}`)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<
    { res: ArenaResult; opp: string; who?: string; out: LadderOutcome } | null
  >(null)

  // Which ladder is being played. Each keeps its own record and its own board, so a bronze collection
  // has a climb of its own; the open one is the original 天梯, record and board where they always were.
  const [league, setLeague] = useState<LadderLeague>(() => {
    try { const k = localStorage.getItem('luluka-ladder'); return (LADDER_LEAGUES as readonly string[]).includes(k ?? '') ? k as LadderLeague : 'open' } catch { return 'open' }
  })
  const pick = (k: LadderLeague) => { setLeague(k); setShown(null); try { localStorage.setItem('luluka-ladder', k) } catch { /* private window */ } }
  const rule = LEAGUE_RULES[league]
  const level = (id: string) => playLevelOf(g, id)
  // the open ladder plays the 卡组; a metal one its own lineup if it has one (CupLineup)
  const lineup = ladderSquadOf(g, league)
  const filled = lineup.slots.filter(Boolean).length
  const rating = squadRating(lineup, level)
  const opp0 = ladderOpponent(g, league)
  const L = ladderOf(g, league)
  const master = L.div >= MASTER_DIV
  const entry = filled === 5 ? leagueEntry(lineup, league) : ({ ok: true } as const)
  const [top, setTop] = useState<TopRow[] | null | 'loading'>('loading')
  // 本赛季 or 上赛季前十, one board at a time
  const [board, setBoard] = useState<'now' | 'last'>('now')
  const [saved, setSaved] = useState(0)
  const [topAt, setTopAt] = useState(0)
  useEffect(() => {
    let alive = true
    const pull = () => {
      void fetchTop(league).then((r) => { if (alive) { setTop(r); setTopAt(Date.now()) } })
    }
    setTop('loading')
    pull()
    const wake = () => { if (document.visibilityState === 'visible') pull() }
    const t = setInterval(wake, 60_000)
    document.addEventListener('visibilitychange', wake)
    return () => {
      alive = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [saved, league])
  // past 大师 the world's clubs are not strong enough on their own
  const masterBump = master ? oppBumpFor(L.points ?? 0) : 0
  const bump = rule.oppBump + masterBump

  const pinned = pendingOpponent(g, league)
  const [drawing, setDrawing] = useState(false)
  useEffect(() => {
    if (pinned || drawing || !cloud) return
    let alive = true
    setDrawing(true)
    void act('ladder_draw', { league }).finally(() => { if (alive) setDrawing(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned, cloud, league, L.wins, L.losses])

  const rival = (pinned?.rival ?? null) as RivalSquad | null
  const oppId = pinned?.club ?? opp0
  const opp = WORLD_TEAMS.find((t) => t.id === oppId)
  // The strength the server scores 大师 points against (cardActions 'ladder'), as a whole number: the arena
  // paper is unrounded, and players saw 「评分 86.00000000001」.
  const oppRating = rival
    ? 84 + Math.min(10, Math.floor(rival.points / 250))
    : Math.round((arenaOpponentRating(oppId) ?? opp?.rating ?? 80) + bump)

  const play = async () => {
    const edit = league === 'open' ? undefined : { target: `ladder:${league}` as const }
    if (filled < 5) { toast('先凑齐五个人。'); go('squad', edit); return }
    if (!entry.ok) { toast(entry.why); go('squad', edit); return }
    if (!canPlay(g, 'ladder', now)) { toast(`体力不够，${staminaRate()}。`); return }
    setBusy(true)
    const r = await act('ladder', { league })
    setBusy(false)
    if (!r.ok) { toast(r.why); return }
    const got = r.result as { res: ArenaResult; opp: string; who?: string; out: LadderOutcome }
    track('card_match', {
      mode: 'ladder', league, won: got.res.win, div: L.div, rating,
      points: L.points ?? 0, rival: got.who ? 1 : 0,
    })
    setSaved((n) => n + 1)
    setShown(got)
  }

  return (
    <>
      {/* four ladders, one record each: the metal ones are where a bronze or silver card is worth playing */}
      <div className="league-bar">
        {LADDER_LEAGUES.map((k) => {
          const rec = k === 'open' ? g.ladder : g.leagues?.[k]
          return (
            <button key={k} className={`league-tab${k === league ? ' on' : ''}`} aria-pressed={k === league} onClick={() => pick(k)}>
              <b>{ladderName(k)}</b>
              <span className="tiny faint">{rec ? `${DIVISIONS[rec.div]} · ${record(rec)}` : '未开始'}</span>
            </button>
          )
        })}
      </div>
      <p className="tiny muted" style={{ margin: '0 0 12px' }}>
        {league === 'open'
          ? '所有卡牌稀有度均可入场，钻石起会遇到真人卡组。'
          : `${rule.blurb} 只打俱乐部，对手按卡色削弱；段位、战绩和排行榜都和公开赛分开算，升段奖励和公开赛一样。`}
        {!entry.ok && <b className="neg"> {entry.why}</b>}
      </p>
      {league !== 'open' && <CupLineup cup={`ladder:${league}`} />}

      <div className="grid c2" style={{ alignItems: 'start' }}>
        <Panel title="段位">
          <div className="div-badge">
            {rankName(L.div, L.stars, L.points ?? 0)}
            {!master && (
              <span className="stars">
                {Array.from({ length: tierStars(L.div) }, (_, i) => (
                  <i key={i} className={i < starsOnTier(L.div, L.stars) ? 'on' : ''} />
                ))}
              </span>
            )}
          </div>
          <div className="small muted" style={{ marginTop: 10, lineHeight: 1.8 }}>
            {season > 0
              ? <><b>本赛季 {seasonName(season)}</b> · 剩 {seasonDaysLeft(today)} 天（{monthDay(seasonLastDay(season))}结束）</>
              : <><b>{seasonName(1)} {monthDay(seasonFirstDay(1))}（周一）开始</b> · 现在是赛季前</>}
            <br />
            {season > 0 ? '本赛季' : '战绩'} <b className="mono">{record(L)}</b>
            {L.streak >= 2 && <span className="pos"> · {L.streak} 连胜</span>}
            {L.streak <= -2 && <span className="neg"> · {-L.streak} 连败</span>}
            <br />
            {season > 0 ? '本赛季最高' : '最高'}{' '}
            {master || L.best >= MASTER_DIV
              ? <><b className="mono">{L.bestPoints ?? 0}</b> 分（{masterTitle(L.bestPoints ?? 0)}）</>
              : DIVISIONS[L.best]}
            {(() => {
              // where this ladder stood when last season ended, and the best it has ever been
              const last = g.lastSeason?.ranks[league]
              const peak = Math.max(L.peak ?? 0, L.best, L.div)
              const peakPts = Math.max(L.peakPoints ?? 0, L.bestPoints ?? 0, L.points ?? 0)
              return (
                <>
                  {last && g.lastSeason && (
                    <><br />{g.lastSeason.season > 0 ? `上赛季 ${seasonName(g.lastSeason.season)}` : '赛季前'}：<b>{rankName(last.div, last.stars, last.points)}</b></>
                  )}
                  {season > 0 && (
                    <><br />历史最高 <b>{peak >= MASTER_DIV ? `${masterTitle(peakPts)} ${peakPts}` : DIVISIONS[peak]}</b></>
                  )}
                </>
              )
            })()}
            <br />
            {master ? (
              <span className="tiny faint">
                大师不掉段，改为计分：赢一场 +20 起，对手评分每高出 84 一分多 3 分
                （下一个对手评分 {oppRating}，赢了 +{20 + Math.max(0, oppRating - 84) * 3}），
                三连胜起再 +8；输一场 −15，最低 0 分。
                {MASTER_TITLES.slice().reverse().filter((t) => t.at > 0)
                  .map((t) => `${t.at} 分升「${t.name}」`).join('，')}，上不封顶。
              </span>
            ) : (
              <span className="tiny faint">
                赢一场 +1★（钻石以下三连胜起 +2★），输一场 −1★，铂金起会掉段。到大师后改为计分，不封顶。
              </span>
            )}
            <span className="tiny faint" style={{ display: 'block', marginTop: 6 }}>
              每个赛季 {SEASON_DAYS} 天（4 周）。赛季结束段位降两级：大师及以上回铂金，钻石回黄金，铂金回白银，其余回青铜（整季没打的每错过一季再多降一次，最多三次）；
              升段卡包和大师称号的十连包每个赛季都能重新拿。金卡、银卡、铜卡天梯一样。
            </span>
          </div>
        </Panel>

        <Panel title="下一个对手">
          {opp ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 700 }}>
                    {rival ? rival.name : opp.name}
                    {rival && <span className="tiny faint mono"> {rival.tag}</span>}
                  </div>
                  <div className="tiny muted">
                    {rival ? (
                      <>
                        <span className="tag t1">真人卡组</span>{' '}
                        {rankName(rival.div, 0, rival.points)} · 别的玩家保存的阵容
                        <br />
                        阵容分 <b>{squadRating(rival, (id) => rival.levels[id] ?? 0)}</b> · 默契{' '}
                        <b>{chemistry(rival).score}</b>
                        {' '}（我 {chemistry(lineup).score}）
                      </>
                    ) : (
                      <>
                        {REGION_CN[opp.region as keyof typeof REGION_CN]} · {opp.league} · 评分{' '}
                        {oppRating}
                        {masterBump > 0 && (
                          <span className="tag warn" style={{ marginLeft: 5 }}>
                            大师加强 +{masterBump}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="right">
                  <div className="tiny faint">我的阵容分</div>
                  <div className="display" style={{ fontSize: 28, lineHeight: 1 }}>{rating}</div>
                </div>
              </div>
              <p className="tiny faint" style={{ lineHeight: 1.7 }}>
                BO{LADDER_BO}，先赢 3 局。每局以摧毁基地决定胜负，<b>在服务器上结算</b>。
                {rival
                  ? `　匹配同段位的玩家（大师按大师分），阵容分相差不超过 12 分。对面高出 ${RIVAL_MERCY_GAP} 分以上，输了不掉星，大师分只扣一半。`
                  : league === 'open' && L.div >= 4 ? '　（暂时没匹配到真人卡组，先打俱乐部。）' : ''}
              </p>
              <GapOdds />
              <button className="primary" onClick={() => void play()} disabled={busy || !cloud || !entry.ok || !canPlay(g, 'ladder', now)}>
                {busy ? '比赛中…'
                  : !cloud ? '需要联网'
                    : filled < 5 ? '先去组队'
                      : !entry.ok ? `这套卡组进不了${ladderName(league)}`
                        : !canPlay(g, 'ladder', now) ? '体力不够'
                        : `开打（BO${LADDER_BO} · ${STAMINA_COST.ladder} 体力）`}
              </button>
              <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
                体力 {staminaNow(g, now)}/{STAMINA_MAX}，够打 {Math.floor(staminaNow(g, now) / STAMINA_COST.ladder)} 场。
                {staminaRate()}，攒满 {STAMINA_MAX} 点要 {staminaFillHours()} 小时，满了不再回复。
              </p>
            </>
          ) : (
            <p className="empty">找不到对手。</p>
          )}
        </Panel>
      </div>

      <Panel
        title={league === 'open' ? '天梯排行榜' : `${ladderName(league)}排行榜`}
        actions={board === 'now' ? (
          <span className="tiny muted">
            按段位和大师分排
            {topAt > 0 && <FreshAt at={topAt} />}
          </span>
        ) : undefined}
      >
        <div className="seg board-seg" role="group" aria-label="看哪个赛季的排行榜">
          <button className={board === 'now' ? 'on' : ''} aria-pressed={board === 'now'} onClick={() => setBoard('now')}>本赛季</button>
          <button className={board === 'last' ? 'on' : ''} aria-pressed={board === 'last'} onClick={() => setBoard('last')}>上赛季前十</button>
        </div>
        {board === 'last' ? <LastSeasonBoard league={league} />
          : top === 'loading' ? <p className="empty">读取中…</p>
          : !top ? <p className="empty">暂时读不到排行榜（离线或服务器忙）。</p>
            : top.length === 0 ? (
              <p className="empty">
                {league === 'open' ? '还没有人上榜。'
                  : `${ladderName(league)}${season > 0 ? '这个赛季' : ''}还没有人打过，第一场就是第一名。`}
              </p>
            )
              : (
                <>
                  <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th className="num">#</th><th>玩家</th><th>段位</th>
                          <th className="num">战绩</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((r) => (
                          <tr key={`${r.rank}-${r.tag}`} className={r.me ? 'me' : ''}>
                            <td className="num mono">{r.rank}</td>
                            <td>
                              <b style={{ color: r.hidden ? 'var(--faint)' : undefined }}>{r.name}</b>
                              <span className="tiny faint mono"> #{r.tag}</span>
                              {r.me && <span className="tag t1" style={{ marginLeft: 5 }}>我</span>}
                            </td>
                            <td className="small">{rankName(r.div, r.stars, r.points)}</td>
                            <td className="num mono tiny">{r.wins}–{r.losses}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {top.some((r) => r.me && r.hidden) && (
                    <div style={{
                      marginTop: 10, padding: '10px 12px', borderRadius: 3,
                      background: 'var(--warn-wash)', border: '1px solid var(--warn)',
                      borderLeftWidth: 3,
                    }}>
                      <b style={{ color: 'var(--warn)' }}>你的名字没有显示在榜上</b>
                      <div className="small muted" style={{ marginTop: 3, lineHeight: 1.7 }}>
                        {top.find((r) => r.me)?.why === 'id'
                          ? <>你把<b>账号 ID 当成了昵称</b>，公开会被人登录。
                            请<b>去「账号」页改个昵称</b>，排名和战绩不会丢。</>
                          : <>昵称含不宜公开的词，去「账号」页改一个即可恢复。</>}
                      </div>
                    </div>
                  )}
                  <p className="tiny faint" style={{ marginTop: 8, marginBottom: 0 }}>
                    {season > 0 ? `只算 ${seasonName(season)} 赛季，战绩是本赛季的胜负。` : ''}前 100 名加上你自己。名字后的 <b>#四位</b> 用来区分同名，<b>不是账号 ID</b>。
                    显示「已隐藏」的是昵称含不宜公开的词，或<b>把账号 ID 填成了昵称</b>，去「账号」页改名即可恢复。
                  </p>
                </>
              )}
      </Panel>

      {shown && (
        <MatchReport
          result={shown.res}
          opponentId={shown.opp}
          opponentName={shown.who}
          mySquad={lineup}
          level={level}
          onClose={() => setShown(null)}
          extra={
            <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
              <span className="chiplet">{shown.out.coins > 0 ? `+${shown.out.coins}` : shown.out.coins} 金币</span>
              {shown.out.pointsDelta != null && (
                <span className="chiplet" style={{ color: shown.out.pointsDelta >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                  {shown.out.pointsDelta >= 0 ? '+' : ''}{shown.out.pointsDelta} 分 · {shown.out.title} {shown.out.points}
                </span>
              )}
              {shown.out.promoted && <span className="chiplet" style={{ color: 'var(--win)' }}>升段 → {rankName(L.div, L.stars, L.points ?? 0)}</span>}
              {shown.out.spared && <span className="chiplet">对手强出一截 · {shown.out.pointsDelta != null ? '少扣一半' : '不掉星'}</span>}
              {shown.out.demoted && <span className="chiplet" style={{ color: 'var(--loss)' }}>掉段 → {rankName(L.div, L.stars, 0)}</span>}
              {shown.out.pack && <span className="chiplet" style={{ color: 'var(--warn)' }}>升段奖励：{PACKS[shown.out.pack].name}</span>}
              {shown.out.milestone && <span className="chiplet" style={{ color: 'var(--warn)' }}>第 {shown.out.milestoneWins} 胜：{PACKS[shown.out.milestone].name} +1</span>}
            </div>
          }
        />
      )}
    </>
  )
}

/** '2026-10-12' → '10月12日' */
const monthDay = (day: string): string => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`

/**
 * 上赛季前十: a finished season's ten, and where this account finished when it is not among them. A list of
 * rows rather than a table, so a phone keeps every column: the rank, the name, then the division over the record.
 */
function LastSeasonBoard({ league }: { league: LadderLeague }) {
  const [board, setBoard] = useState<LastBoard | null | 'loading'>('loading')
  const [tries, setTries] = useState(0)
  useEffect(() => {
    let alive = true
    setBoard('loading')
    void fetchLastTop(league).then((b) => { if (alive) setBoard(b) })
    return () => { alive = false }
  }, [league, tries])
  if (board === 'loading') return <p className="empty">读取中…</p>
  if (!board) {
    return (
      <div className="empty" role="status">
        暂时读不到上赛季排行（离线或服务器忙）。{' '}
        <button className="sm" onClick={() => setTries((n) => n + 1)}>重新加载</button>
      </div>
    )
  }
  if (board.season === null) {
    return <p className="empty">{seasonName(1)} 赛季 {monthDay(seasonFirstDay(1))}开始，第一个赛季结束后这里会留下前十名。</p>
  }
  if (!board.rows.length) return <p className="empty">{board.season > 0 ? `${seasonName(board.season)} 赛季` : '赛季前'}没有人打过这个天梯。</p>
  return (
    <>
      <p className="tiny muted" style={{ margin: '0 0 10px' }}>
        {board.season === 0 ? 'S1 开始前' : `${seasonName(board.season)} 赛季结束时`}的最终段位，前十名。
      </p>
      <ol className="last-board">
        {board.rows.map((r) => (
          <li key={r.rank} className={`last-row${r.me ? ' me' : ''}${r.rank <= 3 ? ` podium p${r.rank}` : ''}`}>
            <span className="last-rank mono" aria-label={`第 ${r.rank} 名`}>{r.rank}</span>
            <span className="last-who">
              <b style={{ color: r.hidden ? 'var(--faint)' : undefined }}>{r.name}</b>
              <span className="tiny faint mono"> #{r.tag}</span>
              {r.me && <span className="tag t1" style={{ marginLeft: 5 }}>我</span>}
            </span>
            <span className="last-div small">{rankName(r.div, r.stars, r.points)}</span>
            <span className="last-wl mono tiny muted">{r.wins}–{r.losses}</span>
          </li>
        ))}
      </ol>
      {board.mine && (
        <p className="small" style={{ margin: '10px 0 0' }}>
          你上赛季第 <b>{board.mine.rank}</b> 名 · {rankName(board.mine.div, board.mine.stars, board.mine.points)}
        </p>
      )}
    </>
  )
}

function FreshAt({ at }: { at: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  return (
    <span className="faint">
      {' · '}
      {s < 15 ? '刚刚更新' : s < 60 ? `${s} 秒前更新` : `${Math.round(s / 60)} 分钟前更新`}
    </span>
  )
}
