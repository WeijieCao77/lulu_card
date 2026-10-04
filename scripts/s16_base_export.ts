/**
 * S16 世界赛系列：把每位 S16 名单选手的普通卡（rating + attrs）导出给 scripts/s16_ratings.py 当先验。
 *
 *   npx tsx scripts/s16_base_export.ts
 *
 * 写 scripts/s16_base.json = { ign: { base, role, club, rating, attrs } }。
 * 只在名单（src/data/s16.json）或普通卡数值变了之后需要重跑。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_PLAYER_CARDS } from '../src/engine/cards'

const here = dirname(fileURLToPath(import.meta.url))
const roster = JSON.parse(readFileSync(join(here, '../src/data/s16.json'), 'utf8')) as {
  players: { ign: string; base: string; club: string; role: string }[]
}
const byId = new Map(BASE_PLAYER_CARDS.map((c) => [c.id, c]))

const out: Record<string, { base: string; role: string; club: string; rating: number; attrs: Record<string, number> }> = {}
const missing: string[] = []
for (const p of roster.players) {
  const card = byId.get(p.base)
  if (!card) {
    missing.push(`${p.ign} (${p.base})`)
    continue
  }
  out[p.ign] = { base: p.base, role: p.role, club: p.club, rating: card.rating, attrs: { ...card.attrs } }
}

writeFileSync(join(here, 's16_base.json'), JSON.stringify(out, null, 1) + '\n')
console.log(`s16_base.json: ${Object.keys(out).length} / ${roster.players.length} players`)
if (missing.length) {
  console.log(`missing ordinary card: ${missing.join(', ')}`)
  process.exitCode = 1
}
