/** Player suggestions, adapted from val_player's mailbox. Internal demo submissions publish immediately.
 * PostgreSQL owns the bounded board. A row lock makes votes and merges atomic
 * across processes; no feedback, votes, or account credentials enter telemetry.
 */
import { createHash, randomBytes } from 'node:crypto'
import { RELEASE_STAGE } from './release-policy.js'

export const FEEDBACK_SCHEMA = `create table if not exists card_feedback (
  key text primary key, items jsonb not null default '[]'::jsonb
);`
const PUBLIC = new Set(['shown', 'taken', 'fixed'])
const STATES = new Set(['pending', 'shown', 'taken', 'fixed', 'hidden'])
const hash = value => createHash('sha256').update(value).digest('hex')
const normal = value => value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
const clean = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim() : ''

const reject = (why, status = 400) => { const error = new Error(why); error.status = status; throw error }
function targetOf(items, id, source = '') {
  const seen = new Set([source])
  while (id && !seen.has(id)) {
    seen.add(id)
    const item = items.find(x => x.id === id)
    if (!item) return null
    if (item.state !== 'merged') return item
    id = item.to
  }
  return null
}
function wire(item, owner, items, admin = false) {
  const out = { id: item.id, t: item.t, text: item.text, state: item.state,
    pin: item.pin, votes: item.votes.length, mine: item.owner === owner, voted: item.votes.includes(owner) }
  if (admin) {
    out.author = item.owner.slice(0, 6)
    out.duplicate = items.find(x => x.id !== item.id && x.state !== 'merged' && normal(x.text) === normal(item.text))?.id || null
  }
  if (item.state === 'merged' && (admin || out.mine)) {
    const target = targetOf(items, item.to, item.id)
    out.merge = !target ? { availability: 'missing' } : !PUBLIC.has(target.state) && !admin
      ? { availability: 'private' }
      : { availability: 'public', target: { id: target.id, text: target.text, state: target.state, votes: target.votes.length } }
  }
  return out
}
const rank = (a, b) => Number(b.pin) - Number(a.pin) || b.votes.length - a.votes.length || b.t - a.t

/** The demo board stays open; the formal board cannot be filled by one verified account. */
export function feedbackPostAllowed(items, owner, now = Date.now(), stage = RELEASE_STAGE) {
  if (stage !== 'production') return true
  const own = items.filter(x => x.owner === owner)
  return own.length < 30 && own.filter(x => x.t > now - 24 * 60 * 60 * 1000).length < 3
}

export function makeFeedbackApi({ getSql, readBody, json, normalizeId, rateLimited, token, tokenFrom, tokenOk, stage = RELEASE_STAGE }) {
  return async (req, res, path, url, bucket) => {
    const admin = path === '/api/admin/feedback'
    if (!admin && !['/api/feedback/list', '/api/feedback/new', '/api/feedback/vote'].includes(path)) return false
    res.setHeader('Cache-Control', 'no-store')
    if (admin && !tokenOk(tokenFrom(req, url), token)) { res.writeHead(404).end('Not found'); return true }
    if (req.method !== 'POST' && !(admin && req.method === 'GET')) { json(res, 405, { ok: false }); return true }
    if (!admin && rateLimited('feedback:' + bucket, 90, 60_000)) { json(res, 429, { ok: false, why: '操作太快了，请稍后再试。' }); return true }
    const sql = getSql()
    if (!sql) { json(res, 503, { ok: false, why: '信箱暂时无法连接。' }); return true }
    try {
      let body = {}
      if (req.method === 'POST') {
        try { body = JSON.parse(await readBody(req, 8192)) } catch { reject('请求格式不正确。') }
        if (!body || typeof body !== 'object') reject('请求格式不正确。')
      }
      let owner = ''
      if (!admin) {
        const id = normalizeId(body.accountId)
        if (!id) reject('请先进入游戏，再使用玩家信箱。', 401)
        owner = hash(id)
        const account = await sql`select verified from card_accounts where id_hash=${owner}`
        if (!account.length) reject('账号不存在。', 401)
        if (stage === 'production' && path !== '/api/feedback/list' && !account[0].verified)
          reject('请先完成手机号验证，再提交建议或投票。', 403)
      }
      const result = await sql.begin(async tx => {
        await tx`insert into card_feedback(key) values('board') on conflict do nothing`
        const [row] = await tx`select items from card_feedback where key='board' for update`
        const items = row.items
        let changed = false, created = null
        if (path.endsWith('/new')) {
          const text = clean(body.text)
          if (![...text].length || [...text].length > 2000) reject('请写下建议，最多 2000 字。')
          if (items.length >= 600) reject('待处理建议较多，请稍后再来。', 409)
          const own = items.filter(x => x.owner === owner)
          if (own.some(x => x.text === text)) reject('这条建议已提交，可在「我的」查看。', 409)
          const now = Date.now()
          if (!feedbackPostAllowed(items, owner, now, stage)) reject('提交建议过于频繁，请稍后再试。', 429)

          let id
          do { id = randomBytes(4).toString('hex') } while (items.some(x => x.id === id))
          created = { id, t: now, owner, text, state: 'shown', pin: false, votes: [owner] }
          items.push(created); changed = true
        } else if (path.endsWith('/vote')) {
          const item = items.find(x => x.id === body.id)
          if (!item || !PUBLIC.has(item.state)) reject('这条建议暂不可投票。', 404)
          if (typeof body.on !== 'boolean') reject('投票格式不正确。')
          if (body.on && !item.votes.includes(owner)) {
            if (item.votes.length >= 5000) reject('该建议的投票数已达上限。', 409)
            item.votes.push(owner)
          } else if (!body.on) item.votes = item.votes.filter(x => x !== owner)
          changed = true
        } else if (admin && req.method === 'POST') {
          const item = items.find(x => x.id === body.id)
          if (!item) reject('这条建议已不存在。', 404)
          if (item.state === 'merged' && body.action !== 'delete') reject('已合并的回执只能查看或删除。', 409)
          if (body.action === 'state' && STATES.has(body.state)) item.state = body.state
          else if (body.action === 'pin') item.pin = !!body.on
          else if (body.action === 'delete') items.splice(items.indexOf(item), 1)
          else if (body.action === 'merge') {
            const target = targetOf(items, body.to, item.id)
            if (!target) reject('合并目标不存在，或会形成循环。', 409)
            const votes = [...new Set([...item.votes, ...target.votes])]
            if (votes.length > 5000) reject('合并后的票数超过上限，没有执行。', 409)
            // Flatten earlier receipts before converting this item into another receipt.
            for (const receipt of items) if (receipt.state === 'merged' && targetOf(items, receipt.to, receipt.id)?.id === item.id) receipt.to = target.id
            target.votes = votes; item.state = 'merged'; item.to = target.id; item.pin = false; item.votes = []
          } else reject('无效的管理操作。')
          changed = true
        }
        if (changed) {
          const bytes = Buffer.byteLength(JSON.stringify(items))
          const reducing = body.action === 'delete' || body.action === 'merge' || (path.endsWith('/vote') && !body.on)
          if (bytes > 8 * 1024 * 1024 && !reducing) reject('信箱存储已满，请联系管理员整理。', 409)
          await tx`update card_feedback set items=${tx.json(items)} where key='board'`
        }
        const counts = { total: items.length, pending: items.filter(x => x.state === 'pending').length, shown: items.filter(x => PUBLIC.has(x.state)).length }
        if (admin) return { ok: true, counts, items: [...items].sort(rank).map(x => wire(x, '', items, true)) }
        return { ok: true, max: 2000, full: counts.total >= 600,
          items: items.filter(x => PUBLIC.has(x.state)).sort(rank).slice(0, 200).map(x => wire(x, owner, items)),
          mine: items.filter(x => x.owner === owner).sort((a, b) => b.t - a.t).map(x => wire(x, owner, items)),
          ...(created ? { created: created.id } : {}) }
      })
      json(res, 200, result)
    } catch (error) {
      json(res, error.status || 503, { ok: false, why: error.status ? error.message : '信箱暂时无法保存，请稍后重试。' })
    }
    return true
  }
}
