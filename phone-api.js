import { RELEASE_POLICY } from './release-policy.js'
/**
 * A phone number behind every card account.
 *
 * 「太多人开小号了」— the account id is a random string the browser keeps, so
 * a second account was a private window away. From here an account plays
 * only after a mainland phone number has answered a code, and one number
 * holds one account: binding a number to an account claims it, a number
 * already holding another account cannot be bound again, and the same code
 * flow lets a player walk INTO the account a number holds (「用手机号进入」),
 * which is also the first real way to recover an id nobody wrote down.
 *
 * What is stored: never the number. sha256(salt + number) to match on, the
 * last four digits to show, and the account's own id encrypted with a server
 * key so a login can hand it back. Codes are stored hashed, expire in five
 * minutes, allow five tries, and a number gets one code a minute and five a
 * day. The sender is Aliyun 号码认证服务 · 短信认证 (see below) when
 * ALIYUN_SMS_ACCESS_KEY_ID / ALIYUN_SMS_ACCESS_KEY_SECRET / ALIYUN_SMS_SIGN_NAME
 * are set; local test codes require an explicit non-production switch.
 * Overseas numbers cannot receive a mainland template —
 * they message the owner, who calls /api/admin/verify on their battle code.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from 'node:crypto'

// the tables live in CARD_SCHEMA (cards-api.js), so every harness that builds
// the card tables has them; kept as a name for anything that imported it
export const PHONE_SCHEMA = ''

const MAX_TRIES = 5
const PER_MINUTE_MS = 60 * 1000
const PER_DAY = 5
// A number's own limits do not stop one client from buying an SMS for every
// number it can list. Bind codes also count per account, and the whole server
// stops sending past a daily budget (SMS_DAILY_CAP, 0 = stop sending now).
const PER_ACCOUNT_DAY = 5
const DAILY_CAP_DEFAULT = 2000
export function smsDailyCap(env = process.env) {
  const raw = String(env.SMS_DAILY_CAP ?? '').trim()
  if (!/^\d+$/.test(raw)) return DAILY_CAP_DEFAULT
  return Math.min(Number(raw), 1_000_000)
}
const SALT = process.env.PHONE_SALT || process.env.ANALYTICS_TOKEN || 'valmanager-phone'
const KEY = createHash('sha256').update(process.env.PHONE_KEY || process.env.ANALYTICS_TOKEN || 'valmanager-phone-key').digest()

export const phoneHash = (phone) => createHash('sha256').update(`${SALT}:${phone}`).digest('hex')
const codeHash = (phoneH, code) => createHash('sha256').update(`${SALT}:${phoneH}:${code}`).digest('hex')

export function normalizePhone(raw) {
  let s = String(raw ?? '').replace(/[^\d+]/g, '')
  if (s.startsWith('+86')) s = s.slice(3)
  else if (s.startsWith('86') && s.length === 13) s = s.slice(2)
  else if (s.startsWith('0086')) s = s.slice(4)
  return /^1[3-9]\d{9}$/.test(s) ? s : null
}

export function encryptId(id) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', KEY, iv)
  const body = Buffer.concat([c.update(String(id), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
}

export function decryptId(enc) {
  const buf = Buffer.from(String(enc), 'base64')
  const d = createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
}

// ---------------------------------------------------------------- Aliyun 号码认证 · 短信认证
//
// Not the plain SMS service: a personally-verified Aliyun account cannot get a
// custom signature there. 号码认证服务's 短信认证 lends a signature
// and a matching system template selected from this account's console, and
// it generates, sends, KEEPS and checks the code itself — SendSmsVerifyCode
// then CheckSmsVerifyCode on dypnsapi.aliyuncs.com. Nothing about the code
// is stored here; card_sms only remembers when a number was last sent to,
// for the one-a-minute / five-a-day limits. Same RPC-2017-05-25 signature
// the owner's other project uses, hand-signed, no SDK.

/** the last codes handed out in dev mode, for the owner's admin route */
export const devCodes = []

const pct = (s) => encodeURIComponent(s).replace(/\+/g, '%20').replace(/\*/g, '%2A').replace(/%7E/g, '~')

export async function aliyunRpc(host, action, extra, env = process.env) {
  const params = {
    Action: action, Version: '2017-05-25', RegionId: 'cn-hangzhou', Format: 'JSON',
    AccessKeyId: env.ALIYUN_SMS_ACCESS_KEY_ID, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0',
    SignatureNonce: randomBytes(16).toString('hex'), Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ...extra,
  }
  const canon = Object.keys(params).sort().map((k) => `${pct(k)}=${pct(params[k])}`).join('&')
  const toSign = `GET&${pct('/')}&${pct(canon)}`
  const sig = createHmac('sha1', `${env.ALIYUN_SMS_ACCESS_KEY_SECRET}&`).update(toSign).digest('base64')
  const r = await fetch(`https://${host}/?${canon}&Signature=${pct(sig)}`, { signal: AbortSignal.timeout(12_000) })
  return r.json().catch(() => ({}))
}

export const smsConfigured = (env = process.env) =>
  !!(env.ALIYUN_SMS_ACCESS_KEY_ID && env.ALIYUN_SMS_ACCESS_KEY_SECRET
    && env.ALIYUN_SMS_SIGN_NAME && env.ALIYUN_SMS_TEMPLATE_CODE)

/** Aliyun makes the code, sends it, and keeps it for five minutes. */
export async function sendVerify(phone, env = process.env) {
  const d = await aliyunRpc('dypnsapi.aliyuncs.com', 'SendSmsVerifyCode', {
    PhoneNumber: phone, SignName: env.ALIYUN_SMS_SIGN_NAME, TemplateCode: env.ALIYUN_SMS_TEMPLATE_CODE,
    TemplateParam: JSON.stringify({ code: '##code##', min: '5' }), ValidTime: '300', CodeLength: '6', CodeType: '1',
    ReturnVerifyCode: 'false',
  }, env)
  if (d?.Code !== 'OK') throw new Error(`aliyun ${d?.Code || '?'}: ${d?.Message || ''}`)
  return true
}

/** Aliyun checks the code the player typed. */
export async function checkVerify(phone, code, env = process.env) {
  const d = await aliyunRpc('dypnsapi.aliyuncs.com', 'CheckSmsVerifyCode', { PhoneNumber: phone, VerifyCode: code }, env)
  if (d?.Code !== 'OK') throw new Error(`aliyun ${d?.Code || '?'}: ${d?.Message || ''}`)
  return d?.Model?.VerifyResult === 'PASS'
}

/**
 * Local codes are an explicit local-test feature. Neither NODE_ENV=production
 * nor a Railway runtime can enable them, even with PHONE_SMS_DEV=1.
 */
export const devMode = (env = process.env) =>
  !RELEASE_POLICY.phoneEnabled && !smsConfigured(env) && env.PHONE_SMS_DEV === '1'
  && env.NODE_ENV !== 'production' && !env.RAILWAY_ENVIRONMENT && !env.RAILWAY_PROJECT_ID

// ---------------------------------------------------------------- the api

export function makePhoneApi(sql, { readBody, json, rateLimited, normalizeId, hash, token, tokenFrom, tokenOk, sender, checker, enabled = RELEASE_POLICY.phoneEnabled, dailyCap = smsDailyCap }) {
  const guard = (res, key, max) => {
    if (rateLimited(key, max)) { json(res, 429, { ok: false, why: '操作太频繁，稍等一下。' }); return true }
    return false
  }
  const body = async (req, res) => {
    try { return JSON.parse(await readBody(req, 4096)) } catch { json(res, 400, { ok: false }); return null }
  }

  // These locks protect only short database steps. Sending/checking at Aliyun
  // happens after the transaction releases its connection; a slow SMS provider
  // must never occupy all four connections needed by matches and saves.
  const locked = (ph, fn) => sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(5160409, ${parseInt(ph.slice(0, 8), 16) | 0})`
    return fn(tx)
  })
  const busyCode = { ok: false, why: '验证码正在处理中，稍等一下。' }
  const expiredCode = { ok: false, why: '验证码过期了，重新发一个。' }

  async function sendCode(req, res, bucket) {
    if (!sql) { json(res, 200, { ok: false, offline: true }); return }
    if (guard(res, `phone:send:${bucket}`, 6)) return
    const b = await body(req, res)
    if (!b) return
    const phone = normalizePhone(b.phone)
    if (!phone) { json(res, 200, { ok: false, why: '只收中国大陆的 11 位手机号。海外号码请到抖音私信作者人工处理。' }); return }
    const ph = phoneHash(phone)
    const purpose = b.for === 'login' ? 'login' : 'bind'
    const id = purpose === 'bind' ? normalizeId(b.id) : null
    const me = id ? hash(id) : null
    const reservation = `pending:${randomBytes(16).toString('hex')}`
    const cap = dailyCap()
    const refused = await locked(ph, async (tx) => {
      const held = await tx`select id_hash from card_phones where phone_h = ${ph}`
      if (purpose === 'bind') {
        if (held.length && held[0].id_hash !== me) {
          return { ok: false, why: '这个手机号已经绑过账号了，一个号只能认证一次。要进那个账号，用「用手机号进入」。', taken: true }
        }
        // A bind code is bought for an account that exists: without one, any
        // client could spend the SMS budget on numbers that will never bind.
        if (!me) return { ok: false, why: '先建好账号，再绑手机号。', noAccount: true }
        const acct = await tx`select 1 from card_accounts where id_hash = ${me}`
        if (!acct.length) return { ok: false, why: '账号还没建好，刷新再试。', noAccount: true }
        const mine = await tx`select last4 from card_phones where id_hash = ${me}`
        if (mine.length && !held.length) return { ok: false, why: `这个账号已经绑了尾号 ${mine[0].last4} 的手机。`, bound: true }
      } else if (!held.length) return { ok: false, why: '这个手机号还没绑过账号。', none: true }
      const recent = await tx`select sent from card_sms where phone_h = ${ph} and sent > now() - interval '1 day' order by sent desc`
      if (recent.length && Date.now() - new Date(recent[0].sent).getTime() < PER_MINUTE_MS) {
        return { ok: false, why: '一分钟内只能发一次，稍等。', wait: Math.ceil((PER_MINUTE_MS - (Date.now() - new Date(recent[0].sent).getTime())) / 1000) }
      }
      if (recent.length >= PER_DAY) return { ok: false, why: '这个号今天发得太多了，明天再试。' }
      // The account and server-wide budgets span numbers: serialise just this
      // short step so concurrent sends to different numbers cannot overshoot.
      await tx`select pg_advisory_xact_lock(5160410, 0)`
      if (me) {
        const [own] = await tx`select count(*)::int as n from card_sms where id_h = ${me} and sent > now() - interval '1 day'`
        if (own.n >= PER_ACCOUNT_DAY) return { ok: false, why: '这个账号今天发的验证码太多了，明天再试。' }
      }
      const [all] = await tx`select count(*)::int as n from card_sms where sent > now() - interval '1 day'`
      if (all.n >= cap) {
        console.warn(`sms: daily cap ${cap} reached, sending paused`)
        return { ok: false, why: '今天的验证码发放已达上限，请明天再试或联系作者。', capped: true }
      }
      // Count the reservation before contacting the sender: simultaneous
      // requests (including another server process) cannot all buy an SMS.
      await tx`insert into card_sms (phone_h, code_h, ip, id_h) values (${ph}, ${reservation}, ${bucket}, ${me})`
      return null
    })
    if (refused) { json(res, 200, refused); return }
    let dev = false
    let localCode = null
    try {
      if (sender) await sender(phone)
      else if (smsConfigured()) { await sendVerify(phone); console.log(`sms: sent ****${phone.slice(-4)}`) }
      else if (devMode()) {
        localCode = String(randomInt(0, 1_000_000)).padStart(6, '0')
        devCodes.unshift({ last4: phone.slice(-4), code: localCode, at: new Date().toISOString() })
        devCodes.splice(50)
        console.log(`sms(dev): ****${phone.slice(-4)} code ${localCode}`)
        dev = true
      } else {
        await sql`delete from card_sms where phone_h = ${ph} and code_h = ${reservation}`
        json(res, 200, { ok: false, why: '短信服务未配置，请联系作者。' })
        return
      }
      await sql`update card_sms set code_h = ${dev ? codeHash(ph, localCode) : ''}
                where phone_h = ${ph} and code_h = ${reservation}`
    } catch (err) {
      await sql`delete from card_sms where phone_h = ${ph} and code_h = ${reservation}`
      console.warn('sms: send failed —', err.message)
      json(res, 200, { ok: false, why: '短信没发出去，稍后再试。' })
      return
    }
    json(res, 200, { ok: true, wait: 60, dev })
  }

  /** Reserve one of five tries, then atomically consume and perform the login/bind. */
  async function verify(phone, ph, code, finish) {
    const reservation = `checking:${randomBytes(16).toString('hex')}`
    const prepared = await locked(ph, async (tx) => {
      const rows = await tx`select ctid, code_h, tries from card_sms where phone_h = ${ph}
                             and sent > now() - interval '5 minutes' order by sent desc limit 1 for update`
      if (!rows.length || rows[0].code_h === 'used') return expiredCode
      const r = rows[0]
      if (/^(pending|checking):/.test(r.code_h)) return busyCode
      if (r.tries >= MAX_TRIES) return { ok: false, why: '试错太多次了，重新发一个。' }
      await tx`update card_sms set tries = tries + 1, code_h = ${reservation} where ctid = ${r.ctid}`
      return { ok: true, previous: r.code_h }
    })
    if (!prepared.ok) return prepared
    const restore = (refund = false) => refund
      ? sql`update card_sms set code_h = ${prepared.previous}, tries = greatest(0, tries - 1)
            where phone_h = ${ph} and code_h = ${reservation}`
      : sql`update card_sms set code_h = ${prepared.previous}
            where phone_h = ${ph} and code_h = ${reservation}`
    try {
      const typed = String(code ?? '').trim()
      let pass = false
      if (/^\d{6}$/.test(typed)) {
        if (checker) pass = await checker(phone, typed)
        else if (smsConfigured()) pass = await checkVerify(phone, typed)
        else pass = prepared.previous !== '' && prepared.previous === codeHash(ph, typed)
      }
      if (!pass) { await restore(); return { ok: false, why: '验证码不对。' } }
      return await locked(ph, async (tx) => {
        const consumed = await tx`update card_sms set code_h = 'used'
                                  where phone_h = ${ph} and code_h = ${reservation}
                                  returning phone_h`
        if (!consumed.length) return expiredCode
        // Keep the row: deleting it erased both the minute/day send quotas.
        // Account ownership is checked again inside this same transaction.
        return finish(tx)
      })
    } catch (err) {
      await restore(true)
      console.warn('sms: check failed —', err.message)
      return { ok: false, why: '校验没连上，稍后再试。' }
    }
  }

  async function bind(req, res, bucket) {
    if (!sql) { json(res, 200, { ok: false, offline: true }); return }
    if (guard(res, `phone:bind:${bucket}`, 20)) return
    const b = await body(req, res)
    if (!b) return
    const id = normalizeId(b.id)
    const phone = normalizePhone(b.phone)
    if (!id || !phone) { json(res, 200, { ok: false, why: '手机号或账号不对。' }); return }
    const ph = phoneHash(phone)
    const me = hash(id)
    // Do the cheap ownership checks before spending a provider verification,
    // and repeat them with the account locked when the code succeeds.
    const ownership = async (tx, lock = false) => {
      const acct = lock
        ? await tx`select verified from card_accounts where id_hash = ${me} for update`
        : await tx`select verified from card_accounts where id_hash = ${me}`
      if (!acct.length) return { ok: false, why: '账号还没建好，刷新再试。' }
      const held = await tx`select id_hash from card_phones where phone_h = ${ph}`
      if (held.length && held[0].id_hash !== me) return { ok: false, why: '这个手机号已经绑了另一个账号。一个号只能有一个账号；要进那个账号，用「用手机号进入」。', taken: true }
      const mine = await tx`select last4 from card_phones where id_hash = ${me}`
      if (mine.length && !held.length) return { ok: false, why: `这个账号已经绑了尾号 ${mine[0].last4} 的手机。`, bound: true }
      return null
    }
    const refused = await ownership(sql)
    if (refused) { json(res, 200, refused); return }
    const v = await verify(phone, ph, b.code, async (tx) => {
      const conflict = await ownership(tx, true)
      if (conflict) return conflict
      await tx`insert into card_phones (phone_h, id_hash, id_enc, last4) values (${ph}, ${me}, ${encryptId(id)}, ${phone.slice(-4)})
               on conflict (phone_h) do nothing`
      await tx`update card_accounts set verified = coalesce(verified, now()),
               verify_via = case when verified is null then 'sms' else coalesce(verify_via, 'sms') end
               where id_hash = ${me}`
      return { ok: true, phone: phone.slice(-4) }
    })
    json(res, 200, v)
  }

  async function login(req, res, bucket) {
    if (!sql) { json(res, 200, { ok: false, offline: true }); return }
    if (guard(res, `phone:login:${bucket}`, 20)) return
    const b = await body(req, res)
    if (!b) return
    const phone = normalizePhone(b.phone)
    if (!phone) { json(res, 200, { ok: false, why: '手机号不对。' }); return }
    const ph = phoneHash(phone)
    const held = await sql`select id_enc, last4 from card_phones where phone_h = ${ph}`
    if (!held.length) { json(res, 200, { ok: false, why: '这个手机号还没绑过账号。', none: true }); return }
    const v = await verify(phone, ph, b.code, async (tx) => {
      const current = await tx`select id_hash, id_enc, last4 from card_phones where phone_h = ${ph}`
      if (!current.length) throw new Error('phone binding disappeared during login')
      const id = decryptId(current[0].id_enc)
      const account = await tx`select id_hash from card_accounts where id_hash = ${current[0].id_hash}`
      if (!account.length || hash(id) !== current[0].id_hash) throw new Error('phone binding account is unavailable')
      return { ok: true, id, phone: current[0].last4 }
    })
    json(res, 200, v)
  }

  const admin = (req, url, res) => {
    if (!token || !tokenOk(tokenFrom ? tokenFrom(req, url) : url.searchParams.get('token'), token)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
      return false
    }
    return true
  }

  /** the owner verifies an account by hand: ?code=<对战码>&via=douyin:xxx */
  async function adminVerify(req, res, url) {
    if (!admin(req, url, res)) return
    if (req.method !== 'POST') { json(res, 405, { ok: false, why: 'POST required' }); return }
    if (!sql) { json(res, 200, { ok: false, offline: true }); return }
    const code = String(url.searchParams.get('code') || '').toLowerCase().slice(0, 8)
    const via = String(url.searchParams.get('via') || 'manual').slice(0, 60)
    if (code.length !== 8) { json(res, 400, { ok: false, why: 'code' }); return }
    // The code is only the head of a hash of an id the client chose: a player
    // can grind ids that share it. Act on exactly one account or on none.
    const hits = await sql`select id_hash from card_accounts where left(id_hash, 8) = ${code} limit 2`
    if (hits.length > 1) { json(res, 200, { ok: false, matched: hits.length, clash: true, why: '这个对战码对应不止一个账号，请用完整 ID 在审核台查询后处理。' }); return }
    if (!hits.length) { json(res, 200, { ok: false, matched: 0, name: null }); return }
    const exact = hits[0].id_hash
    if (url.searchParams.get('undo') === '1') {
      // only a hand-made pass can be taken back: a number that answered a
      // code stays answered. The note stays as revoked:<note>, so the same
      // account asking again is recognised at the desk.
      const rows = await sql`update card_accounts set verified = null, verify_via = 'revoked:' || substr(verify_via, 8)
                             where id_hash = ${exact} and verify_via like 'manual:%' returning name`
      json(res, 200, { ok: rows.length > 0, matched: rows.length, name: rows[0]?.name ?? null, undone: true })
      return
    }
    const manual = `manual:${via}`
    const rows = await sql`update card_accounts set verified = coalesce(verified, now()),
                           verify_via = case when verified is null then ${manual} else coalesce(verify_via, ${manual}) end
                           where id_hash = ${exact} returning name, verified, verify_via`
    json(res, 200, { ok: rows.length > 0, matched: rows.length, name: rows[0]?.name ?? null, via: rows[0]?.verify_via ?? null })
  }

  /**
   * The review desk: one account's standing by 对战码, or the queue — who was
   * passed by hand lately, and who has been playing at the door without a
   * number. Names and codes only; a phone shows as its last four.
   *
   * A player stuck at the door never sees his 对战码 — it lives inside the
   * game — but he was told to keep his id when the account was made. So the
   * desk also takes the id, POSTed as {id}. An id is the whole login: it never
   * rides in a URL, where logs and history would keep it, and the answer
   * carries only the code it hashes to.
   */
  async function adminReview(req, res, url) {
    if (!admin(req, url, res)) return
    if (!sql) { json(res, 200, { ok: false, offline: true }); return }
    let code = String(url.searchParams.get('code') || '').toLowerCase().slice(0, 8)
    if (req.method === 'POST') {
      const b = await body(req, res)
      if (!b) return
      const id = normalizeId(b.id)
      if (!id) { json(res, 400, { ok: false, why: 'ID 格式不对：VM- 开头，后面五组四位' }); return }
      code = hash(id).slice(0, 8)
    }
    if (code) {
      if (code.length !== 8) { json(res, 400, { ok: false, why: 'code' }); return }
      const rows = await sql`select a.name, left(a.id_hash, 8) as code, a.created, a.seen, a.verified, a.verify_via as via, p.last4, p.bound
                             from card_accounts a left join card_phones p on p.id_hash = a.id_hash
                             where left(a.id_hash, 8) = ${code}`
      json(res, 200, { ok: true, found: rows.length, account: rows[0] ?? null })
      return
    }
    const [totals] = await sql`select
      (select count(*)::int from card_accounts where verified is not null) as verified,
      (select count(*)::int from card_accounts where verify_via like 'manual:%') as manual,
      (select count(*)::int from card_accounts where verified is null) as unverified,
      (select count(*)::int from card_accounts where verified is null and verify_via like 'revoked:%') as revoked,
      (select count(*)::int from card_accounts where verified is null and seen > now() - interval '1 day') as knocking24`
    const manual = await sql`select name, left(id_hash, 8) as code, verified, verify_via as via, seen
                             from card_accounts where verify_via like 'manual:%' order by verified desc limit 40`
    const pending = await sql`select name, left(id_hash, 8) as code, created, seen
                              from card_accounts where verified is null and seen > now() - interval '3 days'
                              and (verify_via is null or verify_via not like 'revoked:%')
                              order by seen desc limit 40`
    const revoked = await sql`select name, left(id_hash, 8) as code, verify_via as via, seen
                              from card_accounts where verified is null and verify_via like 'revoked:%'
                              order by seen desc limit 40`
    json(res, 200, { ok: true, totals, manual, pending, revoked })
  }

  async function adminCodes(req, res, url) {
    if (!admin(req, url, res)) return
    // enough to see from outside that the sender works: how many codes went
    // out and how many numbers came back to bind, never the numbers
    let stats = null
    if (sql) {
      const [a] = await sql`select
        (select count(*)::int from card_sms where sent > now() - interval '1 day') as sent24,
        (select max(sent) from card_sms) as last_sent,
        (select count(*)::int from card_phones) as bound,
        (select count(*)::int from card_phones where bound > now() - interval '1 day') as bound24,
        (select max(bound) from card_phones) as last_bound`
      stats = a
    }
    if (stats) stats.cap = dailyCap()
    json(res, 200, { ok: true, configured: smsConfigured(), dev: devMode(), codes: devMode() ? devCodes : [], stats })
  }

  return {
    async route(req, res, path, bucket, url) {
      if (!enabled && ['/api/card/phone/send', '/api/card/phone/bind', '/api/card/phone/login'].includes(path)) {
        json(res, 403, { ok: false, disabled: true, why: '内测期间暂不开放手机号功能，请使用账号 ID 登录。' }); return true
      }
      if (path === '/api/card/phone/send') { if (req.method !== 'POST') { json(res, 405, { ok: false }); return true } await sendCode(req, res, bucket); return true }
      if (path === '/api/card/phone/bind') { if (req.method !== 'POST') { json(res, 405, { ok: false }); return true } await bind(req, res, bucket); return true }
      if (path === '/api/card/phone/login') { if (req.method !== 'POST') { json(res, 405, { ok: false }); return true } await login(req, res, bucket); return true }
      if (path === '/api/admin/verify') { await adminVerify(req, res, url); return true }
      if (path === '/api/admin/sms') { await adminCodes(req, res, url); return true }
      if (path === '/api/admin/review') { await adminReview(req, res, url); return true }
      return false
    },
  }
}

/** Formal policy cannot be disabled by Railway's old demo PHONE_GATE variable. */
export const phoneGate = (policy = RELEASE_POLICY) => policy.phoneEnabled

export async function isVerified(sql, idHash, policy = RELEASE_POLICY) {
  if (!phoneGate(policy)) return true
  const rows = await sql`select verified from card_accounts where id_hash = ${idHash}`
  return !!rows[0]?.verified
}
