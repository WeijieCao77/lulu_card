import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))

// pure resolver tests with stage injection
const { resolveMarketPolicy, resolveMarketGuardMode } = await import('../market-policy.js')

const MIN = { tradeDays: 3, tradePulls: 50, protectSeconds: 60 }
const weakValues = [null, undefined, '', '0', '-1', '1.5', 'NaN', 'Infinity', '-Infinity', '1e999', 'abc', '999999999999999999999999999999', 0, -1, 1.5, NaN, Infinity, -Infinity]

for (const key of ['TRADE_DAYS', 'TRADE_PULLS', 'MARKET_PROTECT_SEC']) {
  for (const v of weakValues) {
    const env = { [key]: String(v) }
    const p = resolveMarketPolicy({ stage: 'production', env })
    const field = key === 'TRADE_DAYS' ? 'tradeDays' : key === 'TRADE_PULLS' ? 'tradePulls' : 'protectSeconds'
    assert.ok(Number.isFinite(p[field]), `production ${key} ${v} must not be NaN/Infinity`)
    assert.ok(p[field] >= MIN[field], `production ${key} ${v} must clamp to >= minimum`)
    if (field === 'tradeDays') assert.ok(Number.isInteger(p.tradeDays), 'production tradeDays must be integer')
  }
}

// demo exact defaults and legacy fractional override
let p = resolveMarketPolicy({ stage: 'demo', env: {} })
assert.deepEqual(p, { tradeDays: 0, tradePulls: 0, protectSeconds: 0, guardMode: 'ban', autoRules: ['A', 'E'] })
p = resolveMarketPolicy({ stage: 'demo', env: { TRADE_DAYS: '2.5', TRADE_PULLS: '7', MARKET_PROTECT_SEC: '10' } })
assert.deepEqual(p, { tradeDays: 2.5, tradePulls: 7, protectSeconds: 10, guardMode: 'ban', autoRules: ['A', 'E'] })

// demo fractional large integer override preserved (legacy parser allows any non-negative finite integer for pulls/sec)
p = resolveMarketPolicy({ stage: 'demo', env: { TRADE_PULLS: '2147483647', MARKET_PROTECT_SEC: '31536000' } })
assert.deepEqual(p, { tradeDays: 0, tradePulls: 2147483647, protectSeconds: 31536000, guardMode: 'ban', autoRules: ['A', 'E'] })

// production valid stricter values allowed
p = resolveMarketPolicy({ stage: 'production', env: { TRADE_DAYS: '5', TRADE_PULLS: '100', MARKET_PROTECT_SEC: '90' } })
assert.deepEqual(p, { tradeDays: 5, tradePulls: 100, protectSeconds: 90, guardMode: 'ban', autoRules: ['A', 'E'] })

// Even a future policy edit to weaker defaults must not silently disable the release floor.
p = resolveMarketPolicy({ stage: 'production', policy: { tradeDays: 0, tradePulls: 0, protectSeconds: 0 }, env: { TRADE_DAYS: '0', TRADE_PULLS: '0', MARKET_PROTECT_SEC: '0', MARKET_GUARD: 'off', MARKET_GUARD_AUTO: '' } })
assert.deepEqual(p, { tradeDays: 3, tradePulls: 50, protectSeconds: 60, guardMode: 'ban', autoRules: ['A', 'E'] })

// production fractional days ceil to not silently weaken operator intended minimum
p = resolveMarketPolicy({ stage: 'production', env: { TRADE_DAYS: '3.1' } })
assert.deepEqual(p, { tradeDays: 4, tradePulls: 50, protectSeconds: 60, guardMode: 'ban', autoRules: ['A', 'E'] })

// production limits reject beyond safe baseline to avoid SQL interval/seconds overflow
p = resolveMarketPolicy({ stage: 'production', env: { TRADE_DAYS: '3651', TRADE_PULLS: '2147483648', MARKET_PROTECT_SEC: '31536001' } })
assert.deepEqual(p, { tradeDays: 3, tradePulls: 50, protectSeconds: 60, guardMode: 'ban', autoRules: ['A', 'E'] })

// production always ban including explicit mode option
for (const m of ['off', 'watch', 'ban', '', 'bad']) {
  p = resolveMarketPolicy({ stage: 'production', env: { MARKET_GUARD: m } })
  assert.equal(p.guardMode, 'ban', `production MARKET_GUARD=${m} must be ban`)
}
p = resolveMarketPolicy({ stage: 'demo', env: { MARKET_GUARD: 'off' } })
assert.equal(p.guardMode, 'off')

// production autoRules always include A,E even env empty or B only
for (const a of ['', 'B', 'C', 'D', 'B,D', 'A']) {
  p = resolveMarketPolicy({ stage: 'production', env: { MARKET_GUARD_AUTO: a } })
  assert.ok(p.autoRules.includes('A'), `production auto ${a} must include A`)
  assert.ok(p.autoRules.includes('E'), `production auto ${a} must include E`)
}
// B/C/D only auto if explicitly added
p = resolveMarketPolicy({ stage: 'production', env: { MARKET_GUARD_AUTO: 'B' } })
assert.deepEqual(new Set(p.autoRules), new Set(['A', 'E', 'B']))
p = resolveMarketPolicy({ stage: 'production', env: { MARKET_GUARD_AUTO: '' } })
assert.deepEqual(new Set(p.autoRules), new Set(['A', 'E']))
p = resolveMarketPolicy({ stage: 'demo', env: { MARKET_GUARD_AUTO: 'A,B' } })
assert.deepEqual(p.autoRules, ['A', 'B'])

// resolveMarketGuardMode
assert.equal(resolveMarketGuardMode('off', 'demo'), 'off')
assert.equal(resolveMarketGuardMode('watch', 'demo'), 'watch')
assert.equal(resolveMarketGuardMode('ban', 'demo'), 'ban')
assert.equal(resolveMarketGuardMode('bad', 'demo'), 'bad', 'demo preserves prior watch-like behavior for unknown mode')
assert.equal(resolveMarketGuardMode('off', 'production'), 'ban')
assert.equal(resolveMarketGuardMode('watch', 'production'), 'ban')
assert.equal(resolveMarketGuardMode(null, 'production'), 'ban')

// unknown stage reject even if policy supplied
assert.throws(() => resolveMarketPolicy({ stage: 'staging', policy: { tradeDays: 3, tradePulls: 50, protectSeconds: 60 } }), /unknown release stage/)
assert.throws(() => resolveMarketPolicy({ stage: '' }), /unknown release stage/)
assert.throws(() => resolveMarketPolicy({ stage: 'PRODUCTION' }), /unknown release stage/)

console.log('ok  纯策略解析：弱/无效/负/小数/NaN/Infinity/超大值均安全；demo保持legacy，production钳制到最小并整数天数；production强制ban与A,E自动规则；未知阶段拒绝')

// integration: spawn isolated temp copies with production stage, import market-policy and guard only
const tmp = mkdtempSync(join(tmpdir(), 'market-policy-check-'))
try {
  for (const f of ['release-policy.js', 'market-policy.js', 'market-guard.js']) {
    copyFileSync(join(rootDir, f), join(tmp, f))
  }
  // rewrite release stage to production in temp copy
  writeFileSync(join(tmp, 'release-policy.js'), readFileSync(join(tmp, 'release-policy.js'), 'utf8').replace("export const RELEASE_STAGE = 'demo'", "export const RELEASE_STAGE = 'production'"))
  // add package.json type module for Windows/Node ESM resolution
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ type: 'module' }))

  // integration check via child process with weak env vars mimicking Railway downgrade
  const childScript = `
    import { pathToFileURL } from 'node:url'
    import assert from 'node:assert/strict'
    const tmp = ${JSON.stringify(tmp)}
    const prodPolicy = await import(pathToFileURL(tmp + '/market-policy.js').href)
    assert.deepEqual(
      { tradeDays: prodPolicy.TRADE_DAYS, tradePulls: prodPolicy.TRADE_PULLS, protectSeconds: prodPolicy.PROTECT_SEC, guardMode: prodPolicy.GUARD_MODE, autoRules: prodPolicy.AUTO_RULES },
      { tradeDays: 3, tradePulls: 50, protectSeconds: 60, guardMode: 'ban', autoRules: ['A', 'E'] }
    )
    const prodGuard = await import(pathToFileURL(tmp + '/market-guard.js').href)
    assert.equal(prodGuard.PROTECT_SEC, 60)
    assert.deepEqual(prodGuard.GUARD, {
      ULTRA_SEC: 2, QUICK_SEC: 105, FRESH_SEC: 300,
      LOOP_N: 30, ULTRA_N: 5, SELLER_CAP: 3, QUICK_DAY: 40,
      SELLER_CAP_WEEK: 10, QUICK_WEEK: 120, FRESH_N: 100, FRESH_HOURS: 20,
      FIRST_DAYS: 3, REPEAT_DAYS: 5,
    })
    for (const mode of ['off', 'watch', 'ban']) {
      const guard = prodGuard.makeMarketGuard({}, { mode })
      assert.equal(guard.mode, 'ban')
    }
    const auto = new Set(prodPolicy.AUTO_RULES)
    assert.ok(auto.has('A') && auto.has('E'))
    const now = Date.now()
    const buys = Array.from({ length: 5 }, (_, i) => ({ made: now - i * 1000, created: now - i * 1000 - 500, seller: 's', won: true }))
    assert.equal(prodGuard.judge(buys, now).verdict, 'ban')
    const loop = Array.from({ length: 31 }, (_, i) => ({ made: now - i * 10000, created: now - i * 10000 - 600000, seller: 'same', card_id: 'same-card', won: true }))
    assert.equal(prodGuard.judge(loop, now).rule, 'E')
    assert.equal(prodGuard.judge(loop, now).verdict, 'ban')
    console.log('child integration ok')
  `
  writeFileSync(join(tmp, '_check.mjs'), childScript)
  execFileSync(process.execPath, [join(tmp, '_check.mjs')], {
    cwd: tmp,
    env: {
      ...process.env,
      TRADE_DAYS: '0',
      TRADE_PULLS: '0',
      MARKET_PROTECT_SEC: '0',
      MARKET_GUARD: 'off',
      MARKET_GUARD_AUTO: ''
    },
    stdio: 'pipe'
  })
  console.log('ok  集成：生产阶段下 market-policy/guard 常量与钳制正确，off/watch 无法绕过，规则保持')
} finally {
  // Only remove the explicitly created files, never recurse over a computed path.
  for (const file of ['release-policy.js', 'market-policy.js', 'market-guard.js', 'package.json', '_check.mjs']) rmSync(join(tmp, file), { force: true })
  rmdirSync(tmp)
}

// verify market-api.js imports from market-policy and not direct release-policy for rules
const marketApiSource = readFileSync(join(rootDir, 'market-api.js'), 'utf8')
assert.ok(/import\s*\{[^}]*resolveMarketPolicy[^}]*\}\s*from\s*['"]\.\/market-policy\.js['"]/.test(marketApiSource), 'market-api must import the policy resolver')
assert.ok(!/import\s*\{[^}]*TRADE_DAYS[^}]*\}\s*from\s*['"]\.\/release-policy\.js['"]/.test(marketApiSource), 'market-api must not import trade constants from release-policy')
assert.ok(/const\s+resolvePolicy\s*=\s*resolveMarketPolicy\(\)\s*;?/.test(marketApiSource), 'market-api must call resolver once')
console.log('ok  源码接线：market-api 引用 market-policy 常量')
