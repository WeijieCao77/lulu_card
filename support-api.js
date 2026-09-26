/**
 * 赛事应援墙 — ported from Val_Manager's champions-api.js (4f9afab), without its schedule.
 *
 * A signed-in, phone-verified player writes a short message to anyone they support (「致」: a player,
 * a team, a region). Every message waits for the owner; only approved ones are public. The owner can
 * approve, reject or take one down again, each step kept in support_reviews. The event name and
 * whether new messages are accepted live in site_config so the owner changes them without a deploy.
 * Public replies carry the author's display name only — never an account id or its hash.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { isVerified } from './phone-api.js'
import { publicTextRefusal } from './feedback-api.js'

export const SUPPORT_SCHEMA = `
create table if not exists support_messages (
  id text primary key, event text not null, account_hash text not null,
  request_key text not null, author text not null, target text not null, body text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created timestamptz not null default now(), reviewed timestamptz, reason text not null default '',
  unique (account_hash, request_key)
);
create index if not exists support_messages_public_idx on support_messages (event, status, created desc);
create index if not exists support_messages_account_idx on support_messages (account_hash, created desc);
create table if not exists support_reviews (
  id text primary key, message_id text not null, before_status text not null, after_status text not null,
  reason text not null, created timestamptz not null default now()
);
`
export const SUPPORT_DEFAULTS = { event: 'worlds-2026', title: '2026 英雄联盟全球总决赛', enabled: true }
export const SUPPORT_LIMITS = { target: 40, bodyMin: 2, body: 200, perDay: 5, gapMs: 60_000 }

const same = (a, b) => { const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? '')); return x.length > 0 && x.length === y.length && timingSafeEqual(x, y) }
const hash = id => createHash('sha256').update(id).digest('hex')
const clean = (v, max) => typeof v === 'string' && [...v.trim()].length <= max ? v.trim().replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ') : ''

export function makeSupportApi(sql, { readBody, json, token, tokenFrom, normalizeId, displayName, rateLimited, bucketOf }) {
  let cfgCache = null, cfgAt = 0
  const config = async () => {
    if (cfgCache && Date.now() - cfgAt < 30_000) return { ...cfgCache }
    const [r] = await sql`select value from site_config where key = 'support_wall'`
    cfgCache = { ...SUPPORT_DEFAULTS, ...r?.value }; cfgAt = Date.now()
    return { ...cfgCache }
  }
  const PATHS = ['/api/support', '/api/support/messages', '/api/support/mine', '/api/admin/support']
  return {
    async route(req, res, path, url) {
      if (!PATHS.includes(path)) return false
      res.setHeader?.('Cache-Control', 'no-store')
      const admin = path === '/api/admin/support'
      if (admin && (!token || !same(tokenFrom(req, url), token))) { json(res, 404, { ok: false }); return true }
      if (!sql) { json(res, 503, { ok: false, why: '应援墙暂不可用，请稍后重试。' }); return true }
      if (!['GET', 'POST'].includes(req.method)) { json(res, 405, { ok: false }); return true }
      if (req.method === 'POST' && !admin && rateLimited?.(`sw:${bucketOf?.(req) ?? ''}`, 20)) { json(res, 429, { ok: false, why: '操作太频繁，请稍后再试。' }); return true }
      let body = {}
      if (req.method === 'POST') {
        try { body = JSON.parse(await readBody(req, 8192)); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object') }
        catch { json(res, 400, { ok: false, why: '提交格式不正确或内容过长。' }); return true }
      }
      const cfg = await config()

      if (path === '/api/support' && req.method === 'GET') {
        json(res, 200, { ok: true, title: cfg.title, enabled: cfg.enabled, limits: SUPPORT_LIMITS }); return true
      }
      if (path === '/api/support/messages' && req.method === 'GET') {
        const limit = 24, offset = Math.max(0, Math.min(10000, Math.floor(Number(url.searchParams.get('offset')) || 0)))
        const rows = await sql`select id, author, target, body, created from support_messages
          where event = ${cfg.event} and status = 'approved' order by created desc, id desc limit ${limit + 1} offset ${offset}`
        json(res, 200, { ok: true, rows: rows.slice(0, limit), more: rows.length > limit }); return true
      }

      if (admin) {
        if (req.method === 'GET') {
          const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending'
          const offset = Math.max(0, Math.min(10000, Math.floor(Number(url.searchParams.get('offset')) || 0)))
          const rows = await sql`select id, author, target, body, status, created, reviewed, reason from support_messages
            where event = ${cfg.event} and status = ${status} order by created desc, id desc limit 31 offset ${offset}`
          const counts = await sql`select status, count(*)::int as count from support_messages where event = ${cfg.event} group by status`
          json(res, 200, { ok: true, rows: rows.slice(0, 30), more: rows.length > 30, counts, config: cfg }); return true
        }
        if (body.action === 'config') {
          const next = { ...cfg }
          if (typeof body.enabled === 'boolean') next.enabled = body.enabled
          if (body.title !== undefined) {
            const title = clean(body.title, 40)
            if (!title) { json(res, 400, { ok: false, why: '请填写 1–40 字的赛事名称。' }); return true }
            next.title = title
          }
          if (body.event !== undefined) {
            if (!/^[a-z0-9-]{3,40}$/.test(String(body.event))) { json(res, 400, { ok: false, why: '赛事编号只能用小写字母、数字和横线。' }); return true }
            next.event = body.event
          }
          await sql`insert into site_config (key, value, updated) values ('support_wall', ${sql.json(next)}, now())
            on conflict (key) do update set value = excluded.value, updated = now()`
          cfgCache = null
          json(res, 200, { ok: true, config: next }); return true
        }
        if (body.action === 'review' && ['approved', 'rejected'].includes(body.status) && ['pending', 'approved', 'rejected'].includes(body.expected)) {
          const reason = clean(body.reason ?? '', 200)
          const changed = await sql.begin(async tx => {
            const [r] = await tx`update support_messages set status = ${body.status}, reviewed = now(), reason = ${reason}
              where id = ${String(body.id)} and status = ${body.expected} returning id`
            if (r) await tx`insert into support_reviews (id, message_id, before_status, after_status, reason)
              values (${randomUUID()}, ${r.id}, ${body.expected}, ${body.status}, ${reason})`
            return !!r
          })
          json(res, changed ? 200 : 409, { ok: changed, why: changed ? undefined : '留言状态已变化，请刷新后再审核。' }); return true
        }
        json(res, 400, { ok: false, why: '无效操作。' }); return true
      }

      if (req.method !== 'POST') { json(res, 405, { ok: false }); return true }
      const id = normalizeId(body.id)
      if (!id) { json(res, 401, { ok: false, why: '请先进入游戏再留言。' }); return true }
      const accountHash = hash(id)
      const [known] = await sql`select 1 as ok from card_accounts where id_hash = ${accountHash}`
      if (!known) { json(res, 401, { ok: false, why: '请先进入游戏再留言。' }); return true }
      if (path === '/api/support/mine') {
        const rows = await sql`select id, target, body, status, created, reason from support_messages
          where account_hash = ${accountHash} and event = ${cfg.event} order by created desc limit 20`
        json(res, 200, { ok: true, rows }); return true
      }
      if (!(await isVerified(sql, accountHash))) { json(res, 403, { ok: false, why: '先绑手机号再留言。' }); return true }
      if (!cfg.enabled) { json(res, 403, { ok: false, why: '留言征集暂未开放。' }); return true }
      const text = clean(body.body, SUPPORT_LIMITS.body), target = clean(body.target, SUPPORT_LIMITS.target), key = String(body.requestId ?? '')
      if ([...text].length < SUPPORT_LIMITS.bodyMin || !target || !/^[a-zA-Z0-9_-]{8,80}$/.test(key)) {
        json(res, 400, { ok: false, why: `请填写支持对象（最多 ${SUPPORT_LIMITS.target} 字）和 ${SUPPORT_LIMITS.bodyMin}–${SUPPORT_LIMITS.body} 字留言。` }); return true
      }
      if (/VM(?:[-\s]?[A-Z0-9]{4}){5}/i.test(`${text} ${target}`)) { json(res, 400, { ok: false, why: '留言不能包含账号 ID，请删除后再提交。' }); return true }
      const refused = publicTextRefusal(`${target} ${text}`)
      if (refused) { json(res, 400, { ok: false, why: refused }); return true }
      const result = await sql.begin(async tx => {
        const [account] = await tx`select name from card_accounts where id_hash = ${accountHash} for update`
        if (!account) return { code: 401, why: '请先进入游戏再留言。' }
        const [existing] = await tx`select id, status from support_messages where account_hash = ${accountHash} and request_key = ${key}`
        if (existing) return { code: 200, row: existing }
        const [rate] = await tx`select count(*)::int as total, max(created) as latest from support_messages
          where account_hash = ${accountHash} and created > now() - interval '24 hours'`
        if (rate.total >= SUPPORT_LIMITS.perDay || (rate.latest && Date.now() - new Date(rate.latest).getTime() < SUPPORT_LIMITS.gapMs)) {
          return { code: 429, why: `每分钟可提交一条，每 24 小时最多 ${SUPPORT_LIMITS.perDay} 条，请稍后再来。` }
        }
        const author = displayName(account.name, accountHash).name
        const [row] = await tx`insert into support_messages (id, event, account_hash, request_key, author, target, body)
          values (${randomUUID()}, ${cfg.event}, ${accountHash}, ${key}, ${author}, ${target}, ${text}) returning id, status`
        return { code: 200, row }
      })
      json(res, result.code, { ok: result.code === 200, why: result.why, row: result.row }); return true
    },
  }
}
