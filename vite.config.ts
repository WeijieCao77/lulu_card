import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * world.json as the browser gets it: the same file without the fields only the rating scripts read (the
 * macro split, the source ids, residency, the pre-card attributes, roster fetch stamps). About 150 KB of the
 * 1.1 MB the first page downloaded for nothing (2026-10-02, 「玩的很卡」). The server's engine bundle is
 * built separately (scripts/build-server.mjs) and keeps the whole file.
 */
const BROWSER_DROPS = { players: ['macroFrom', 'sourcePlayerId', 'residency', 'lolAttrs'], teams: ['rosterFetchedAt', 'rosterSource'] }
function slimWorld(): Plugin {
  return {
    name: 'slim-world-json',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split(String.fromCharCode(92)).join('/').endsWith('src/data/world.json')) return null
      const w = JSON.parse(code)
      for (const [list, keys] of Object.entries(BROWSER_DROPS)) {
        for (const row of w[list] ?? []) for (const k of keys) delete row[k]
      }
      return { code: JSON.stringify(w), map: null }
    },
  }
}

// base: './' keeps the build working both at a domain root and under a
// GitHub Pages project subpath (/Val_Manager/).
export default defineConfig({
  plugins: [slimWorld(), react()],
  base: './',
  server: { proxy: { '/api': 'http://127.0.0.1:8088', '/admin': 'http://127.0.0.1:8088' } },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // React changes once a year; the game changes every week. Kept in its
        // own chunk, an update no longer invalidates the framework in every
        // player's cache.
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor'
          // The datasets are the biggest things in the build, and Rollup's
          // default grouping put the 370 KB of rosters in the same chunk as the
          // changelog text — which the front page needs. So the page that had
          // been carefully kept clear of the game engine downloaded the game
          // anyway, to draw a panel of release notes.
          //
          // Named explicitly: each dataset is its own chunk, fetched by
          // whichever page actually reads it and by nothing else.
          if (id.includes('src/data/world.json')) return 'world'
          if (id.includes('src/data/dossier.json')) return 'dossier'
          if (id.includes('src/data/prospects.json')) return 'world'
          if (id.includes('src/data/changelog')) return 'changelog'
        },
      },
    },
  },
})
