/**
 * 峡谷回响: the rules the owner set (2026-10-04), checked against the engine.
 *
 *   npx tsx scripts/check_echo_series.ts
 */
import { SQUAD_SLOTS, ALL_CARDS, BASE_PLAYER_CARDS, COACH_CARDS, ECHO_CARDS, LEGEND_CARDS, PLAYER_CARDS, cardById, isEchoCard, personOf } from '../src/engine/cards'
import { FULL_SET_CARDS, PACKS, collectionProgress, newGacha, openPack, packCost, seriesOfPack } from '../src/engine/gacha'
import { clubSets } from '../src/engine/clubSets'
import { rollShop } from '../src/engine/dailyShop'
import { echoSetProgress, mergeClientFields, migrateGacha } from '../src/engine/gacha'
import { matchesFilter, readFilter } from '../src/engine/cardFilter'
import { clubsIn } from '../src/ui/cards/Filters'
import { chemistry } from '../src/engine/cards'
import { runAction, squadForPlay } from '../src/engine/cardActions'
import { ECHO_QUIZ } from '../echo-quiz.js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
check('至少 189 人有生日，年龄按生日算（Uzi 1997-04-05）', ECHO_CARDS.filter((c) => c.echo!.birth).length >= 189 && ECHO_CARDS.find((c) => c.ign === 'Uzi')!.age === new Date().getFullYear() - 1997 - (new Date() < new Date(new Date().getFullYear(), 3, 5) ? 1 : 0))
check('没生日的不显示 0 岁', ECHO_CARDS.filter((c) => !c.echo!.birth).every((c) => c.ageEstimated))
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

// 峡谷回响问答: once, five questions, a 回响包 per right answer, answers only on the server
{
  const bank = ECHO_QUIZ as { id: string; q: string; options: string[]; answer: number }[]
  check('题库至少 5 题，每题 4 个选项、答案在范围内、id 不重复', bank.length >= 5 && bank.every((q) => q.options.length === 4 && q.answer >= 0 && q.answer < 4) && new Set(bank.map((q) => q.id)).size === bank.length, String(bank.length))
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)])
  check('src/ 里没有任何文件引用题库（答案不进浏览器）', !walk('src').some((f) => /(from\s+|import\(\s*)['"][^'"]*echo-quiz(\.js)?['"]/.test(readFileSync(f, 'utf8'))))
  const day = '2026-10-10'
  const env = (seed: number) => ({ now: Date.parse(day), today: day, seed, echoQuiz: bank })
  const g = newGacha('quiz', 'quiz', day)
  check('没有题库时打不开', !runAction(g, 'echo_quiz', {}, { now: 0, today: day, seed: 1 }).ok)
  const r = runAction(g, 'echo_quiz', {}, env(7)) as { ok: true; result: { questions: { q: string; options: string[]; right: number | null }[] } }
  const qs = r.result.questions
  check('一次 5 道题，未作答时不给答案', qs.length === 5 && qs.every((q) => q.right === null && q.options.length === 4))
  const again = runAction(g, 'echo_quiz', {}, env(99)) as typeof r
  check('再打开还是同一套题', JSON.stringify(again.result.questions) === JSON.stringify(qs))
  const before = g.packs.echo ?? 0
  const slotOf = (i: number) => { const q = bank.find((x) => x.id === g.echoQuiz!.ids[i])!; return g.echoQuiz!.order[i].indexOf(q.answer) }
  const right0 = runAction(g, 'echo_quiz_answer', { i: 0, pick: slotOf(0) }, env(1)) as { ok: true; result: { correct: boolean } }
  check('答对送 1 个回响包', right0.ok && right0.result.correct && (g.packs.echo ?? 0) === before + 1)
  check('同一题不能再答', !runAction(g, 'echo_quiz_answer', { i: 0, pick: slotOf(0) }, env(1)).ok)
  const wrong1 = runAction(g, 'echo_quiz_answer', { i: 1, pick: (slotOf(1) + 1) % 4 }, env(1)) as typeof right0
  check('答错不送', wrong1.ok && !wrong1.result.correct && (g.packs.echo ?? 0) === before + 1)
  for (const i of [2, 3, 4]) runAction(g, 'echo_quiz_answer', { i, pick: slotOf(i) }, env(1))
  check('五题答完共送 4 包，记录 won=4', (g.packs.echo ?? 0) === before + 4 && g.echoQuiz!.won === 4)
  const kept = migrateGacha(JSON.parse(JSON.stringify(g)), 'quiz')
  check('存档迁移后问答记录还在（不能重答）', !!kept.echoQuiz && kept.echoQuiz.picks.every((p) => p !== null))
  const forged = mergeClientFields(migrateGacha(JSON.parse(JSON.stringify(newGacha('q2', 'q2', day))), 'q2'), { echoQuiz: g.echoQuiz, packs: { echo: 99 } } as never)
  check('客户端改不了问答和卡包（只有上线赠送的 1 包）', !forged.echoQuiz && (forged.packs.echo ?? 0) === 1)
  check('选项顺序每人打乱', new Set(Array.from({ length: 20 }, (_, k) => { const x = newGacha('s' + k, 's' + k, day); runAction(x, 'echo_quiz', {}, env(k * 31 + 5)); return x.echoQuiz!.order.map((o) => o.join('')).join('|') })).size > 15)
}

// 每日老将问答: one a day, a 回响试训包 for a right answer, never a question the account has seen
{
  const bank = ECHO_QUIZ as { id: string; q: string; options: string[]; answer: number }[]
  check('题库 100 题', bank.length === 100, String(bank.length))
  const g = migrateGacha(JSON.parse(JSON.stringify(newGacha('daily', 'daily', '2026-10-10'))), 'daily')
  const at = (d: number) => { const day = new Date(Date.UTC(2026, 9, 10 + d)).toISOString().slice(0, 10); return { now: Date.parse(day), today: day, seed: d + 1, echoQuiz: bank } }
  runAction(g, 'echo_quiz', {}, at(0))
  const launch = new Set(g.echoQuiz!.ids)
  const asked: string[] = []
  let paid = 0, exhausted = false
  for (let d = 0; d < 120; d++) {
    const r = runAction(g, 'echo_daily', {}, at(d)) as { ok: true; result: { daily: { right: number | null } | null; exhausted?: boolean } }
    if (!r.ok) break
    if (!r.result.daily) { exhausted = true; break }
    if (d === 0) {
      const again = runAction(g, 'echo_daily', {}, at(0)) as typeof r
      check('同一天再打开还是同一题', g.echoDaily!.id === g.echoDaily!.seen.at(-1) && again.ok && JSON.stringify(again.result.daily) === JSON.stringify(r.result.daily))
      check('作答前不给答案', r.result.daily.right === null)
    }
    asked.push(g.echoDaily!.id)
    const q = bank.find((x) => x.id === g.echoDaily!.id)!
    const slot = g.echoDaily!.order.indexOf(q.answer)
    const before = g.packs.echoScout ?? 0
    const ans = runAction(g, 'echo_daily_answer', { pick: d % 3 === 0 ? (slot + 1) % 4 : slot }, at(d)) as { ok: true; result: { correct: boolean } }
    if (ans.ok && ans.result.correct) { paid++; if ((g.packs.echoScout ?? 0) !== before + 1) check('答对送回响试训包', false) }
    if (d === 0) check('一天只能答一次', !runAction(g, 'echo_daily_answer', { pick: slot }, at(0)).ok)
  }
  check('每天的题从不重复', new Set(asked).size === asked.length, `${asked.length} 题`)
  check('不出上线活动那五题', asked.every((id) => !launch.has(id)))
  check('题答完会提示，不会重复出题', exhausted && asked.length === 95, `${asked.length}`)
  check('答对的天数 = 回响试训包数', (g.packs.echoScout ?? 0) === paid && g.echoDaily!.won === paid)
  const kept = migrateGacha(JSON.parse(JSON.stringify(g)), 'daily')
  check('读档后出过的题还记得', kept.echoDaily!.seen.length === 95)
  const forged = mergeClientFields(kept, { echoDaily: undefined, packs: { echoScout: 50 } } as never)
  check('客户端改不了每日题和回响试训包', !!forged.echoDaily && (forged.packs.echoScout ?? 0) === paid)
  const one = openPack(g, 'echoScout', 'pack', '2026-10-10')
  check('回响试训包开出 1 张回响卡', one.length === 1 && isEchoCard(one[0].card))
}

// 上线赠礼: one 回响包 per account, once, with an inbox line
{
  const day = '2026-10-10'
  const g = migrateGacha(JSON.parse(JSON.stringify(newGacha('gift', 'gift', day))), 'gift')
  check('每个账号送 1 个回响包，信箱有说明', (g.packs.echo ?? 0) === 1 && g.echoGift === 1 && !!g.mail?.[0]?.text.includes('峡谷回响包'))
  const again = migrateGacha(JSON.parse(JSON.stringify(g)), 'gift')
  check('只送一次（再次读档不重复）', (again.packs.echo ?? 0) === 1)
  const forged = mergeClientFields(again, { echoGift: undefined, echoSet: 4 } as never)
  check('客户端改不了赠礼和图鉴领取记录', forged.echoGift === 1 && !forged.echoSet)
}

// 峡谷回响图鉴: 49 / 97 / 145 / 193, owner's rewards
{
  const day = '2026-10-10'
  const g = migrateGacha(JSON.parse(JSON.stringify(newGacha('set', 'set', day))), 'set')
  const p0 = echoSetProgress(g)
  check('图鉴档位 49 / 97 / 145 / 193', p0.marks.join('/') === '49/97/145/193' && p0.total === 193, p0.marks.join('/'))
  const give = (n: number) => { for (const c of ECHO_CARDS.slice(0, n)) g.cards[c.id] ??= { level: 0, dupes: 0, got: 0 } as never }
  const day0 = { now: Date.parse(day), today: day, seed: 1 }
  give(48)
  check('48 张领不了', !runAction(g, 'echo_set', {}, day0).ok)
  give(49)
  let coins = g.coins
  check('49 张：+1500 金币', runAction(g, 'echo_set', {}, day0).ok && g.coins === coins + 1500 && g.echoSet === 1)
  check('同一档不能重复领', !runAction(g, 'echo_set', {}, day0).ok)
  give(145)
  coins = g.coins; const packs = g.packs.echo ?? 0
  check('一次补领 50%、75%：回响包 ×1，+5000 金币', runAction(g, 'echo_set', {}, day0).ok && g.coins === coins + 5000 && (g.packs.echo ?? 0) === packs + 1 && g.echoSet === 3)
  give(193)
  coins = g.coins; const ten = g.packs.ten ?? 0
  check('193 张：十连包 ×1，+10000 金币', runAction(g, 'echo_set', {}, day0).ok && g.coins === coins + 10000 && (g.packs.ten ?? 0) === ten + 1 && g.echoSet === 4)
  check('领完后不再有奖励', !runAction(g, 'echo_set', {}, day0).ok)
  check('回响图鉴不影响全图鉴进度', collectionProgress(g).total === collectionProgress(newGacha('x', 'x', day)).total)
}

// 回响卡就是普通的金银铜：能和普通卡混搭上阵、报名杯赛
{
  const day = '2026-10-10'
  const g = migrateGacha(JSON.parse(JSON.stringify(newGacha('mix', 'mix', day))), 'mix')
  const used = new Set<string>()
  const pick = (role: string, echoCard: boolean) => {
    const pool = echoCard ? ECHO_CARDS : BASE_PLAYER_CARDS
    const c = pool.find((x) => !used.has(personOf(x)) && (role === '辅助' || x.roles.includes(role as never)))!
    used.add(personOf(c))
    return c.id
  }
  const slots = SQUAD_SLOTS.map((role, i) => pick(role, i < 2))
  for (const id of slots) g.cards[id] = { id, level: 0, dupes: 0, seen: 1, got: day } as never
  g.squad = { slots, coach: null }
  g.coins = 100_000
  const ok = squadForPlay(g)
  check('两张回响卡 + 三张普通卡能组成阵容', ok.ok && ok.squad.slots.filter((x) => x && isEchoCard(cardById(x))).length === 2)
  const entered = runAction(g, 'cup_enter', {}, { now: Date.parse(day), today: day, seed: 3 })
  check('混搭阵容能报名杯赛，报名表里有回响卡', entered.ok && !!g.cup?.registration?.squad.slots.some((x) => x && isEchoCard(cardById(x))), entered.ok ? '' : entered.why)
  // and then actually PLAY: registration alone passed while every real match threw 「峡谷比赛需要双方各五名选手」 (500 in production, 2026-10-04)
  const played = runAction(g, 'cup_play', {}, { now: Date.parse(day), today: day, seed: 5 })
  check('混搭阵容能真的打杯赛（五人都上场）', played.ok && (played.result as { res: { lines: { cardId: string }[] } }).res.lines.filter((l) => slots.includes(l.cardId)).length === 5, played.ok ? '' : played.why)
  g.cup = null
  runAction(g, 'ladder_draw', {}, { now: Date.parse(day), today: day, seed: 6 })
  const ladder = runAction(g, 'ladder', {}, { now: Date.parse(day), today: day, seed: 7 })
  check('混搭阵容能打天梯', ladder.ok, ladder.ok ? '' : ladder.why)
  const echoUzi = ECHO_CARDS.find((c) => c.ign === 'Uzi')!, legendUzi = LEGEND_CARDS.find((c) => c.ign === 'Uzi')
  if (legendUzi) {
    g.cards[echoUzi.id] = { id: echoUzi.id, level: 0, dupes: 0, seen: 1, got: day } as never
    g.cards[legendUzi.id] = { id: legendUzi.id, level: 0, dupes: 0, seen: 1, got: day } as never
    g.squad = { slots: [echoUzi.id, legendUzi.id, ...slots.slice(2)], coach: null }
    check('同一个人（回响 Uzi + 名人堂 Uzi）不能同时上阵', !squadForPlay(g).ok)
  }
}

// 俱乐部（站长 2026-10-04）：还在或改名的挂现在的俱乐部；解散了的是历史俱乐部 H:TAG，人少也算一个俱乐部
{
  const club = (ign: string) => echo(ign).clubId
  check('每张回响卡都有俱乐部', ECHO_CARDS.every((c) => c.clubId && c.clubTag), ECHO_CARDS.filter((c) => !c.clubId).map((c) => c.ign).join(' '))
  check('Uzi、Letme、Ming、Mlxg 都是 RNG（历史俱乐部）', ['Uzi', 'Letme', 'Ming', 'Mlxg'].every((n) => club(n) === 'H:RNG'))
  check('Lwx、GimGoon 是 FPX', club('Lwx') === 'H:FPX' && club('GimGoon') === 'H:FPX')
  check('改名的跟到现在：DWG→DK、SKT→T1、Splyce→KOI、V5→NIP', club('Nuguri') === 'T17' && club('Huni') === 'T24' && club('Kold') === 'T29' && club('y4') === 'T8')
  check('代表战队解散的放回老俱乐部（站长 2026-10-04）：GimGoon→FPX、Karsa→闪电狼、Doublelift→CLG、Bjergsen→TSM', club('GimGoon') === 'H:FPX' && club('Karsa') === 'H:FW' && club('Doublelift') === 'H:CLG' && club('Bjergsen') === 'H:TSM')
  check('代表战队还在、挂的是别的现役队的先不动（待定）：Xerxe 仍是 GiantX', club('Xerxe') === 'T27')
  const rngFour = ['Letme', 'Mlxg', 'Uzi', 'Ming'].map((n) => echo(n).id)
  const other = BASE_PLAYER_CARDS.find((c) => c.roles.includes('中单') && c.clubTag !== 'RNG')!
  const ch = chemistry({ slots: [rngFour[0], rngFour[1], other.id, rngFour[2], rngFour[3]], coach: null })
  check('四个 RNG 老将加一个外人：RNG 四人之间都是同队默契', ch.links.filter((l) => l.why === 'club').length === 6, String(ch.links.filter((l) => l.why === 'club').length))
  const rngLegend = LEGEND_CARDS.find((c) => c.clubId === 'H:RNG' && c.ign !== 'Uzi' && c.ign !== 'Letme' && c.ign !== 'Ming' && c.ign !== 'Mlxg')
  if (rngLegend) check(`回响 RNG 和名人堂 RNG（${rngLegend.ign}）同队`, chemistry({ slots: [rngFour[0], rngLegend.id, null, null, null], coach: null }).links.some((l) => l.why === 'club'))
  check('筛选能按 RNG 俱乐部找到老将', clubsIn(ECHO_CARDS).some((x) => x.label === 'RNG' && x.n >= 4))
}

// 图鉴和市场的「峡谷回响」筛选
check('筛选「峡谷回响」只出回响卡，193 张', ALL_CARDS.filter((c) => matchesFilter(c, { rarity: 'echo', region: 'all', role: 'all', club: 'all' })).length === 193 && ALL_CARDS.filter((c) => matchesFilter(c, { rarity: 'echo', region: 'all', role: 'all', club: 'all' })).every(isEchoCard))
check('服务器读筛选认得「峡谷回响」', readFilter({ rarity: 'echo' }).rarity === 'echo')

console.log(bad ? `\n${bad} 处不对` : '\n全部通过')
process.exit(bad ? 1 : 0)
