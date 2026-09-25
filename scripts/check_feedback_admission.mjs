/** The formal mailbox is val_player's: letters wait for the owner, content and pace are gated. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { FEEDBACK_SCHEMA, FORMAL, feedbackPostAllowed, feedbackRefusal, makeFeedbackApi } from '../feedback-api.js'

// ---- the rules, on paper
const now = Date.parse('2026-09-23T12:00:00Z')
const own = (t, text = `建议 ${t}`) => ({ owner: 'account-a', t, text, state: 'pending' })
const HOUR = 60 * 60 * 1000
assert.equal(feedbackPostAllowed([own(now), own(now - 1000)], 'account-a', now, 'production'), true)
assert.equal(feedbackPostAllowed([own(now), own(now - 1000), own(now - 2000)], 'account-a', now, 'production'), false, 'three in an hour')
assert.equal(feedbackPostAllowed([own(now), own(now - 1000), own(now - 2000)], 'account-b', now, 'production'), true, 'another account')
const spread = Array.from({ length: 9 }, (_, i) => own(now - (i + 1) * 2 * HOUR))
assert.equal(feedbackPostAllowed(spread, 'account-a', now, 'production'), true, 'nine today, spread out')
assert.equal(feedbackPostAllowed([...spread, own(now - 90 * 60 * 1000)], 'account-a', now, 'production'), false, 'ten a day')
assert.equal(feedbackPostAllowed(Array.from({ length: 30 }, () => own(now)), 'account-a', now, 'demo'), true, 'demo unchanged')
const why = (text, items = []) => feedbackRefusal(items, 'account-a', text, now, 'production')
assert.match(why('太少'), /太短/)
assert.match(why('字'.repeat(FORMAL.MAX_TEXT + 1)), /最多 200/)
assert.equal(why('字'.repeat(FORMAL.MAX_TEXT)), null)
assert.match(why('想要代练的来私聊'), /不能挂在公开榜/)
assert.match(why('看看 www.example.com 这个'), /链接/)
assert.match(why('联系我13800138000好吗'), /联系方式/)
assert.match(why('市场，能按位置筛选吗？', [own(now - 5 * HOUR, '市场能按位置筛选吗')]), /已经提过/, 'same words, punctuation aside')
assert.equal(why('市场能按位置筛选吗', [{ ...own(now - 5 * HOUR, '市场能按位置筛选吗'), owner: 'account-b' }]), null, 'someone else may say the same')
const queue = Array.from({ length: FORMAL.MAX_PENDING }, (_, i) => ({ owner: `o${i}`, t: 0, text: `x${i}`, state: 'pending' }))
assert.match(why('排队太多的时候', queue), /还没看完/)

// ---- on the real API
const db = new PGlite()
await db.exec('create table card_accounts (id_hash text primary key, verified timestamptz);' + FEEDBACK_SCHEMA)
const sql = makeSql(db)
const id = 'formal-feedback-account', other = 'other-feedback-account'
const hashOf = (v) => createHash('sha256').update(v).digest('hex')
await sql`insert into card_accounts (id_hash) values (${hashOf(id)}), (${hashOf(other)})`
const api = makeFeedbackApi({
  getSql: () => sql,
  readBody: async (req) => req.body,
  json: (res, code, body) => { res.code = code; res.body = body },
  normalizeId: (value) => [id, other].includes(value) ? value : null,
  rateLimited: () => false,
  token: 'owner-token', tokenFrom: () => null, tokenOk: () => false,
  stage: 'production',
})
async function post(path, body, who = id) {
  const req = { method: 'POST', body: JSON.stringify({ accountId: who, ...body }) }
  const res = { setHeader() {} }
  await api(req, res, path, new URL('https://example.test' + path), 'test')
  return res
}
assert.equal((await post('/api/feedback/new', { text: '未验证的账号' })).code, 403)
await sql`update card_accounts set verified = now()`
const first = await post('/api/feedback/new', { text: '希望卡池再多一点' })
assert.equal(first.code, 200)
assert.equal(first.body.max, 200)
assert.equal(first.body.mine[0].state, 'pending', 'a letter waits for the owner')
assert.equal(first.body.items.length, 0, 'and is not on the public board yet')
const seen = await post('/api/feedback/list', {}, other)
assert.equal(seen.body.items.length, 0, 'nobody else sees a pending letter')
assert.equal(seen.body.mine.length, 0)
for (let i = 0; i < 2; i++) assert.equal((await post('/api/feedback/new', { text: `第 ${i} 条不同的建议` })).code, 200)
const fourth = await post('/api/feedback/new', { text: '一小时里的第四条' })
assert.equal(fourth.code, 429)
assert.match(fourth.body.why, /一小时最多发 3 条/)
assert.equal((await post('/api/feedback/new', { text: '加微信聊聊' }, other)).code, 400)
const board = await sql`select items from card_feedback where key='board'`
assert.equal(board[0].items.length, 3)
await db.close()
console.log('feedback admission: formal letters wait for review; val_player content gates and 3/hour, 10/day; demo unchanged')
