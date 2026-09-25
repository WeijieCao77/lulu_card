/** Wrong admin tokens lock a network bucket for the window; players are never touched. */
import assert from 'node:assert/strict'
import { makeAdminGuard } from '../admin-guard.js'
import { validatePhoneSecrets, ADMIN_TOKEN_MIN } from '../phone-config.js'
import { RELEASE_POLICIES } from '../release-policy.js'

let t = 0
const guard = makeAdminGuard({ max: 10, windowMs: 600_000, now: () => t })
for (let i = 0; i < 9; i++) guard.fail('a')
assert.equal(guard.locked('a'), false, 'nine wrong tokens: still allowed')
guard.fail('a')
assert.equal(guard.locked('a'), true, 'ten wrong tokens: locked')
assert.equal(guard.locked('b'), false, 'another network is not affected')
t += 599_000
assert.equal(guard.locked('a'), true, 'still locked inside the window')
t += 2_000
assert.equal(guard.locked('a'), false, 'unlocked once the window has passed')
guard.fail('a')
assert.equal(guard.locked('a'), false, 'a fresh window starts counting from one')

// the admin token may be short (8+); the phone key and salt may not
const env = { NODE_ENV: 'production', PHONE_GATE: '1', ANALYTICS_TOKEN: 'owner123',
  PHONE_KEY: 'k'.repeat(64), PHONE_SALT: 's'.repeat(64),
  ALIYUN_SMS_ACCESS_KEY_ID: 'id', ALIYUN_SMS_ACCESS_KEY_SECRET: 'secret', ALIYUN_SMS_SIGN_NAME: 'sign', ALIYUN_SMS_TEMPLATE_CODE: '100001' }
assert.equal(ADMIN_TOKEN_MIN, 8)
assert.doesNotThrow(() => validatePhoneSecrets(env, RELEASE_POLICIES.production), 'an 8-character admin token is accepted')
assert.throws(() => validatePhoneSecrets({ ...env, ANALYTICS_TOKEN: 'short12' }, RELEASE_POLICIES.production), 'seven characters is refused')
assert.throws(() => validatePhoneSecrets({ ...env, PHONE_KEY: 'k'.repeat(23) }, RELEASE_POLICIES.production), 'the phone key still needs 24')
console.log('admin guard: ten wrong tokens lock one network for ten minutes; admin token 8+, phone secrets 24+')
