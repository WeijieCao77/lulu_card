import assert from 'node:assert/strict'
import { makeSql } from '../pglite-sql.js'
import { PGlite } from '@electric-sql/pglite'
import { sweepCardRequests } from '../request-maintenance.js'

async function makeDb() {
  const db = new PGlite()
  await db.exec(`
    create table card_requests (
      id_hash text not null,
      request_id text not null,
      action text,
      reply jsonb,
      at timestamptz not null,
      primary key (id_hash, request_id)
    );
    create index idx_card_requests_at on card_requests(at);
  `)
  return db
}

{
  const db = await makeDb()
  const now = Date.now()
  const old = new Date(now - 73 * 3600 * 1000).toISOString()
  const pendingOld = new Date(now - 80 * 3600 * 1000).toISOString()
  const boundary = new Date(now - 72 * 3600 * 1000).toISOString()
  const mid = new Date(now - 48 * 3600 * 1000).toISOString()
  const recent = new Date(now - 2 * 3600 * 1000).toISOString()

  await db.exec(`
    insert into card_requests (id_hash, request_id, action, reply, at) values
    ('h1','r1','a','{"ok": true, "data": "x"}'::jsonb, '${old}'),
    ('h2','r2','a',null, '${pendingOld}'),
    ('h3','r3','a','{"ok": true, "data": "y"}'::jsonb, '${boundary}'),
    ('h4','r4','a','{"ok": true, "data": "z"}'::jsonb, '${mid}'),
    ('h5','r5','a',null, '${recent}')
  `)

  const r1 = await sweepCardRequests(makeSql(db), { now: () => now, batch: 500 })
  assert.equal(r1.deleted, 2)
  assert.equal(r1.compacted, 2)

  const rows = await db.query('select id_hash, reply from card_requests order by id_hash')
  assert.equal(rows.rows.length, 3)
  const byHash = Object.fromEntries(rows.rows.map(r => [r.id_hash, r.reply]))
  assert.equal(byHash.h1, undefined, 'old with reply deleted')
  assert.equal(Object.hasOwn(byHash, 'h2'), false, 'abandoned committed null older than 72h deleted')
  assert.equal(byHash.h3.trimmed, true, 'boundary key retained, body compacted')
  assert.equal(byHash.h4.trimmed, true, 'mid compacted')
  assert.equal(byHash.h4.data, undefined)
  assert.equal(byHash.h5, null, 'recent null preserved')

  const r2 = await sweepCardRequests(makeSql(db), { now: () => now, batch: 500 })
  assert.equal(r2.deleted, 0)
  assert.equal(r2.compacted, 0)
  await db.close()
}

{
  const db = await makeDb()
  const now = Date.now()
  for (let i = 0; i < 5; i++) {
    const at = new Date(now - 80 * 3600 * 1000 + i * 1000).toISOString()
    await db.exec(`insert into card_requests (id_hash, request_id, action, reply, at) values ('h${i}','r${i}','a','{"ok": true}'::jsonb, '${at}')`)
  }
  const r1 = await sweepCardRequests(makeSql(db), { now: () => now, batch: 2 })
  assert.equal(r1.deleted, 2)
  const r2 = await sweepCardRequests(makeSql(db), { now: () => now, batch: 2 })
  assert.equal(r2.deleted, 2)
  const r3 = await sweepCardRequests(makeSql(db), { now: () => now, batch: 2 })
  assert.equal(r3.deleted, 1)
  const r4 = await sweepCardRequests(makeSql(db), { now: () => now, batch: 2 })
  assert.equal(r4.deleted, 0)
  await db.close()
}

// Compaction is separately bounded, keeps exact 6h replies and 72h keys.
{
  const db = await makeDb(), sql = makeSql(db), now = Date.now()
  for (let i=0;i<5;i++) await sql`insert into card_requests values (${String(i)}, ${String(i)}, 'action', '{"ok":true,"result":{"coins":5}}'::jsonb, ${new Date(now-7*3600000)})`
  await sql`insert into card_requests values ('six','six','action','{"ok":true,"payload":"keep"}'::jsonb,${new Date(now-6*3600000)})`
  await sql`insert into card_requests values ('nullBoundary','nullBoundary','action',null,${new Date(now-72*3600000)})`
  const a = await sweepCardRequests(sql,{now:()=>now,batch:2})
  assert.equal(a.compacted,2)
  assert.equal(a.deleted,0)
  const retained = await sql`select * from card_requests where id_hash in ('six','nullBoundary') order by id_hash`
  assert.equal(retained.length,2)
  assert.equal(retained[0].reply,null)
  assert.equal(retained[1].reply.payload,'keep')
  const replay = await sql`select action,reply from card_requests where reply ? 'trimmed'`
  assert.equal(replay.length,2)
  assert.ok(replay.every(r=>r.action==='action' && r.reply.ok===true && r.reply.trimmed===true))
  await db.close()
}
console.log('request-maintenance: passed')
