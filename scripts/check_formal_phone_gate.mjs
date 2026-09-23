/** Exercise the real card + phone API with the release policy compiled as formal.
 * No production database, SMS provider, secrets, or current demo build touched.
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { build } from 'esbuild'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const previousGate = process.env.PHONE_GATE
process.env.PHONE_GATE = '0' // A stale Railway demo variable must not bypass the formal build.
const temp = join(root, '.local-data', `formal-phone-${randomBytes(6).toString('hex')}.mjs`)
await mkdir(dirname(temp), { recursive: true })
try {
  await build({
    entryPoints: [join(root, 'cards-api.js'), join(root, 'phone-api.js')],
    entryNames: 'formal-[name]', outdir: dirname(temp), platform: 'node', format: 'esm',
    bundle: true, packages: 'external', logLevel: 'silent',
    plugins: [{ name: 'formal-policy', setup(api) {
      api.onResolve({ filter: /release-policy\.js$/ }, () => ({ path: 'release-policy', namespace: 'formal-test' }))
      api.onLoad({ filter: /.*/, namespace: 'formal-test' }, async () => {
        const source = await readFile(join(root, 'release-policy.js'), 'utf8')
        assert.match(source, /RELEASE_STAGE = 'demo'/)
        return { contents: source.replace("RELEASE_STAGE = 'demo'", "RELEASE_STAGE = 'production'"), loader: 'js', resolveDir: root }
      })
    } }],
  })
  const { CARD_SCHEMA, makeCardApi, normalizeId } = await import(`${pathToFileURL(join(dirname(temp), 'formal-cards-api.js'))}?${Date.now()}`)
  const { makePhoneApi, devMode } = await import(`${pathToFileURL(join(dirname(temp), 'formal-phone-api.js'))}?${Date.now()}`)
  assert.equal(devMode({ PHONE_SMS_DEV: '1' }), false, 'formal build must never generate local SMS codes')
  const db = new PGlite()
  try {
    const sql = makeSql(db)
    await db.exec(CARD_SCHEMA)
    const id = 'VM-ABCD-EFGH-JKMN-PQRS-TVWX'
    const hash = (value) => createHash('sha256').update(value).digest('hex')
    const options = {
      readBody: async (req) => JSON.stringify(req.body),
      json: (res, status, body) => { res.status = status; res.body = body },
      rateLimited: () => false, normalizeId, hash,
    }
    const cards = makeCardApi(sql, options)
    const phones = makePhoneApi(sql, { ...options, sender: async () => {}, checker: async (_p, code) => code === '424242' })
    const call = async (api, path, body) => {
      const res = {}
      await api.route({ method: 'POST', body }, res, path, 'formal-test', new URL(`http://local${path}`))
      return res.body
    }
    assert((await call(cards, '/api/card/claim', { id, name: '正式测试' })).ok)
    const load = await call(cards, '/api/card/load', { id })
    assert.equal(load.verified, false)
    assert((await call(cards, '/api/card/act', { id, action: 'checkin', client: load.state })).unverified)
    assert((await call(phones, '/api/card/phone/send', { phone: '13800138000', for: 'bind', id })).ok)
    assert((await call(phones, '/api/card/phone/bind', { id, phone: '13800138000', code: '424242' })).ok)
    assert.equal((await call(cards, '/api/card/load', { id })).verified, true)
    await sql`update card_sms set sent = sent - interval '61 seconds'`
    assert((await call(phones, '/api/card/phone/send', { phone: '13800138000', for: 'login' })).ok)
    assert.equal((await call(phones, '/api/card/phone/login', { phone: '13800138000', code: '000000' })).ok, false)
    assert.equal((await call(phones, '/api/card/phone/login', { phone: '13800138000', code: '424242' })).id, id)
    assert.equal((await call(phones, '/api/card/phone/login', { phone: '13800138000', code: '424242' })).ok, false)
    const second = 'VM-2222-2222-2222-2222-2222'
    assert((await call(cards, '/api/card/claim', { id: second, name: '小号' })).ok)
    assert((await call(phones, '/api/card/phone/send', { phone: '13800138000', for: 'bind', id: second })).taken)
    console.log('formal phone gate: unverified blocked; bind and phone recovery pass; code replay and second account blocked')
  } finally { await db.close() }
} finally {
  for (const name of ['formal-cards-api.js', 'formal-phone-api.js']) await rm(join(dirname(temp), name), { force: true })
  if (previousGate === undefined) delete process.env.PHONE_GATE
  else process.env.PHONE_GATE = previousGate
}
