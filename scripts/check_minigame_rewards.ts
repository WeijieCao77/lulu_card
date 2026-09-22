import { strict as assert } from 'node:assert'
import { runAction } from '../src/engine/cardActions'
import { newGacha } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'
import { newMinigame, MINIGAME_DAILY, MINI_COINS } from '../src/engine/minigame'

const DAY = '2026-09-20'
let n = 0
function pass(name: string, fn: () => void) {
  try { fn(); console.log(`ok  ${name}`); n++ } catch (e) {
    console.error(`FAIL ${name}`, e)
    process.exitCode = 1
  }
}
const env = (now: number, today = DAY, seed = 4343) => ({ now, today, seed })
const fresh = (): GachaState => newGacha('audit-minigame-rewards', '审计', DAY)
type StartRes = { seed: number; startedAt: number; playsLeft: number }
type FinishRes = { tier: string; reward: { pack: string | null; coins: number; bonusPack?: 'elite' }; playsLeft: number }
const goldTaps = Array.from({ length: 25 }, (_, i) => 1000 + i * 400) // last 10600
const silverTaps = Array.from({ length: 25 }, (_, i) => 1000 + i * 1160) // last 28840
const copperTaps = Array.from({ length: 25 }, (_, i) => 1000 + i * 1760) // last 43240

function finishSchulte(g: GachaState, now: number, today = DAY, taps: number[] = goldTaps, wrong = 0): FinishRes {
  const start = runAction(g, 'minigame_start', { game: 'schulte' }, env(now, today)) as { ok: true; result: StartRes }
  assert.ok(start.ok)
  const finish = runAction(g, 'minigame_finish', { transcript: { taps, wrong } }, env(now + taps[taps.length - 1] + 1000, today))
  assert.ok(finish.ok, (finish as { why?: string }).why)
  return (finish as { result: FinishRes }).result
}

pass('金档400，银250，铜100', () => {
  assert.deepEqual(MINI_COINS, { 金: 400, 银: 250, 铜: 100 })
  for (const [taps, expected, tier] of [[goldTaps, MINI_COINS.金, '金'], [silverTaps, MINI_COINS.银, '银'], [copperTaps, MINI_COINS.铜, '铜']] as const) {
    const g = fresh()
    const beforeCoins = g.coins
    const beforeElite = g.packs.elite ?? 0
    const r = finishSchulte(g, 10000, DAY, taps)
    assert.equal(r.tier, tier)
    assert.equal(r.reward.coins, expected)
    assert.equal(g.coins, beforeCoins + expected)
    if (tier === '铜') {
      assert.equal(r.reward.pack, null)
      assert.equal(r.reward.bonusPack, undefined)
      assert.equal(g.packs.elite ?? 0, beforeElite)
    } else {
      assert.equal(r.reward.pack, 'sentinel')
      assert.equal(r.reward.bonusPack, 'elite')
      assert.equal(g.packs.elite ?? 0, beforeElite + 1)
      assert.equal(g.minigame?.bonusDay, DAY)
    }
  }
})

pass('每日首次金/银只一次', () => {
  const g = fresh()
  const r1 = finishSchulte(g, 20000)
  assert.equal(r1.reward.bonusPack, 'elite')
  const eliteAfter = g.packs.elite ?? 0
  const r2 = finishSchulte(g, 30000)
  assert.equal(r2.reward.bonusPack, undefined)
  assert.equal(g.packs.elite ?? 0, eliteAfter)
})

pass('铜档不吞首次达标奖励', () => {
  const g = fresh()
  const eliteBefore = g.packs.elite ?? 0
  const r1 = finishSchulte(g, 40000, DAY, copperTaps)
  assert.equal(r1.reward.bonusPack, undefined)
  assert.equal(g.packs.elite ?? 0, eliteBefore)
  assert.equal(g.minigame?.bonusDay, undefined)
  const r2 = finishSchulte(g, 100000, DAY, silverTaps)
  assert.equal(r2.reward.bonusPack, 'elite')
})

pass('次日重置', () => {
  const g = fresh()
  finishSchulte(g, 60000)
  const r = finishSchulte(g, 70000, '2026-09-21')
  assert.equal(r.reward.bonusPack, 'elite')
})

pass('跨日结算基础有，额外无；新日随后可领', () => {
  const g = fresh()
  const start = runAction(g, 'minigame_start', { game: 'schulte' }, env(80000, '2026-09-21')) as { ok: true; result: StartRes }
  assert.ok(start.ok)
  const beforeCoins = g.coins
  const beforeElite = g.packs.elite ?? 0
  const beforeWon = g.minigame?.won ?? 0
  const f = runAction(g, 'minigame_finish', { transcript: { taps: goldTaps, wrong: 0 } }, env(100000, '2026-09-22'))
  assert.ok(f.ok, (f as { why?: string }).why)
  const res = (f as { result: FinishRes }).result
  assert.equal(res.reward.coins, MINI_COINS.金)
  assert.equal(res.reward.pack, 'sentinel')
  assert.equal(res.reward.bonusPack, undefined)
  assert.equal(g.coins, beforeCoins + MINI_COINS.金)
  assert.equal(g.packs.elite ?? 0, beforeElite)
  assert.equal((g.minigame?.won ?? 0), beforeWon + 1)
  const r2 = finishSchulte(g, 120000, '2026-09-22')
  assert.equal(r2.reward.bonusPack, 'elite')
})

pass('重复finish无发奖', () => {
  const g = fresh()
  const now = 140000
  const start = runAction(g, 'minigame_start', { game: 'schulte' }, env(now)) as { ok: true; result: StartRes }
  assert.ok(start.ok)
  const beforeCoins = g.coins
  const beforeElite = g.packs.elite ?? 0
  const r1 = runAction(g, 'minigame_finish', { transcript: { taps: goldTaps, wrong: 0 } }, env(now + 20000))
  assert.ok(r1.ok)
  const r2 = runAction(g, 'minigame_finish', { transcript: { taps: goldTaps, wrong: 0 } }, env(now + 21000))
  assert.ok(!r2.ok)
  assert.equal(g.coins, beforeCoins + MINI_COINS.金)
  assert.equal(g.packs.elite ?? 0, beforeElite + 1)
})

pass('旧账号缺minigame或旧live兼容', () => {
  const g = fresh()
  delete (g as Partial<GachaState>).minigame
  const r = runAction(g, 'minigame_start', { game: 'schulte' }, env(250000))
  assert.ok(r.ok)
  const g2 = fresh()
  g2.minigame = newMinigame()
  g2.minigame.day = DAY
  g2.minigame.live = { game: 'schulte', seed: 999, startedAt: 200000 }
  const f = runAction(g2, 'minigame_finish', { transcript: { taps: goldTaps, wrong: 0 } }, env(220000))
  assert.ok(f.ok)
  assert.equal((f as { result: FinishRes }).result.reward.bonusPack, 'elite')
})

pass('每日5次限制不变', () => {
  const g = fresh()
  let ok = true
  for (let i = 0; i < MINIGAME_DAILY; i++) ok = runAction(g, 'minigame_start', { game: 'aim' }, env(300000 + i)).ok && ok
  assert.ok(ok)
  assert.ok(!runAction(g, 'minigame_start', { game: 'aim' }, env(310000)).ok)
})

pass('同日五金总上限为2000金币五位置包一选拔包', () => {
  const g = fresh()
  const coinsBefore = g.coins, eliteBefore = g.packs.elite ?? 0, roleBefore = g.packs.sentinel ?? 0
  for (let i = 0; i < 5; i++) finishSchulte(g, 100000 + i * 60000)
  assert.equal(g.coins - coinsBefore, 2000)
  assert.equal((g.packs.elite ?? 0) - eliteBefore, 1)
  assert.equal((g.packs.sentinel ?? 0) - roleBefore, 5)
  assert.ok(!runAction(g, 'minigame_start', { game: 'schulte' }, env(500000)).ok)
})

pass('请求伪造day/reward/tier无效', () => {
  const g = fresh()
  const beforeCoins = g.coins, beforeElite = g.packs.elite ?? 0
  assert.ok(runAction(g, 'minigame_start', { game: 'schulte', day: '2099-01-01' }, env(100000)).ok)
  const r = runAction(g, 'minigame_finish', {
    transcript: { taps: copperTaps, wrong: 0 }, day: '2099-01-01',
    reward: { pack: 'elite', coins: 9999 }, tier: '金', bonusDay: '2099-01-01',
  }, env(150000))
  assert.ok(r.ok)
  const result = (r as { result: FinishRes }).result
  assert.equal(result.tier, '铜')
  assert.equal(result.reward.coins, MINI_COINS.铜)
  assert.equal(result.reward.pack, null)
  assert.equal(result.reward.bonusPack, undefined)
  assert.equal(g.coins, beforeCoins + MINI_COINS.铜)
  assert.equal(g.packs.elite ?? 0, beforeElite)
  assert.equal(g.minigame?.day, DAY)
  assert.equal(g.minigame?.bonusDay, undefined)
  const qualified = finishSchulte(g, 160000)
  assert.equal(qualified.reward.bonusPack, 'elite')
  assert.ok(runAction(g, 'minigame_start', { game: 'schulte' }, env(190000)).ok)
  const duplicateBonus = runAction(g, 'minigame_finish', {
    transcript: { taps: goldTaps, wrong: 0 }, day: '2099-01-01', bonusDay: null,
  }, env(210000))
  assert.ok(duplicateBonus.ok)
  assert.equal((duplicateBonus as { result: FinishRes }).result.reward.bonusPack, undefined)
  assert.equal(g.packs.elite ?? 0, beforeElite + 1)
})

pass('脚本或超时局不发奖励也不吞达标奖励', () => {
  const g = fresh()
  const beforeCoins = g.coins, beforeElite = g.packs.elite ?? 0
  assert.ok(runAction(g, 'minigame_start', { game: 'schulte' }, env(100000)).ok)
  assert.ok(!runAction(g, 'minigame_finish', { transcript: { taps: Array.from({ length: 25 }, (_, i) => 100 + i * 20) } }, env(120000)).ok)
  assert.equal(g.coins, beforeCoins)
  assert.equal(g.packs.elite ?? 0, beforeElite)
  assert.equal(g.minigame?.bonusDay, undefined)
  assert.ok(runAction(g, 'minigame_start', { game: 'schulte' }, env(200000)).ok)
  assert.ok(!runAction(g, 'minigame_finish', { transcript: { taps: goldTaps } }, env(900001)).ok)
  assert.equal(g.coins, beforeCoins)
  assert.equal(g.packs.elite ?? 0, beforeElite)
  assert.equal(finishSchulte(g, 1000000).reward.bonusPack, 'elite')
})

console.log(`\n${n} 组通过`)
