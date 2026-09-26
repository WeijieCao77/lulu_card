/** 赛事应援墙: verified players write, the owner approves, only approved messages are public. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { CARD_SCHEMA, normalizeId } from '../cards-api.js'
import { SITE_SCHEMA } from '../site-api.js'
import { SUPPORT_SCHEMA, makeSupportApi } from '../support-api.js'
import { displayName } from '../names.js'

const db = new PGlite()
await db.exec(CARD_SCHEMA); await db.exec(SITE_SCHEMA); await db.exec(SUPPORT_SCHEMA)
const sql = makeSql(db)
const hash = (id) => createHash('sha256').update(id).digest('hex')
const A = 'VM-AAAA-BBBB-CCCC-DDDD-EEEE', B = 'VM-FFFF-GGGG-HHHH-JJJJ-KKKK'
await sql`insert into card_accounts (id_hash, name, state) values (${hash(A)}, '应援人', '{}'), (${hash(B)}, '未验证', '{}')`
await sql`update card_accounts set verified = now() where id_hash = ${hash(A)}`
const api = makeSupportApi(sql, {
  readBody: async (req) => req.body, json: (res, code, body) => { res.code = code; res.body = body },
  token: 'owner-token', tokenFrom: (req) => req.token ?? null, normalizeId, displayName, rateLimited: () => false, bucketOf: () => 'b',
})
async function call(path, body, { method = body ? 'POST' : 'GET', token, query = '' } = {}) {
  const res = { setHeader() {} }
  await api.route({ method, body: body ? JSON.stringify(body) : undefined, token }, res, path, new URL(`http://x${path}?${query}`))
  return res
}
let n = 0
const post = (id, target, body) => call('/api/support/messages', { id, target, body, requestId: `req-${String(++n).padStart(8, '0')}` })

assert.equal((await call('/api/support')).body.title, '2026 英雄联盟全球总决赛')
assert.equal((await post(B, 'T1', '加油加油')).code, 403, 'phone verification first')
assert.equal((await post('not-an-id', 'T1', '加油加油')).code, 401)
const first = await post(A, 'Faker', '十年如一日，冲！')
assert.equal(first.code, 200); assert.equal(first.body.row.status, 'pending')
assert.equal((await call('/api/support/messages')).body.rows.length, 0, 'pending is not public')
const mine = await call('/api/support/mine', { id: A })
assert.equal(mine.body.rows.length, 1); assert.equal(mine.body.rows[0].status, 'pending')
// the same request again is the same row, not a second one
const again = await call('/api/support/messages', { id: A, target: 'Faker', body: '十年如一日，冲！', requestId: `req-${String(n).padStart(8, '0')}` })
assert.equal(again.body.row.id, first.body.row.id)
assert.equal((await post(A, 'T1', '第二条来得太快')).code, 429, 'one a minute')
await sql`update support_messages set created = created - interval '2 minutes'`
assert.equal((await post(A, `我的号 ${A}`, '看这里')).code, 400, 'no account ids')
assert.equal((await post(A, 'T1', '去 www.example.com 看直播')).code, 400, 'no links')
assert.equal((await post(A, 'T1', '加我13800138000')).code, 400, 'no contact numbers')
assert.equal((await post(A, 'T1', '想要代练的来')).code, 400, 'blocked words')
assert.equal((await post(A, '', '没写给谁')).code, 400)
assert.equal((await post(A, 'T1', '字'.repeat(201))).code, 400)
for (let i = 0; i < 4; i++) { assert.equal((await post(A, 'LPL', `第 ${i} 条应援`)).code, 200); await sql`update support_messages set created = created - interval '2 minutes'` }
assert.equal((await post(A, 'LPL', '第六条')).code, 429, 'five a day')

// the owner's desk
assert.equal((await call('/api/admin/support', null, { token: 'wrong' })).code, 404)
const desk = await call('/api/admin/support', null, { token: 'owner-token' })
assert.equal(desk.body.rows.length, 5)
const id = first.body.row.id
assert.equal((await call('/api/admin/support', { action: 'review', id, status: 'approved', expected: 'pending' }, { token: 'owner-token' })).code, 200)
assert.equal((await call('/api/admin/support', { action: 'review', id, status: 'approved', expected: 'pending' }, { token: 'owner-token' })).code, 409, 'a stale review is refused')
const wall = (await call('/api/support/messages')).body.rows
assert.equal(wall.length, 1); assert.equal(wall[0].target, 'Faker'); assert.equal(wall[0].author, displayName('应援人', hash(A)).name)
assert(!JSON.stringify(wall).includes(hash(A)) && !JSON.stringify(wall).includes(A), 'no account id or hash in public')
assert.equal((await call('/api/admin/support', { action: 'review', id, status: 'rejected', expected: 'approved', reason: '撤下' }, { token: 'owner-token' })).code, 200)
assert.equal((await call('/api/support/messages')).body.rows.length, 0, 'taken down again')
assert.equal((await sql`select count(*)::int as n from support_reviews`)[0].n, 2, 'every review is recorded')
assert.equal((await call('/api/support/mine', { id: A })).body.rows.find((r) => r.id === id).reason, '撤下')
// switching submissions off, renaming the event
assert.equal((await call('/api/admin/support', { action: 'config', enabled: false, title: 'MSI 应援' }, { token: 'owner-token' })).code, 200)
const cfg = (await call('/api/support')).body
assert.equal(cfg.enabled, false); assert.equal(cfg.title, 'MSI 应援')
await sql`update support_messages set created = created - interval '2 days'`
assert.equal((await post(A, 'T1', '关闭后再发')).code, 403)
await db.close()
console.log('support wall: verified-only, pending until approved, take-down, review log, limits, content gates, no ids in public')
