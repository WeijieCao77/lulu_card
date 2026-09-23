import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { FEEDBACK_SCHEMA, feedbackPostAllowed, makeFeedbackApi } from '../feedback-api.js'

const now = Date.parse('2026-09-23T12:00:00Z')
const own = (t) => ({ owner: 'account-a', t })
const yesterday = now - 24 * 60 * 60 * 1000 - 1
assert.equal(feedbackPostAllowed([own(now), own(now - 1000)], 'account-a', now, 'production'), true)
assert.equal(feedbackPostAllowed([own(now), own(now - 1000), own(now - 2000)], 'account-a', now, 'production'), false)
assert.equal(feedbackPostAllowed([own(now), own(now - 1000), own(now - 2000)], 'account-b', now, 'production'), true)
assert.equal(feedbackPostAllowed([own(yesterday), own(yesterday), own(now)], 'account-a', now, 'production'), true)
assert.equal(feedbackPostAllowed(Array.from({ length: 30 }, () => own(yesterday)), 'account-a', now, 'production'), false)
assert.equal(feedbackPostAllowed(Array.from({ length: 30 }, () => own(now)), 'account-a', now, 'demo'), true)

const db = new PGlite()
await db.exec('create table card_accounts (id_hash text primary key, verified timestamptz);' + FEEDBACK_SCHEMA)
const sql = makeSql(db)
const id = 'formal-feedback-account'
const idHash = createHash('sha256').update(id).digest('hex')
await sql`insert into card_accounts (id_hash) values (${idHash})`
const api = makeFeedbackApi({
  getSql: () => sql,
  readBody: async (req) => req.body,
  json: (res, code, body) => { res.code = code; res.body = body },
  normalizeId: (value) => value === id ? id : null,
  rateLimited: () => false,
  token: 'owner-token', tokenFrom: () => null, tokenOk: () => false,
  stage: 'production',
})
async function post(path, body) {
  const req = { method: 'POST', body: JSON.stringify({ accountId: id, ...body }) }
  const res = { setHeader() {} }
  await api(req, res, path, new URL('https://example.test' + path), 'test')
  return res
}
assert.equal((await post('/api/feedback/new', { text: '未验证' })).code, 403)
await sql`update card_accounts set verified = now() where id_hash = ${idHash}`
for (let i = 0; i < 3; i++) assert.equal((await post('/api/feedback/new', { text: `建议 ${i}` })).code, 200)
assert.equal((await post('/api/feedback/new', { text: '第四条' })).code, 429)
const board = await sql`select items from card_feedback where key='board'`
assert.equal(board[0].items.length, 3)
await db.close()
console.log('feedback admission: production per-account limits; demo unchanged')
