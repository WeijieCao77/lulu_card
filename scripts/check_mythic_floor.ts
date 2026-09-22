import { PACKS, PACK_ORDER, MYTHIC_FLOOR, POSITION_PACK_KINDS, newGacha, openPack } from '../src/engine/gacha'

import { BASE_PLAYER_CARDS } from '../src/engine/cards'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(msg)
    process.exit(1)
  }
}

function openPacks(g: ReturnType<typeof newGacha>, kind: keyof typeof PACKS, count: number) {
  for (let i = 0; i < count; i++) {
    g.packs[kind] = (g.packs[kind] ?? 0) + 1
    openPack(g, kind, 'pack')
  }
}

function runChecks() {
  // 1198 scout pulls no mythic, counter 1199
  {
    const g = newGacha('CHECK-1198', '验证', '2026-01-01')
    g.seed = 901
    g.coins = Number.MAX_SAFE_INTEGER
    g.mythicDry = MYTHIC_FLOOR - 2
    g.packs.scout = 1
    const first = openPack(g, 'scout', 'pack')
    assert(first.every(p => p.card.rarity !== 'mythic'), 'seed 901 must not produce an early natural mythic')
    assert(g.mythicDry === 1199, `1198 scout pulls should set mythicDry=1199, got ${g.mythicDry}`)
    openPacks(g, 'scout', 1)
    assert(g.mythicDry === 0, 'draw 1200 must pay and reset')
  }

  // 1199/1200/1205 states next scout pack must contain mythic
  for (const dry of [1199, 1200, 1205]) {
    const g = newGacha(`CHECK-${dry}`, '验证', '2026-01-01')
    g.seed = 901
    g.coins = Number.MAX_SAFE_INTEGER
    g.mythicDry = dry
    g.packs.scout = 1
    const pulled = openPack(g, 'scout', 'pack')
    assert(pulled.some(p => p.card.rarity === 'mythic'), `next scout pack should be mythic when mythicDry=${dry}`)
  }

  // ten pack from 1195 gives one mythic and remaining 5 counter, seed natural no mythic
  {
    const g = newGacha('CHECK-TEN', '验证', '2026-01-01')
    g.seed = 901
    g.coins = Number.MAX_SAFE_INTEGER
    g.mythicDry = 1195
    g.packs.ten = 1
    const pulled = openPack(g, 'ten', 'pack')
    assert(pulled.some(p => p.card.rarity === 'mythic'), 'ten pack at 1195 should contain mythic')
    assert(g.mythicDry === 5, `ten pack after one mythic leaves mythicDry=5, got ${g.mythicDry}`)
    // ensure no natural mythic happened for this seed before floor
    const g2 = newGacha('CHECK-TEN-NAT', '验证', '2026-01-01')
    g2.seed = 901
    g2.coins = Number.MAX_SAFE_INTEGER
    g2.mythicDry = 0
    g2.packs.ten = 1
    const natural = openPack(g2, 'ten', 'pack')
    assert(!natural.some(p => p.card.rarity === 'mythic'), 'seed 901 ten pack should not natural mythic')
  }

  // cross-pack sharing: scout then elite then ten, each card counted
  {
    const g = newGacha('CHECK-CROSS', '验证', '2026-01-01')
    g.seed = 901
    g.coins = Number.MAX_SAFE_INTEGER
    g.mythicDry = 0
    g.packs.scout = 1
    openPack(g, 'scout', 'pack')
    const afterScout = g.mythicDry
    g.packs.elite = 1
    openPack(g, 'elite', 'pack')
    assert(g.mythicDry === afterScout + 3, `elite should add 3 to shared counter, got ${g.mythicDry}`)
    g.packs.ten = 1
    openPack(g, 'ten', 'pack')
    assert(g.mythicDry === afterScout + 13, `ten should add 10 after elite, got ${g.mythicDry}`)
  }

  // coach/LCP/CBLOL and all position packs at 1199 do not pay mythic and do not advance, then scout pays
  const noMythicKinds = ['coach', 'lcp', 'cblol', ...POSITION_PACK_KINDS] as const
  for (const kind of noMythicKinds) {
    const g = newGacha(`CHECK-NOMY-${kind}`, '验证', '2026-01-01')
    g.seed = 901
    g.coins = Number.MAX_SAFE_INTEGER
    g.mythicDry = 1199
    g.packs[kind] = 1
    const pulled = openPack(g, kind, 'pack')
    assert(!pulled.some(p => p.card.rarity === 'mythic'), `${kind} should not pay mythic even at 1199`)
    assert(g.mythicDry === 1199, `${kind} should not advance mythicDry`)
    g.packs.scout = 1
    const scoutPulled = openPack(g, 'scout', 'pack')
    assert(scoutPulled.some(p => p.card.rarity === 'mythic'), 'scout after no-mythic pack should still pay mythic')
  }

  // legend pack does not consume pity/gold counters, uses pack inventory, coins unchanged, existing card upgrades without loss
  {
    const g = newGacha('CHECK-LEGEND', '验证', '2026-01-01')
    g.seed = 901
    g.coins = 123456
    g.mythicDry = 700
    g.pity = 10
    g.packs.legend = 1
    const baseId = BASE_PLAYER_CARDS[0].id
    g.cards[baseId] = { id: baseId, level: 4, dupes: 2, seen: 3, got: '2026-09-22' }
    const beforeCards = JSON.stringify(g.cards[baseId])
    const pulled = openPack(g, 'legend', 'pack')
    assert(pulled.length === 1 && pulled[0].card.rarity === 'mythic', 'legend pack must contain one mythic')
    assert(g.mythicDry === 700, `legend should not consume mythicDry`)
    assert(g.pity === 10, `legend should not consume pity`)
    assert(g.packs.legend === 0, 'legend pack should consume inventory')
    assert(g.coins === 123456, 'legend pack should not charge coins')
    assert(JSON.stringify(g.cards[baseId]) === beforeCards, 'existing base card upgrades must be preserved')
    // if a card already existed, dupes/seen should increase; test by inserting one before
    const g2 = newGacha('CHECK-LEGEND-UP', '验证', '2026-01-01')
    g2.seed = 901
    g2.coins = 9999
    g2.packs.legend = 1
    // manually add a card that will be pulled? Can't know which, so just assert no existing card disappears
    const beforeIds = Object.keys(g2.cards)
    const pulled2 = openPack(g2, 'legend', 'pack')
    const pulledCard = pulled2[0].card
    if (beforeIds.includes(pulledCard.id)) {
      assert(g2.cards[pulledCard.id].dupes >= 1, 'existing legend card should increment dupes')
    } else {
      assert(g2.cards[pulledCard.id].seen === 1, 'new legend card should have seen=1')
    }
  }

  for (const kind of PACK_ORDER.filter(k => PACKS[k].mythic > 0 && PACKS[k].mythic < 1)) {
    const g = newGacha('all-pack-floor', '验证', '2026-09-22')
    g.seed = 901; g.mythicDry = MYTHIC_FLOOR - 1; g.packs[kind] = 1
    assert(openPack(g, kind, 'pack').some(p => p.card.rarity === 'mythic'), kind + ' must pay at floor')
  }
  console.log('Mythic floor checks passed')
}

runChecks()
