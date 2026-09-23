import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RELEASE_STAGE } from '../release-policy.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const buildId = process.env.RELEASE_BUILD_ID || randomUUID()
const policySha256 = sha(readFileSync(join(root, 'release-policy.js')))
const base = { stage: RELEASE_STAGE, buildId, policySha256 }
const kind = process.argv[2]
if (kind === 'frontend') {
  const dist = join(root, 'dist')
  const assets = join(dist, 'assets')
  if (!existsSync(join(dist, 'index.html')) || !existsSync(assets)) throw new Error('Vite output missing')
  const files = ['index.html', ...readdirSync(assets).filter(name => /\.(?:js|css)$/.test(name)).map(name => `assets/${name}`)]
  const hashes = Object.fromEntries(files.map(name => [name, sha(readFileSync(join(dist, name)))]))
  writeFileSync(join(dist, 'release-build.json'), JSON.stringify({ ...base, indexSha256: hashes['index.html'], files: hashes }))
} else if (kind === 'engine') {
  const bundle = join(root, 'dist-server', 'engine.mjs')
  writeFileSync(join(root, 'dist-server', 'release-build.json'), JSON.stringify({ ...base, bundleSha256: sha(readFileSync(bundle)) }))
} else {
  throw new Error('usage: node scripts/stamp-release-build.mjs frontend|engine')
}
