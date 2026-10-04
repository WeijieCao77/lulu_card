// 峡谷回响问答 through the real HTTP action route (cards-api.js + dist-server engine, PGlite):
// the server hands the bank to the rules, the reply never carries an answer before it is given,
// and a right answer lands a 回响包 in the stored account.   npm run build:server && node scripts/check_echo_quiz_server.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { CARD_SCHEMA, makeCardApi } from '../cards-api.js'
import { ECHO_QUIZ } from '../echo-quiz.js'

const db = new PGlite()
const sql = makeSql(db)
await db.exec(CARD_SCHEMA)
const api = makeCardApi(sql, {
  rateLimited: () => false,
  readBody: async r => r.body,
  json: (r, code, body) => { r.code = code; r.json = body },
  staticRoot: resolve('public'),
})
const id = 'VM-ABCD-EFGH-JKMN-PQRS-0001'
const hash = createHash('sha256').update(id).digest('hex')
await sql`insert into card_accounts (id_hash, state, verified) values (${hash}, ${sql.json({})}, now())`
const act = async (action, args = {}) => {
  const res = {}
  await api.route({ method: 'POST', body: JSON.stringify({ id, action, args, client: {} }) }, res, '/api/card/act', 'test')
  return res.json
}
const open = await act('echo_quiz')
assert.equal(open.ok, true, JSON.stringify(open).slice(0, 300))
const view = open.result.questions
assert.equal(view.length, 5)
assert.ok(view.every(q => q.right === null && !('answer' in q)), 'no answer before it is given')
assert.ok(!JSON.stringify(open).includes('"answer"'), 'no answer anywhere in the reply')
const stored = async () => (await sql`select state from card_accounts where id_hash=${hash}`)[0].state
const s1 = await stored()
const q0 = ECHO_QUIZ.find(q => q.id === s1.echoQuiz.ids[0])
const slot = s1.echoQuiz.order[0].indexOf(q0.answer)
const before = s1.packs.echo ?? 0
const ans = await act('echo_quiz_answer', { i: 0, pick: slot })
assert.equal(ans.ok, true)
assert.equal(ans.result.correct, true)
assert.equal((await stored()).packs.echo, before + 1)
const twice = await act('echo_quiz_answer', { i: 0, pick: slot })
assert.equal(twice.ok, false)
console.log('峡谷回响问答（服务器）：全部通过')
