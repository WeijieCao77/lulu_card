/**
 * What plays under the game.
 *
 * Riot's own VALORANT releases, which their fan-content policy lets a
 * non-commercial project like this one use. The files live in public/music
 * as 96k AAC (m4a) — about the quality of a 160k mp3 at half the bytes, after
 * the mp3s were reported as stuttering on a phone — and the server hands
 * them out in byte ranges so Safari will play them at all.
 *
 * Order is play order. `file` is relative to the site root and carries a
 * version so a replaced file is a new URL under the week-long cache.
 */
/**
 * 噜噜卡's player (owner, 2026-09-27: as 开瓦包's, with music the owner will choose).
 * Not live yet: on only in the local dev build (npm run dev). The production build
 * drops it entirely. To launch, set this to true and replace TRACKS below with the
 * owner's music (files in public/music, m4a).
 *
 * Empty since 2026-09-28: 开瓦包's VALORANT placeholder files were being copied into the production
 * build (never played, but publicly served), so the owner had them removed until the real music
 * arrives. With no tracks the player does not render, even in the dev build.
 */
export const MUSIC_ENABLED: boolean = typeof import.meta.env !== 'undefined' && import.meta.env.DEV === true

export interface Track {
  id: string
  title: string
  artist: string
  file: string
}

export const TRACKS: Track[] = []
