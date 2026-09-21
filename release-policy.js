/** Temporary demo rules. Production release must pass npm run check:production.
 * See docs/production-release-checklist.md before changing this switch.
 */
export const RELEASE_STAGE = 'demo'
export const RELEASE_POLICIES = Object.freeze({
  demo: Object.freeze({ starterCoins: 100_000, tradeDays: 0, tradePulls: 0, protectSeconds: 0, phoneEnabled: false }),
  production: Object.freeze({ starterCoins: 3_000, tradeDays: 3, tradePulls: 50, protectSeconds: 60, phoneEnabled: true }),
})
export const RELEASE_POLICY = RELEASE_POLICIES[RELEASE_STAGE]
