import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const root = fileURLToPath(new URL('..', import.meta.url))
await build({ entryPoints: ['src/engine/server.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: 'dist-server/engine.mjs', logLevel: 'warning', absWorkingDir: root })
execFileSync(process.execPath, ['scripts/stamp-release-build.mjs', 'engine'], { cwd: root, env: process.env, stdio: 'inherit' })
