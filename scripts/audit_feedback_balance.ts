import { openPack, newGacha, PACKS, SERIES } from '../src/engine/gacha'
import { BASE_PLAYER_CARDS, PLAYER_CARDS } from '../src/engine/cards'
import { Rng } from '../src/engine/rng'
import fs from 'fs'
import path from 'path'
import assert from 'node:assert/strict'

// ----------------------------------------------------------------------------
// config
// ----------------------------------------------------------------------------
const FULL = process.env.FULL !== '0'
const SAMPLING_DRAWS = FULL ? 100002 : 10000
const COLLECTION_RUNS = FULL ? 100 : 10
const COLLECTION_MAX_DRAWS = 30000
const PITY_RUNS = FULL ? 200000 : 20000
const BASE_SEED = 0x5eed1234
const DATE = '2026-01-01'

const SERIES_PACK: Record<string, keyof typeof PACKS> = {
  LPL: 'cn', LCK: 'pac', LCS: 'ame', LEC: 'emea', LCP: 'lcp', CBLOL: 'cblol',
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------
function baseIdsForRegion(region: string): string[] {
  return BASE_PLAYER_CARDS.filter(c => c.region === region).map(c => c.id)
}

function actualBaseReachableForRegion(region: string): Set<string> {
  // mirror gacha seriesPool gold/silver/bronze exactly, from production PLAYER_CARDS
  const pool = PLAYER_CARDS.filter(c =>
    c.region === region && (c.rarity === 'gold' || c.rarity === 'silver' || c.rarity === 'bronze'),
  )
  return new Set(pool.map(c => c.id))
}

function openSeriesPack(g: any, kind: keyof typeof PACKS) {
  g.packs[kind] = 1
  return openPack(g, kind, 'pack', DATE)
}

function sampleSeriesRegion(region: string, draws: number, seed: number) {
  const kind = SERIES_PACK[region]
  const packDraws = PACKS[kind].draws
  const packs = Math.ceil(draws / packDraws)
  const g = newGacha('audit', 'audit', DATE)
  g.seed = seed
  const counts: Record<string, number> = {}
  for (let i = 0; i < packs; i++) {
    const pulls = openSeriesPack(g, kind)
    for (const p of pulls) {
      counts[p.card.id] = (counts[p.card.id] || 0) + 1
    }
  }
  const actualDraws = packs * packDraws
  const observedTotal = Object.values(counts).reduce((s, n) => s + n, 0)
  assert.strictEqual(observedTotal, actualDraws, `${region} sampling draw count`)
  return { counts, actualDraws }
}

function simulateCollectionRun(region: string, maxDraws: number, seed: number) {
  const kind = SERIES_PACK[region]
  const packDraws = PACKS[kind].draws
  const target = new Set(baseIdsForRegion(region))
  const owned = new Set<string>()
  const g = newGacha('audit', 'audit', DATE)
  g.seed = seed
  let draws = 0
  let lastCollected: string | null = null

  while (draws < maxDraws && owned.size < target.size) {
    const pulls = openSeriesPack(g, kind)
    draws += packDraws
    for (const p of pulls) {
      if (target.has(p.card.id)) {
        const before = owned.size
        owned.add(p.card.id)
        if (owned.size === target.size && before !== target.size) {
          lastCollected = p.card.id
        }
      }
    }
  }

  const completed = owned.size === target.size
  const missing = [...target].filter(id => !owned.has(id))
  return { seed, completed, draws, lastCollected: completed ? lastCollected : null, missing }
}

function wilsonCI(success: number, n: number): [number, number] {
  if (n === 0) return [0, 0]
  const z = 1.959963985
  const p = success / n
  const denom = 1 + z * z / n
  const centre = (p + z * z / (2 * n)) / denom
  const interval = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
  return [Math.max(0, centre - interval), Math.min(1, centre + interval)]
}

function quantileFromRuns(runs: { draws: number; completed: boolean }[], q: number): number | null {
  const sorted = [...runs].sort((a, b) => a.draws - b.draws)
  const idx = Math.ceil(sorted.length * q) - 1
  if (idx < 0 || idx >= sorted.length) return null
  return sorted[idx].completed ? sorted[idx].draws : null
}

function hardestCardsSummary(runs: any[], limit = 10): { cardId: string; count: number }[] {
  const freq: Record<string, number> = {}
  for (const r of runs) {
    if (r.completed && r.lastCollected) {
      freq[r.lastCollected] = (freq[r.lastCollected] || 0) + 1
    } else if (!r.completed && Array.isArray(r.missing)) {
      for (const id of r.missing) freq[id] = (freq[id] || 0) + 1
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([cardId, count]) => ({ cardId, count }))
}

// ----------------------------------------------------------------------------
// pity simulation
// ----------------------------------------------------------------------------
function buildWaitCDF(baseRate: number, hardPity: number, softStart?: number, slope?: number) {
  const cdf: number[] = new Array(hardPity)
  let survival = 1
  let analyticMean = 0
  let cum = 0
  for (let d = 1; d <= hardPity; d++) {
    let p: number
    if (d === hardPity) {
      p = 1
    } else {
      p = baseRate
      if (softStart !== undefined && slope !== undefined && d >= softStart) {
        const steps = d - softStart + 1
        p = baseRate + steps * slope
        if (p > 1) p = 1
        if (p < 0) p = 0
      }
    }
    const pdf = survival * p
    cum += pdf
    cdf[d - 1] = cum
    analyticMean += survival // P(T >= d) = S(d-1)
    survival *= 1 - p
  }
  // floating point: final CDF should be exactly 1
  cdf[hardPity - 1] = 1
  assert.ok(Math.abs(cum - 1) < 1e-9, `CDF sum failure base=${baseRate} H=${hardPity}`)
  return { cdf, analyticMean, hardPity }
}

function sampleFromCDF(cdf: number[], rng: Rng): number {
  const u = rng.next()
  let lo = 0
  let hi = cdf.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cdf[mid] < u) lo = mid + 1
    else hi = mid
  }
  return lo + 1 // 1-based wait
}

function simulatePityScenario(
  baseRate: number,
  hardPity: number,
  runs: number,
  seed: number,
  softStart?: number,
  slope?: number,
) {
  const { cdf, analyticMean, hardPity: H } = buildWaitCDF(baseRate, hardPity, softStart, slope)
  const rng = new Rng(seed)
  const waits: number[] = new Array(runs)
  let hardPityCount = 0
  for (let i = 0; i < runs; i++) {
    const w = sampleFromCDF(cdf, rng)
    waits[i] = w
    if (w === H) hardPityCount++
  }
  waits.sort((a, b) => a - b)
  const mean = waits.reduce((s, w) => s + w, 0) / runs
  const p50 = waits[Math.floor(runs * 0.5)]
  const p90 = waits[Math.floor(runs * 0.9)]
  const p99 = waits[Math.floor(runs * 0.99)]
  const hardPityRate = hardPityCount / runs
  const per10kMythics = 10000 / mean
  assert.ok(Math.abs(mean - analyticMean) / analyticMean < 0.1, `pity mean mismatch base=${baseRate} H=${H}`)
  return { mean, p50, p90, p99, hardPityRate, per10kMythics, analyticMean }
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------
async function main() {
  const result: any = {
    metadata: {
      date: new Date().toISOString(),
      seed: BASE_SEED,
      fullScale: FULL,
    },
    staticCheck: {},
    sampling: {},
    collection: {},
    rarityThresholds: { candidates: [], impact: {} },
    pitySimulation: {},
  }

  // 1. static + sampling
  console.log('Static and sampling check...')
  const staticCheck: any = {}
  const sampling: any = {}
  for (const region of SERIES) {
    const base = baseIdsForRegion(region)
    const actual = actualBaseReachableForRegion(region)
    const staticMissing = base.filter(id => !actual.has(id))
    assert.strictEqual(staticMissing.length, 0, `static missing for ${region}: ${staticMissing.join(',')}`)
    assert.strictEqual(actual.size, base.length, `actual pool size mismatch for ${region}`)
    staticCheck[region] = {
      expectedBaseCount: base.length,
      actualReachableBaseCount: actual.size,
      staticMissing,
    }

    const { counts, actualDraws } = sampleSeriesRegion(region, SAMPLING_DRAWS, BASE_SEED + SERIES.indexOf(region) * 101)
    const baseZero = base.filter(id => !(id in counts))
    const extraObserved = Object.keys(counts).filter(id => !base.includes(id))
    // full per-card table: all base cards + any extra observed cards
    const fullCounts: Record<string, number> = {}
    for (const id of base) fullCounts[id] = counts[id] || 0
    for (const id of extraObserved) fullCounts[id] = counts[id]
    sampling[region] = {
      totalDraws: actualDraws,
      sampleMissingBase: baseZero,
      extraObserved,
      fullCounts,
    }
  }
  result.staticCheck = staticCheck
  result.sampling = sampling

  // 2. collection simulation
  console.log('Collection simulation...')
  const collection: any = {}
  for (const region of SERIES) {
    const runs: any[] = []
    let completed = 0
    const baseSeed = 7000 + SERIES.indexOf(region) * 1000
    for (let i = 0; i < COLLECTION_RUNS; i++) {
      const seed = baseSeed + i
      const run = simulateCollectionRun(region, COLLECTION_MAX_DRAWS, seed)
      runs.push(run)
      if (run.completed) completed++
    }
    const p50 = quantileFromRuns(runs, 0.5)
    const p90 = quantileFromRuns(runs, 0.9)
    const completedDraws = runs.filter(r => r.completed).map(r => r.draws)
    const meanCompleted = completedDraws.length
      ? completedDraws.reduce((s, d) => s + d, 0) / completedDraws.length
      : null
    const [ciLow, ciHigh] = wilsonCI(completed, COLLECTION_RUNS)
    collection[region] = {
      runs: COLLECTION_RUNS,
      completed,
      incomplete: COLLECTION_RUNS - completed,
      completionRate: completed / COLLECTION_RUNS,
      wilson95CI: [ciLow, ciHigh],
      p50,
      p90,
      meanCompleted,
      sampleLimit: FULL ? 'full scale' : 'reduced scale',
      hardestCards: hardestCardsSummary(runs, 10),
      runsDetail: runs,
    }
  }
  result.collection = collection

  // 3. rarity thresholds
  console.log('Rarity threshold evaluation...')
  const candidates = [
    { gold: 84, silver: 72 },
    { gold: 86, silver: 76 },
    { gold: 88, silver: 80 },
    { gold: 89, silver: 82 },
  ]
  const rarityCandidates = candidates.map(({ gold, silver }) => {
    const perRegion: Record<string, { gold: number; silver: number; bronze: number }> = {}
    const affected: any[] = []
    for (const region of SERIES) {
      const cards = BASE_PLAYER_CARDS.filter(c => c.region === region)
      const counts = { gold: 0, silver: 0, bronze: 0 }
      for (const c of cards) {
        const newRarity = c.rating >= gold ? 'gold' : c.rating >= silver ? 'silver' : 'bronze'
        counts[newRarity as 'gold' | 'silver' | 'bronze']++
        if (c.rarity !== newRarity) {
          affected.push({ cardId: c.id, oldRarity: c.rarity, newRarity, rating: c.rating })
        }
      }
      perRegion[region] = counts
    }
    return { gold, silver, perRegion, affected }
  })
  result.rarityThresholds = {
    candidates: rarityCandidates,
    impact: {
      notes: [
        'MAX_LEVEL=5; DUPES_FOR and COINS_FOR are shared across rarities; SALVAGE is rarity-dependent',
        'Silver/gold threshold affects cup eligibility, draw pools, salvage and market valuation; card IDs, level cap and upgrade costs are unchanged',
        'Mythic cards remain 90-97 and are not included in gold/silver redistribution',
        'Cup caps, levels, upgrades, and market impact are not fully simulated in this audit',
      ],
    },
  }

  // 4. pity simulation
  console.log('Pity simulation...')
  const baseRates = [0.0001, 0.0004, 0.0006]
  const pityResults: any[] = []
  for (const rate of baseRates) {
    const scenarios = [
      { name: 'old_1201_hard', hardPity: 1201, softStart: undefined, slope: undefined },
      { name: 'new_1200_hard', hardPity: 1200, softStart: undefined, slope: undefined },
      { name: 'soft_800_slope_1e-6', hardPity: 1200, softStart: 800, slope: 0.000001 },
      { name: 'soft_800_slope_5e-6', hardPity: 1200, softStart: 800, slope: 0.000005 },
      { name: 'soft_800_slope_1e-5', hardPity: 1200, softStart: 800, slope: 0.00001 },
    ]
    const baseSeed = BASE_SEED + 50000 + (baseRates.indexOf(rate) * 1000)
    const sims = scenarios.map((s, idx) => {
      const m = simulatePityScenario(rate, s.hardPity, PITY_RUNS, baseSeed + idx, s.softStart, s.slope)
      return { name: s.name, seed: baseSeed + idx, ...m }
    })
    // relative changes vs old 1201 hard
    const old = sims[0]
    for (const s of sims) {
      s.relativeChange = {
        mean: (s.mean - old.mean) / old.mean,
        p50: (s.p50 - old.p50) / old.p50,
        p90: (s.p90 - old.p90) / old.p90,
        p99: (s.p99 - old.p99) / old.p99,
        hardPityRate: s.hardPityRate - old.hardPityRate,
        per10kMythics: (s.per10kMythics - old.per10kMythics) / old.per10kMythics,
      }
    }
    pityResults.push({ baseRate: rate, runs: PITY_RUNS, scenarios: sims })
  }
  result.pitySimulation = {
    notes: [
      'Simulates mythic card wait time only, not full gacha engine',
      'Candidate soft pity from draw 800 with linear slope to hard pity 1200 is NOT implemented',
      'Analytic mean via survival sum is included (analyticMean), simulated mean should match within tolerance',
    ],
    results: pityResults,
  }

  // write output
  const outDir = path.join(process.cwd(), 'docs')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'feedback-balance-audit.json')
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))

  // console summary only
  console.log('Audit complete.')
  console.log('Regions:', SERIES.join(', '))
  console.log('Sampling draws per region:', SAMPLING_DRAWS)
  console.log('Collection runs per region:', COLLECTION_RUNS)
  console.log('Pity simulation runs per scenario:', PITY_RUNS)
  console.log('Output:', outPath)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

