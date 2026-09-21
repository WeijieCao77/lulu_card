// Local-only, persistent preview. Production still uses the original Postgres
// and phone verification paths; this launcher never reads the VAL database.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
process.env.DATABASE_URL = 'pglite://'
process.env.PGLITE_PATH = resolve('.local-data/lol-cards')
process.env.PHONE_GATE = '0'
process.env.PORT ??= '8088'
process.env.HOST = '127.0.0.1'
mkdirSync(resolve('.local-data'), { recursive: true })
// Stable local-only admin key; excluded from Git with the entire local data directory.
if (!process.env.ANALYTICS_TOKEN) {
  const tokenPath = resolve('.local-data/admin-token.txt')
  if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(32).toString('hex'), { mode: 0o600 })
  process.env.ANALYTICS_TOKEN = readFileSync(tokenPath, 'utf8').trim()
  console.log('Local admin: /admin — key stored in .local-data/admin-token.txt')
}
await import('../server.js')
