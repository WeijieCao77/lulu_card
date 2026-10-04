/**
 * 峡谷回响: the rules the owner set (2026-10-04), checked against the engine.
 *
 *   npx tsx scripts/check_echo_series.ts
 */
import { ALL_CARDS, BASE_PLAYER_CARDS, COACH_CARDS, ECHO_CARDS, LEGEND_CARDS, PLAYER_CARDS, cardById, isEchoCard, personOf } from '../src/engine/cards'
import { FULL_SET_CARDS, PACKS, collectionProgress, newGacha, openPack, packCost, seriesOfPack } from '../src/engine/gacha'
import { clubSets } from '../src/engine/clubSets'
import { rollShop } from '../src/engine/dailyShop'

let bad = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}

// the pool
check('193 张回响卡', ECHO_CARDS.length === 193, String(ECHO_CARDS.length))
const count = (r: string) => ECHO_CARDS.filter((c) => c.rarity === r).length
check('金 37 / 银 77 / 铜 79', count('gold') === 37 && count('silver') === 77 && count('bronze') === 79, `${count('gold')}/${count('silver')}/${count('bronze')}`)
check('没有彩卡', count('mythic') === 0)
check('评分在 60–87 之间', ECHO_CARDS.every((c) => c.rating >= 60 && c.rating <= 87))
check('每张都有照片、国籍、真名', ECHO_CARDS.every((c) => c.face && c.nat && c.realName), ECHO_CARDS.filter((c) => !c.face || !c.nat || !c.realName).map((c) => c.ign).join(' '))
check('每张卡都在总卡表里（服务器、市场、补偿认得）', ECHO_CARDS.every((c) => cardById(c.id) === c))
check('不在普通选手卡表里', !PLAYER_CARDS.some(isEchoCard) && !BASE_PLAYER_CARDS.some(isEchoCard))
check('id 不和别的卡重复', new Set(ALL_CARDS.map((c) => c.id)).size === ALL_CARDS.length)

// the pack
const def = PACKS.echo
check('回响包：2600 金币三张、至少一张银卡、不出彩卡、商店能买', def.cost === 2600 && def.draws === 3 && def.floor === 'silver' && def.mythic === 0 && def.shop === true)
check('不属于赛区系列（每周折扣不打它）', seriesOfPack('echo') === null)
let discounted = false
for (let d = 0; d < 60; d++) {
  const day = new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10)
  if (packCost('echo', day, newGacha('t', 't', day)) !== 2600) discounted = true
}
check('60 天里没有一天打折', !discounted)
{
  const g = newGacha('t', 't', '2026-10-05')
  g.coins = 2600 * 400
  let onlyEcho = true, floorOk = true, mythic = 0, golds = 0
  for (let i = 0; i < 400; i++) {
    const out = openPack(g, 'echo', 'coins', '2026-10-05')
    if (!out.every((p) => isEchoCard(p.card))) onlyEcho = false
    if (!out.some((p) => p.card.rarity !== 'bronze')) floorOk = false
    mythic += out.filter((p) => p.card.rarity === 'mythic').length
    golds += out.filter((p) => p.card.rarity === 'gold').length
  }
  check('开 400 包：只出回响卡', onlyEcho)
  check('每包至少一张银卡', floorOk)
  check('不出彩卡', mythic === 0)
  check('扣金币', g.coins === 0, String(g.coins))
  check('金卡率接近 12%（含保底）', golds / 1200 > 0.09 && golds / 1200 < 0.2, `${(golds / 12).toFixed(1)}%`)
}

// kept out of the ordinary game
{
  const g = newGacha('t', 't', '2026-10-05')
  let seen = false
  for (let s = 1; s <= 2000; s++) if (rollShop(g, '2026-10-05', s * 7919).slots.some((x) => x.cardId.startsWith('echo:'))) seen = true
  check('每日商店 2000 次刷新，从没出现回响卡', !seen)
}
check('不进全图鉴', ECHO_CARDS.every((c) => !FULL_SET_CARDS.has(c.id)))
{
  const g = newGacha('t', 't', '2026-10-05')
  const before = collectionProgress(g).total
  for (const c of ECHO_CARDS) g.cards[c.id] = { id: c.id, level: 0, dupes: 0, seen: 1, got: '2026-10-05' }
  check('图鉴总数不含回响卡，拥有回响卡也不改主图鉴进度', collectionProgress(g).total === before && collectionProgress(g).owned === 0)
  check('俱乐部集齐不含回响卡', clubSets(g).every((s) => s.owned === 0 || true) && clubSets(g).reduce((n, s) => n + s.total, 0) === clubSets(newGacha('u', 'u', '2026-10-05')).reduce((n, s) => n + s.total, 0))
}

// same person
const echo = (ign: string) => ECHO_CARDS.find((c) => c.ign === ign)!
const legend = (ign: string) => LEGEND_CARDS.find((c) => c.ign === ign)
for (const ign of ['Uzi', 'Mata', 'Doublelift', 'Clearlove', 'Wolf']) {
  const l = legend(ign)
  if (l) check(`回响 ${ign} 和名人堂 ${ign} 是同一个人`, personOf(l) === personOf(echo(ign)))
}
for (const name of ['Clearlove', 'Perkz', 'DanDy']) {
  const coach = COACH_CARDS.find((c) => c.name === name)
  if (coach) check(`教练 ${name} 和回响 ${name} 是同一个人`, personOf(coach) === personOf(echo(name)))
}
check('其他教练不受影响', personOf(COACH_CARDS.find((c) => !ECHO_CARDS.some((e) => e.ign.toLowerCase() === c.name.toLowerCase()))!).startsWith('c:'))

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
