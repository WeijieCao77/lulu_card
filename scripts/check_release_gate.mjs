import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'lulu-release-gate-'))
const sha = value => createHash('sha256').update(value).digest('hex')
const files = ['release-gate.js', 'release-policy.js', 'market-policy.js', 'phone-api.js', 'phone-config.js']
try {
  for (const file of files) copyFileSync(join(root, file), join(tmp, file))
  const policyFile = join(tmp, 'release-policy.js')
  const production = readFileSync(policyFile, 'utf8').replace("export const RELEASE_STAGE = 'demo'", "export const RELEASE_STAGE = 'production'")
  assert.match(production, /RELEASE_STAGE = 'production'/)
  writeFileSync(policyFile, production)
  writeFileSync(join(tmp, 'package.json'), '{"type":"module"}')
  mkdirSync(join(tmp, 'dist'))
  mkdirSync(join(tmp, 'dist', 'assets'))
  mkdirSync(join(tmp, 'dist-server'))
  writeFileSync(join(tmp, 'dist', 'index.html'), '<html>formal</html>')
  writeFileSync(join(tmp, 'dist', 'assets', 'app.js'), 'formal bundle')
  writeFileSync(join(tmp, 'dist-server', 'engine.mjs'), 'formal engine')
  const policySha256 = sha(production)
  const buildId = randomUUID()
  const frontend = { stage: 'production', buildId, policySha256,
    indexSha256: sha('<html>formal</html>'), files: { 'index.html': sha('<html>formal</html>'), 'assets/app.js': sha('formal bundle') } }
  const engineManifest = { stage: 'production', buildId, policySha256, bundleSha256: sha('formal engine') }
  writeFileSync(join(tmp, 'dist', 'release-build.json'), JSON.stringify(frontend))
  writeFileSync(join(tmp, 'dist-server', 'release-build.json'), JSON.stringify(engineManifest))
  const { inspectProductionRelease } = await import(pathToFileURL(join(tmp, 'release-gate.js')).href)
  const env = { NODE_ENV: 'production', PHONE_GATE: '1', DATABASE_URL: 'postgres://user:pass@localhost/db',
    ALIYUN_SMS_ACCESS_KEY_ID: 'realAccessId12345678', ALIYUN_SMS_ACCESS_KEY_SECRET: 'realAccessSecret1234567890',
    ALIYUN_SMS_SIGN_NAME: '真实签名', ALIYUN_SMS_TEMPLATE_CODE: '100001', ANALYTICS_TOKEN: 'a'.repeat(32), PHONE_KEY: 'k'.repeat(32), PHONE_SALT: 's'.repeat(32),
    TRADE_DAYS: '0', TRADE_PULLS: '0', MARKET_PROTECT_SEC: '0', MARKET_GUARD: 'off', MARKET_GUARD_AUTO: '' }
  const engineModule = { RELEASE_STAGE: 'production', newGacha: () => ({ coins: 3000, packs: { scout: 3, elite: 1, coach: 1 } }) }
  let result = inspectProductionRelease({ env, engineModule })
  assert.equal(result.ok, true, result.errors.join('; '))
  assert.deepEqual([result.market.tradeDays, result.market.tradePulls, result.market.protectSeconds], [3, 50, 60])
  result = inspectProductionRelease({ env: { ...env, PHONE_GATE: '0' }, engineModule })
  assert.equal(result.ok, false)
  result = inspectProductionRelease({ env: { ...env, PHONE_SMS_DEV: '1' }, engineModule })
  assert.equal(result.ok, false)
  result = inspectProductionRelease({ env: { ...env, ENGINE_FROM_SOURCE: '1' }, engineModule })
  assert.equal(result.ok, false)
  result = inspectProductionRelease({ env, engineModule: { ...engineModule, RELEASE_STAGE: 'demo' } })
  assert.equal(result.ok, false)
  result = inspectProductionRelease({ env, engineModule, engineManifest: { ...engineManifest, buildId: randomUUID() } })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('different builds')))
  result = inspectProductionRelease({ env: { ...env, ALIYUN_SMS_TEMPLATE_CODE: '' }, engineModule })
  assert.equal(result.ok, false)
  result = inspectProductionRelease({ env: { ...env, PHONE_KEY: 'REPLACE_WITH_ANOTHER_RANDOM_64_HEX_CHARACTERS' }, engineModule })
  assert.equal(result.ok, false)
  writeFileSync(join(tmp, 'dist', 'assets', 'app.js'), 'stale bundle')
  result = inspectProductionRelease({ env, engineModule })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('frontend asset differs')))
  console.log('ok formal release gate: matching artifacts pass; weak market settings clamp; phone/dev/stale build mismatches block')
} finally {
  const target = realpathSync(tmp)
  assert.equal(dirname(target).toLowerCase(), realpathSync(tmpdir()).toLowerCase())
  assert.match(basename(target), /^lulu-release-gate-/)
  rmSync(target, { recursive: true, force: true })
}
