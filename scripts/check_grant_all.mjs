/** 全员补偿: every account once per campaign, however many times the owner presses. */
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { CARD_SCHEMA, normalizeId } from '../cards-api.js'
import { SITE_SCHEMA, makeSiteApi } from '../site-api.js'
import { displayName } from '../names.js'

const db = new PGlite()
await db.exec(CARD_SCHEMA); await db.exec(SITE_SCHEMA)
const sql = makeSql(db)
for (let i = 0; i < 5; i++) await sql`insert into card_accounts (id_hash, name, state) values (${'h' + i}, ${'玩家' + i}, '{}')`
const api = makeSiteApi(sql, { readBody: async (req) => req.body, json: (res, code, body) => { res.code = code; res.body = body },
  token: 'owner-token', tokenFrom: (req) => req.token ?? null, normalizeId, displayName, engine: null })
async function call(body, token = 'owner-token') {
  const res = { setHeader() {}, writeHead() { return { end() {} } } }
  await api.route({ method: 'POST', body: JSON.stringify(body), token, headers: {} }, res, '/api/admin/grant_all', new URL('http://x/api/admin/grant_all'))
  return res
}
const mail = async () => (await sql`select count(*)::int as n, coalesce(sum(coins), 0)::int as coins from card_mail where kind = 'grant'`)[0]
const C = { campaign: '公测补偿-10000', coins: 10000 }

assert.equal((await call(C, 'wrong')).code, undefined, 'no token, no route')
assert.equal((await call({ coins: 10000 })).body.ok, false, 'a campaign name is required')
let r = await call({ ...C, preview: true })
assert.deepEqual([r.body.total, r.body.already, r.body.pending], [5, 0, 5])
assert.equal((await mail()).n, 0, 'preview sends nothing')
r = await call(C)
assert.equal(r.body.sent, 5)
assert.deepEqual(await mail(), { n: 5, coins: 50000 })
// pressed again, or retried after a timeout: nobody is paid twice
r = await call(C)
assert.deepEqual([r.body.sent, r.body.skipped], [0, 5])
assert.equal((await mail()).n, 5)
await Promise.all([call(C), call(C), call(C)])
assert.equal((await mail()).n, 5, 'three presses at once still pay each account once')
// someone who registers later gets it when the same campaign is sent again
await sql`insert into card_accounts (id_hash, name, state) values ('late', '后来的', '{}')`
r = await call({ ...C, preview: true })
assert.equal(r.body.pending, 1)
r = await call(C)
assert.equal(r.body.sent, 1)
assert.deepEqual(await mail(), { n: 6, coins: 60000 })
// a different campaign is a different grant
assert.equal((await call({ campaign: '另一次补偿', coins: 100 })).body.sent, 6)
await db.close()
console.log('grant all: preview sends nothing; one grant per account per campaign, whatever the presses or retries')
