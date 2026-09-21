export type ReleasePolicy = Readonly<{ starterCoins: number; starterPacks: Readonly<{ scout: number; elite: number; ten: number; coach: number }>; tradeDays: number; tradePulls: number; protectSeconds: number; phoneEnabled: boolean }>
export const RELEASE_STAGE: 'demo' | 'production'
export const RELEASE_POLICIES: Readonly<Record<'demo' | 'production', ReleasePolicy>>
export const RELEASE_POLICY: ReleasePolicy
