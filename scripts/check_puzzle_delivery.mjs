import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { CARD_SCHEMA, makeCardApi, serverDay } from '../cards-api.js'
import * as engine from '../dist-server/engine.mjs'

const db = new PGlite()
const sql = makeSql(db)
await db.exec(CARD_SCHEMA)
const api = makeCardApi(sql, {
  rateLimited: () => false,
  readBody: async r => r.body,
  json: (r, code, body) => { r.code = code; r.json = body },
  staticRoot: resolve('public'),
})
const hash = id => createHash('sha256').update(id).digest('hex')
const call = async id => {
  const res = {
    code: 0, head: {}, body: null,
    writeHead(code, head) { this.code = code; this.head = head },
    end(body) { this.body = body },
  }
  await api.route({ method: 'POST', body: JSON.stringify({ id }) }, res, '/api/card/puzzle', 'test')
  return res
}

const kinds = new Set()
let actionChecked = false
for (let i = 0; i < 150 && kinds.size < 3; i++) {
  const id = `VM-ABCD-EFGH-JKMN-PQRS-${String(i).padStart(4, '0')}`
  const kind = engine.kindFor(serverDay(), id)
  if (kinds.has(kind)) continue
  await sql`insert into card_accounts (id_hash, state) values (${hash(id)}, ${sql.json({})})`
  const first = await call(id)
  assert.equal(first.code, 200)
  assert.equal(first.head['Content-Type'], 'image/webp')
  assert.equal(first.head['Content-Disposition'], 'inline; filename="puzzle.webp"')
  assert.equal(first.head['Cache-Control'], 'no-store')
  assert.equal(first.head['X-Puzzle-Sig'], engine.challengeSig())
  const info = await sharp(first.body).metadata()
  assert.ok(info.width <= 56, `Initial image is low resolution, got ${info.width}px`)
  const [stored] = await sql`select kind, answer from card_challenge_puzzles where id_hash=${hash(id)} and day=${serverDay()}`
  assert.equal(stored.kind, kind)
  assert.ok(engine.answerPool(kind).includes(stored.answer))
  if (!actionChecked) {
    const game = engine.newGacha(id, '挑战测试', serverDay())
    const wrong = engine.answerPool(kind).find(value => value !== stored.answer)
    assert.ok(wrong)
    const env = { now: Date.now(), today: serverDay(), seed: 1, challengePuzzle: stored }
    const firstGuess = engine.runAction(game, 'challenge', { guessId: wrong, sig: engine.challengeSig() }, env)
    assert.equal(firstGuess.ok, true)
    assert.equal(game.challenge.rows.length, 1)
    assert.equal(game.challenge.reveal, undefined, 'answer remains private after a wrong guess')
    assert.ok(!JSON.stringify(game.challenge).includes(stored.answer), 'unfinished save does not contain answer')
    const finalGuess = engine.runAction(game, 'challenge', { guessId: stored.answer, sig: engine.challengeSig() }, env)
    assert.equal(finalGuess.ok, true)
    assert.equal(game.challenge.solved, true)
    assert.deepEqual(game.challenge.reveal, { kind, id: stored.answer })
    actionChecked = true
  }
  const repeat = await call(id)
  assert.equal(repeat.body.toString('base64'), first.body.toString('base64'), 'same account/day sees the same puzzle')
  kinds.add(kind)
}
assert.equal(kinds.size, 3)
const unknown = await call('VM-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ')
assert.equal(unknown.code, 404, 'an unknown account cannot request a puzzle image')
await db.close()
console.log('Puzzle delivery passed: persisted private answer, masked WebP, stable daily image, unknown account denied')
