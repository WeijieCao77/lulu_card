import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const buildEnv = { ...process.env, RELEASE_BUILD_ID: randomUUID() }
const run = (...args) => execFileSync(process.execPath, args, { cwd: root, env: buildEnv, stdio: 'inherit' })
run('node_modules/typescript/bin/tsc', '-b')
run('node_modules/vite/bin/vite.js', 'build')
run('scripts/precompress.mjs')
run('scripts/stamp-release-build.mjs', 'frontend')
run('scripts/build-server.mjs')
