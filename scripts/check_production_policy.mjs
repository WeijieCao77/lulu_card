// Read-only pre-release gate. Run with the intended production environment.
import { RELEASE_STAGE, RELEASE_POLICY } from '../release-policy.js'
import { TRADE_DAYS, TRADE_PULLS } from '../market-api.js'
import { PROTECT_SEC } from '../market-guard.js'
import { smsConfigured } from '../phone-api.js'
import { validatePhoneSecrets } from '../phone-config.js'

const failures = []
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'BLOCK'} ${label}`); if (!ok) failures.push(label) }
check(RELEASE_STAGE === 'production', 'Release stage is production (demo must not be published as the formal release)')
check(RELEASE_POLICY.starterCoins === 3000, 'Starter coins restored to 3,000')
check(TRADE_DAYS >= 3 && TRADE_PULLS >= 50, 'Effective market gates: at least 3 days and 50 pulls')
check(PROTECT_SEC >= 60, 'Effective buyout protection: at least 60 seconds')
check(RELEASE_POLICY.phoneEnabled && process.env.PHONE_GATE !== '0', 'Phone verification enabled')
check(process.env.PHONE_SMS_DEV !== '1' && smsConfigured(), 'Real SMS provider configured, no development codes')
check((process.env.MARKET_GUARD ?? 'ban') === 'ban', 'Automatic market enforcement enabled')
const rules = new Set((process.env.MARKET_GUARD_AUTO ?? 'A,E').toUpperCase().split(/[^A-E]+/).filter(Boolean))
check(rules.has('A') && rules.has('E'), 'Anti-script and circular-trading auto rules A/E enabled')
check(!!process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('pglite:'), 'Persistent production database configured')
try { validatePhoneSecrets({ ...process.env, NODE_ENV: 'production' }) } catch { failures.push('Stable phone secrets missing or weak'); console.log('BLOCK Stable phone secrets missing or weak') }
const keys = ['ANALYTICS_TOKEN', 'PHONE_KEY', 'PHONE_SALT'].map(k => process.env[k])
check(keys.every(k => k && k.length >= 24) && new Set(keys).size === 3, 'Three independent stable administration/phone secrets')
try {
  const engine = await import('../dist-server/engine.mjs')
  check(engine.newGacha('release-check', 'check', '2026-01-01').coins === 3000, 'Built server engine uses production starter coins')
} catch { check(false, 'Build the server before running the production check') }
console.log('Also complete docs/production-release-checklist.md: configuration checks do not replace abuse tests or SMS delivery verification.')
process.exitCode = failures.length ? 1 : 0
