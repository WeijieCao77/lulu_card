/**
 * 天梯赛季: four weeks from Monday 2026-10-12 (S1), a two-division drop at the turn on every ladder that was
 * played, and every promotion and 大师 title pack paid again each season (owner, 2026-10-07, after 开瓦包).
 *
 * The engine part runs on fixed dates. The server part (load / act roll the account, the board ranks only
 * this season) runs three times: with the real S1 date (today is 赛季前 until 10-12, so nothing may roll),
 * and with the start moved into the past so that today is in S1 and in S2 and the turn is exercised.
 *
 *   npx tsx scripts/check_seasons.ts
 */
process.env.ENGINE_FROM_SOURCE = '1'
// these accounts are never bound to a phone; the gate is tested on its own in check_phone.ts
process.env.PHONE_GATE = '0'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { AUTO_VERIFY } from './verified-fixture.mjs'
import {
  MASTER_DIV, MASTER_TITLES, SEASON_DAYS, SEASON_START, migrateGacha, newGacha, recordLadder, rollSeason,
  seasonDaysLeft, seasonFirstDay, seasonLastDay, seasonOf, seasonResetDiv, setSeasonStartForCheck,
} from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { runAction } from '../src/engine/cardActions'

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

// ---------------------------------------------------------------- the calendar
setSeasonStartForCheck(null)
check('S1 从 2026-10-12（周一）开始，每季 28 天', SEASON_START === '2026-10-12' && SEASON_DAYS === 28
  && new Date('2026-10-12T00:00:00Z').getUTCDay() === 1)
check('10/11 以前都是赛季前', seasonOf('2026-10-11') === 0 && seasonOf('2026-10-07') === 0 && seasonOf('2026-09-01') === 0)
check('S1 是 10/12–11/8，S2 从 11/9 开始', seasonOf('2026-10-12') === 1 && seasonOf('2026-11-08') === 1 && seasonOf('2026-11-09') === 2)
check('起止日期', seasonFirstDay(1) === '2026-10-12' && seasonFirstDay(2) === '2026-11-09'
  && seasonLastDay(1) === '2026-11-08' && seasonLastDay(0) === '2026-10-11')
check('剩余天数含当天', seasonDaysLeft('2026-10-12') === 28 && seasonDaysLeft('2026-11-08') === 1)
check('降两级：大师→铂金，钻石→黄金，铂金→白银，其余→青铜',
  [0, 1, 2, 3, 4, 5, 9].map(seasonResetDiv).join() === '0,0,0,1,2,3,3')
check('赛季前建的号在赛季前，S1 里建的号直接在 S1',
  newGacha('VM-T-NEW0', 'a', '2026-10-07').season === 0 && newGacha('VM-T-NEW1', 'b', '2026-10-20').season === 1)

// ---------------------------------------------------------------- the turn, every ladder
const g = newGacha('VM-TEST-SEASON', '赛季', '2026-10-01')
// a 大师 1500 on the open ladder, 钻石 on the gold one, 黄金 on the silver one, the bronze one never played
g.ladder = { ...g.ladder, div: MASTER_DIV, stars: 0, best: MASTER_DIV, points: 1500, bestPoints: 1600, wins: 140, losses: 90, streak: 4 }
g.leagues = {
  gold: { div: 4, stars: 5, best: 4, wins: 30, losses: 20, streak: 0, points: 0, bestPoints: 0 },
  silver: { div: 2, stars: 1, best: 3, wins: 5, losses: 9, streak: -1, points: 0, bestPoints: 0 },
  bronze: { div: 0, stars: 0, best: 0, wins: 0, losses: 0, streak: 0, points: 0, bestPoints: 0 },
}
g.ladder.pending = { at: 230, club: 'x' } as never
check('赛季前不动（10/11）', rollSeason(g, '2026-10-11') === null && g.ladder.div === MASTER_DIV && (g.season ?? 0) === 0)
const ended = rollSeason(g, '2026-10-12')
check('进入 S1：大师 1500 回铂金，星和分清零', g.season === 1 && g.ladder.div === 3 && g.ladder.stars === 0
  && g.ladder.points === 0 && g.ladder.best === 3 && g.ladder.bestPoints === 0, JSON.stringify(g.ladder))
check('金卡天梯钻石回黄金、银卡天梯黄金回青铜；没打过的铜卡天梯不动也不记',
  g.leagues.gold!.div === 2 && g.leagues.gold!.stars === 0 && g.leagues.silver!.div === 0 && g.leagues.bronze!.div === 0
  && !ended!.ranks.bronze && g.leagues.bronze!.sWins === undefined)
check('生涯胜负不清零（待打对手和检查都读它），本赛季胜负清零',
  g.ladder.wins === 140 && g.ladder.losses === 90 && g.ladder.sWins === 0 && g.ladder.sLosses === 0
  && g.leagues.gold!.wins === 30 && g.leagues.gold!.sWins === 0)
check('上赛季记录：段位和分；赛季前的战绩是生涯战绩', ended!.season === 0 && ended!.ranks.open!.div === MASTER_DIV
  && ended!.ranks.open!.points === 1500 && ended!.ranks.open!.wins === 140 && ended!.ranks.gold!.div === 4
  && ended!.ranks.silver!.div === 2 && g.lastSeason === ended)
check('历史最高留着', g.ladder.peak === MASTER_DIV && g.ladder.peakPoints === 1600
  && g.leagues.gold!.peak === 4 && g.leagues.silver!.peak === 3)
check('上赛季段位抽到的对手作废，新赛季重新抽', g.ladder.pending === undefined)
check('同一赛季再滚一次什么都不变', rollSeason(g, '2026-10-30') === null && g.ladder.div === 3 && g.season === 1)
check('日志里写了', g.log[0]?.text.includes('S1 赛季开始') && g.log[0]?.text.includes('铂金'), g.log[0]?.text)
const again = migrateGacha(copy(g), 'VM-TEST-SEASON')
check('读档后新字段都还在', again.season === 1 && again.ladder.peak === MASTER_DIV && again.ladder.sWins === 0
  && again.leagues!.gold!.peak === 4 && again.leagues!.gold!.sWins === 0 && again.lastSeason?.season === 0)

// the point of it: the packs pay again
let packs = 0
const before = g.packs.ten ?? 0
let guard = 0
while (g.ladder.div < MASTER_DIV && guard++ < 300) { const out = recordLadder(g, true, 86); if (out.pack) packs++ }
check('铂金打回大师：钻石、大师两个升段包（十连）再发一次', packs === 2 && (g.packs.ten ?? 0) - before >= 2, `${packs} 个`)
let titles = 0
const immortal = MASTER_TITLES.find((t) => t.name === '不朽')!.at
while ((g.ladder.points ?? 0) < immortal && guard++ < 600) { const out = recordLadder(g, true, 95); if (out.pack === 'ten') titles++ }
check('大师称号（不朽）的十连包也再发', titles >= 1, `${titles} 个`)
check('本赛季战绩在涨，生涯战绩也在涨', (g.ladder.sWins ?? 0) > 0 && g.ladder.wins === 140 + (g.ladder.sWins ?? 0))
const metal = recordLadder(g, false, 80, 'gold')
check('金卡天梯也记本赛季胜负', g.leagues.gold!.sLosses === 1 && g.leagues.gold!.losses === 21 && metal.win === false)
// a metal ladder first played this season starts its season record from nothing
recordLadder(g, true, 80, 'bronze')
check('这赛季才开打的天梯，本赛季战绩从 1 开始', g.leagues.bronze!.sWins === 1 && g.leagues.bronze!.wins === 1)

// the next turn: 不朽 again → 铂金, and the S1 record is the season's own
const s1Wins = g.ladder.sWins
const s2 = rollSeason(g, '2026-11-09')
check('S1 → S2：又回铂金，上赛季战绩是 S1 自己的', g.season === 2 && g.ladder.div === 3 && s2!.season === 1
  && s2!.ranks.open!.wins === s1Wins && g.ladder.peakPoints! >= 1600)

// away for a season: one drop a season missed
const idle = newGacha('VM-TEST-IDLE', '潜水', '2026-10-01')
idle.ladder = { ...idle.ladder, div: MASTER_DIV, best: MASTER_DIV, wins: 50, losses: 50, points: 400, bestPoints: 400 }
rollSeason(idle, '2026-11-12')
check('错过一个赛季：降两次（大师 → 铂金 → 白银）', idle.season === 2 && idle.ladder.div === 1)

// a 黄金 player: back to 青铜 (the bottom three divisions all go to 青铜)
const gold = newGacha('VM-TEST-GOLD', '黄金', '2026-10-01')
gold.ladder = { ...gold.ladder, div: 2, stars: 4, best: 2, wins: 20, losses: 15 }
rollSeason(gold, '2026-10-12')
check('黄金回青铜', gold.ladder.div === 0 && gold.ladder.stars === 0 && gold.ladder.peak === 2)
const never = newGacha('VM-TEST-NEVER', '没打', '2026-10-01')
const neverRec = rollSeason(never, '2026-10-12')
check('一场没打过：只换赛季号，没有上赛季记录', never.season === 1 && !never.lastSeason && neverRec !== null
  && Object.keys(neverRec.ranks).length === 0)

// the action path: the first action in a new season rolls it, and none before
const acted = newGacha('VM-TEST-ACT', '动作', '2026-10-01')
acted.ladder = { ...acted.ladder, div: 4, best: 4, wins: 10, losses: 3 }
runAction(acted, 'mail_seen', {}, { now: Date.parse('2026-10-11T02:00:00Z'), today: '2026-10-11', seed: 1 })
check('赛季前的操作不动段位', (acted.season ?? 0) === 0 && acted.ladder.div === 4)
runAction(acted, 'mail_seen', {}, { now: Date.parse('2026-10-12T02:00:00Z'), today: '2026-10-12', seed: 1 })
check('新赛季第一次操作就进入新赛季（钻石 → 黄金）', acted.season === 1 && acted.ladder.div === 2)

// ---------------------------------------------------------------- the server, with the start moved
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const { CARD_SCHEMA, engine, makeCardApi, serverDay } = await import('../cards-api.js')
const today = serverDay()
const dayMinus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
interface Res { code: number; body: Record<string, any> }

const modes: { label: string; start: string | null }[] = [
  { label: '真实日期', start: null },
  { label: '起点挪到 3 天前（今天是 S1）', start: dayMinus(3) },
  { label: '起点挪到 31 天前（今天是 S2）', start: dayMinus(31) },
]
for (const mode of modes) {
  setSeasonStartForCheck(mode.start)
  const now = seasonOf(today)
  console.log(`\n— ${mode.label}：今天 ${today}，第 ${now} 季`)
  check('服务器和检查用的是同一份赛季日历', engine.seasonOf(today) === now)
  if (mode.start === null && today < SEASON_START) check('S1 之前：今天是赛季前', now === 0)

  const db = new PGlite()
  const sql = makeSql(db)
  await db.exec(CARD_SCHEMA)
  await db.exec(AUTO_VERIFY)
  const api = makeCardApi(sql, {
    rateLimited: () => false,
    readBody: (req: { body: string }) => Promise.resolve(req.body),
    json: (res: Res, code: number, body: Record<string, unknown>) => { res.code = code; res.body = body },
  } as never)
  const call = async (path: string, body: unknown): Promise<Res> => {
    const res: Res = { code: 0, body: {} }
    await api.route({ body: JSON.stringify(body), method: 'POST' } as never, res as never, path, 'test')
    return res
  }
  const id = (n: number) => `VM-5EA5-0000-0000-0000-${String(n).padStart(4, '0')}`
  const put = async (who: string, name: string, state: object) => {
    await sql`insert into card_accounts (id_hash, name, state) values (${hash(who)}, ${name}, ${sql.json(state)})`
  }
  const row = async (who: string) => (await sql`select state, rev from card_accounts where id_hash = ${hash(who)}`)[0] as { state: GachaState; rev: number }
  /** a 大师 1500 on the open ladder, 钻石 on gold, 黄金 on silver, last seen in `season` (absent: never rolled) */
  const veteran = (season: number | null) => {
    const s = newGacha('VM-X', '老玩家', dayMinus(60)) as GachaState
    if (season === null) delete s.season
    else s.season = season
    s.ladder = { ...s.ladder, div: MASTER_DIV, best: MASTER_DIV, stars: 0, points: 1500, bestPoints: 1500, wins: 100, losses: 50 }
    s.leagues = {
      gold: { div: 4, stars: 3, best: 4, wins: 20, losses: 10, streak: 0, points: 0, bestPoints: 0 },
      silver: { div: 2, stars: 1, best: 2, wins: 8, losses: 8, streak: 0, points: 0, bestPoints: 0 },
    }
    s.daily.staminaAt = Date.now()
    return s
  }

  const made = await call('/api/card/claim', { id: id(1), name: '新人' })
  check('新号生在今天的赛季', made.body.ok === true && made.body.state.season === now, JSON.stringify(made.body.state?.season))

  if (now === 0) {
    await put(id(2), '老玩家', veteran(null))
    const before = await row(id(2))
    const l = await call('/api/card/load', { id: id(2) })
    const after = await row(id(2))
    check('赛季前读档：段位不动、不写库', l.body.ok === true && l.body.state.ladder.div === MASTER_DIV
      && after.rev === before.rev && after.state.season === undefined)
  } else {
    // last seen the season before: the first look moves it in, and writes it
    await put(id(2), '老玩家', veteran(now - 1))
    const before = await row(id(2))
    const l = await call('/api/card/load', { id: id(2) })
    const after = await row(id(2))
    const s = l.body.state as GachaState
    check('新赛季第一次读档就进入新赛季', l.body.ok === true && s.season === now && after.state.season === now
      && after.rev === before.rev + 1, `rev ${before.rev} → ${after.rev}`)
    check('大师 1500 → 铂金，0 星 0 分；钻石 → 黄金；黄金 → 青铜',
      s.ladder.div === 3 && s.ladder.stars === 0 && s.ladder.points === 0 && s.leagues!.gold!.div === 2 && s.leagues!.silver!.div === 0)
    check('写进库里的也是新段位，历史最高和上赛季都在', after.state.ladder.div === 3 && after.state.ladder.peakPoints === 1500
      && after.state.lastSeason?.season === now - 1 && after.state.lastSeason?.ranks.open?.points === 1500)
    const l2 = await call('/api/card/load', { id: id(2) })
    const after2 = await row(id(2))
    check('再读一次：不再降、不再写', l2.body.state.ladder.div === 3 && after2.rev === after.rev)

    // the first action of the season, without a load before it
    await put(id(3), '直接开打', veteran(now - 1))
    const drew = await call('/api/card/act', { id: id(3), action: 'ladder_draw', args: {}, client: {}, requestId: 'season-check-000001' })
    const acted3 = await row(id(3))
    check('新赛季第一次操作（抽对手）就进入新赛季，对手按铂金抽', drew.body.ok === true && acted3.state.season === now
      && acted3.state.ladder.div === 3 && !!acted3.state.ladder.pending && !acted3.state.ladder.pending.rival, JSON.stringify(drew.body).slice(0, 160))
  }

  // the board: only this season's accounts, with this season's record
  await db.exec('delete from card_accounts')
  api.invalidate()
  const here = veteran(now)
  here.ladder = { ...here.ladder, points: 300, wins: 50, losses: 10, sWins: 3, sLosses: 1 }
  here.leagues!.gold = { ...here.leagues!.gold!, wins: 20, losses: 10, sWins: 0, sLosses: 0 }
  await put(id(10), '本赛季', here)
  if (now > 0) await put(id(11), '还在上赛季', veteran(now - 1))
  const open = await call('/api/card/top', {})
  const rows = open.body.rows as { name: string; wins: number; losses: number }[]
  const me = rows.find((r) => r.name === '本赛季')
  check('排行榜上有本赛季的号', !!me, rows.map((r) => r.name).join(' '))
  if (now > 0) {
    check('还没进新赛季的号不在本赛季榜上', !rows.some((r) => r.name === '还在上赛季'))
    check('战绩是本赛季的胜负', me?.wins === 3 && me?.losses === 1, `${me?.wins}–${me?.losses}`)
    const goldBoard = await call('/api/card/top', { league: 'gold' })
    check('金卡天梯本赛季没打：不在金卡榜上', (goldBoard.body.rows as unknown[]).length === 0, JSON.stringify(goldBoard.body.rows))
  } else {
    check('赛季前：战绩是生涯战绩', me?.wins === 50 && me?.losses === 10, `${me?.wins}–${me?.losses}`)
    const goldBoard = await call('/api/card/top', { league: 'gold' })
    check('赛季前：金卡榜照旧', (goldBoard.body.rows as { name: string }[]).some((r) => r.name === '本赛季'))
  }
  await db.close()
}
setSeasonStartForCheck(null)

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
