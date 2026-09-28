import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { adminLoginHtml } from '../admin-login.js'

new Function(adminLoginHtml().match(/<script>([\s\S]*?)<\/script>/)[1])
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const token = randomBytes(32).toString('hex')
const child = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url), stdio: 'pipe',
  env: { ...process.env, DATABASE_URL: 'pglite://', PGLITE_PATH: '', HOST: '127.0.0.1', PORT: String(port), PHONE_GATE: '0',
    ANALYTICS_TOKEN: token, PHONE_KEY: randomBytes(32).toString('hex'), PHONE_SALT: randomBytes(32).toString('hex') },
})
let output = ''
child.stdout.on('data', d => { output += d })
child.stderr.on('data', d => { output += d })
const base = 'http://127.0.0.1:' + port
const auth = { Authorization: 'Bearer ' + token }
const post = async (path, body, headers = {}) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  assert.equal(r.status, 200, path)
  return r.json()
}
try {
  let ready = false
  for (let i = 0; i < 150; i++) {
    try { ready = (await fetch(base + '/readyz')).ok } catch {}
    if (ready) break
    if (child.exitCode !== null) break
    await delay(200)
  }
  assert(ready, 'Isolated server did not become ready: ' + output)
  const login = await fetch(base + '/admin')
  assert.equal(login.status, 200)
  assert.equal(login.headers.get('cache-control'), 'no-store')
  const shell = await login.text()
  assert(shell.includes('id="login"'))
  assert(!shell.includes(token) && !shell.includes('id="gWho"'))
  assert.equal((await fetch(base + '/admin', { headers: { Authorization: 'Bearer invalid' } })).status, 404)
  const dashboard = await fetch(base + '/admin', { headers: auth })
  assert.equal(dashboard.status, 200)
  assert((await dashboard.text()).includes('id="adminLogout"'))
  for (const path of ['/api/admin/overview', '/api/admin/perf', '/api/admin/account?code=12345678', '/api/stats']) {
    assert.equal((await fetch(base + path)).status, 404, path + ' needs auth')
  }
  assert.equal((await fetch(base + '/api/admin/grant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404)
  const stats = await fetch(base + '/api/stats?days=7', { headers: auth })
  assert.equal(stats.status, 200)
  assert(!(await stats.json()).why, 'stats should read the new empty database')
  const overview = await fetch(base + '/api/admin/overview?days=7', { headers: auth })
  assert.equal(overview.status, 200)
  assert.equal((await overview.json()).today.active_visitors, 0)
  for (const action of ['send', 'bind', 'login']) {
    const response = await fetch(base + '/api/card/phone/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(response.status, 403)
    assert.equal((await response.json()).disabled, true, 'Demo must not send SMS or accept phone credentials')
  }
  const id = 'VM-2222-2222-2222-2222-2222'
  const account = await post('/api/card/claim', { id, name: '信箱集成测试' })
  assert(account.ok)
  const grant = await post('/api/admin/grant', { who: id, coins: 123, pack: 'elite', count: 1, note: '测试奖励' }, auth)
  assert(grant.ok)
  const take = await post('/api/card/act', { id, action: 'mail_take', args: {}, client: {} })
  assert(take.ok)
  assert.equal(take.state.coins, account.state.coins + 123)
  assert.equal(take.state.packs.elite, account.state.packs.elite + 1)
  assert(take.state.mail.some(m => m.note === '测试奖励'))
  const again = await post('/api/card/act', { id, action: 'mail_take', args: {}, client: {} })
  assert(again.ok)
  assert.equal(again.state.coins, take.state.coins)
  assert.deepEqual(again.state.packs, take.state.packs)
  const seen = await post('/api/card/act', { id, action: 'mail_seen', args: {}, client: {} })
  assert(seen.ok && seen.state.mail.every(m => m.seen))
  console.log('Admin login, auth guards, stats, grant → inbox, duplicate collection and read state passed.')
  const other = 'VM-3333-3333-3333-3333-3333'
  assert((await post('/api/card/claim', { id: other, name: '反馈测试乙' })).ok)
  assert.equal((await fetch(base + '/api/admin/feedback')).status, 404)
  const created = await post('/api/feedback/new', { accountId: id, text: '希望名人堂可以按选手排序' })
  assert(created.ok && created.created)
  const letterId = created.created
  assert.equal(created.mine[0].state, 'pending')
  assert.equal(created.items, undefined, 'there is no public board')
  const stranger = await post('/api/feedback/list', { accountId: other })
  assert.equal(stranger.mine.length, 0)
  assert(!JSON.stringify(stranger).includes('名人堂'), 'another player never sees a letter')
  const vote = await fetch(base + '/api/feedback/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: other, id: letterId, on: true }) })
  assert.notEqual(vote.status, 200, 'voting is gone')
  let managed = await post('/api/admin/feedback', { id: letterId, action: 'reply', text: '收到，下个版本加上。' }, auth)
  assert(managed.ok)
  assert.equal(managed.items.find(x => x.id === letterId).state, 'read', 'a reply marks the letter read')
  let mine = await post('/api/feedback/list', { accountId: id })
  assert.equal(mine.mine[0].reply.text, '收到，下个版本加上。')
  assert.equal(mine.mine[0].replyNew, true, 'first look: the reply is new')
  assert(!JSON.stringify(mine).includes('author'))
  mine = await post('/api/feedback/list', { accountId: id })
  assert.equal(mine.mine[0].replyNew, false, 'second look: seen')
  assert(!JSON.stringify(await post('/api/feedback/list', { accountId: other })).includes('下个版本'), 'nor the reply')
  managed = await post('/api/admin/feedback', { id: letterId, action: 'state', state: 'fixed' }, auth)
  assert.equal(managed.items.find(x => x.id === letterId).state, 'fixed')
  assert.equal(managed.items.find(x => x.id === letterId).replySeen, true)
  const pin = await fetch(base + '/api/admin/feedback', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: letterId, action: 'pin', on: true }) })
  assert.equal(pin.status, 400, 'no pinning any more')
  await post('/api/admin/feedback', { id: letterId, action: 'delete' }, auth)
  mine = await post('/api/feedback/list', { accountId: id })
  assert.equal(mine.mine.length, 0)
  const invalid = await fetch(base + '/api/feedback/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: 'not-an-account' }) })
  assert.equal(invalid.status, 401)
  console.log('Private mail: only the writer and the owner see a letter; no board, votes or pins; reply, seen flag, state and delete passed.')

} finally {
  child.kill()
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))
}
