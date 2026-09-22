import { measureOdds } from '../../engine/odds'
import type { PackOdds } from '../../engine/odds'

self.onmessage = (e: MessageEvent<number>) => {
  try {
    const trials = typeof e.data === 'number' && Number.isFinite(e.data) ? e.data : 30000
    const result: PackOdds[] = measureOdds(trials)
    ;(self as unknown as Worker).postMessage(result)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) })
  }
}
