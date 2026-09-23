import assert from 'node:assert/strict'
import { makeSql } from '../pglite-sql.js'
import { PGlite } from '@electric-sql/pglite'
import { createDatabaseHealth } from '../database-health.js'

async function makeDb() {
  const db = new PGlite()
  await db.exec(`
    create table card_requests (
      id_hash text primary key,
      request_id text not null,
      action text,
      reply jsonb,
      at timestamptz not null
    );
    insert into card_requests (id_hash, request_id, action, reply, at) values
    ('h1','r1','a','{"ok": true}'::jsonb, now() - interval '1 day'),
    ('h2','r2','a',null, now() - interval '2 days')
  `)
  return db
}

{
  const db = await makeDb()
  const health = createDatabaseHealth(makeSql(db), { ttlMs: 0 })
  const result = await health.get()
  assert.equal(result.ok, true)
  assert.ok(result.database, 'database present')
  assert.ok(result.tables.some(t => t.name === 'card_requests'), 'card_requests in tables')
  assert.ok(result.requests, 'requests present')
  assert.ok(Array.isArray(result.requests), 'requests array')
  assert.equal(result.requests.reduce((n,r)=>n+r.count,0),2)
  await db.close()
}

{
  let calls = 0
  const stub = async () => {
    calls++
    if (calls === 1) throw new Error('denied')
    if (calls === 2) throw new Error('denied')
    if (calls === 3) throw new Error('denied')
    if (calls === 4) throw new Error('denied')
    return [{ day: '2024-01-01', count: 1 }]
  }
  db: {
    const health = createDatabaseHealth(stub, { ttlMs: 0 })
    const result = await health.get()
    assert.equal(result.ok, true)
    assert.equal(result.database, null)
    assert.equal(result.tables.length, 0)
    assert.equal(result.wal, null)
    assert.ok(result.unavailable.includes('wal'))
    assert.ok(!JSON.stringify(result).includes('denied'), 'raw errors hidden')
  }
}

{
  let calls = 0
  const stub = async () => {
    calls++
    return [{ size: 100 }]
  }
  const health = createDatabaseHealth(stub, { ttlMs: 5000 })
  await health.get()
  await health.get()
  assert.equal(calls, 4, 'four queries once, then cached')
}

{
  let calls = 0
  let resolve
  const gate = new Promise(r => { resolve = r })
  const stub = async () => {
    calls++
    await gate
    return [{ size: 1 }]
  }
  const health = createDatabaseHealth(stub, { ttlMs: 0 })
  const p1 = health.get()
  const p2 = health.get()
  resolve()
  const [a, b] = await Promise.all([p1, p2])
  assert.equal(calls, 4, 'single flight: four total queries')
  assert.deepEqual(a, b)
}

// Parse the embedded browser script, then exercise the failed-fetch rendering.
{
  const { overviewScript } = await import('../admin-overview-ui.js')
  const { runInNewContext } = await import('node:vm')
  const node = { innerHTML: '' }
  const ctx = { window: {}, $: ()=>node, auth:()=>({}), fetch:()=>Promise.reject(new Error('<denied>')), console }
  runInNewContext(overviewScript+';refreshDatabaseHealth()',ctx)
  await new Promise(r=>setImmediate(r))
  assert.ok(node.innerHTML.includes('&lt;denied&gt;'))
  assert.ok(!node.innerHTML.includes('<denied>'))
}
console.log('database-health: passed')
