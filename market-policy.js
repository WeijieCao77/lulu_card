import { RELEASE_POLICIES, RELEASE_STAGE } from './release-policy.js'

const INT = Number.isInteger
const FIN = Number.isFinite
const MAX_DAYS = 3650
const MAX_PULLS = 2147483647
const MAX_SECONDS = 31536000

/** Parse release-safe market policy. Demo keeps legacy lenient parsing (fractional tradeDays allowed as before); production clamps weak/invalid env to policy minimums, integer days, safe upper bounds. */
export function resolveMarketPolicy({ stage = RELEASE_STAGE, policy = RELEASE_POLICIES[stage], env = process.env } = {}) {
  if (!['demo', 'production'].includes(stage) || !policy) throw new Error(`unknown release stage ${stage}`)
  const base = policy

  if (stage === 'demo') {
    const tradeDaysEnv = Number(env.TRADE_DAYS)
    const tradeDays = env.TRADE_DAYS && FIN(tradeDaysEnv) && tradeDaysEnv >= 0 ? tradeDaysEnv : base.tradeDays
    const tradePullsEnv = Number(env.TRADE_PULLS)
    const tradePulls = env.TRADE_PULLS && INT(tradePullsEnv) && tradePullsEnv >= 0 ? tradePullsEnv : base.tradePulls
    const protectSecondsEnv = Number(env.MARKET_PROTECT_SEC)
    const protectSeconds = env.MARKET_PROTECT_SEC && INT(protectSecondsEnv) && protectSecondsEnv >= 0 ? protectSecondsEnv : base.protectSeconds
    const guardMode = resolveMarketGuardMode(env.MARKET_GUARD ?? 'ban', stage)
    const autoRules = parseAutoRules(env.MARKET_GUARD_AUTO, stage)
    return { tradeDays, tradePulls, protectSeconds, guardMode, autoRules }
  }

  // production: clamp weak/invalid values to policy minimums, integer days, safe upper bounds
  const minDays = Math.max(3, base.tradeDays ?? 3)
  const minPulls = Math.max(50, base.tradePulls ?? 50)
  const minSec = Math.max(60, base.protectSeconds ?? 60)

  let tradeDays = minDays
  const td = Number(env.TRADE_DAYS)
  if (env.TRADE_DAYS && FIN(td) && td >= minDays && td <= MAX_DAYS) tradeDays = Math.ceil(td)

  let tradePulls = minPulls
  const tp = Number(env.TRADE_PULLS)
  if (env.TRADE_PULLS && INT(tp) && tp >= minPulls && tp <= MAX_PULLS) tradePulls = tp

  let protectSeconds = minSec
  const ps = Number(env.MARKET_PROTECT_SEC)
  if (env.MARKET_PROTECT_SEC && INT(ps) && ps >= minSec && ps <= MAX_SECONDS) protectSeconds = ps

  return { tradeDays, tradePulls, protectSeconds, guardMode: 'ban', autoRules: parseAutoRules(env.MARKET_GUARD_AUTO, stage) }
}

export function resolveMarketGuardMode(value, stage = RELEASE_STAGE) {
  if (!['demo', 'production'].includes(stage)) throw new Error(`unknown release stage ${stage}`)
  if (stage === 'production') return 'ban'
  return value
}

function parseAutoRules(v, stage) {
  const raw = String(v ?? 'A,E').toUpperCase().split(/[^A-E]+/).filter(Boolean)
  const set = new Set(raw)
  if (stage === 'production') {
    set.add('A')
    set.add('E')
  }
  return [...set]
}

/** Effective runtime constants for production/demo (used by market-api.js and market-guard.js). */
export const { tradeDays: TRADE_DAYS, tradePulls: TRADE_PULLS, protectSeconds: PROTECT_SEC, guardMode: GUARD_MODE, autoRules: AUTO_RULES } = resolveMarketPolicy()
