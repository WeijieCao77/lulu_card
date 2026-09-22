import {
  BASE_PLAYER_CARDS,
  LEGEND_CARDS,
  COACH_CARDS,
  rarityOf,
  GOLD_AT,
  SILVER_AT,
  COACH_GOLD_AT,
  COACH_SILVER_AT,
  cardById,
  SQUAD_SLOTS,
  coachRarityOf
} from '../src/engine/cards';
import {
  ordinaryRating,
  ordinaryCardStats,
  CARD_BALANCE_VERSION
} from '../src/engine/cardRarity';
import { gameRegionOf } from '../src/engine/gameRegions';
import { WORLD_PLAYERS } from '../src/engine/world';
import type { Attrs } from '../src/engine/types';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const worldJsonPath = new URL('../src/data/world.json', import.meta.url);
const worldJsonRaw = JSON.parse(readFileSync(worldJsonPath, 'utf8')).players as any[];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function attrsFromSource(p: typeof WORLD_PLAYERS[number] & { sourceOverall: number }, cardRating: number): Attrs {
  const rawAttrs = p.attrs as Attrs;
  const out: Attrs = {} as Attrs;
  for (const key of Object.keys(rawAttrs) as (keyof Attrs)[]) {
    const raw = Number(rawAttrs[key]);
    const computed = clamp(Math.round(raw + cardRating - p.overall), 1, 99);
    out[key] = computed;
  }
  return out;
}

function assertPlayerCardShape(card: any, p: any) {
  assert.strictEqual(card.id, `p:${p.id}`, `card.id mismatch for player ${p.id}`);
  assert.strictEqual(card.playerId, p.id, `playerId mismatch for ${p.id}`);
  assert.strictEqual(card.ign, p.ign, `ign mismatch for ${p.id}`);
  assert.strictEqual(card.role, p.role, `role mismatch for ${p.id}`);
  assert.strictEqual(card.clubId, p.teamId ?? null, `club mismatch for ${p.id}`);
  assert.strictEqual(card.region, p.region, `region mismatch for ${p.id}`);
}

function assertNoAttrsMutation(card: any, p: any) {
  assert.notStrictEqual(card.attrs, p.attrs, `card.attrs should not be same reference as WORLD_PLAYERS attrs for ${p.id}`);
}

function assertAttrsMatchWorld(_card: any, p: any) {
  const raw = worldJsonRaw.find(w => w.id === p.id);
  assert.ok(raw, `raw player missing ${p.id}`);
  assert.strictEqual(p.overall, raw.overall);
  assert.deepStrictEqual(p.attrs, raw.attrs, `raw attrs mutated ${p.id}`);
}

function testPlayerCountsAndCardStats() {
  const byGroup = new Map<string, Map<string, { count: number; min: number; max: number }>>();
  for (const p of WORLD_PLAYERS as (typeof WORLD_PLAYERS[number] & { sourceOverall?: number })[]) {
    assert.ok(typeof p.sourceOverall === 'number', `sourceOverall missing for ${p.id}`);
    const card = cardById(`p:${p.id}`);
    assert.ok(card, `card not found for ${p.id}`);
    assertPlayerCardShape(card, p);
    assertNoAttrsMutation(card, p);
    assertAttrsMatchWorld(card, p);
    const expectedRating = ordinaryRating(p.sourceOverall!, p.region);
    assert.strictEqual(card.rating, expectedRating, `rating mismatch for ${p.id} expected ${expectedRating} got ${card.rating}`);
    const expectedStats = ordinaryCardStats(p);
    assert.strictEqual(card.rating, expectedStats.rating, `card rating mismatch for ${p.id}`);
    assert.deepStrictEqual((card as any).attrs, attrsFromSource(p as typeof p & {sourceOverall:number}, card.rating));
    for (const key of Object.keys(expectedStats.attrs)) {
      assert.strictEqual(card.attrs[key], expectedStats.attrs[key], `card attr ${key} mismatch for ${p.id}`);
    }
    const expectedRarity = rarityOf(card.rating);
    assert.strictEqual(card.rarity, expectedRarity, `rarity mismatch for ${p.id}`);
    assert.strictEqual(card.rarity, rarityOf(card.rating), `rarityOf not idempotent for ${p.id}`);
    const group = gameRegionOf(card.region)!;
    const region = gameRegionOf(p.region);
    assert.strictEqual(group, region, `group mismatch for ${p.id}`);
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const rarityMap = byGroup.get(group)!;
    if (!rarityMap.has(card.rarity)) rarityMap.set(card.rarity, { count: 0, min: Infinity, max: -Infinity });
    const entry = rarityMap.get(card.rarity)!;
    entry.count++;
    entry.min = Math.min(entry.min, card.rating);
    entry.max = Math.max(entry.max, card.rating);
  }

  const expectedCounts: Record<string, Record<string, number>> = {
    'LPL': { 'gold': 25, 'silver': 35, 'bronze': 43 },
    'LCK': { 'gold': 35, 'silver': 30, 'bronze': 57 },
    'WEST': { 'gold': 42, 'silver': 125, 'bronze': 285 }
  };
  for (const [group, rarityMap] of byGroup) {
    for (const [rarity, entry] of rarityMap) {
      assert.strictEqual(entry.count, expectedCounts[group]?.[rarity], `count mismatch for ${group} ${rarity}`);
      if (rarity === 'gold') {
        assert.ok(entry.min >= GOLD_AT, `gold min below GOLD_AT for ${group}`);
        assert.ok(entry.max <= 90, `gold max above 90 for ${group}`);
      } else if (rarity === 'silver') {
        assert.ok(entry.min >= SILVER_AT, `silver min below SILVER_AT for ${group}`);
        assert.ok(entry.max < GOLD_AT, `silver max >= GOLD_AT for ${group}`);
      } else {
        assert.ok(entry.max < SILVER_AT, `bronze max >= SILVER_AT for ${group}`);
      }
    }
  }
  console.log('Player card counts/ratings/attrs verified');
}

function testCoachCountsAndConsistency() {
  const byGroup = new Map<string, Map<string, number>>();
  for (const coach of COACH_CARDS) {
    const group = gameRegionOf(coach.region) ?? 'null';
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const rarityMap = byGroup.get(group)!;
    const rarity = coachRarityOf(coach.rating);
    rarityMap.set(rarity, (rarityMap.get(rarity) ?? 0) + 1);
    if (rarity === 'gold') {
      assert.ok(coach.rating >= COACH_GOLD_AT, `coach gold below threshold for ${group}`);
    } else if (rarity === 'silver') {
      assert.ok(coach.rating >= COACH_SILVER_AT && coach.rating < COACH_GOLD_AT, `coach silver range issue for ${group}`);
    } else {
      assert.ok(coach.rating < COACH_SILVER_AT, `coach bronze above silver threshold for ${group}`);
    }
  }
  const expectedCoachCounts: Record<string, Record<string, number>> = {
    'LPL': { gold: 3, silver: 8, bronze: 6 },
    'LCK': { gold: 8, silver: 5, bronze: 7 },
    'WEST': { gold: 20, silver: 22, bronze: 32 },
    'null': { gold: 0, silver: 0, bronze: 3 }
  };
  for (const [group, rarityMap] of byGroup) {
    for (const [rarity, count] of rarityMap) {
      assert.strictEqual(count, expectedCoachCounts[group]?.[rarity], `coach count mismatch for ${group} ${rarity}`);
    }
  }
  // Coach gold 78+ silver 72+ unified across all groups
  const allCoaches = COACH_CARDS;
  for (const coach of allCoaches) {
    if (coachRarityOf(coach.rating) === 'gold') assert.ok(coach.rating >= 78, `coach gold < 78 for ${coach.id}`);
    if (coachRarityOf(coach.rating) === 'silver') assert.ok(coach.rating >= 72, `coach silver < 72 for ${coach.id}`);
  }
  console.log('Coach counts verified');
}

function testLegendCardsSnapshot() {
  const fixturePath = new URL('./fixtures/legend-cards-v3.json', import.meta.url);
  const fixtureRaw = readFileSync(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureRaw);
  assert.deepStrictEqual(LEGEND_CARDS, fixture, 'LEGEND_CARDS deepEqual fixture mismatch');
  console.log('Legend cards fixture deepEqual verified');
}

function testRoleCoverageForAllSlots() {
  for (const group of ['LPL', 'LCK', 'WEST']) {
  const allCards = BASE_PLAYER_CARDS.filter(c => gameRegionOf(c.region) === group);
  for (const slot of SQUAD_SLOTS) {
    const pool = allCards.filter(c => c.roles?.includes(slot));
    assert.ok(pool.length > 0, `Empty role pool for slot ${slot}`);
    for (const rarity of ['gold', 'silver', 'bronze']) {
      const rarityPool = pool.filter(c => rarityOf(c.rating) === rarity);
      assert.ok(rarityPool.length > 0, `Empty ${rarity} pool for slot ${slot}`);
    }
  }
  }
  console.log('Role coverage verified for all slots and rarities');
}

function testOrdinaryRatingAnchors() {
  const anchors: Record<string, Record<number, number>> = {
    'LPL': { 75: 72, 76: 78, 77: 83, 78: 84, 85: 90 },
    'LCK': { 70: 72, 76: 83, 77: 84, 79: 85, 80: 85, 93: 90 },
    'WEST': { 66: 72, 70: 83, 71: 84, 75: 87, 77: 88 }
  };
  for (const [region, anchorMap] of Object.entries(anchors)) {
    for (const [sourceStr, rating] of Object.entries(anchorMap)) {
      const source = Number(sourceStr);
      const result = ordinaryRating(source, region);
      assert.strictEqual(result, rating, `anchor mismatch: ${region} source ${source} expected ${rating} got ${result}`);
    }
  }

  // Monotonicity check for each region source 30..99
  for (const region of ['LPL', 'LCK', 'WEST']) {
    let prev = -Infinity;
    for (let source = 30; source <= 99; source++) {
      const rating = ordinaryRating(source, region);
      assert.ok(rating >= prev, `non-monotonic at ${region} source ${source}: prev ${prev} curr ${rating}`);
      prev = rating;
    }
  }
  console.log('Ordinary rating anchors and monotonicity verified');
}

function testOrdinaryCardStatsFallback() {
  const base = { overall: 80, region: 'LPL', attrs: { ...WORLD_PLAYERS[0].attrs } };
  for (const p of [{ ...base, region: 'UNKNOWN', sourceOverall: 78 }, base, { ...base, sourceOverall: NaN }]) {
    const before = structuredClone(p);
    const out = ordinaryCardStats(p);
    assert.strictEqual(out.rating, p.overall);
    assert.deepStrictEqual(out.attrs, p.attrs);
    assert.notStrictEqual(out.attrs, p.attrs);
    assert.deepStrictEqual(p, before);
  }
  console.log('Ordinary card stats fallback verified');
}

function testGlobalRarityColorConsistency() {
  const allRatedCards = [
    ...BASE_PLAYER_CARDS
  ];
  for (const card of allRatedCards) {
    const rating = card.rating;
    const expectedRarity = rarityOf(rating);
    assert.strictEqual(card.rarity, expectedRarity, `card ${card.id} rarity ${card.rarity} does not match rarityOf(${rating})`);
  }

  const playerCardsMaxRegion: Record<string, number> = {};
  for (const card of BASE_PLAYER_CARDS) {
    const region = gameRegionOf(card.region);
    if (region) playerCardsMaxRegion[region] = Math.max(playerCardsMaxRegion[region] ?? 0, card.rating);
  }
  assert.ok(playerCardsMaxRegion['WEST'] === 88, `WEST max player rating exceeds 88: ${playerCardsMaxRegion['WEST']}`);
  for (const region of ['LPL', 'LCK']) {
    assert.ok(playerCardsMaxRegion[region] === 90, `${region} max exceeds 90`);
  }
  console.log('Global rarity color consistency verified');
}

assert.equal(BASE_PLAYER_CARDS.length, 677);
assert.equal(LEGEND_CARDS.length, 40);
assert.equal(COACH_CARDS.length, 114);
assert.equal(CARD_BALANCE_VERSION, 5);
testPlayerCountsAndCardStats();

const goldFraction = (group: string): number => {
  const cards = BASE_PLAYER_CARDS.filter(c => gameRegionOf(c.region) === group);
  assert.ok(cards.length > 0, `Missing region ${group}`);
  return cards.filter(c => c.rarity === 'gold').length / cards.length;
};
const lckFraction = goldFraction('LCK');
const lplFraction = goldFraction('LPL');
const westFraction = goldFraction('WEST');
assert.ok(lckFraction > lplFraction && lplFraction > westFraction, 'Gold fraction must be LCK > LPL > WEST');
assert.ok(lckFraction >= 0.28 && lckFraction <= 0.32, 'LCK gold fraction must be 28–32%');
testCoachCountsAndConsistency();
testLegendCardsSnapshot();
testRoleCoverageForAllSlots();
testOrdinaryRatingAnchors();
testOrdinaryCardStatsFallback();
testGlobalRarityColorConsistency();

console.log('All re-rating regression tests passed');
