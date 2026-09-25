/** Temporary demo rules. Production release must pass npm run check:production.
 * See docs/production-release-checklist.md before changing this switch.
 */
export const RELEASE_STAGE = 'production'
export const RELEASE_POLICIES = Object.freeze({
  demo: Object.freeze({ starterCoins: 100_000, starterPacks: Object.freeze({ scout: 10, elite: 10, ten: 10, coach: 1 }), tradeDays: 0, tradePulls: 0, protectSeconds: 0, phoneEnabled: false }),
  production: Object.freeze({ starterCoins: 3_000, starterPacks: Object.freeze({ scout: 3, elite: 1, ten: 0, coach: 1 }), tradeDays: 3, tradePulls: 50, protectSeconds: 60, phoneEnabled: true }),
})
export const RELEASE_POLICY = RELEASE_POLICIES[RELEASE_STAGE]
