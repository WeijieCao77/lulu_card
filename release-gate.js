/** Fail closed before a formal-release server begins accepting requests. */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RELEASE_STAGE, RELEASE_POLICY } from './release-policy.js'
import { resolveMarketPolicy } from './market-policy.js'
import { smsConfigured } from './phone-api.js'
import { ADMIN_TOKEN_MIN, validatePhoneSecrets } from './phone-config.js'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const local = name => fileURLToPath(new URL(name, import.meta.url))

export function inspectProductionRelease({ env = process.env, frontendManifest, engineManifest, engineModule, policySource } = {}) {
  const errors = []
  const requireRule = (ok, reason) => { if (!ok) errors.push(reason) }
  requireRule(RELEASE_STAGE === 'production', 'release stage must be production')
  requireRule(env.NODE_ENV === 'production', 'NODE_ENV must be production')
  requireRule(!env.ENGINE_FROM_SOURCE, 'production must load the verified engine bundle')
  requireRule(RELEASE_POLICY.starterCoins === 3000, 'starter coins must be 3,000')
  const packs = RELEASE_POLICY.starterPacks
  requireRule(packs.scout === 3 && packs.elite === 1 && packs.ten === 0 && packs.coach === 1, 'starter packs must be 3/1/0/1')
  const market = resolveMarketPolicy({ env })
  requireRule(market.tradeDays >= 3 && market.tradePulls >= 50 && market.protectSeconds >= 60, 'effective market time, pull and protection gates are weak')
  requireRule(market.guardMode === 'ban' && market.autoRules.includes('A') && market.autoRules.includes('E'), 'effective automatic market enforcement is weak')
  requireRule(RELEASE_POLICY.phoneEnabled && env.PHONE_GATE === '1', 'PHONE_GATE must explicitly equal 1')
  requireRule(env.PHONE_SMS_DEV !== '1', 'development SMS codes must be disabled')
  const smsValues = [env.ALIYUN_SMS_ACCESS_KEY_ID, env.ALIYUN_SMS_ACCESS_KEY_SECRET, env.ALIYUN_SMS_SIGN_NAME, env.ALIYUN_SMS_TEMPLATE_CODE]
  requireRule(smsConfigured(env) && smsValues.every(value => typeof value === 'string' && value.trim().length >= 3
    && !/^(?:replace|change|todo|your|example|test)[_-]/i.test(value.trim()))
    && String(env.ALIYUN_SMS_ACCESS_KEY_SECRET).length >= 16,
  'Aliyun SMS credentials, sign name and template are required')
  let databaseUrlOk = false
  try { const url = new URL(env.DATABASE_URL); databaseUrlOk = ['postgres:', 'postgresql:'].includes(url.protocol) && !!url.hostname && !!url.pathname.slice(1) } catch { /* blocked below */ }
  requireRule(databaseUrlOk, 'persistent PostgreSQL URL required')
  try { validatePhoneSecrets({ ...env, NODE_ENV: 'production' }) } catch { errors.push('stable phone secrets missing or weak') }
  const secretNames = ['ANALYTICS_TOKEN', 'PHONE_KEY', 'PHONE_SALT']
  const secrets = secretNames.map(name => env[name])
  // The phone key and salt protect stored identities: 24+. The admin token is
  // typed by the owner and guessing it is capped per network (admin-guard.js): 8+.
  const minLength = { ANALYTICS_TOKEN: ADMIN_TOKEN_MIN, PHONE_KEY: 24, PHONE_SALT: 24 }
  requireRule(secrets.every((value, i) => typeof value === 'string' && value.length >= minLength[secretNames[i]]
    && !/^(?:replace|change|todo|your|example|test)[_-]/i.test(value.trim())) && new Set(secrets).size === 3,
    'independent stable admin, phone key and phone salt required')

  let manifest = frontendManifest
  let builtEngine = engineManifest
  let source = policySource
  try { manifest ??= JSON.parse(readFileSync(local('./dist/release-build.json'), 'utf8')) } catch { errors.push('frontend release manifest missing or invalid') }
  try { builtEngine ??= JSON.parse(readFileSync(local('./dist-server/release-build.json'), 'utf8')) } catch { errors.push('server release manifest missing or invalid') }
  try { source ??= readFileSync(local('./release-policy.js')) } catch { errors.push('release policy source missing') }
  if (manifest && builtEngine && source) {
    const sourceHash = sha256(source)
    for (const [name, artifact] of [['frontend', manifest], ['engine', builtEngine]]) {
      requireRule(artifact.stage === 'production', `${name} was not built for production`)
      requireRule(artifact.policySha256 === sourceHash, `${name} release policy differs from server source`)
      requireRule(typeof artifact.buildId === 'string' && /^[0-9a-f-]{36}$/.test(artifact.buildId), `${name} build ID missing`)
    }
    requireRule(manifest.buildId === builtEngine.buildId, 'frontend and engine came from different builds')
    try {
      requireRule(manifest.indexSha256 === sha256(readFileSync(local('./dist/index.html'))), 'frontend index changed after build')
      requireRule(builtEngine.bundleSha256 === sha256(readFileSync(local('./dist-server/engine.mjs'))), 'engine changed after build')
      const files = manifest.files
      requireRule(files && typeof files === 'object' && Object.keys(files).length >= 2, 'frontend file inventory missing')
      if (files && typeof files === 'object') {
        const actual = ['index.html', ...readdirSync(local('./dist/assets')).filter(name => /\.(?:js|css)$/.test(name)).map(name => `assets/${name}`)].sort()
        requireRule(JSON.stringify(Object.keys(files).sort()) === JSON.stringify(actual), 'frontend file inventory differs from build output')
        for (const [name, expected] of Object.entries(files)) {
          if (!/^(index\.html|assets\/[a-zA-Z0-9_.-]+\.(?:js|css))$/.test(name)) { errors.push('frontend file inventory contains invalid path'); continue }
          try { requireRule(expected === sha256(readFileSync(local(`./dist/${name}`))), `frontend asset differs: ${name}`) }
          catch { errors.push(`frontend asset missing: ${name}`) }
        }
      }
    } catch { errors.push('frontend or engine build artifact missing') }
  }
  requireRule(engineModule?.RELEASE_STAGE === 'production', 'built engine release stage must be production')
  if (engineModule?.newGacha) {
    const fresh = engineModule.newGacha('release-gate', 'check', '2026-01-01')
    requireRule(fresh.coins === 3000 && fresh.packs?.scout === 3 && fresh.packs?.elite === 1
      && !fresh.packs?.ten && fresh.packs?.coach === 1, 'built engine uses wrong starter supplies')
  }
  return { ok: errors.length === 0, errors, market }
}

export function assertProductionReleaseReady(options) {
  if (RELEASE_STAGE !== 'production') return
  const { errors } = inspectProductionRelease(options)
  if (errors.length) throw new Error(`Formal release blocked: ${errors.join('; ')}`)
}
