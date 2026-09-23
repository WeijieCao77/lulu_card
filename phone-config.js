import { RELEASE_POLICY } from './release-policy.js'

/** Validate startup without silently rotating the keys protecting existing identities. */
export function validatePhoneSecrets(env = process.env, policy = RELEASE_POLICY) {
  const production = env.NODE_ENV === 'production' || !!env.RAILWAY_PROJECT_ID
  const legacy = env.ANALYTICS_TOKEN || ''
  const key = env.PHONE_KEY || legacy
  const salt = env.PHONE_SALT || legacy
  const placeholder = (value) => /^(?:REPLACE|CHANGE|TODO|YOUR|EXAMPLE|TEST)(?:_|-|\b)/i.test(value || '')
  if ((production || policy.phoneEnabled) && (!key || !salt || key.length < 24 || salt.length < 24
    || placeholder(key) || placeholder(salt)
    || key === 'valmanager-phone-key' || salt === 'valmanager-phone')) {
    throw new Error('Production phone secrets missing or weak; preserve existing secrets during configuration, never generate replacements at boot')
  }
  if (policy.phoneEnabled) {
    if (!legacy || legacy.length < 24 || placeholder(legacy) || new Set([legacy, key, salt]).size !== 3) {
      throw new Error('Formal release requires three independent administration and phone secrets')
    }
    if (env.PHONE_GATE === '0' || env.PHONE_SMS_DEV === '1') {
      throw new Error('Formal release cannot disable phone verification or enable development SMS codes')
    }
    if (!env.ALIYUN_SMS_ACCESS_KEY_ID || !env.ALIYUN_SMS_ACCESS_KEY_SECRET
      || !env.ALIYUN_SMS_SIGN_NAME || !env.ALIYUN_SMS_TEMPLATE_CODE) {
      throw new Error('Formal release requires configured Aliyun PNVS SMS credentials, signature, and template')
    }
  }
  if (!production && (!key || !salt)) return { mode: 'development' }
  return { mode: !env.PHONE_KEY || !env.PHONE_SALT || key === legacy || salt === legacy ? 'legacy-admin' : 'dedicated' }
}
