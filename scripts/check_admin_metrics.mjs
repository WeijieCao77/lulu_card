import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { SCHEMA } from '../analytics.js'
import { luluMetrics } from '../admin-overview.js'

const db = new PGlite(), sql = makeSql(db)
await db.exec(SCHEMA)
// Beijing midnight expressed in UTC; fixtures remain deterministic on any CI host timezone.
const day0 = new Date(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00+08:00').getTime()
const at = (offset, hour = 0, minute = 0) => new Date(day0 + offset * 86400_000 + hour * 3600_000 + minute * 60_000).toISOString()
const event = (visitor, session, time, name, props = {}) => sql`
  insert into events(visitor_id,session_id,ts,name,device,props)
  values(${visitor},${session},${time},${name},'phone',${sql.json(props)})`
try {
  const empty = await luluMetrics(sql, 30)
  assert.equal(Number(empty.today.active_visitors), 0)
  assert.equal(Number(empty.today.new_devices), 0)
  assert.equal(empty.screenWidths.length, 0)
  await event('a', 'old-a', at(-3, 10), 'session_start', { w: 390 })
  await event('a', 'cross-day', at(-1, 23, 50), 'session_start', { w: 390 })
  await event('a', 'cross-day', at(-1, 23, 59), 'session_ping', { active_s: 120 })
  await event('a', 'cross-day', at(0, 0, 1), 'session_ping', { active_s: 180 })
  await event('a', 'cross-day', at(0, 0, 2), 'session_end', { active_s: 180 })
  await event('b', 'b-today', at(0, 0, 1), 'session_start', { w: 1280 })
  await event('b', 'b-today', at(0, 0, 2), 'session_ping', { active_s: 60 })
  await event('c', 'bad-data', at(-2, 10), 'session_ping', { active_s: 'invalid' })
  await event('c', 'bad-data', at(-2, 11), 'session_ping', { active_s: 1e308 })
  const report = await luluMetrics(sql, 30)
  assert.equal(Number(report.today.new_devices), 1, 'returning a is not a new device')
  assert.equal(Number(report.today.active_visitors), 2)
  assert.equal(Number(report.today.sessions), 2)
  assert.equal(Number(report.today.page_views), 1)
  assert.equal(Number(report.deviceDuration.total_active_s), 240, 'repeated cumulative pings do not double-count')
  assert.equal(Number(report.deviceDuration.avg_device_active_s), 120)
  assert.equal(Number(report.deviceDuration.median_device_active_s), 120)
  assert.equal(Number(report.deviceDuration.avg_daily_active_s), 80, 'cross-midnight session is split into daily increments')
  assert.equal(Number(report.deviceDuration.median_daily_active_s), 60)
  const aCohort = report.retention.find(x => String(x.cohort).slice(0, 10) === new Date(day0 + 8 * 3600_000 - 3 * 86400_000).toISOString().slice(0, 10))
  assert(aCohort)
  assert.equal(aCohort.d3, null, 'today is not a completed retention day')
  assert.equal(Number(aCohort.d1), 0)
  assert.equal(report.screenWidths.reduce((sum, x) => sum + Number(x.n), 0), 2, 'device repeated on multiple days counts once')
  console.log('PASS: admin metrics timezone, new/returning users, duration dedupe/cross-day, complete-day retention, malicious numbers and screen dedupe.')
} finally { await db.close() }
