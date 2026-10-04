/**
 * Removed cards (cards.ts REMOVED_CARDS): not dealt, not in the catalogue, gone from a save on load.
 *
 *   npx tsx scripts/check_removed_cards.ts
 */
import { BASE_PLAYER_CARDS, REMOVED_CARDS, cardById } from '../src/engine/cards'
import { migrateGacha } from '../src/engine/gacha'

let bad = 0
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++ }
const keep = BASE_PLAYER_CARDS[0].id
check('naiyou 在移除名单里', REMOVED_CARDS.has('p:P58'))
check('卡池里没有 naiyou', !BASE_PLAYER_CARDS.some((c) => c.id === 'p:P58') && !cardById('p:P58'))
const row = (id: string) => ({ id, level: 3, dupes: 1, seen: 2 })
const save = migrateGacha({
  cards: { 'p:P58': row('p:P58'), [keep]: row(keep) },
  squad: { slots: ['p:P58', keep, null, null, null], coach: null },
  presets: [{ name: 'a', squad: { slots: [null, 'p:P58', null, null, null], coach: null } }],
  cupSquads: { 'open:free': { slots: [null, null, 'p:P58', null, null], coach: null } },
} as never, 'test')
check('存档里的 naiyou 被删掉', !save.cards['p:P58'] && !!save.cards[keep])
check('主阵容里清掉', save.squad.slots[0] === null && save.squad.slots[1] === keep)
check('预设阵容里清掉', save.presets![0].squad.slots[1] === null)
check('杯赛阵容里清掉', (save.cupSquads as Record<string, { slots: unknown[] }>)['open:free'].slots[2] === null)
check('补一个试训包', save.packs.scout === 1)
// the 峡谷回响 launch gift adds a letter of its own on the same load, so look for this one by its note
const naiyouMail = (s: typeof save) => (s.mail ?? []).filter((m) => m.note?.includes('naiyou'))
check('信箱里有一条说明', naiyouMail(save).length === 1 && naiyouMail(save)[0].seen === false)
const again = migrateGacha(save, 'test')
check('再加载不会重复补', again.packs.scout === 1 && naiyouMail(again).length === 1)
console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
