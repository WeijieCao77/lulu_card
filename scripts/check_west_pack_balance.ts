import assert from 'node:assert/strict';
import { newGacha, openPack, PACKS, MYTHIC_FLOOR } from '../src/engine/gacha';
import { SALVAGE, BASE_PLAYER_CARDS } from '../src/engine/cards';
import { gameRegionOf } from '../src/engine/gameRegions';

function run(seed: string, goldRate: number, silverRate: number) {
  const g = newGacha('SIM', 'Audit', seed);
  const original = { gold: PACKS.west.gold, silver: PACKS.west.silver };
  PACKS.west.gold = goldRate;
  PACKS.west.silver = silverRate;
  try {
    let gold = 0, silver = 0, bronze = 0, mythic = 0, salvage = 0;
    const packs = 20000;
    const mythicSequence: { pack: number; slot: number; cardId: string }[] = [];
    for (let i = 0; i < packs; i++) {
      g.packs.west = 1;
      const result = openPack(g, 'west', 'pack');
      if (result.length !== 3) throw new Error('Expected 3 pulls');
      if (!result.some((p) => p.card.rarity !== 'bronze')) throw new Error('Floor violated');
      for (const [slot, pull] of result.entries()) {
        const card = pull.card;
        salvage += SALVAGE[card.rarity];
        if (card.rarity === 'mythic') { mythic++; mythicSequence.push({ pack: i, slot, cardId: card.id }); continue; }
        if (gameRegionOf(card.region) !== 'WEST') throw new Error('Non-WEST card');
        if (card.rarity === 'gold') gold++;
        else if (card.rarity === 'silver') silver++;
        else if (card.rarity === 'bronze') bronze++;
      }
    }
    const total = packs * 3;
    return { gold: gold / total, silver: silver / total, bronze: bronze / total, mythic, mythicSequence, finalSeed: g.seed, salvage: salvage / packs };
  } finally {
    PACKS.west.gold = original.gold;
    PACKS.west.silver = original.silver;
  }
}

for (const [kind, gold, silver] of [['scout', .03, .26], ['elite', .08, .38], ['ten', .06, .34], ['cn', .08, .38], ['pac', .08, .38], ['west', .05, .08]] as const) {
  assert.equal(PACKS[kind].gold, gold, `${kind}: gold base`);
  assert.equal(PACKS[kind].silver, silver, `${kind}: silver base`);
  assert.equal(PACKS[kind].mythic, kind === 'scout' ? .0001 : kind === 'ten' ? .0006 : .0004, `${kind}: mythic base`);
}
assert.equal(PACKS.west.floor, 'silver');
assert.equal(PACKS.west.draws, 3);

const baseline = run('2026-01-01', 0.08, 0.38);
const current = run('2026-01-01', 0.05, 0.08);

assert.deepEqual(current.mythicSequence, baseline.mythicSequence, 'mythic pack/slot/person sequence unchanged');
assert.equal(current.finalSeed, baseline.finalSeed, 'random stream consumption unchanged');
if (baseline.mythic !== current.mythic) throw new Error(`Mythic count changed: ${baseline.mythic} vs ${current.mythic}`);
if (current.gold < 0.055 || current.gold > 0.075) throw new Error(`Gold rate ${current.gold}`);
if (current.silver < 0.27 || current.silver > 0.31) throw new Error(`Silver rate ${current.silver}`);
if (current.bronze < 0.62 || current.bronze > 0.68) throw new Error(`Bronze rate ${current.bronze}`);
if (current.salvage < 400 || current.salvage > 470) throw new Error(`Salvage ${current.salvage}`);
if (MYTHIC_FLOOR !== 1200) throw new Error('MYTHIC_FLOOR changed');
if (PACKS.west.cost !== 2600) throw new Error('west cost changed');

const eligible = BASE_PLAYER_CARDS.filter((c) => gameRegionOf(c.region) === 'WEST');
const goldCount = eligible.filter((c) => c.rarity === 'gold').length;
const silverCount = eligible.filter((c) => c.rarity === 'silver').length;
const bronzeCount = eligible.filter((c) => c.rarity === 'bronze').length;
if (goldCount !== 42 || silverCount !== 125 || bronzeCount !== 285) {
  throw new Error(`Pool counts: ${goldCount}/${silverCount}/${bronzeCount}`);
}

assert.ok(current.gold / goldCount < current.bronze / bronzeCount, 'individual gold less common than individual bronze');
const { mythicSequence: oldSequence, ...oldSummary } = baseline;
const { mythicSequence: newSequence, ...newSummary } = current;
console.log('Baseline:', oldSummary);
console.log('Current:', newSummary);
console.log('✓ All checks passed');
