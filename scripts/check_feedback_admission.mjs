/** 给作者写信: private letters (no board, no votes), content and pace gated, owner replies land as a notice. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { FEEDBACK_SCHEMA, FORMAL, feedbackPostAllowed, feedbackRefusal, makeFeedbackApi, publicTextRefusal } from '../feedback-api.js'

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
assert.match(why('字'.repeat(FORMAL.MAX_TEXT + 1)), /最多 500/)
assert.equal(why('字'.repeat(FORMAL.MAX_TEXT)), null)
assert.match(why('想要代练的来私聊'), /不能发送/)
assert.equal(why('截图在 https://example.com/a.png 这里'), null, 'a private letter may carry a link')
assert.equal(why('我的账号是 VM-1234567 这个'), null, 'and numbers')
assert.match(publicTextRefusal('看看 www.example.com 这个'), /链接/, 'the public support wall keeps its gate')
assert.match(why('市场，能按位置筛选吗？', [own(now - 5 * HOUR, '市场能按位置筛选吗')]), /已经发过/, 'same words, punctuation aside')
assert.equal(why('市场能按位置筛选吗', [{ ...own(now - 5 * HOUR, '市场能按位置筛选吗'), owner: 'account-b' }]), null, 'someone else may say the same')
const queue = Array.from({ length: FORMAL.MAX_PENDING }, (_, i) => ({ owner: `o${i}`, t: 0, text: `x${i}`, state: 'pending' }))
assert.match(why('排队太多的时候', queue), /还没看完/)

// ---- on the real API
const db = new PGlite()
await db.exec('create table card_accounts (id_hash text primary key, verified timestamptz);'
  + 'create table card_mail (id bigserial primary key, to_h text not null, kind text not null, card_id text, level int not null default 0, coins int not null default 0, pack text, count int not null default 1, body jsonb, made timestamptz not null default now(), taken timestamptz);'
  + FEEDBACK_SCHEMA)
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
  token: 'owner-token', tokenFrom: () => 'owner-token', tokenOk: (a, b) => a === b,
  stage: 'production',
})
async function post(path, body, who = id) {
  const req = { method: 'POST', body: JSON.stringify(path.includes('admin') ? body : { accountId: who, ...body }) }
  const res = { setHeader() {}, writeHead() { return { end() {} } } }
  await api(req, res, path, new URL('https://example.test' + path), 'test')
  return res
}
assert.equal((await post('/api/feedback/new', { text: '未验证的账号' })).code, 403)
await sql`update card_accounts set verified = now()`
const first = await post('/api/feedback/new', { text: '希望卡池再多一点' })
assert.equal(first.code, 200)
assert.equal(first.body.max, 500)
assert.equal(first.body.mine[0].state, 'pending')
assert.equal(first.body.items, undefined, 'no public board')
const seen = await post('/api/feedback/list', {}, other)
assert.equal(seen.body.mine.length, 0, 'nobody else sees a letter')
assert(!JSON.stringify(seen.body).includes('卡池'))
assert.equal((await post('/api/feedback/vote', { id: first.body.created, on: true }, other)).code, undefined, 'no vote endpoint')
for (let i = 0; i < 2; i++) assert.equal((await post('/api/feedback/new', { text: `第 ${i} 封不同的来信` })).code, 200)
const fourth = await post('/api/feedback/new', { text: '一小时里的第四封' })
assert.equal(fourth.code, 429)
assert.match(fourth.body.why, /一小时最多发 3 封/)
assert.equal((await post('/api/feedback/new', { text: '加微信聊聊' }, other)).code, 400)

// the owner replies: the letter is read, and a notice waits in the writer's inbox
const reply = await post('/api/admin/feedback', { action: 'reply', id: first.body.created, text: '好，下个卡包就加。' })
assert.equal(reply.code, 200)
const mail = await sql`select to_h, kind, body from card_mail`
assert.equal(mail.length, 1)
assert.equal(mail[0].to_h, hashOf(id))
assert.equal(mail[0].kind, 'feedback_reply')
assert.equal(mail[0].body.excerpt, '希望卡池再多一点')
const back = await post('/api/feedback/list', {})
const letter = back.body.mine.find(x => x.id === first.body.created)
assert.equal(letter.reply.text, '好，下个卡包就加。')
assert.equal(letter.replyNew, true)
assert.equal(letter.state, 'read')
assert.equal((await post('/api/feedback/list', {})).body.mine.find(x => x.id === first.body.created).replyNew, false)
assert.equal((await post('/api/admin/feedback', { action: 'pin', id: first.body.created, on: true })).code, 400, 'no pinning')

const board = await sql`select items from card_feedback where key='board'`
assert.equal(board[0].items.length, 3)
await db.close()
console.log('给作者写信: private letters, no board or votes; 500 chars, links allowed, 3/hour, 10/day; reply shows to the writer and lands a notice')
