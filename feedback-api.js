/** Player mail to the author: private, one to one (owner, 2026-09-28 — 「不公开、不上榜、不投票、不排名，
 * 其他玩家完全看不到。作者可以在后台看到以及选择回复」).
 *
 * A letter is seen by its writer and by the owner in /admin, nobody else. There is no board, no votes, no
 * pin, no ranking. The owner marks a letter read / taken / fixed / set aside and may reply; the writer
 * sees the reply under his own letter. Letters from the old public board keep their words; 'shown'
 * reads as 'read' and a merged one stays a receipt that can only be deleted.
 *
 * PostgreSQL holds the letters in one row (key 'board', the name the old board used), locked per change.
 * No letter, reply or account credential enters telemetry.
 */
import { createHash, randomBytes } from 'node:crypto'
import { RELEASE_STAGE } from './release-policy.js'

export const FEEDBACK_SCHEMA = `create table if not exists card_feedback (
  key text primary key, items jsonb not null default '[]'::jsonb
);`
/** pending = 未读; the rest are the owner's marks */
const STATES = new Set(['pending', 'read', 'taken', 'fixed', 'hidden'])
const stateOf = (s) => (s === 'shown' ? 'read' : s)
const hash = value => createHash('sha256').update(value).digest('hex')
const normal = value => value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
const clean = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim() : ''
const cleanReply = value => typeof value === 'string' ? value.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : ''

const reject = (why, status = 400) => { const error = new Error(why); error.status = status; throw error }

/** What a writer, or the owner, gets back for one letter. */
function wire(item, admin = false) {
  const out = { id: item.id, t: item.t, text: item.text, state: stateOf(item.state) }
  if (item.reply) out.reply = { text: item.reply.text, t: item.reply.t }
  if (admin) {
    out.author = item.owner.slice(0, 6)
    if (item.reply) out.replySeen = !!item.replySeen
  } else if (item.reply) out.replyNew = !item.replySeen
  return out
}

/* Spam that no letter needs. The letters are private now, so links and numbers (a screenshot link, an
   account id) are allowed; the owner reads everything anyway. */
const BLOCK = [
  '加微信', '加威信', '加vx', '加v信', '代练', '代打', '外挂', '辅助器', '破解版',
  '刷单', '兼职日结', '博彩', '棋牌', '菠菜', '网赚', '免费领', '扫码进群', '包赢',
  '裸聊', '约炮', '一夜情', '色情',
]
/* The support wall is still public, and keeps the old gate. */
const PUBLIC_BLOCK = [...BLOCK, '私聊我', '草泥马', '傻逼', '煞笔', '尼玛', '狗日的', '你妈的', '妈了个', 'fuck', 'shit', 'bitch', 'asshole']
const LINKY = /(https?:\/\/|www\.|\.com|\.cn\b|\.net\b|[a-z]{2,}\.(me|top|xyz|vip)\b)/i
const DIGITS = /\d{7,}/
export const FORMAL = { MIN_TEXT: 4, MAX_TEXT: 500, PER_HOUR: 3, PER_DAY: 10, MAX_PENDING: 300 }
export const REPLY_MAX = 1000
const DEMO_MAX_TEXT = 2000
const MAX_LETTERS = 3000

/** Words, links and contact numbers that can never hang on a public wall (the support wall). */
export function publicTextRefusal(text) {
  const low = text.toLowerCase()
  if (PUBLIC_BLOCK.some(w => low.includes(w))) return '这条里有不能公开展示的词，换个说法再发。'
  if (LINKY.test(text)) return '先别放链接，直接说就行。'
  if (DIGITS.test(text)) return '别留联系方式，作者在这儿就能看到你写的。'
  return null
}

/** Why this letter cannot be sent, or null. */
export function feedbackRefusal(items, owner, text, now = Date.now(), stage = RELEASE_STAGE) {
  const n = [...text].length
  if (stage !== 'production') {
    if (!n || n > DEMO_MAX_TEXT) return '请写下内容，最多 2000 字。'
    if (items.some(x => x.owner === owner && x.text === text)) return '这封信已经发过了，可在「我的来信」查看。'
    return null
  }
  if (n < FORMAL.MIN_TEXT) return `太短了，至少 ${FORMAL.MIN_TEXT} 个字，把想说的说清楚。`
  if (n > FORMAL.MAX_TEXT) return `一封最多 ${FORMAL.MAX_TEXT} 个字，长了就分两封。`
  const low = text.toLowerCase()
  if (BLOCK.some(w => low.includes(w))) return '这封信里有不能发送的词，换个说法再发。'
  const own = items.filter(x => x.owner === owner)
  if (own.some(x => normal(x.text) === normal(text))) return '这封你已经发过了，在「我的来信」里能看到。'
  if (items.filter(x => x.state === 'pending').length >= FORMAL.MAX_PENDING) return '作者还没看完排队的信，过两天再来。'
  if (own.filter(x => x.t > now - 60 * 60 * 1000).length >= FORMAL.PER_HOUR) return `一小时最多发 ${FORMAL.PER_HOUR} 封，攒一攒再来。`
  if (own.filter(x => x.t > now - 24 * 60 * 60 * 1000).length >= FORMAL.PER_DAY) return `一天最多发 ${FORMAL.PER_DAY} 封，明天再来。`
  return null
}
/** Kept for the admission check: true when an account may send one more (length/content aside). */
export function feedbackPostAllowed(items, owner, now = Date.now(), stage = RELEASE_STAGE) {
  return feedbackRefusal(items, owner, '一封正常的来信', now, stage) === null
}

export function makeFeedbackApi({ getSql, readBody, json, normalizeId, rateLimited, token, tokenFrom, tokenOk, stage = RELEASE_STAGE }) {
  return async (req, res, path, url, bucket) => {
    const admin = path === '/api/admin/feedback'
    if (!admin && !['/api/feedback/list', '/api/feedback/new'].includes(path)) return false
    res.setHeader('Cache-Control', 'no-store')
    if (admin && !tokenOk(tokenFrom(req, url), token)) { res.writeHead(404).end('Not found'); return true }
    if (req.method !== 'POST' && !(admin && req.method === 'GET')) { json(res, 405, { ok: false }); return true }
    if (!admin && rateLimited('feedback:' + bucket, 90, 60_000)) { json(res, 429, { ok: false, why: '操作太快了，请稍后再试。' }); return true }
    const sql = getSql()
    if (!sql) { json(res, 503, { ok: false, why: '信箱暂时无法连接。' }); return true }
    try {
      let body = {}
      if (req.method === 'POST') {
        try { body = JSON.parse(await readBody(req, 16384)) } catch { reject('请求格式不正确。') }
        if (!body || typeof body !== 'object') reject('请求格式不正确。')
      }
      let owner = ''
      if (!admin) {
        const id = normalizeId(body.accountId)
        if (!id) reject('请先进入游戏，再使用信箱。', 401)
        owner = hash(id)
        const account = await sql`select verified from card_accounts where id_hash=${owner}`
        if (!account.length) reject('账号不存在。', 401)
        if (stage === 'production' && path === '/api/feedback/new' && !account[0].verified)
          reject('请先完成手机号验证，再给作者写信。', 403)
      }
      const result = await sql.begin(async tx => {
        await tx`insert into card_feedback(key) values('board') on conflict do nothing`
        const [row] = await tx`select items from card_feedback where key='board' for update`
        const items = row.items
        let changed = false, created = null
        if (path.endsWith('/new')) {
          const text = clean(body.text)
          if (items.length >= MAX_LETTERS) reject('信箱满了，作者清一清就好，过两天再来。', 409)
          const now = Date.now()
          const refused = feedbackRefusal(items, owner, text, now, stage)
          if (refused) reject(refused, /小时|一天/.test(refused) ? 429 : 400)
          let id
          do { id = randomBytes(4).toString('hex') } while (items.some(x => x.id === id))
          created = { id, t: now, owner, text, state: 'pending' }
          items.push(created); changed = true
        } else if (admin && req.method === 'POST') {
          const item = items.find(x => x.id === body.id)
          if (!item) reject('这封信已不存在。', 404)
          if (item.state === 'merged' && body.action !== 'delete') reject('旧的合并回执只能删除。', 409)
          if (body.action === 'state' && STATES.has(body.state)) item.state = body.state
          else if (body.action === 'reply') {
            const text = cleanReply(body.text)
            if (!text) {
              delete item.reply; delete item.replySeen
            } else {
              if ([...text].length > REPLY_MAX) reject(`回复最多 ${REPLY_MAX} 个字。`)
              item.reply = { text, t: Date.now() }
              item.replySeen = false
              if (item.state === 'pending') item.state = 'read'
              // a notice in the writer's inbox, so the badge tells him (the reply itself stays with the letter)
              const excerpt = [...item.text].slice(0, 20).join('') + ([...item.text].length > 20 ? '…' : '')
              await tx`insert into card_mail (to_h, kind, body) values (${item.owner}, 'feedback_reply', ${tx.json({ excerpt })})`
            }
          } else if (body.action === 'delete') items.splice(items.indexOf(item), 1)
          else reject('无效的管理操作。')
          changed = true
        }
        // the writer's own letters, wired before his unread replies are marked seen, so this answer still
        // says which replies are new
        const mine = !admin ? items.filter(x => x.owner === owner).sort((a, b) => b.t - a.t).map(x => wire(x)) : []
        if (!admin) {
          for (const x of items) {
            if (x.owner === owner && x.reply && !x.replySeen) { x.replySeen = true; changed = true }
          }
        }
        if (changed) {
          if (Buffer.byteLength(JSON.stringify(items)) > 8 * 1024 * 1024 && body.action !== 'delete') reject('信箱存储已满，请联系管理员整理。', 409)
          await tx`update card_feedback set items=${tx.json(items)} where key='board'`
        }
        const counts = { total: items.length, pending: items.filter(x => x.state === 'pending').length, replied: items.filter(x => x.reply).length }
        if (admin) return { ok: true, counts, items: [...items].sort((a, b) => b.t - a.t).map(x => wire(x, true)) }
        return { ok: true, max: stage === 'production' ? FORMAL.MAX_TEXT : DEMO_MAX_TEXT, min: stage === 'production' ? FORMAL.MIN_TEXT : 1,
          full: items.length >= MAX_LETTERS, mine, ...(created ? { created: created.id } : {}) }
      })
      json(res, 200, result)
    } catch (error) {
      json(res, error.status || 503, { ok: false, why: error.status ? error.message : '信箱暂时无法保存，请稍后重试。' })
    }
    return true
  }
}

/** How many of this account's letters have a reply it has not opened yet — for the mailbox badge. */
export async function unreadReplies(sql, idHash) {
  const [row] = await sql`select items from card_feedback where key='board'`
  return (row?.items ?? []).filter(x => x.owner === idHash && x.reply && !x.replySeen).length
}
