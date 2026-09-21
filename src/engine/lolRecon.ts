/** Training positions on the Rift. Normalized coordinates, not live match data. */
export interface ReconWindow { map: 'rift'; name: string; x: number; y: number; s: number; spots: readonly (readonly [number, number])[] }
export const RECON_WINDOWS: readonly ReconWindow[] = [
  { map: 'rift', name: '全图视野训练', x: 0, y: 0, s: 1,
    spots: [[.15,.75],[.15,.5],[.15,.28],[.3,.15],[.5,.15],[.75,.15],
      [.85,.3],[.85,.5],[.85,.72],[.7,.85],[.5,.85],[.3,.85],
      [.3,.7],[.4,.6],[.5,.5],[.6,.4],[.7,.3],[.35,.4],[.6,.65]] },
]
