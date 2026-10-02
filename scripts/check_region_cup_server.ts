/**
 * 地区杯 on the real card API: a registered five is kept, and the next account's draw finds it.
 *
 *   npx tsx scripts/check_region_cup_server.ts
 */
process.env.ENGINE_FROM_SOURCE = '1'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { makeSql } from '../pglite-sql.js'
import { newGacha } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { BASE_PLAYER_CARDS, COACH_CARDS, SQUAD_SLOTS, personOf } from '../src/engine/cards'
import type { Squad } from '../src/engine/cards'
import { regionOf } from '../src/engine/regionCup'

const { CARD_SCHEMA, REGION_CUP_SCHEMA, makeCardApi } = await import('../cards-api.js')
let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}
const db = new PGlite(), sql = makeSql(db)
await db.exec(CARD_SCHEMA + REGION_CUP_SCHEMA)
type Reply = { code: number; body: Record<string, any> }
const json = (res: Reply, code: number, body: Reply['body']) => { res.code = code; res.body = body }
const cards = makeCardApi(sql, { rateLimited: () => false, readBody: async (req: { body: string }) => req.body, json } as never)
const hash = (id: string) => createHash('sha256').update(id).digest('hex')
async function call(path: string, body: unknown) {
  const out: Reply = { code: 0, body: { ok: false } }
  await cards.route({ method: 'POST', body: JSON.stringify(body) } as never, out as never, path, 'region-test')
  return out.body
}
const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
function fiveOf(region: string): Squad {
  const list = BASE_PLAYER_CARDS.filter((c) => regionOf(c.nat) === region).sort((a, b) => b.rating - a.rating)
  const used = new Set<string>()
  const slots = SQUAD_SLOTS.map((slot) => { const p = list.find((c) => !used.has(personOf(c)) && c.roles.includes(slot)); if (p) used.add(personOf(p)); return p?.id ?? null })
  return { slots, coach: COACH_CARDS.find((c) => regionOf((c as { nat?: string }).nat) === region)?.id ?? null }
}
async function account(id: string, squad: Squad) {
  await call('/api/card/claim', { id, name: `地区${id.slice(-2)}` })
  const g: GachaState = newGacha(id, `地区${id.slice(-2)}`, today)
  for (const c of [...squad.slots, squad.coach]) if (c) g.cards[c] = { id: c, level: 0, dupes: 0, seen: 1, got: today }
  g.squad = structuredClone(squad)
  // the formal release plays only phone-bound accounts; these stand in for bound ones
  await sql`update card_accounts set state = ${sql.json(g)}, verified = now() where id_hash = ${hash(id)}`
}
try {
  const a = 'VM-REGN-REGN-REGN-REGN-RGA1', b = 'VM-REGN-REGN-REGN-REGN-RGB1'
  await account(a, fiveOf('tw'))
  await account(b, fiveOf('kr'))
  const r1 = await call('/api/card/act', { id: a, action: 'region_enter', args: {}, client: {} })
  check('中国台湾阵容报名成功', r1.ok, r1.why ?? '')
  await new Promise((r) => setTimeout(r, 50))
  const kept = await sql`select region, score from region_cup_entries where id_hash = ${hash(a)}`
  check('报名的阵容留下来了', kept.length === 1 && kept[0].region === 'tw', JSON.stringify(kept[0] ?? null))
  const r2 = await call('/api/card/act', { id: b, action: 'region_enter', args: {}, client: {} })
  check('韩国阵容报名成功', r2.ok, r2.why ?? '')
  const cup = r2.state?.regionCup
  const met = cup ? [...cup.path, ...cup.lowers].map((id: string) => cup.rivals[id]).filter((x: any) => !x.ai) : []
  check('第二个人抽到了第一个人的阵容', met.length === 1 && met[0].region === 'tw', met.map((x: any) => `${x.name} ${x.tag}`).join(' / ') || '一个都没抽到')
  let n = 0
  while (n < 12) {
    const p = await call('/api/card/act', { id: b, action: 'region_play', args: {}, client: {} })
    if (!p.ok) { check('每场都打得了', false, p.why); break }
    n++
    if (p.state?.regionCup?.done) break
  }
  check('在服务器上打得完', n > 0, `${n} 场`)
  const again = await call('/api/card/act', { id: b, action: 'region_enter', args: {}, client: {} })
  check('同一天第二次报名被拒绝', !again.ok, again.why ?? '')
} catch (err) {
  console.error(err)
  bad++
}
console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
