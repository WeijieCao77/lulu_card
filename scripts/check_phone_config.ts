import assert from 'node:assert/strict'
import { validatePhoneSecrets } from '../phone-config.js'
import { RELEASE_POLICIES } from '../release-policy.js'
assert.throws(() => validatePhoneSecrets({ NODE_ENV: 'production' }), /missing or weak/)
assert.throws(() => validatePhoneSecrets({ RAILWAY_PROJECT_ID: 'test', ANALYTICS_TOKEN: 'short' }), /missing or weak/)
// legacy/dedicated/development modes are the startup rules under the demo policy; formal ones follow
const demo = RELEASE_POLICIES.demo
assert.equal(validatePhoneSecrets({ NODE_ENV: 'production', ANALYTICS_TOKEN: 'a'.repeat(32) }, demo).mode, 'legacy-admin')
assert.equal(validatePhoneSecrets({ NODE_ENV: 'production', PHONE_KEY: 'k'.repeat(32), PHONE_SALT: 's'.repeat(32), ANALYTICS_TOKEN: 'a'.repeat(32) }, demo).mode, 'dedicated')
assert.equal(validatePhoneSecrets({}, demo).mode, 'development')
const formal = { NODE_ENV: 'production', ANALYTICS_TOKEN: 'a'.repeat(32), PHONE_KEY: 'k'.repeat(32), PHONE_SALT: 's'.repeat(32),
  ALIYUN_SMS_ACCESS_KEY_ID: 'id', ALIYUN_SMS_ACCESS_KEY_SECRET: 'secret', ALIYUN_SMS_SIGN_NAME: 'current-sign', ALIYUN_SMS_TEMPLATE_CODE: 'current-template' }
assert.equal(validatePhoneSecrets(formal, RELEASE_POLICIES.production).mode, 'dedicated')
assert.throws(() => validatePhoneSecrets({ ...formal, PHONE_GATE: '0' }, RELEASE_POLICIES.production), /cannot disable/)
assert.throws(() => validatePhoneSecrets({ ...formal, PHONE_SMS_DEV: '1' }, RELEASE_POLICIES.production), /development SMS/)
assert.throws(() => validatePhoneSecrets({ ...formal, ALIYUN_SMS_TEMPLATE_CODE: '' }, RELEASE_POLICIES.production), /requires configured/)
assert.throws(() => validatePhoneSecrets({ ...formal, PHONE_KEY: formal.PHONE_SALT }, RELEASE_POLICIES.production), /independent/)
assert.throws(() => validatePhoneSecrets({ ...formal, PHONE_KEY: 'REPLACE_WITH_ANOTHER_RANDOM_64_HEX_CHARACTERS' }, RELEASE_POLICIES.production), /missing or weak/)
for (const prefix of ['CHANGE', 'TODO', 'YOUR', 'EXAMPLE', 'TEST']) {
  assert.throws(() => validatePhoneSecrets({ ...formal, PHONE_SALT: `${prefix}_WITH_A_REAL_RANDOM_SECRET_1234567890` }, RELEASE_POLICIES.production), /missing or weak/)
  assert.throws(() => validatePhoneSecrets({ ...formal, ANALYTICS_TOKEN: `${prefix}_WITH_A_REAL_RANDOM_SECRET_1234567890` }, RELEASE_POLICIES.production), /independent/)
}
console.log('phone startup validation: missing/weak rejected, legacy identities preserved, dedicated secrets accepted')
