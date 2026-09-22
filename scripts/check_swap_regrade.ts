/**
 * 换卡稀有度回归: 验证不同稀有度或缺失卡片时换卡被拒且无资产损失。
 *   npx tsx scripts/check_swap_regrade.ts
 */
process.env.ENGINE_FROM_SOURCE = '1'
process.env.PHONE_GATE = '0'
process.env.TRADE_DAYS = '0'
process.env.TRADE_PULLS = '0'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { createHash } from 'node:crypto'
import { ALL_CARDS } from '../src/engine/cards'
import { STAMINA_COST, STAMINA_MAX } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'

const { CARD_SCHEMA, makeCardApi, normalizeId, battleCode } = await import('../cards-api.js')
const { makeMarketApi } = await import('../market-api.js')
const { displayName } = await import('../names.js')

const db = new PGlite()
const sql = makeSql(db)
await db.exec(CARD_SCHEMA)

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const hashOf = (id: string) => createHash('sha256').update(id).digest('hex')

import type { Card } from '../src/engine/cards'


interface Res { code: number; body: Record<string, unknown> }
const json = (res: Res, code: number, body: Record<string, unknown>) => { res.code = code; res.body = body }
const readBody = (req: { body: string }) => Promise.resolve(req.body)

const realEngine = await import('../src/engine/server.ts')
const overrides = new Map<string, Card | undefined>()
const fakeEngine = {
  ...realEngine,
  cardById(id: string) {
    return overrides.has(id) ? overrides.get(id) : realEngine.cardById(id)
  },
}

const cards = makeCardApi(sql, { rateLimited: () => false, readBody, json } as never)
const market = makeMarketApi(sql, {
  readBody, json, normalizeId, displayName, rateLimited: () => false, engine: fakeEngine as never, timer: false,
} as never)
async function call(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res: Res = { code: 0, body: {} }
  const api = path.startsWith('/api/market/') ? market : cards
  await api.route({ body: JSON.stringify(body), method: 'POST' } as never, res as never, path, 't')
  return res.body
}
const stored = async (id: string): Promise<GachaState> =>
  (await sql`select state from card_accounts where id_hash = ${hashOf(id)}` as unknown as { state: GachaState }[])[0].state
const inbox = async (id: string) =>
  ((await call('/api/card/act', { id, action: 'mail_take', args: {}, client: {} })).result as
    { mail: { kind: string; cardId: string | null; level: number }[] }).mail
const patch = async (id: string, path: string, value: unknown) =>
  sql`update card_accounts set state = jsonb_set(state, ${`{${path}}`}::text[], ${JSON.stringify(value)}::jsonb) where id_hash = ${hashOf(id)}`

const A = 'VM-AAAA-AAAA-AAAA-AAAA-AAAA'
const B = 'VM-BBBB-BBBB-BBBB-BBBB-BBBB'
const codeOf = (id: string) => battleCode(hashOf(id))

const silver = ALL_CARDS.filter((c) => c.rarity === 'silver' && c.kind === 'player').map((c) => c.id)
const owned = (id: string, level = 0, dupes = 0) => ({ id, level, dupes, seen: 1 + dupes, got: '2026-09-01' })

type GachaCards = Record<string, { id: string; level: number; dupes: number; seen: number; got: string }>
const cardsOf = async (id: string): Promise<GachaCards> => (await stored(id)).cards as GachaCards

try {
// 真实 API 创建账户并清空旧邮件
await call('/api/card/claim', { id: A, name: '甲' })
await call('/api/card/claim', { id: B, name: '乙' })
for (const id of [A, B]) {
  await inbox(id)
  await patch(id, 'daily', { ...(await stored(id)).daily, stamina: STAMINA_MAX, staminaAt: Date.now() })
}

const give = silver[0]
const want = silver[1]

// 每个 case 前重置覆盖并让双方各持有一张所需卡片
async function setup() {
  overrides.clear()
  for (const id of [A, B]) await inbox(id)
  await patch(A, 'cards', { [give]: owned(give, 2, 0) })
  await patch(B, 'cards', { [want]: owned(want, 3, 0) })
  for (const id of [A, B]) {
    await patch(id, 'daily', { ...(await stored(id)).daily, stamina: STAMINA_MAX, staminaAt: Date.now() })
    await patch(id, 'pulls', 999)
    await sql`update card_accounts set created = now() - interval '10 days' where id_hash = ${hashOf(id)}`
  }
  const made = await call('/api/market/swap', { id: A, code: codeOf(B), giveId: give, wantId: want })
  if (!(made.ok === true && typeof made.id === 'string')) throw new Error('发单失败: ' + JSON.stringify(made).slice(0, 80))
  const sw = String(made.id)
  const aCards = await cardsOf(A)
  check('发单后发起者不再持有 give', !(give in aCards), JSON.stringify(aCards))
  return sw
}

console.log('稀有度回归：')

// ---- 正常同色交换成功 ----
{
  const sw = await setup()
  const b0 = await stored(B)
  const r = await call('/api/market/swap_answer', { id: B, swap: sw, accept: true })
  check('正常同色接受成功', r.ok === true, JSON.stringify(r).slice(0, 80))
  const b1 = await stored(B)
  check('接受者扣了正确体力', b1.daily.stamina === b0.daily.stamina - STAMINA_COST.swap, `${b0.daily.stamina} → ${b1.daily.stamina}`)
  const am = await inbox(A)
  const bm = await inbox(B)
  const aCards = await cardsOf(A)
  const bCards = await cardsOf(B)
  check('发起者持有 want 且无 give', aCards[want]?.level === 3 && aCards[want]?.dupes === 0 && !(give in aCards), JSON.stringify(aCards))
  check('接受者持有 give 且无 want', bCards[give]?.level === 2 && bCards[give]?.dupes === 0 && !(want in bCards), JSON.stringify(bCards))
  check('发起者收到 want 交换通知', am.filter((m) => m.kind === 'swap_in' && m.cardId === want && m.level === 3).length === 1)
  check('接受者收到 give 交换通知', bm.filter((m) => m.kind === 'swap_in' && m.cardId === give && m.level === 2).length === 1)
}

// ---- 改色案例 ----
{
  const sw = await setup()
  const wantCard = realEngine.cardById(want)!
  overrides.set(want, { ...wantCard, rarity: 'gold' })
  const b0 = await stored(B)
  const beforeMail = await sql`select count(*)::int as n from card_mail where kind = 'swap_back' and card_id = ${give}`

  const [r1, r2] = await Promise.all([
    call('/api/market/swap_answer', { id: B, swap: sw, accept: true }),
    call('/api/market/swap_answer', { id: B, swap: sw, accept: true }),
  ])
  check('并发接受至少一个 rarity', r1.rarity === true || r2.rarity === true, JSON.stringify([r1, r2]))
  check('所有响应均不成功且无 undefined 键', [r1, r2].every((r) => r.ok !== true && (r.rarity === true || r.gone === true) && !('undefined' in r)), JSON.stringify([r1, r2]))
  check('其他并发响应为 gone', [r1, r2].some((r) => r.gone === true), JSON.stringify([r1, r2]))

  const st = await sql`select status from card_swaps where id = ${sw}::bigint`
  check('交换状态是 declined', st[0]?.status === 'declined', st[0]?.status)
  const b1 = await stored(B)
  check('接受者账号完全无变化', JSON.stringify(b0) === JSON.stringify(b1), 'deepEqual')

  const afterMail = await sql`select count(*)::int as n from card_mail where kind = 'swap_back' and card_id = ${give}`
  check('只新增一封退回邮件', afterMail[0].n === beforeMail[0].n + 1, `${beforeMail[0].n} → ${afterMail[0].n}`)

  const back = await inbox(A)
  check('发起者收到一张 level2 退回卡', back.filter((m) => m.kind === 'swap_back' && m.cardId === give && m.level === 2).length === 1, JSON.stringify(back))
  const backCards = await cardsOf(A)
  check('改色退信后发起者持有 give level2 dupes0', backCards[give]?.level === 2 && backCards[give]?.dupes === 0, JSON.stringify(backCards))

  const r3 = await call('/api/market/swap_answer', { id: B, swap: sw, accept: true })
  check('重复接受已关闭交换返回 gone', r3.ok === false && r3.gone === true, JSON.stringify(r3))
  const noBack = await inbox(A)
  check('重复领取无新退回', noBack.filter((m) => m.kind === 'swap_back' && m.cardId === give).length === 0, JSON.stringify(noBack))
  const finalMail = await sql`select count(*)::int as n from card_mail where kind = 'swap_back' and card_id = ${give}`
  check('退回邮件总数保持不变', finalMail[0].n === beforeMail[0].n + 1, `${beforeMail[0].n} → ${finalMail[0].n}`)
}

// ---- 缺失 want 卡案例 ----
{
  const sw = await setup()
  overrides.set(want, undefined)
  const b0 = await stored(B)
  const r = await call('/api/market/swap_answer', { id: B, swap: sw, accept: true })
  check('缺失 want 卡拒绝且返回 rarity', r.ok === false && r.rarity === true, JSON.stringify(r))
  const st = await sql`select status from card_swaps where id = ${sw}::bigint`
  check('缺失 want 卡交换状态是 declined', st[0]?.status === 'declined', st[0]?.status)
  const b1 = await stored(B)
  check('缺失 want 卡时接受者无变化', JSON.stringify(b0) === JSON.stringify(b1), 'deepEqual')
  const back = await inbox(A)
  check('缺失 want 卡时发起者收到退回 level2', back.some((m) => m.kind === 'swap_back' && m.cardId === give && m.level === 2), JSON.stringify(back))
  const backCards = await cardsOf(A)
  check('缺失 want 卡退信后发起者持有 give level2 dupes0', backCards[give]?.level === 2 && backCards[give]?.dupes === 0, JSON.stringify(backCards))
}

// ---- 缺失 give 卡案例 ----
{
  const sw = await setup()
  overrides.set(give, undefined)
  const b0 = await stored(B)
  const r = await call('/api/market/swap_answer', { id: B, swap: sw, accept: true })
  check('缺失 give 卡拒绝且返回 rarity', r.ok === false && r.rarity === true, JSON.stringify(r))
  const st = await sql`select status from card_swaps where id = ${sw}::bigint`
  check('缺失 give 卡交换状态是 declined', st[0]?.status === 'declined', st[0]?.status)
  const b1 = await stored(B)
  check('缺失 give 卡时接受者无变化', JSON.stringify(b0) === JSON.stringify(b1), 'deepEqual')
  const back = await inbox(A)
  check('缺失 give 卡时发起者收到退回 level2', back.some((m) => m.kind === 'swap_back' && m.cardId === give && m.level === 2), JSON.stringify(back))
  const backCards = await cardsOf(A)
  check('缺失 give 卡退信后发起者持有 give level2 dupes0', backCards[give]?.level === 2 && backCards[give]?.dupes === 0, JSON.stringify(backCards))
}

// ---- 无遗留 ----
{
  const open = await sql`select count(*)::int as n from card_swaps where status = 'open'`
  const lost = await sql`
    select s.id from card_swaps s
    where s.status in ('declined', 'cancelled', 'expired')
      and not exists (select 1 from card_mail m where m.kind = 'swap_back' and m.to_h = s.from_h and m.card_id = s.give_id)`
  check(`每个未成交换均已退卡（还挂着 ${open[0].n} 个）`, lost.length === 0, JSON.stringify(lost))
}

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
} finally {
  await db.close()
}
if (bad) throw new Error(`${bad} 处不对`)
