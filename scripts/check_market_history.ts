process.env.ENGINE_FROM_SOURCE = '1'
process.env.PHONE_GATE = '0'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'

const { CARD_SCHEMA, normalizeId } = await import('../cards-api.js')
const { MARKET_HISTORY_SCHEMA, createMarketHistory } = await import('../market-history.js')
const { displayName } = await import('../names.js')
const { makeMarketApi } = await import('../market-api.js')
const engine = await import('../src/engine/server.ts')

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}

const db = new PGlite(), sql = makeSql(db)
await db.exec(CARD_SCHEMA)
// The production CARD_SCHEMA already contains the upgrade: no test-only DDL rescue.
const indexes = await sql`select indexname from pg_indexes where indexname in ('listing_sold_history_idx','offer_accepted_history_idx')`
assert.equal(indexes.length,2)
assert.ok(CARD_SCHEMA.includes(MARKET_HISTORY_SCHEMA))
await db.exec(MARKET_HISTORY_SCHEMA) // repeated migration is safe
const hashOf = (id: string) => createHash('sha256').update(id).digest('hex')

let queries = 0
const counted = (strings: TemplateStringsArray, ...values: unknown[]) => {
  queries++
  return sql(strings, ...values)
}

interface Res { code: number; body: Record<string, any> }
const makeApi = () => makeMarketApi(sql, {
  readBody: (req: { body: string }) => Promise.resolve(req.body),
  json: (res: Res, code: number, body: Record<string, unknown>) => { res.code = code; res.body = body },
  normalizeId, displayName, rateLimited: () => false, engine, timer: false, useSummary: true,
} as never)
const rawApi = makeApi()
const api = { async route(req: any, res: Res, path: string, bucket: string) {
  await rawApi.route(req, res, path, bucket)
  return res
} }

const ME = 'VM-TEST-0000-0000-0000-0001'
const CARDS = engine.ALL_CARDS.map((c: { id: string }) => c.id)
const c0 = CARDS[0], c1 = CARDS[1]
const MAX_LEVEL = engine.MAX_LEVEL ?? 5

await sql`insert into card_accounts (id_hash, name, state, created, verified) values
  (${hashOf(ME)}, '看记录', ${JSON.stringify({ coins: 999999, cards: {}, pulls: 99 })}, now() - interval '9 days', now())`
for (const h of ['S1', 'B1', 'B2']) {
  await sql`insert into card_accounts (id_hash, name, state, created) values
    (${hashOf(h)}, ${h}, '{}'::jsonb, now() - interval '9 days')`
}

async function seedCard(cardId: string, prices: number[], levels: number[], agesHours: number[], statuses: string[] = []) {
  for (let i = 0; i < prices.length; i++) {
    const status = statuses[i] ?? 'sold'
    const at = new Date(Date.now() - agesHours[i] * 3600000)
    const [l] = await sql`insert into card_listings (seller_h, card_id, level, ask, status, created, closed)
      values (${hashOf('S1')}, ${cardId}, ${levels[i]}, ${prices[i]}, ${status}, ${at}, ${status === 'sold' ? at : null}) returning id`
    if (status === 'sold') await sql`insert into card_offers (listing, buyer_h, price, status) values (${l.id}, ${hashOf('B1')}, ${prices[i]}, 'accepted')`
  }
}

// c0: 10 sold listings, prices 100..1000, levels [0,1,1,2,0,1,0,2,1,0], ages [10d,8d,6d,5d,3d,2d,1d,1h,30m,10m]
const c0Levels = [0, 1, 1, 2, 0, 1, 0, 2, 1, 0]
const c0Prices = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
const c0Ages = [240, 192, 144, 120, 72, 48, 24, 1, 0.5, 0.166]
await seedCard(c0, c0Prices, c0Levels, c0Ages)
// open and withdrawn with accepted offers must be excluded
await sql`insert into card_listings (seller_h, card_id, level, ask, status, created, closed)
  values (${hashOf('S1')}, ${c0}, 0, 50, 'open', now() - interval '2 hours', null)`
const w = await sql`insert into card_listings (seller_h, card_id, level, ask, status, created, closed)
  values (${hashOf('S1')}, ${c0}, 0, 60, 'withdrawn', now() - interval '3 hours', now() - interval '2 hours') returning id`
const o = await sql`insert into card_listings (seller_h, card_id, level, ask, status, created, closed)
  values (${hashOf('S1')}, ${c0}, 0, 70, 'open', now() - interval '3 hours', null) returning id`
await sql`insert into card_offers (listing, buyer_h, price, status, made, settled)
  values (${w[0].id}, ${hashOf('B1')}, 55, 'accepted', now() - interval '1 hour', now() - interval '30 minutes')`
await sql`insert into card_offers (listing, buyer_h, price, status, made, settled)
  values (${o[0].id}, ${hashOf('B1')}, 65, 'accepted', now() - interval '1 hour', now() - interval '30 minutes')`

// c1: 3 sold, prices 10,20,30 for median odd test
await seedCard(c1, [10, 20, 30], [0, 1, 1], [1, 2, 3])

const r = await api.route({ body: JSON.stringify({ cardId: c0 }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
const body = (r as unknown as { body: Record<string, any> }).body
check('history ok', body?.ok === true, JSON.stringify(body))
// 10 sold, 2 withdrawn accepted excluded
check('sold count excludes open/withdrawn', body?.sold === 10, `got ${body?.sold}`)
check('recent limited to 8', body?.recent?.length === 8, `got ${body?.recent?.length}`)
const recentDates = (body?.recent ?? []).map((x: { at: string }) => new Date(x.at).getTime())
check('recent ordered desc', recentDates.every((d: number, i: number) => i === 0 || recentDates[i - 1] > d), 'dates descending')
const jsonStr = JSON.stringify(body)
check('no identities', !jsonStr.includes('buyer') && !jsonStr.includes('seller') && !jsonStr.includes('hand'))
check('avg 550', body?.avg === 550, `got ${body?.avg}`)
check('median 550', body?.median === 550, `got ${body?.median}`)
check('week sold 8', body?.week?.sold === 8, `got ${body?.week?.sold}`)
check('week avg 650', body?.week?.avg === 650, `got ${body?.week?.avg}`)

const rlRes = await api.route({ body: JSON.stringify({ cardId: c0, level: 1 }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
const rl = (rlRes as unknown as { body: Record<string, any> }).body
check('level stats', rl?.level?.level === 1)
check('level sold 4', rl?.level?.sold === 4, `got ${rl?.level?.sold}`)
// level 1 prices: 200,300,600,900 → avg 500
check('level avg 500', rl?.level?.avg === 500, `got ${rl?.level?.avg}`)

const rc1Res = await api.route({ body: JSON.stringify({ cardId: c1 }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
const rc1 = (rc1Res as unknown as { body: Record<string, any> }).body
check('odd median 20', rc1?.median === 20, `got ${rc1?.median}`)
check('c1 sold 3', rc1?.sold === 3)

const badCardRes = await api.route({ body: JSON.stringify({ cardId: 'NOPE' }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('invalid card 400', (badCardRes as unknown as { code: number }).code === 400)
const badLevelRes = await api.route({ body: JSON.stringify({ cardId: c0, level: -1 }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('invalid level -1 400', (badLevelRes as unknown as { code: number }).code === 400)
const tooHighRes = await api.route({ body: JSON.stringify({ cardId: c0, level: MAX_LEVEL + 1 }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('invalid level >MAX 400', (tooHighRes as unknown as { code: number }).code === 400)
const fracLevelRes = await api.route({ body: JSON.stringify({ cardId: c0, level: 1.5 }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('fractional level 400', (fracLevelRes as unknown as { code: number }).code === 400)
const strLevelRes = await api.route({ body: JSON.stringify({ cardId: c0, level: '1' }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('string level 400', (strLevelRes as unknown as { code: number }).code === 400)
const nullLevelRes = await api.route({ body: JSON.stringify({ cardId: c0, level: null }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('null level 200', ((nullLevelRes as unknown as { code: number }).code === 200) && (nullLevelRes as unknown as { body: Record<string, any> }).body?.ok === true)
const noLevelRes = await api.route({ body: JSON.stringify({ cardId: c0 }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('absent level 200', ((noLevelRes as unknown as { code: number }).code === 200) && (noLevelRes as unknown as { body: Record<string, any> }).body?.ok === true)
const malformedRes = await api.route({ body: '{bad json', method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('malformed body 400', (malformedRes as unknown as { code: number }).code === 400)
const getRes = await api.route({ body: '', method: 'GET', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('GET rejected 405', (getRes as unknown as { code: number }).code === 405)
const longCardRes = await api.route({ body: JSON.stringify({ cardId: 'X'.repeat(100) }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
check('long cardId 400', (longCardRes as unknown as { code: number }).code === 400)

const emptyRes: Res = {code:0,body:{}}
await api.route({body:JSON.stringify({cardId:CARDS[2]}),method:'POST',headers:{}} as never,emptyRes,'/api/market/history','t')
assert.deepEqual({sold:emptyRes.body.sold,avg:emptyRes.body.avg,median:emptyRes.body.median,recent:emptyRes.body.recent},{sold:0,avg:null,median:null,recent:[]})

const before = await sql`select count(*)::int as n from card_listings`
const callsBefore = queries
await api.route({ body: JSON.stringify({ cardId: c0 }), method: 'POST', headers: {} } as never, { code: 0, body: {} } as never, '/api/market/history', 't')
const callsAfter = queries
check('no db mutations', (before[0] as { n: number }).n === ((await sql`select count(*)::int as n from card_listings`)[0] as { n: number }).n)
check('cached history avoids queries', callsAfter === callsBefore)

// cache/singleflight via createMarketHistory with counted sql
queries = 0
let fakeNow = 1000000
const mh = createMarketHistory(counted, { now: () => fakeNow, ttlMs: 1000, maxEntries: 2 })
const p1 = mh.history(c0, null)
const p2 = mh.history(c0, null)
// async functions may wrap promises; query counts prove coalescing.
const [h1, h2] = await Promise.all([p1, p2])
check('coalesced one call for full stats', queries === 2, `got ${queries}`)
check('h1 sold 10', h1.sold === 10)
check('h2 sold 10', h2.sold === 10)
const p3 = mh.history(c0, null)
assert.deepEqual(await p3, h1)
check('cache hit no query', queries === 2)
fakeNow += 2000
queries = 0
const p4 = mh.history(c0, null)
const d4 = await p4
check('expired refetch', queries === 2, `got ${queries}`)
check('d4 sold 10', d4.sold === 10)

// maxEntries bound: fill with c0, c1, then another key evicts first
const mh2 = createMarketHistory(counted, { now: () => 0, ttlMs: 60000, maxEntries: 2 })
await mh2.history(c0, null)
await mh2.history(c1, null)
await mh2.history(c0, 1)
const diag = mh2.diagnostics()
check('cache bounded', diag.cacheSize === 2, `got ${diag.cacheSize}`)

// Capacity does not spawn duplicate uncached SQL when the map is full.
let unblock!: () => void
const gate = new Promise<void>(r => { unblock = r })
let started = 0
const slow = async (strings: TemplateStringsArray, ...values: unknown[]) => { started++; await gate; return sql(strings,...values) }
const mh3 = createMarketHistory(slow, { maxEntries: 2 })
const ps = [mh3.history(c0,null), mh3.history(c1,null), mh3.history(c0,0), mh3.history(c0,1)]
const rejected = await mh3.history(c0,2)
check('inflight cap returns busy', rejected.busy === true && started === 4)
unblock()
await Promise.all(ps)
check('cache remains bounded after concurrent work', mh3.diagnostics().cacheSize === 2)

// A public history read must not write listings, offers, mail or accounts.
const snapshot = async () => JSON.stringify(await db.query(`select
 (select jsonb_agg(to_jsonb(l) order by id) from card_listings l) as listings,
 (select jsonb_agg(to_jsonb(o) order by id) from card_offers o) as offers,
 (select jsonb_agg(to_jsonb(m) order by id) from card_mail m) as mail,
 (select jsonb_agg(to_jsonb(a) order by id_hash) from card_accounts a) as accounts`))
const beforeAll = await snapshot()
await createMarketHistory(sql).history(c0,1)
assert.equal(await snapshot(),beforeAll)
// Existing demo gates are untouched and this read does not require an account.
const limited = makeMarketApi(sql,{readBody:async()=>JSON.stringify({cardId:c0}),json:(r:any,c:number,b:any)=>{r.code=c;r.body=b},normalizeId,displayName,rateLimited:()=>true,engine,timer:false} as never)
const limitedRes:Res={code:0,body:{}}
await limited.route({method:'POST'} as never,limitedRes as never,'/api/market/history','limited')
check('rate limit returns429',limitedRes.code===429)

await db.close()
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed')
process.exit(bad ? 1 : 0)
