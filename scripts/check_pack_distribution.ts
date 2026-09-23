/** Deterministic per-card distribution regression; npx tsx scripts/check_pack_distribution.ts. */
import assert from 'node:assert/strict'
import {
  newGacha, openPack, PACK_ORDER, POSITION_PACK_KINDS, PACKS, MYTHIC_FLOOR, packCost,
} from '../src/engine/gacha'
import { runAction } from '../src/engine/cardActions'
import {
  ALL_CARDS, LEGEND_CARDS, LEGEND_COACH_CARDS, PLAYER_CARDS, COACH_CARDS, SEOUL_CARDS,
  cardById,
} from '../src/engine/cards'
import { gameRegionOf } from '../src/engine/gameRegions'
import type { Card, Rarity } from '../src/engine/cards'
import type { PackKind } from '../src/engine/gacha'

const ACTIVE_PACKS: PackKind[] = [...PACK_ORDER, ...POSITION_PACK_KINDS, 'legend']
const DRAW_TARGET = 2000, SESSIONS = 10
const SEED_STREAM = (i: number) => Math.imul(i ^ 0x5bd1e995, 1103515245) >>> 0

function getPool(kind: PackKind): { mythic: Card[]; gold: Card[]; silver: Card[]; bronze: Card[] } {
  const pool = PACKS[kind].pool
  const r = (cards: Card[], rarity: Rarity) => cards.filter(c => c.rarity === rarity)
  if (pool === 'player') return { mythic: LEGEND_CARDS.slice(), gold: r(PLAYER_CARDS, 'gold'), silver: r(PLAYER_CARDS, 'silver'), bronze: r(PLAYER_CARDS, 'bronze') }
  if (pool === 'coach') return { mythic: LEGEND_COACH_CARDS.slice(), gold: r(COACH_CARDS, 'gold'), silver: r(COACH_CARDS, 'silver'), bronze: r(COACH_CARDS, 'bronze') }
  if (pool === 'legend') return { mythic: [...LEGEND_CARDS, ...LEGEND_COACH_CARDS], gold: [], silver: [], bronze: [] }
  if (pool === 'seoul2024') return { mythic: [], gold: r(SEOUL_CARDS, 'gold'), silver: r(SEOUL_CARDS, 'silver'), bronze: r(SEOUL_CARDS, 'bronze') }
  const regionPools = ['LPL', 'LCK', 'WEST', 'LCS', 'LEC', 'LCP', 'CBLOL'] as const
  if ((regionPools as readonly string[]).includes(pool)) {
    const region = pool as typeof regionPools[number]
    const inRegion = (c: Card) => pool === 'LPL' || pool === 'LCK' || pool === 'WEST' ? gameRegionOf(c.region) === region : c.region === region
    return { mythic: LEGEND_CARDS.filter(inRegion), gold: PLAYER_CARDS.filter(c => c.rarity === 'gold' && inRegion(c)), silver: PLAYER_CARDS.filter(c => c.rarity === 'silver' && inRegion(c)), bronze: PLAYER_CARDS.filter(c => c.rarity === 'bronze' && inRegion(c)) }
  }
  const positions = ['上单', '打野', '中单', '下路'] as const
  if ((positions as readonly string[]).includes(pool)) {
    const role = pool as typeof positions[number]
    return { mythic: [], gold: PLAYER_CARDS.filter(c => c.rarity === 'gold' && c.roles.includes(role)), silver: PLAYER_CARDS.filter(c => c.rarity === 'silver' && c.roles.includes(role)), bronze: PLAYER_CARDS.filter(c => c.rarity === 'bronze' && c.roles.includes(role)) }
  }
  throw new Error(`Unknown pool: ${pool}`)
}

const dupIds = (cards: readonly { id: string }[]) => [...new Set(cards.filter((c, i) => cards.findIndex(x => x.id === c.id) !== i).map(c => c.id))]
const binomZ = (obs: number, exp: number, k: number) => exp <= 0 ? NaN : (obs - exp) / Math.sqrt(exp * (1 - 1 / k))

interface SessionResult {
  actualDrawCount: number; maxPerCard: number; maxCardId: string | null
  rarityCounts: Record<string, number>; perCardCounts: Record<string, number>; errors: string[]
}

function simulateSession(packKind: PackKind, path: 'direct' | 'server', sessionIndex: number, seedBase: number): SessionResult {
  const def = PACKS[packKind]
  const g = newGacha(`audit-${path}-${packKind}-${sessionIndex}`, '审计', '2026-01-01')
  g.coins = Number.MAX_SAFE_INTEGER; g.seed = (seedBase + sessionIndex) >>> 0
  const errors: string[] = [], rarityCounts: Record<string, number> = {}, perCardCounts: Record<string, number> = {}
  let actualDrawCount = 0
  const numPacks = Math.ceil(DRAW_TARGET / def.draws)
  const allowed = new Set(Object.values(getPool(packKind)).flat().map(c => c.id))

  for (let p = 0; p < numPacks; p++) {
    g.packs[packKind as string] = (g.packs[packKind as string] ?? 0) + 1
    let pulled: { card: Card }[]
    try {
      if (path === 'direct') pulled = openPack(g, packKind, 'pack', '2026-01-01').map(r => ({ card: r.card }))
      else {
        const result = runAction(g, 'open', { kind: packKind, payWith: 'pack' }, { now: 1767225600000 + p * 1000, today: '2026-01-01', seed: SEED_STREAM(p * 31 + sessionIndex * 7 + seedBase) })
        if (!result.ok) { errors.push(`runAction failed at pack ${p}: ${result.why}`); pulled = [] }
        else pulled = (result.result as { pulled: { cardId: string }[] }).pulled.map(pr => { const card = cardById(pr.cardId); if (!card) throw new Error(`cardById null for ${pr.cardId}`); return { card } })
      }
    } catch (e) { errors.push(`exception at pack ${p}: ${e instanceof Error ? e.message : String(e)}`); pulled = []; break }
    if (pulled.length !== def.draws) errors.push(`pack ${p} returned ${pulled.length} draws, expected ${def.draws}`)
    for (const draw of pulled) {
      assert(allowed.has(draw.card.id), `ineligible ${packKind}/${draw.card.id}`)
      actualDrawCount++; const id = draw.card.id, rarity = draw.card.rarity as Rarity
      rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + 1; perCardCounts[id] = (perCardCounts[id] ?? 0) + 1
    }
  }
  assert.equal(actualDrawCount, numPacks * def.draws)
  const maxEntry = Object.entries(perCardCounts).sort((a, b) => b[1] - a[1])[0]
  return { actualDrawCount, maxPerCard: maxEntry?.[1] ?? 0, maxCardId: maxEntry?.[0] ?? null, rarityCounts, perCardCounts, errors }
}

function aggregatePath(packKind: PackKind, sessions: SessionResult[]): any {
  const apc: Record<string, number> = {}, arc: Record<string, number> = {}
  for (const s of sessions) {
    for (const [id, c] of Object.entries(s.perCardCounts)) apc[id] = (apc[id] ?? 0) + c
    for (const [r, c] of Object.entries(s.rarityCounts)) arc[r] = (arc[r] ?? 0) + c
  }
  const pool = getPool(packKind), pcz: Record<string, number> = {}
  let chiSq = 0, chiDf = 0
  for (const [rarity, cards] of Object.entries({ mythic: pool.mythic, gold: pool.gold, silver: pool.silver, bronze: pool.bronze })) {
    if (!cards.length) { assert.equal(arc[rarity] ?? 0, 0, `${packKind}/${rarity} must stay empty`); continue }
    const observedTotal = cards.reduce((s, c) => s + (apc[c.id] ?? 0), 0)
    if (observedTotal !== (arc[rarity] ?? 0)) throw new Error(`Rarity count mismatch for ${packKind}/${rarity}: ${observedTotal} vs ${arc[rarity] ?? 0}`)
    const expPer = observedTotal / cards.length
    if (expPer >= 10) chiDf += cards.length - 1
    for (const card of cards) {
      const obs = apc[card.id] ?? 0
      const z = binomZ(obs, expPer, cards.length)
      pcz[card.id] = z
      if (Number.isFinite(z) && expPer >= 10) chiSq += (obs - expPer) ** 2 / expPer
    }
  }
  for (const id of Object.keys(apc)) if (!(id in pcz)) throw new Error(`observed card absent from eligible pool ${id}`)
  const absZs = Object.values(pcz).filter(v => Number.isFinite(v)).map(v => Math.abs(v))
  return { sessions, aggregateActualDraws: sessions.reduce((s, x) => s + x.actualDrawCount, 0), aggregateRarityCounts: arc, aggregatePerCard: apc, perCardZ: pcz, maxAbsZ: absZs.length ? Math.max(...absZs) : 0, chiSq, chiDf, chiNormalizedZ: chiDf > 0 ? (chiSq - chiDf) / Math.sqrt(2 * chiDf) : NaN }
}

// Only test conditional card probabilities when the sample is large enough.
// Sparse natural mythic rolls are validated separately using forced pity below.
function assertDistribution(kind: PackKind, agg: ReturnType<typeof aggregatePath>): void {
  for (const [rarity, cards] of Object.entries(getPool(kind))) {
    const expected = (agg.aggregateRarityCounts[rarity] ?? 0) / cards.length
    if (expected >= 10 && cards.length > 1) for (const c of cards) {
      assert(Math.abs(agg.perCardZ[c.id]) < 7, `${kind}/${rarity}/${c.id}: biased conditional frequency ${agg.perCardZ[c.id]}`)
    }
  }
  if (agg.chiDf > 0) assert(agg.chiNormalizedZ < 6, `${kind}: excess conditional chi-square ${agg.chiNormalizedZ}`)
  if (kind === 'legend') for (const c of getPool(kind).mythic) assert(agg.aggregatePerCard[c.id] > 0, `${c.id} never sampled`)
}

// The detector must fail on the reported scale of skew, not merely print a histogram.
{
  const ids = getPool('legend').mythic.map(c => c.id)
  const counts = Object.fromEntries(ids.map((id, i) => [id, i === 0 ? 300 : Math.floor(1700 / (ids.length - 1))]))
  for (let i = 1; i <= 1700 % (ids.length - 1); i++) counts[ids[i]]++
  const sample: SessionResult = { actualDrawCount: 2000, maxPerCard: 300, maxCardId: ids[0], rarityCounts: { mythic: 2000 }, perCardCounts: counts, errors: [] }
  assert.throws(() => assertDistribution('legend', aggregatePath('legend', [sample])), /biased|chi-square/)
}

// Historical LPL had one bronze (Juhan), so every bronze roll selected him.
// Keep enough alternatives in each ordinary regional tier to prevent that regression.
for (const kind of ['cn', 'pac', 'west'] as const) {
  for (const rarity of ['gold', 'silver', 'bronze'] as const) assert(getPool(kind)[rarity].length >= 10, `${kind}/${rarity}: concentrated regional pool`)
}

// Main execution
const out: any = { analysis: { timestamp: new Date().toISOString(), activePacks: ACTIVE_PACKS, drawTarget: DRAW_TARGET, sessionsPerPath: SESSIONS, duplicateIds: {}, packResults: {} as Record<string, any>, worldPoolSizes: { totalAllCards: ALL_CARDS.length, playerCards: PLAYER_CARDS.length, coachCards: COACH_CARDS.length, legendPlayerCards: LEGEND_CARDS.length, legendCoachCards: LEGEND_COACH_CARDS.length, globalLegendPool: LEGEND_CARDS.length + LEGEND_COACH_CARDS.length, seoulCards: SEOUL_CARDS.length }, zeroCountsByRarity: {} as Record<string, Record<string, number>> }, errors: [] as string[] }

for (const [name, arr] of Object.entries({ allCards: ALL_CARDS, playerCards: PLAYER_CARDS, coachCards: COACH_CARDS, legendCards: LEGEND_CARDS, legendCoachCards: LEGEND_COACH_CARDS, seoulCards: SEOUL_CARDS })) out.analysis.duplicateIds[name] = dupIds(arr)

for (const legacy of ['ame', 'emea', 'lcp', 'cblol']) {
  try {
    const g1 = newGacha('legacy-test', '测试', '2026-01-01'); g1.packs[legacy] = 1
    let threw = false; try { openPack(g1, legacy as PackKind, 'pack', '2026-01-01') } catch { threw = true }
    if (!threw) out.errors.push(`Direct openPack did NOT reject legacy pack ${legacy}`)
    const g2 = newGacha('legacy-test2', '测试', '2026-01-01'); g2.packs[legacy] = 1
    const r = runAction(g2, 'open', { kind: legacy as PackKind, payWith: 'pack' }, { now: 1767225600000, today: '2026-01-01', seed: 42 })
    if (r.ok) out.errors.push(`runAction did NOT reject legacy pack ${legacy}`)
  } catch (e) { out.errors.push(`Legacy test exception for ${legacy}: ${e instanceof Error ? e.message : String(e)}`) }
}

assert.deepEqual(out.errors, [])
for (const dups of Object.values(out.analysis.duplicateIds)) assert.deepEqual(dups, [])

console.log(`Audit: ${DRAW_TARGET} draws × ${SESSIONS} sessions × 2 paths per pack`)
for (const packKind of ACTIVE_PACKS) {
  const pool = getPool(packKind)
  const poolSizes = { mythic: pool.mythic.length, gold: pool.gold.length, silver: pool.silver.length, bronze: pool.bronze.length }
  const dups: Record<string, string[]> = {}
  for (const [r, cards] of Object.entries(pool)) { const d = dupIds(cards); if (d.length) dups[r] = d }

  const dirSessions: SessionResult[] = [], svSessions: SessionResult[] = []
  for (let s = 0; s < SESSIONS; s++) {
    const d = simulateSession(packKind, 'direct', s, 0x1000 + s * 17); assert.deepEqual(d.errors, []); dirSessions.push(d)
    const sv = simulateSession(packKind, 'server', s, 0x2000 + s * 31); assert.deepEqual(sv.errors, []); svSessions.push(sv)
  }
  const dirAgg = aggregatePath(packKind, dirSessions), svAgg = aggregatePath(packKind, svSessions)
  assertDistribution(packKind, dirAgg); assertDistribution(packKind, svAgg)
  const zeroRarities: Record<string, number> = {}
  for (const [r, cards] of Object.entries(pool)) zeroRarities[r] = cards.filter(c => (dirAgg.aggregatePerCard[c.id] ?? 0) === 0 && (svAgg.aggregatePerCard[c.id] ?? 0) === 0).length
  out.analysis.zeroCountsByRarity[packKind] = zeroRarities
  out.analysis.packResults[packKind] = { packKind, poolSizes, duplicateIdsByRarity: dups, direct: dirAgg, server: svAgg }
  console.log(`\n${packKind} (pool m${poolSizes.mythic}/g${poolSizes.gold}/s${poolSizes.silver}/b${poolSizes.bronze})`)
  console.log(`  direct: maxPerCard=${Math.max(...dirSessions.map(s => s.maxPerCard))} chiZ=${dirAgg.chiNormalizedZ.toFixed(2)} maxAbsZ=${dirAgg.maxAbsZ.toFixed(2)} zeroMythics=${zeroRarities.mythic ?? 0}`)
  console.log(`  server: maxPerCard=${Math.max(...svSessions.map(s => s.maxPerCard))} chiZ=${svAgg.chiNormalizedZ.toFixed(2)} maxAbsZ=${svAgg.maxAbsZ.toFixed(2)} zeroMythics=${zeroRarities.mythic ?? 0}`)
}


// Force the shared mythic floor so all eligible cards can be checked without millions of natural rolls.
for (const kind of ['scout', 'elite', 'ten', 'cn', 'pac', 'west'] as const) {
  const g = newGacha(`forced-${kind}`, 'Audit', '2026-01-01')
  const counts: Record<string, number> = {}; let total = 0
  const eligible = getPool(kind).mythic
  for (let i = 0; i < 4000; i++) {
    g.packs[kind] = 1; g.mythicDry = MYTHIC_FLOOR - 1
    const mythics = openPack(g, kind, 'pack').filter(p => p.card.rarity === 'mythic')
    assert(mythics.length > 0, `${kind} failed pity`)
    for (const p of mythics) { assert(eligible.some(c => c.id === p.card.id)); counts[p.card.id] = (counts[p.card.id] ?? 0) + 1; total++ }
    assert(g.mythicDry >= 0 && g.mythicDry < MYTHIC_FLOOR)
  }
  for (const c of eligible) assert(counts[c.id] > 0, `${kind}/${c.id} unavailable at pity`)
  assertDistribution(kind, aggregatePath(kind, [{ actualDrawCount: total, maxPerCard: Math.max(...Object.values(counts)), maxCardId: null, rarityCounts: { mythic: total }, perCardCounts: counts, errors: [] }]))
}

// Paying with a bought pack or coins must use the same random draw, including server entropy.
for (const kind of PACK_ORDER.filter(k => PACKS[k].shop !== false)) {
  const a = newGacha(`payment-${kind}`, 'Audit', '2026-01-01'); a.coins = 1e9; a.packs[kind] = 1
  const b = structuredClone(a), env = { now: 1767225600000, today: '2026-01-01', seed: 0x98765432 }
  const price = packCost(kind, env.today, a)
  const ra = runAction(a, 'open', { kind, payWith: 'coins', expectedPrice: price }, env)
  const rb = runAction(b, 'open', { kind, payWith: 'pack' }, env)
  assert(ra.ok && rb.ok); assert.deepEqual(ra.result, rb.result)
  assert.equal(a.seed, b.seed); assert.equal(a.pity, b.pity); assert.equal(a.mythicDry, b.mythicDry)
  assert.equal(a.coins, 1e9 - price); assert.equal(b.packs[kind], 0)
}

// Persisting the final seed must resume at the next draw, not replay the previous pack.
{
  const g = newGacha('replay', 'Audit', '2026-01-01'); g.packs.ten = 40
  const clone = JSON.parse(JSON.stringify(g)) as typeof g
  const baseline: string[][] = [], replay: string[][] = [], otherEntropy: string[][] = []
  const other = structuredClone(g)
  for (let i = 0; i < 20; i++) {
    const env = { now: 1767225600000 + i, today: '2026-01-01', seed: SEED_STREAM(i) }
    const a = runAction(g, 'open', { kind: 'ten', payWith: 'pack' }, env)
    const b = runAction(clone, 'open', { kind: 'ten', payWith: 'pack' }, env)
    const c = runAction(other, 'open', { kind: 'ten', payWith: 'pack' }, { ...env, seed: SEED_STREAM(i + 100) })
    assert(a.ok && b.ok && c.ok)
    const ids = (r: typeof a) => (r.result as { pulled: { cardId: string }[] }).pulled.map(p => p.cardId)
    baseline.push(ids(a)); replay.push(ids(b)); otherEntropy.push(ids(c))
  }
  assert.deepEqual(baseline, replay); assert.notDeepEqual(baseline, otherEntropy)
  assert.equal(new Set(baseline.map(x => x.join(','))).size, 20)
}
console.log('PASS conditional distribution, regional pool breadth, forced mythic coverage, payment parity and deterministic server entropy')
