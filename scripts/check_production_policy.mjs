/** Read-only pre-release gate. Run after a complete build with the intended production environment. */
import { inspectProductionRelease } from '../release-gate.js'

let engineModule
try { engineModule = await import('../dist-server/engine.mjs') } catch { /* reported below */ }
const result = inspectProductionRelease({ engineModule })
for (const error of result.errors) console.error(`BLOCK ${error}`)
if (result.ok) console.log('PASS formal release code, configuration and matching frontend/server artifacts')
console.log('Manual SMS delivery, abuse, database reset and load acceptance remain in docs/production-release-checklist.md.')
process.exitCode = result.ok ? 0 : 1
