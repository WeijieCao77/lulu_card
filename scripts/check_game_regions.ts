import assert from 'node:assert/strict'
import { ALL_CARDS, PLAYER_CARDS } from '../src/engine/cards'
import { runAction } from '../src/engine/cardActions'
import {
  claimSeries, mergeClientFields, migrateGacha, newGacha, openPack, packCost, PACK_ORDER,
  seriesProgress, SERIES, SERIES_REWARDS, PACKS, MYTHIC_FLOOR,
} from '../src/engine/gacha'
import type { GachaState, Series } from '../src/engine/gacha'
import { applyMail } from '../src/engine/inbox'
import { gameRegionOf, GAME_REGIONS } from '../src/engine/gameRegions'
import { matchesFilter, readFilter } from '../src/engine/cardFilter'
import { weekKey, selectWeeklySeries, selectedWeeklySeries } from '../src/engine/weeklySeries'

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  key: () => null,
  clear: () => store.clear(),
  get length() { return store.size },
}

const resources = (g: GachaState) => structuredClone({ coins: g.coins, packs: g.packs, cards: g.cards, seed: g.seed, pulls: g.pulls, pity: g.pity, mythicDry: g.mythicDry })

const env = (today: string, seed = 1) => ({
  now: Date.parse(`${today}T00:00:00+08:00`),
  today,
  seed,
})

/** Check function throws on failure; process exits 1 via top-level catch. */
function run() {
  // ---------------------------------------------------------------------
  // 1. Exact three-region API and PACK_ORDER, old PACKS kept for history.
  // ---------------------------------------------------------------------
  assert.deepEqual(GAME_REGIONS, ['LPL', 'LCK', 'WEST'])
  assert.deepEqual(SERIES, ['LPL', 'LCK', 'WEST'])
  assert.equal(gameRegionOf('LPL'), 'LPL')
  assert.equal(gameRegionOf('LCK'), 'LCK')
  assert.equal(gameRegionOf('WEST'), 'WEST')
  assert.equal(gameRegionOf('LEC'), 'WEST')
  assert.equal(gameRegionOf('LCS'), 'WEST')
  assert.equal(gameRegionOf('LCP'), 'WEST')
  assert.equal(gameRegionOf('CBLOL'), 'WEST')
  assert.equal(gameRegionOf('unknown'), undefined)
  assert.equal(gameRegionOf('ame'), undefined)
  assert.equal(gameRegionOf(1), undefined)
  assert.deepEqual(PACK_ORDER, ['scout', 'elite', 'ten', 'coach', 'cn', 'pac', 'west'])
  // Legacy PACKS still exists for historical mail; new code must never use them
  // as first-class pack IDs except through canonicalisation.
  for (const legacy of ['ame', 'emea', 'lcp', 'cblol'] as const) {
    assert.ok(PACKS[legacy]); assert.equal(PACK_ORDER.includes(legacy), false)
  }

  // ---------------------------------------------------------------------
  // 2. Actual migrateGacha behaviour from legacy packs.
  // ---------------------------------------------------------------------
  {
    const g = newGacha('acct', '审计', '2026-09-07') as GachaState
    g.packs = {
      ame: 5,
      emea: 6,
      lcp: 7,
      cblol: 8,
      west: 9,
      scout: 2,
      cn: 1,
    }
    const cardsBefore = JSON.stringify(g.cards)
    const coinsBefore = g.coins
    const scoutPacksBefore = g.packs.scout
    const cnPacksBefore = g.packs.cn
    const m1 = migrateGacha(g, 'acct')

    // Exactly sum, not MAX or first-wins.
    assert.equal(m1.packs.west, 5 + 6 + 7 + 8 + 9)
    assert.equal(m1.packs.scout, scoutPacksBefore)
    assert.equal(m1.packs.cn, cnPacksBefore)
    assert.equal(m1.coins, coinsBefore)
    for (const key of ['ame', 'emea', 'lcp', 'cblol'] as const) {
      assert.equal(Object.hasOwn(m1.packs, key), false, `legacy pack ${key} removed`)
    }
    assert.deepEqual(JSON.parse(cardsBefore), m1.cards, 'cards untouched by migration')

    // Second migration is idempotent on the west key.
    const migratedBefore = structuredClone(m1)
    const m2 = migrateGacha(m1, 'acct')
    assert.equal(m2.packs.west, 35)
    assert.deepEqual(m2, migratedBefore, 'second migration is a deep-equal no-op')

    // Real card collection untouched by region migration.
    const realCard = PLAYER_CARDS[0].id
    const card = PLAYER_CARDS.find((c) => c.id === realCard)
    assert.ok(card, 'test uses real card')
    const g2 = newGacha('acct', '审计', '2026-09-07') as GachaState
    g2.cards[realCard] = { id: realCard, level: 2, dupes: 3, spares: [1], seen: 1, got: '2026-09-01' }
    g2.packs = { ame: 2, west: 3 }
    migrateGacha(g2, 'acct')
    assert.deepEqual(g2.cards[realCard], { id: realCard, level: 2, dupes: 3, spares: [1], seen: 1, got: '2026-09-01' })
    assert.equal(g2.packs.west, 5)
  }

  // ---------------------------------------------------------------------
  // 3. claimSeries only pays the final WEST tier after old-series tiers filled.
  // ---------------------------------------------------------------------
  {
    const g = newGacha('acct', '审计', '2026-09-07') as GachaState
    Object.assign(g, { series: { LEC: 1, LCS: 3, LCP: 2, CBLOL: 4, WEST: 2 } })
    migrateGacha(g, 'acct')
    assert.deepEqual(g.series, { WEST: 4 })
    assert.equal(Object.hasOwn(g.series, 'LEC'), false)
    assert.equal(Object.hasOwn(g.series, 'LCS'), false)
    assert.equal(Object.hasOwn(g.series, 'LCP'), false)
    assert.equal(Object.hasOwn(g.series, 'CBLOL'), false)

    // Fill all WEST cards to satisfy every tier below final.
    for (const c of PLAYER_CARDS) {
      if (gameRegionOf(c.region) === 'WEST') {
        g.cards[c.id] = { id: c.id, level: 0, dupes: 0, seen: 1, got: '2026-09-01' }
      }
    }
    assert.equal(seriesProgress(g).find(p => p.region === 'WEST')?.owned, PLAYER_CARDS.filter(c => gameRegionOf(c.region) === 'WEST' && c.rarity !== 'mythic').length)
    const before = resources(g)
    assert.ok(claimSeries(g, 'WEST'))
    assert.equal(g.coins - before.coins, 15000)
    assert.deepEqual(g.packs, { ...before.packs, ten: (before.packs.ten ?? 0) + 1 })
    assert.equal(g.series?.WEST, SERIES_REWARDS.length)

    const coinsAfter = g.coins
    const packsAfter = JSON.stringify(g.packs)
    const again = claimSeries(g, 'WEST')
    assert.equal(again, null)
    assert.equal(g.coins, coinsAfter)
    assert.equal(JSON.stringify(g.packs), packsAfter)
  }

  // ---------------------------------------------------------------------
  // 4. Weekly series pick Monday 2026-09-21 with legacy region migrates to WEST,
  // same-week change fails, week preserved, next week can change.
  // ---------------------------------------------------------------------
  {
    const g = newGacha('acct', '审计', '2026-09-21') as GachaState
    g.weeklySeriesPick = { week: '2026-09-21', region: 'LCP' as never }
    const m = migrateGacha(g, 'acct')
    assert.deepEqual(m.weeklySeriesPick, { week: '2026-09-21', region: 'WEST' })
    assert.equal(selectedWeeklySeries(m, '2026-09-21'), 'WEST')
    const r = runAction(m, 'series_pick', { region: 'LPL' }, env('2026-09-21'))
    assert.equal(r.ok, false, 'same week cannot change migrated WEST to LPL')
    assert.deepEqual(m.weeklySeriesPick, { week: '2026-09-21', region: 'WEST' })
    const nextWeek = '2026-09-28'
    assert.equal(weekKey(nextWeek), nextWeek)
    const r2 = runAction(m, 'series_pick', { region: 'LPL' }, env(nextWeek))
    assert.equal(r2.ok, true)
    assert.deepEqual(m.weeklySeriesPick, { week: nextWeek, region: 'LPL' })
  }

  // ---------------------------------------------------------------------
  // 5. Legacy four packs rejected for both coin and pack opens, state untouched.
  // ---------------------------------------------------------------------
  for (const kind of ['ame', 'emea', 'lcp', 'cblol'] as const) {
    for (const payWith of ['coins', 'pack'] as const) {
      const g = newGacha('acct', '审计', '2026-09-07') as GachaState
      g.coins = 100000
      // Give stock for pack opens so an allowed legacy pack would succeed.
      g.packs = {
        ...g.packs,
        [kind]: 5 as never,
        west: 1,
      }
      const wholeBefore = structuredClone(g)
      assert.throws(() => openPack(g, kind, payWith, '2026-09-07'), /已合并/)
      assert.deepEqual(g, wholeBefore)
      const before = resources(g)
      const r = runAction(g, 'open', { kind, payWith }, env('2026-09-07'))
      assert.equal(r.ok, false, `${kind} ${payWith} open rejected`)
      assert.deepEqual(resources(g), before, `${kind} ${payWith} rejection leaves resources unchanged`)
    }
  }

  // ---------------------------------------------------------------------
  // 6. Old four mail entries each deliver two WEST packs with legacy text.
  // ---------------------------------------------------------------------
  {
    const g = newGacha('acct', '审计', '2026-09-07') as GachaState
    const beforePacks = g.packs.west ?? 0
    const mail = [
      { kind: 'grant', cardId: null, level: 0, coins: 0, pack: 'ame', count: 2, body: {}, at: Date.now() },
      { kind: 'grant', cardId: null, level: 0, coins: 0, pack: 'emea', count: 2, body: {}, at: Date.now() },
      { kind: 'grant', cardId: null, level: 0, coins: 0, pack: 'lcp', count: 2, body: {}, at: Date.now() },
      { kind: 'grant', cardId: null, level: 0, coins: 0, pack: 'cblol', count: 2, body: {}, at: Date.now() },
    ]
    applyMail(g, mail)
    assert.equal(g.packs.west, beforePacks + 8)
    for (const key of ['ame', 'emea', 'lcp', 'cblol'] as const) {
      assert.equal(g.packs[key], undefined)
    }
    // Each mail text is readable through mailLine with legacy pack maps to WEST name.
    for (const m of g.mail ?? []) {
      assert.match(m.text, /其他包/)
    }
  }

  // ---------------------------------------------------------------------
  // 7. Pool per-region sampling: 50 packs per legal region; WEST origins sampled
  // 1500 times to show all four legacy origins appear.
  // ---------------------------------------------------------------------
  for (const region of SERIES) {
    const pack = region === 'LPL' ? 'cn' : region === 'LCK' ? 'pac' : 'west'
    const g = newGacha('pool-' + region, '审计', '2026-09-07')
    g.packs[pack] = 1501
    const origins = new Set<string>()
    const runs = region === 'WEST' ? 1500 : 50
    for (let i = 0; i < runs; i++) {
      const before = g.coins
      const pulled = openPack(g, pack, 'pack', '2026-09-07')
      assert.equal(pulled.length, 3)
      assert.ok(pulled.some(p => p.card.rarity !== 'bronze'), pack + ' silver floor')
      for (const p of pulled) {
        assert.equal(gameRegionOf(p.card.region), region)
        origins.add(p.card.region!)
      }
      assert.equal(g.coins, before)
    }
    if (region === 'WEST') assert.deepEqual([...origins].sort(), ['CBLOL', 'LCP', 'LCS', 'LEC'].sort())
    g.mythicDry = MYTHIC_FLOOR - 1
    const forced = openPack(g, pack, 'pack', '2026-09-07')
    assert.ok(forced.some(p => p.card.rarity === 'mythic'), pack + ' mythic floor')
    assert.ok(forced.every(p => gameRegionOf(p.card.region) === region))
  }

  // ---------------------------------------------------------------------
  // 8. matchesFilter for each old region normal card and WEST; unknown no match;
  // readFilter maps old region to WEST.
  // ---------------------------------------------------------------------
  const sampleLEC = ALL_CARDS.find((c) => gameRegionOf(c.region) === 'WEST' && c.region === 'LEC')
  const sampleLCS = ALL_CARDS.find((c) => gameRegionOf(c.region) === 'WEST' && c.region === 'LCS')
  const sampleLCP = ALL_CARDS.find((c) => gameRegionOf(c.region) === 'WEST' && c.region === 'LCP')
  const sampleCBL = ALL_CARDS.find((c) => gameRegionOf(c.region) === 'WEST' && c.region === 'CBLOL')
  const sampleLPL = ALL_CARDS.find((c) => gameRegionOf(c.region) === 'LPL')
  const sampleLCK = ALL_CARDS.find((c) => gameRegionOf(c.region) === 'LCK')
  assert.ok(sampleLEC && sampleLCS && sampleLCP && sampleCBL && sampleLPL && sampleLCK, 'samples exist')

  for (const card of [sampleLEC, sampleLCS, sampleLCP, sampleCBL]) {
    assert.equal(matchesFilter(card, { rarity: 'all', region: 'WEST', role: 'all', club: 'all' }), true, `${card.region} matches WEST`)
    assert.equal(matchesFilter(card, readFilter({ region: card.region })), true, `legacy ${card.region} maps to WEST`)
  }
  assert.equal(matchesFilter({ ...sampleLPL, region: sampleLPL.region }, { rarity: 'all', region: 'WEST', role: 'all', club: 'all' }), false)
  const read = readFilter({ region: 'LEC' })
  assert.equal(read.region, 'WEST')
  const readW = readFilter({ region: 'WEST' })
  assert.equal(readW.region, 'WEST')
  const readUnknown = readFilter({ region: 'XX' })
  assert.equal(readUnknown.region, 'XX')
  assert.equal(matchesFilter(sampleLPL, readUnknown), false)
  assert.equal(matchesFilter(sampleLEC, readUnknown), false)

  // ---------------------------------------------------------------------
  // 9. mergeClientFields cannot forge packs, weeklySeriesPick, series.
  // ---------------------------------------------------------------------
  {
    const server = newGacha('acct', '审计', '2026-09-07') as GachaState
    server.coins = 12345
    server.packs.west = 7
    selectWeeklySeries(server, '2026-09-07', 'WEST')
    server.series = { WEST: 2 }
    const forged = {
      ...server,
      coins: 9999,
      packs: { ...server.packs, west: 99 },
      weeklySeriesPick: { week: '2026-09-07', region: 'LPL' as Series },
      series: { WEST: 5 },
    }
    const merged = mergeClientFields(server, forged)
    assert.equal(merged.coins, 12345)
    assert.equal(merged.packs.west, 7)
    assert.deepEqual(merged.weeklySeriesPick, { week: '2026-09-07', region: 'WEST' })
    assert.deepEqual(merged.series, { WEST: 2 })
  }

  // ---------------------------------------------------------------------
  // 10. expectedPrice for WEST: missing/forged/stale rejected; correct prices
  // with and without selection; stock packs need no expectedPrice.
  // ---------------------------------------------------------------------
  const snapshot = (g: GachaState) => JSON.stringify({
    coins: g.coins, packs: g.packs, cards: g.cards, seed: g.seed,
    pulls: g.pulls, pity: g.pity, mythicDry: g.mythicDry,
  })
  {
    const g = newGacha('acct', '审计', '2026-09-07') as GachaState
    g.coins = 100000
    const before = snapshot(g)
    const rMissing = runAction(g, 'open', { kind: 'west', payWith: 'coins' }, env('2026-09-07'))
    assert.equal(rMissing.ok, false, 'missing expectedPrice rejected')
    assert.equal(snapshot(g), before, 'missing expectedPrice state untouched')

    const rForged = runAction(g, 'open', { kind: 'west', payWith: 'coins', expectedPrice: 2080 }, env('2026-09-07'))
    assert.equal(rForged.ok, false, 'forged 2080 rejected when cost is 2600')
    assert.equal(snapshot(g), before, 'forged expectedPrice state untouched')

    // Correct full price without weekly pick.
    const rCorrect = runAction(g, 'open', { kind: 'west', payWith: 'coins', expectedPrice: 2600 }, env('2026-09-07'))
    assert.equal(rCorrect.ok, true)
    assert.equal(g.coins, 100000 - 2600)
  }
  {
    const g = newGacha('acct', '审计', '2026-09-07') as GachaState
    g.coins = 100000
    selectWeeklySeries(g, '2026-09-07', 'WEST')
    assert.equal(packCost('west', '2026-09-07', g), 2080)
    const rCorrect = runAction(g, 'open', { kind: 'west', payWith: 'coins', expectedPrice: 2080 }, env('2026-09-07'))
    assert.equal(rCorrect.ok, true)
    assert.equal(g.coins, 100000 - 2080)
  }
  {
    const g = newGacha('acct', '审计', '2026-09-07') as GachaState
    g.coins = 100000
    selectWeeklySeries(g, '2026-09-07', 'WEST')
    const before = snapshot(g)
    const rStale = runAction(g, 'open', { kind: 'west', payWith: 'coins', expectedPrice: 2080 }, env('2026-09-14'))
    assert.equal(rStale.ok, false, 'stale price across week rejected')
    assert.equal(snapshot(g), before)
  }
  {
    const g = newGacha('acct', '审计', '2026-09-07') as GachaState
    g.packs.west = 3
    const coinsBefore = g.coins
    const packsBefore = g.packs.west
    const r = runAction(g, 'open', { kind: 'west', payWith: 'pack' }, env('2026-09-07'))
    assert.equal(r.ok, true)
    assert.equal(g.packs.west, packsBefore - 1)
    assert.equal(g.coins, coinsBefore)
  }

  console.log('PASS: three game regions, idempotent migration, retained card levels, milestone no-double-pay, week lock, legacy mail, pool floors, market filter and server-owned price/resources')
}

try {
  run()
} catch (e) {
  console.error(e)
  process.exit(1)
}
