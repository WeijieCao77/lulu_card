/**
 * A phone behind every account. (2026-09-11)
 *
 *   npx tsx scripts/check_phone.ts
 *
 * 「太多人开小号了」: an account plays only after a mainland number has
 * answered a code, one number holds one account, and the same code lets a
 * player into the account the number holds. Codes are hashed, expire, allow
 * five tries; a number gets one code a minute. The dev sender (no Aliyun keys)
 * hands the code to the log and the admin route; the Aliyun request is
 * checked for its signature shape without sending.
 */
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { createHash, randomInt } from 'node:crypto'
import { CARD_SCHEMA, makeCardApi, normalizeId } from '../cards-api.js'
import { checkVerify, devCodes, devMode, encryptId, decryptId, isVerified, makePhoneApi, normalizePhone, phoneGate, sendVerify, smsConfigured, smsDailyCap } from '../phone-api.js'
import { RELEASE_POLICIES, RELEASE_POLICY } from '../release-policy.js'

process.env.PHONE_GATE = '0' // Regression: formal policy must ignore this old demo bypass.
// the harness decides the mode, not the machine it runs on: CI carries Railway's
// variables, a laptop may carry Aliyun keys
process.env.PHONE_SMS_DEV = '1'
for (const k of ['ALIYUN_SMS_ACCESS_KEY_ID', 'ALIYUN_SMS_ACCESS_KEY_SECRET', 'ALIYUN_SMS_SIGN_NAME']) delete process.env[k]
const db = new PGlite()
const sql = makeSql(db)
await db.exec(CARD_SCHEMA)
let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const rateHits = new Map<string, number>()
const rateLimited = (key: string, max = 60) => { const n = (rateHits.get(key) ?? 0) + 1; rateHits.set(key, n); return n > max }
const readBody = (req: { body: string }) => Promise.resolve(req.body)
interface Res { code: number; body: Record<string, unknown>; headersSent?: boolean; writeHead?: unknown }
const json = (res: Res, code: number, body: Record<string, unknown>) => { res.code = code; res.body = body }
const hash = (id: string) => createHash('sha256').update(String(id)).digest('hex')
const cards = makeCardApi(sql, { rateLimited, readBody, json } as never)
// A stand-in provider: the formal policy never makes local codes, so the harness plays Aliyun — it
// makes the code, keeps it for the checker, and leaves it in devCodes where every check below reads it.
const issued = new Map<string, string>()
const sender = async (p: string) => {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  issued.set(p, code)
  devCodes.unshift({ last4: p.slice(-4), code, at: new Date().toISOString() })
}
const checker = async (p: string, c: string) => issued.get(p) === c
const adminOpts = { token: 'tok', tokenFrom: (_r: unknown, u: URL) => u.searchParams.get('token'), tokenOk: (a: string, b: string) => a === b, enabled: true }
const phone = makePhoneApi(sql, { readBody, json, rateLimited, normalizeId, hash, ...adminOpts, sender, checker } as never)
/** the same API with no provider at all: what a formal server without SMS configured does */
const bare = makePhoneApi(sql, { readBody, json, rateLimited, normalizeId, hash, ...adminOpts } as never)
async function call(api: { route: (...a: never[]) => Promise<boolean> }, path: string, body: unknown, bucket = 'test', query = '', method?: string): Promise<Res> {
  const res: Res = { code: 0, body: {}, writeHead: () => ({ end: () => {} }) }
  const req = { body: JSON.stringify(body), method: method ?? (path === '/api/admin/verify' || !path.startsWith('/api/admin') ? 'POST' : 'GET') }
  await api.route(req as never, res as never, path as never, bucket as never, new URL(`http://x${path}?${query}`) as never)
  return res
}

// ---- numbers ----------------------------------------------------------
check('大陆号码通过', normalizePhone('138 0013 8000') === '13800138000')
check('+86 前缀去掉', normalizePhone('+8613800138000') === '13800138000')
check('固话、海外号拒绝', normalizePhone('02112345678') === null && normalizePhone('+12125551234') === null)
check('id 加密能解回来', decryptId(encryptId('VM-ABCD-EFGH-JKMN-PQRS-TVWX')) === 'VM-ABCD-EFGH-JKMN-PQRS-TVWX')

// ---- a new account cannot play until bound ---------------------------
const ID = 'VM-ABCD-EFGH-JKMN-PQRS-TVWX'
let r = await call(cards, '/api/card/claim', { id: ID, name: '点点' })
check('新账号能建', r.body.ok === true)
r = await call(cards, '/api/card/load', { id: ID })
check('正式策略下新账号不能游玩，即使旧 PHONE_GATE=0', phoneGate(RELEASE_POLICIES.production) && !(await isVerified(sql, hash(ID), RELEASE_POLICIES.production)))
const state = (r.body.state as Record<string, unknown>)
r = await call(cards, '/api/card/act', { id: ID, action: 'checkin', client: state })
check('正式策略下未绑手机的账号被拦', r.body.ok === false && r.body.unverified === true, String(r.body.why))

// ---- send, bind ---------------------------------------------------------
r = await call(phone, '/api/card/phone/send', { phone: '13800138000', id: ID })
check('发码成功，验证码不在本地生成', r.body.ok === true && r.body.dev === false, JSON.stringify(r.body))
const code = devCodes[0].code
check('验证码是六位数字', /^\d{6}$/.test(code))
r = await call(phone, '/api/card/phone/send', { phone: '13800138000', id: ID })
check('一分钟内不能再发', r.body.ok === false && typeof r.body.wait === 'number', String(r.body.why))
r = await call(phone, '/api/card/phone/bind', { id: ID, phone: '13800138000', code: '000000' })
check('错码拒绝', r.body.ok === false && String(r.body.why).includes('不对'))
r = await call(phone, '/api/card/phone/bind', { id: ID, phone: '13800138000', code })
check('对码绑定', r.body.ok === true && r.body.phone === '8000', JSON.stringify(r.body))
r = await call(cards, '/api/card/load', { id: ID })
check('load 说绑了、尾号 8000', r.body.verified === true && r.body.phone === '8000')
r = await call(cards, '/api/card/act', { id: ID, action: 'checkin', client: r.body.state })
check('正式策略下绑完可以游玩', await isVerified(sql, hash(ID), RELEASE_POLICIES.production))
r = await call(phone, '/api/card/phone/bind', { id: ID, phone: '13800138000', code })
check('用过的码作废', r.body.ok === false)

// ---- one number, one account --------------------------------------------
const ID2 = 'VM-2222-2222-2222-2222-2222'
await call(cards, '/api/card/claim', { id: ID2, name: '小号' })
rateHits.clear()
await sql`delete from card_sms`
const sentBefore = devCodes.length
r = await call(phone, '/api/card/phone/send', { phone: '13800138000', for: 'bind', id: ID2 }, 'other')
check('用过的号给第二个账号发码：直接拒，不发', r.body.ok === false && r.body.taken === true && devCodes.length === sentBefore, String(r.body.why))
r = await call(phone, '/api/card/phone/send', { phone: '13800138000' }, 'other')
check('不带账号也一样拒', r.body.ok === false && r.body.taken === true && devCodes.length === sentBefore, String(r.body.why))
r = await call(phone, '/api/card/phone/bind', { id: ID2, phone: '13800138000', code: '123456' })
check('同一个号绑第二个账号被拒', r.body.ok === false && r.body.taken === true, String(r.body.why))
r = await call(phone, '/api/card/phone/send', { phone: '13900139000', for: 'bind', id: ID }, 'other2')
check('绑过的账号给第二个号发码：直接拒，不发', r.body.ok === false && r.body.bound === true && devCodes.length === sentBefore, String(r.body.why))
r = await call(phone, '/api/card/phone/send', { phone: '13900139000', id: ID2 }, 'other2')
const code3 = devCodes[0].code
r = await call(phone, '/api/card/phone/bind', { id: ID, phone: '13900139000', code: code3 })
check('一个账号不能绑第二个号', r.body.ok === false && r.body.bound === true, String(r.body.why))

// ---- walking into the account a number holds -----------------------------
await sql`delete from card_sms`
r = await call(phone, '/api/card/phone/send', { phone: '13900139000', for: 'login' }, 'login0')
check('没绑过的号要登录：直接拒，不发', r.body.ok === false && r.body.none === true, String(r.body.why))
r = await call(phone, '/api/card/phone/send', { phone: '13800138000', for: 'login' }, 'login')
check('绑过的号要登录：发', r.body.ok === true, String(r.body.why))
const code4 = devCodes[0].code
r = await call(phone, '/api/card/phone/login', { phone: '13800138000', code: code4 })
check('用手机号进入拿回账号 id', r.body.ok === true && r.body.id === ID, JSON.stringify(r.body))
r = await call(phone, '/api/card/phone/login', { phone: '13900139000', code: '123456' })
check('没绑过的号说没绑过', r.body.ok === false && r.body.none === true)

// ---- five tries, then a fresh code --------------------------------------
await sql`delete from card_sms`
const ID3 = 'VM-3333-3333-3333-3333-3333'
await call(cards, '/api/card/claim', { id: ID3, name: '试错' })
await call(phone, '/api/card/phone/send', { phone: '13700137000', id: ID3 }, 'tries')
let last: Res = { code: 0, body: {} }
for (let i = 0; i < 6; i++) last = await call(phone, '/api/card/phone/bind', { id: ID3, phone: '13700137000', code: '111111' }, `t${i}`)
check('五次之后要重新发', String(last.body.why).includes('重新发'))

// ---- the owner verifies by hand --------------------------------------------
const ID4 = 'VM-4444-4444-4444-4444-4444'
await call(cards, '/api/card/claim', { id: ID4, name: '海外' })
r = await call(phone, '/api/admin/verify', {}, 'admin', `token=tok&code=${hash(ID4).slice(0, 8)}&via=douyin:abc`)
check('后台按对战码手工验证', r.body.ok === true && r.body.matched === 1, JSON.stringify(r.body))
r = await call(cards, '/api/card/load', { id: ID4 })
check('手工验证后能玩、没有手机', r.body.verified === true && r.body.phone === null)
r = await call(phone, '/api/admin/review', {}, 'admin', `token=tok&code=${hash(ID4).slice(0, 8)}`)
check('审核台按对战码看状态：人工、来源', r.body.ok === true && r.body.account?.via === 'manual:douyin:abc' && r.body.account?.last4 == null, JSON.stringify(r.body))
r = await call(phone, '/api/admin/review', {}, 'admin', `token=tok&code=${hash(ID).slice(0, 8)}`)
check('绑过手机的显示尾号、来源 sms', r.body.account?.last4 === '8000' && r.body.account?.via === 'sms', JSON.stringify(r.body.account))
// 进不了门的人看不到对战码，只有建号时记下的 ID：审核台也收 ID，走 POST 正文
r = await call(phone, '/api/admin/review', { id: ID4 }, 'admin', 'token=tok', 'POST')
check('审核台按 ID 查到同一个账号，只回对战码', r.body.ok === true && r.body.account?.code === hash(ID4).slice(0, 8)
  && r.body.account?.via === 'manual:douyin:abc' && !JSON.stringify(r.body).includes(ID4), JSON.stringify(r.body))
r = await call(phone, '/api/admin/review', { id: ' vm-4444 4444-4444-4444-4444 ' }, 'admin', 'token=tok', 'POST')
check('ID 大小写、空格、少横杠都认', r.body.account?.code === hash(ID4).slice(0, 8), JSON.stringify(r.body))
r = await call(phone, '/api/admin/review', { id: 'VM-4444-4444' }, 'admin', 'token=tok', 'POST')
check('ID 不全就说格式不对', r.body.ok === false && String(r.body.why).includes('格式'), JSON.stringify(r.body))
r = await call(phone, '/api/admin/review', {}, 'admin', `token=tok&id=${ID4}`)
check('ID 放在网址里不认', r.body.account === undefined, JSON.stringify(r.body).slice(0, 80))
r = await call(phone, '/api/admin/review', { id: ID4 }, 'admin', 'token=wrong', 'POST')
check('没有口令按 ID 也查不到', r.code === 0 || r.code === 404)
r = await call(phone, '/api/admin/review', {}, 'admin', 'token=tok')
check('审核台列表：人工名单、门口名单、合计', r.body.ok === true
  && r.body.manual.some((a: { code: string }) => a.code === hash(ID4).slice(0, 8))
  && r.body.pending.some((a: { code: string }) => a.code === hash(ID3).slice(0, 8))
  && !r.body.pending.some((a: { code: string }) => a.code === hash(ID).slice(0, 8))
  && r.body.totals.manual === 1 && r.body.totals.unverified >= 2, JSON.stringify(r.body.totals))
check('审核台不见号码', !JSON.stringify(r.body).includes('13800138000'))
r = await call(phone, '/api/admin/verify', {}, 'admin', `token=tok&code=${hash(ID).slice(0, 8)}&undo=1`)
check('撤销不动用验证码绑过的账号', r.body.ok === false && r.body.matched === 0)
r = await call(phone, '/api/admin/verify', {}, 'admin', `token=tok&code=${hash(ID4).slice(0, 8)}&undo=1`)
check('撤销人工通过', r.body.ok === true && r.body.undone === true)
r = await call(cards, '/api/card/load', { id: ID4 })
check('撤销后正式策略回到门口', !(await isVerified(sql, hash(ID4), RELEASE_POLICIES.production)))
r = await call(cards, '/api/card/act', { id: ID4, action: 'checkin', client: r.body.state })
check('正式策略下撤回后受限', !(await isVerified(sql, hash(ID4), RELEASE_POLICIES.production)))
// 拿小号来人工审核的：撤回的号留着当时的备注，再来一查就认得出
r = await call(phone, '/api/admin/review', {}, 'admin', `token=tok&code=${hash(ID4).slice(0, 8)}`)
check('撤回的号留着当时的备注', r.body.account?.via === 'revoked:douyin:abc' && r.body.account?.verified == null, JSON.stringify(r.body.account))
r = await call(phone, '/api/admin/review', {}, 'admin', 'token=tok')
check('撤回过的单列一份，不在人工名单也不在门口名单', r.body.revoked?.some((a: { code: string; via: string }) => a.code === hash(ID4).slice(0, 8) && a.via === 'revoked:douyin:abc')
  && !r.body.manual.some((a: { code: string }) => a.code === hash(ID4).slice(0, 8))
  && !r.body.pending.some((a: { code: string }) => a.code === hash(ID4).slice(0, 8))
  && r.body.totals.revoked === 1 && r.body.totals.manual === 0, JSON.stringify(r.body.totals))
r = await call(phone, '/api/admin/verify', {}, 'admin', `token=tok&code=${hash(ID4).slice(0, 8)}&undo=1`)
check('撤回过的不会再撤一次', r.body.ok === false && r.body.matched === 0)
r = await call(phone, '/api/admin/verify', {}, 'admin', `token=tok&code=${hash(ID4).slice(0, 8)}&via=douyin:again`)
r = await call(phone, '/api/admin/review', {}, 'admin', `token=tok&code=${hash(ID4).slice(0, 8)}`)
check('撤回过的还能再放行，备注换成新的', !!r.body.account?.verified && r.body.account?.via === 'manual:douyin:again', JSON.stringify(r.body.account))
{
  // 撤回之后自己绑了手机：来源记成 sms，不再挂着撤回
  const ID6 = 'VM-6666-6666-6666-6666-6666'
  await call(cards, '/api/card/claim', { id: ID6, name: '撤了又绑' })
  const c6 = hash(ID6).slice(0, 8)
  await call(phone, '/api/admin/verify', {}, 'admin', `token=tok&code=${c6}&via=douyin:alt`)
  await call(phone, '/api/admin/verify', {}, 'admin', `token=tok&code=${c6}&undo=1`)
  await call(phone, '/api/card/phone/send', { phone: '13500135000', for: 'bind', id: ID6 }, 'r6')
  r = await call(phone, '/api/card/phone/bind', { id: ID6, phone: '13500135000', code: devCodes[0].code }, 'r6')
  check('撤回后能自己绑手机', r.body.ok === true, JSON.stringify(r.body))
  r = await call(phone, '/api/admin/review', {}, 'admin', `token=tok&code=${c6}`)
  check('绑上之后来源是 sms', r.body.account?.via === 'sms' && r.body.account?.last4 === '5000', JSON.stringify(r.body.account))
}
{
  // 对战码只是 ID 哈希的前八位，ID 由客户端选：能刷出一串同码的小号。人工通过只认唯一的一个号
  const twins = ['ab12cd34' + '0'.repeat(56), 'ab12cd34' + '1'.repeat(56)]
  for (const h of twins) await sql`insert into card_accounts (id_hash, state) values (${h}, '{}')`
  r = await call(phone, '/api/admin/verify', {}, 'admin', 'token=tok&code=ab12cd34&via=douyin:twin')
  const [{ n }] = await sql`select count(*)::int as n from card_accounts where left(id_hash, 8) = 'ab12cd34' and verified is not null`
  check('同一个对战码对上多个账号：一个都不放行', r.body.ok === false && r.body.clash === true && n === 0, JSON.stringify(r.body))
  r = await call(phone, '/api/admin/verify', {}, 'admin', 'token=tok&code=ab12cd34&undo=1')
  check('撤回也一样拒绝', r.body.ok === false && r.body.clash === true)
}
r = await call(phone, '/api/admin/verify', {}, 'admin', `token=wrong&code=${hash(ID4).slice(0, 8)}`)
check('没有口令看不到后台路由', r.code === 0 || r.code === 404)
r = await call(phone, '/api/admin/verify', {}, 'admin', `token=tok&code=${hash(ID4).slice(0, 8)}`, 'GET')
check('后台人工验证必须 POST', r.code === 405)
r = await call(phone, '/api/admin/review', {}, 'admin', `token=wrong`)
check('没有口令看不到审核台', r.code === 0 || r.code === 404)
r = await call(phone, '/api/admin/sms', {}, 'admin', 'token=tok')
check('后台能看开发模式的验证码', r.body.ok === true && Array.isArray(r.body.codes))
check('后台能看发码与绑定的数量，不见号码', r.body.stats && r.body.stats.sent24 >= 1 && r.body.stats.bound >= 1 && !JSON.stringify(r.body.stats).includes('138'))

// ---- the SMS budget: bind codes need an account, per account and per day ----
{
  let cap = 1_000
  const budget = makePhoneApi(sql, { readBody, json, rateLimited: () => false, normalizeId, hash, token: 'tok', tokenFrom: (_r: unknown, u: URL) => u.searchParams.get('token'), tokenOk: (a: string, b: string) => a === b, enabled: true, dailyCap: () => cap, sender, checker } as never)
  await sql`delete from card_sms`
  const before = devCodes.length
  let r = await call(budget, '/api/card/phone/send', { phone: '13100131000', for: 'bind' }, 'b0')
  check('不带账号的绑定发码直接拒，不发', r.body.ok === false && r.body.noAccount === true && devCodes.length === before, JSON.stringify(r.body))
  r = await call(budget, '/api/card/phone/send', { phone: '13100131000', for: 'bind', id: 'VM-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ' }, 'b0')
  check('不存在的账号也拒，不发', r.body.ok === false && r.body.noAccount === true && devCodes.length === before, JSON.stringify(r.body))
  r = await call(budget, '/api/card/phone/send', { phone: '13100131000', for: 'bind', id: 'not-an-id' }, 'b0')
  check('格式不对的账号也拒', r.body.ok === false && r.body.noAccount === true && devCodes.length === before)
  const ID7 = 'VM-7777-7777-7777-7777-7777'
  await call(cards, '/api/card/claim', { id: ID7, name: '换号狂' })
  let sentOk = 0
  for (let i = 0; i < 6; i++) {
    r = await call(budget, '/api/card/phone/send', { phone: `1310013100${i}`, for: 'bind', id: ID7 }, `b${i}`)
    if (r.body.ok) sentOk++
  }
  check('一个账号一天最多给 5 个号发绑定码', sentOk === 5 && r.body.ok === false && String(r.body.why).includes('账号今天'), JSON.stringify(r.body))
  await sql`delete from card_sms`
  cap = 2
  const ID8 = 'VM-8888-8888-8888-8888-8888'
  await call(cards, '/api/card/claim', { id: ID8, name: '预算' })
  const a = await call(budget, '/api/card/phone/send', { phone: '13200132001', for: 'bind', id: ID8 }, 'c1')
  const b = await call(budget, '/api/card/phone/send', { phone: '13200132002', for: 'bind', id: ID7 }, 'c2')
  const n = devCodes.length
  r = await call(budget, '/api/card/phone/send', { phone: '13800138000', for: 'login' }, 'c3')
  check('全站每日上限到了就停发，找回也停', a.body.ok === true && b.body.ok === true && r.body.ok === false && r.body.capped === true && devCodes.length === n, JSON.stringify(r.body))
  await sql`delete from card_sms`
  cap = 0
  r = await call(budget, '/api/card/phone/send', { phone: '13800138000', for: 'login' }, 'c4')
  check('上限设 0 立即停发', r.body.ok === false && r.body.capped === true)
  cap = 1
  const burst = await Promise.all(['13200132011', '13200132012', '13200132013', '13200132014'].map((p, i) =>
    call(budget, '/api/card/phone/send', { phone: p, for: 'bind', id: [ID7, ID8, ID3, ID2][i] }, `burst${i}`)))
  const [{ n: rows }] = await sql`select count(*)::int as n from card_sms`
  check('并发给不同号码发码也不超出全站上限', burst.filter((x) => x.body.ok).length === 1 && rows === 1, JSON.stringify(burst.map((x) => x.body.ok)))
  r = await call(budget, '/api/admin/sms', {}, 'admin', 'token=tok')
  check('后台显示当天上限', r.body.stats?.cap === 1)
  check('SMS_DAILY_CAP 解析：缺省 2000，0 表示停发，乱填回缺省', smsDailyCap({}) === 2000 && smsDailyCap({ SMS_DAILY_CAP: '0' }) === 0
    && smsDailyCap({ SMS_DAILY_CAP: '300' }) === 300 && smsDailyCap({ SMS_DAILY_CAP: '-5' }) === 2000 && smsDailyCap({ SMS_DAILY_CAP: 'abc' }) === 2000)
  await sql`delete from card_sms`
}

// Even an accidentally retained PHONE_SMS_DEV=1 cannot issue local codes on a
// formal server without a configured provider.
{
  const before = devCodes.length
  const oldNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const noProvider = await call(bare, '/api/card/phone/send', { phone: '13300133000', id: ID3 }, 'formal-no-provider')
  check('正式环境短信缺配置失败关闭，不产开发码', noProvider.body.ok === false && devCodes.length === before)
  if (oldNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = oldNodeEnv
}

// ---- the Aliyun 号码认证 requests, without sending ---------------------------
{
  const seen: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: string) => {
    seen.push(String(url))
    const u = new URL(String(url))
    return { status: 200, json: async () => (u.searchParams.get('Action') === 'CheckSmsVerifyCode' ? { Code: 'OK', Model: { VerifyResult: 'PASS' } } : { Code: 'OK' }) }
  }) as never
  const env = { ALIYUN_SMS_ACCESS_KEY_ID: 'AK', ALIYUN_SMS_ACCESS_KEY_SECRET: 'SK', ALIYUN_SMS_SIGN_NAME: '控制台现行签名', ALIYUN_SMS_TEMPLATE_CODE: '100009' }
  check('四个变量齐了才算配置好', smsConfigured(env) && !smsConfigured({ ...env, ALIYUN_SMS_TEMPLATE_CODE: '' }))
  check('正式环境无法启用开发码', !devMode({ RAILWAY_ENVIRONMENT: 'production', PHONE_SMS_DEV: '1' }) && !devMode({ NODE_ENV: 'production', PHONE_SMS_DEV: '1' })
    // local codes are a demo-only convenience: under the formal policy not even a laptop makes them
    && devMode({ PHONE_SMS_DEV: '1' }) === !RELEASE_POLICY.phoneEnabled)
  const ok = await sendVerify('13800138000', env)
  const u = new URL(seen[0])
  check('SendSmsVerifyCode 走号码认证接口、带齐参数', ok && u.hostname === 'dypnsapi.aliyuncs.com' && u.searchParams.get('Action') === 'SendSmsVerifyCode'
    && u.searchParams.get('PhoneNumber') === '13800138000' && u.searchParams.get('SignName') === '控制台现行签名'
    && u.searchParams.get('TemplateCode') === '100009' && u.searchParams.get('TemplateParam') === '{"code":"##code##","min":"5"}'
    && u.searchParams.get('ValidTime') === '300' && u.searchParams.get('CodeLength') === '6'
    && u.searchParams.get('CodeType') === '1' && u.searchParams.get('ReturnVerifyCode') === 'false'
    && u.searchParams.get('Version') === '2017-05-25' && !!u.searchParams.get('Signature'), u.search.slice(0, 120))
  const pass = await checkVerify('13800138000', '123456', env)
  const c = new URL(seen[1])
  check('CheckSmsVerifyCode 由阿里云判定', pass && c.searchParams.get('Action') === 'CheckSmsVerifyCode' && c.searchParams.get('VerifyCode') === '123456')
  globalThis.fetch = realFetch
}

// ---- with the sender and checker injected, the account flow is the same ----
{
  const sent: string[] = []
  const inj = makePhoneApi(sql, { readBody, json, rateLimited, normalizeId, hash, token: 'tok', tokenFrom: (_r: unknown, u: URL) => u.searchParams.get('token'), tokenOk: (a: string, b: string) => a === b, enabled: true,
    sender: async (p: string) => { sent.push(p) }, checker: async (_p: string, c: string) => c === '424242' } as never)
  const ID5 = 'VM-5555-5555-5555-5555-5555'
  await call(cards, '/api/card/claim', { id: ID5, name: '真短信' })
  await sql`delete from card_sms`
  let r = await call(inj, '/api/card/phone/send', { phone: '13600136000', id: ID5 }, 'inj')
  check('配置好时验证码不在本地生成', r.body.ok === true && r.body.dev === false && sent[0] === '13600136000' && devCodes.every((d) => d.last4 !== '6000'))
  r = await call(inj, '/api/card/phone/bind', { id: ID5, phone: '13600136000', code: '000000' }, 'inj')
  check('阿里云说不对就不对', r.body.ok === false)
  r = await call(inj, '/api/card/phone/bind', { id: ID5, phone: '13600136000', code: '424242' }, 'inj')
  check('阿里云说通过就绑上', r.body.ok === true && r.body.phone === '6000', JSON.stringify(r.body))
}

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
