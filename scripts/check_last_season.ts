/**
 * 上赛季前十 (cards-api.js /api/card/top_last): a finished season's ten on each ladder, read from each account's
 * frozen `lastSeason` or, for one not seen since the turn, its live ladder; suspects and this-season-only
 * accounts out. Run with the real S1 date (no season has ended yet) and with the start moved into the past,
 * so that the season that ended is 赛季前 and S1.
 *
 *   npx tsx scripts/check_last_season.ts
 */
process.env.ENGINE_FROM_SOURCE = '1'
process.env.PHONE_GATE = '0'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { seasonOf, setSeasonStartForCheck } from '../src/engine/gacha'

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const { CARD_SCHEMA, makeCardApi, serverDay } = await import('../cards-api.js')
interface Res { code: number; body: Record<string, any> }
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
const id = (n: number) => `VM-5EA5-0000-0000-0000-${String(n).padStart(4, '0')}`
const today = serverDay()
const dayMinus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)

for (const start of [null, dayMinus(3), dayMinus(31)]) {
  setSeasonStartForCheck(start)
  const now = seasonOf(today)
  const prev = now - 1
  console.log(`\n— S1 起点 ${start ?? '2026-10-12（真实）'}：今天第 ${now} 季`)
  const db = new PGlite()
  const sql = makeSql(db)
  await db.exec(CARD_SCHEMA)
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
  const put = async (who: string, name: string, state: object, suspect = false) => {
    await sql`insert into card_accounts (id_hash, name, state, suspect) values (${hash(who)}, ${name}, ${sql.json(state)}, ${suspect})`
  }

  if (prev < 0) {
    const r = await call('/api/card/top_last', {})
    check('第一个赛季还没开始/结束：没有上赛季', r.body.ok === true && r.body.season === null && r.body.rows.length === 0)
  } else {
    // a season number as the save keeps it: 赛季前 saves simply have none
    const was = (s: number) => (s === 0 ? {} : { season: s })
    // moved into this season: the final rank is frozen in lastSeason (wins/losses: that season's; 赛季前: the career)
    await put(id(1), '冠军', {
      season: now,
      lastSeason: { season: prev, ranks: { open: { div: 5, stars: 0, points: 2400, best: 5, bestPoints: 2400, wins: prev === 0 ? 38 : 3, losses: prev === 0 ? 9 : 1 } } },
      ladder: { div: 3, stars: 0, points: 0, wins: 40, losses: 10, sWins: 2, sLosses: 1 },
    })
    // never seen since the turn: the live ladder IS the final rank
    await put(id(2), '亚军', { ...was(prev), ladder: { div: 5, stars: 0, points: 2000, wins: 30, losses: 12, ...(prev > 0 ? { sWins: 8, sLosses: 4 } : {}) } })
    // a suspect never stands on a board
    await put(id(3), '可疑', { ...was(prev), ladder: { div: 5, stars: 0, points: 9999, wins: 99, losses: 0 } }, true)
    // only this season: not on last season's board
    await put(id(4), '新人', { season: now, ladder: { div: 5, stars: 0, points: 5000, wins: 5, losses: 0, sWins: 5, sLosses: 0 } })
    // never played last season
    await put(id(5), '没打', { ...was(prev), ladder: { div: 0, stars: 0, points: 0, wins: 0, losses: 0 } })
    // a crowd below them, so the ten are cut and one of them finishes outside it
    for (let n = 10; n < 22; n++) await put(id(n), `玩家${n}`, { ...was(prev), ladder: { div: 2, stars: 30 - n, points: 0, wins: 5, losses: 5, sWins: 5, sLosses: 5 } })
    // a silver ladder of its own
    await put(id(30), '银卡王', { ...was(prev), ladder: { div: 0, stars: 0, wins: 0, losses: 0 }, leagues: { silver: { div: 4, stars: 2, best: 4, wins: 6, losses: 2, sWins: 6, sLosses: 2, streak: 0 } } })

    const r = await call('/api/card/top_last', { id: id(21) })
    const rows = r.body.rows as { rank: number; name: string; div: number; points: number; wins: number; losses: number; me: boolean }[]
    check('读得出来', r.body.ok === true && r.body.season === prev && Array.isArray(rows), JSON.stringify(r.body).slice(0, 160))
    check('正好前十', rows.length === 10)
    check('第一是已经进新赛季、段位冻结在上赛季记录里的', rows[0]?.name === '冠军' && rows[0].points === 2400)
    check('第二是还没登录、上赛季段位还在天梯上的', rows[1]?.name === '亚军' && rows[1].points === 2000)
    check('可疑账号、只打了这赛季的、上赛季没打的都不上榜', !rows.some((x) => ['可疑', '新人', '没打'].includes(x.name)))
    if (prev === 0) {
      check('赛季前的战绩是生涯战绩（已进新赛季的：进 S1 时冻结的那份）', rows[0].wins === 38 && rows[0].losses === 9, `${rows[0].wins}–${rows[0].losses}`)
      check('赛季前的战绩是生涯战绩（还没进新赛季的）', rows[1].wins === 30 && rows[1].losses === 12, `${rows[1].wins}–${rows[1].losses}`)
    } else {
      check('战绩是那个赛季自己的', rows[0].wins === 3 && rows[1].wins === 8, `${rows[0].wins} / ${rows[1].wins}`)
    }
    check('没进前十的自己：告诉他第几名', r.body.mine?.rank === 14 && !rows.some((x) => x.me), JSON.stringify(r.body.mine))
    const mine = await call('/api/card/top_last', { id: id(1) })
    check('在前十里的自己：那一行标出来，不另外报名次', mine.body.rows[0].me === true && mine.body.mine === null)
    check('返回里不含任何 ID', !JSON.stringify(r.body).includes('VM-'))
    const silver = await call('/api/card/top_last', { league: 'silver' })
    check('银卡天梯看自己的', silver.body.ok === true && silver.body.rows.length === 1 && silver.body.rows[0].name === '银卡王', JSON.stringify(silver.body.rows))
    const bronze = await call('/api/card/top_last', { league: 'bronze' })
    check('没人打过的铜卡天梯是空的', bronze.body.ok === true && Array.isArray(bronze.body.rows) && bronze.body.rows.length === 0)
  }
  await db.close()
}
setSeasonStartForCheck(null)
console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
