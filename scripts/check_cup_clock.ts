import assert from 'node:assert/strict'
import { makeCupPass } from '../cup-clock.js'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const keepAlive = setInterval(() => {}, 100)
try {
  let stalls = 0
  let calls = 0
  let finishOld: (() => void) | undefined
  const clock = makeCupPass({ name: 'opencup-test', limitMs: 25, onStall: () => { stalls++ } })
  const first = clock.run(() => { calls++; return new Promise<void>((resolve) => { finishOld = resolve }) })
  assert.equal(clock.run(() => { calls++; return undefined }), first)
  await assert.rejects(first, /advancement stalled/)
  assert.equal(stalls, 1)
  assert.equal(clock.inflight, null)
  await clock.run(() => { calls++ })
  assert.equal(calls, 2)
  finishOld?.()
  await sleep(0)
  assert.equal(clock.inflight, null, 'late completion cannot clear a newer pass')
  await assert.rejects(clock.run(() => { throw new Error('database error') }), /database error/)
  assert.equal(clock.inflight, null)
  await clock.run(() => undefined)
  await sleep(40)
  assert.equal(stalls, 1, 'completed passes cancel their timeout')
  console.log('PASS cup clock single-flight, stall release, late completion, normal failure and timeout cancellation')
} finally {
  clearInterval(keepAlive)
}
