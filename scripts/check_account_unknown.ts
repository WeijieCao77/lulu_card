import assert from 'node:assert/strict'
import { act } from '../src/engine/account'
import { newGacha } from '../src/engine/gacha'
import type { GachaState } from '../src/engine/gacha'

const store = new Map<string, string>()
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size },
}

function stubGlobal<T extends object>(target: T, key: keyof T, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
  return () => {
    if (desc) Object.defineProperty(target, key, desc)
    else delete (target as any)[key]
  }
}

const restores: Array<() => void> = []
restores.push(stubGlobal(globalThis, 'localStorage', localStorageStub))
restores.push(stubGlobal(globalThis, 'window', globalThis))

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<{ status: number; body: string }>) {
  const calls: Array<{ url: string; body: string }> = []
  const impl = async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? '')
    calls.push({ url, body })
    const res = await handler(url, init)
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      json: async () => {
        try { return JSON.parse(res.body) } catch { throw new SyntaxError('invalid JSON') }
      },
    } as Response
  }
  restores.push(stubGlobal(globalThis, 'fetch', impl))
  return calls
}

function wrapRetryTimeout() {
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  const wrapped = ((cb: (...args: any[]) => void, ms?: number, ...args: any[]) => {
    return realSetTimeout(cb, ms === 1200 ? 0 : ms, ...args)
  }) as typeof setTimeout
  const clear = ((id: any) => realClearTimeout(id)) as typeof clearTimeout
  restores.push(stubGlobal(globalThis, 'setTimeout', wrapped))
  restores.push(stubGlobal(globalThis, 'clearTimeout', clear))
}

wrapRetryTimeout()

const makeState = (): GachaState => newGacha('VM-AAAA-BBBB-CCCC-DDDD-EEEE', '测试员', '2026-01-01')

type Case = {
  name: string
  responses: Array<{ status: number; body: string }>
  expectOk: boolean
  expectUnknown: boolean
  expectRetries?: number
  expectAbsorbCoins?: number
}

const cases: Case[] = [
  {
    name: 'two 500s with forged JSON',
    responses: [
      { status: 500, body: JSON.stringify({ ok: true, state: { coins: 999999 }, rev: 999, code: 'FORGED00', now: Date.now() }) },
      { status: 500, body: JSON.stringify({ ok: true, state: { coins: 999999 }, rev: 999, code: 'FORGED00', now: Date.now() }) },
    ],
    expectOk: false, expectUnknown: true, expectRetries: 2, expectAbsorbCoins: 0,
  },
  {
    name: 'two 500s with ok=false JSON',
    responses: [
      { status: 500, body: JSON.stringify({ ok: false, why: 'unstable', state: { coins: 999999 }, now: Date.now() }) },
      { status: 500, body: JSON.stringify({ ok: false, why: 'unstable', state: { coins: 999999 }, now: Date.now() }) },
    ],
    expectOk: false, expectUnknown: true, expectRetries: 2, expectAbsorbCoins: 0,
  },
  {
    name: '200 empty object twice',
    responses: [
      { status: 200, body: '{}' },
      { status: 200, body: '{}' },
    ],
    expectOk: false, expectUnknown: true, expectRetries: 2,
  },
  {
    name: '200 bad JSON twice',
    responses: [
      { status: 200, body: 'not json' },
      { status: 200, body: 'still not json' },
    ],
    expectOk: false, expectUnknown: true, expectRetries: 2,
  },
  {
    name: 'network failure twice',
    responses: [],
    expectOk: false, expectUnknown: true, expectRetries: 2,
  },
  {
    name: '500 then 200 ok:true',
    responses: [
      { status: 500, body: JSON.stringify({ ok: false, why: 'unstable', now: Date.now() }) },
      { status: 200, body: JSON.stringify({ ok: true, result: { card: 'VM-1' }, now: Date.now() }) },
    ],
    expectOk: true, expectUnknown: false, expectRetries: 2,
  },
  {
    name: '400 business refusal',
    responses: [
      { status: 400, body: JSON.stringify({ ok: false, why: '参数错误', now: Date.now() }) },
    ],
    expectOk: false, expectUnknown: false, expectRetries: 1,
  },
  {
    name: '429 empty (rate-limit)',
    responses: [
      { status: 429, body: '' },
    ],
    expectOk: false, expectUnknown: false, expectRetries: 1,
  },
  {
    name: '200 ok:true success',
    responses: [
      { status: 200, body: JSON.stringify({ ok: true, result: { card: 'VM-2' }, now: Date.now() }) },
    ],
    expectOk: true, expectUnknown: false, expectRetries: 1,
  },
  {
    name: '200 ok:false business refusal',
    responses: [
      { status: 200, body: JSON.stringify({ ok: false, why: '余额不足', now: Date.now() }) },
    ],
    expectOk: false, expectUnknown: false, expectRetries: 1,
  },
]

async function main() {
  for (const c of cases) {
    const state = makeState()
    const initialCoins = state.coins
    let networkCount = 0
    let calls: Array<{ url: string; body: string }> = []
    if (c.responses.length === 0) {
      restores.push(stubGlobal(globalThis, 'fetch', async () => { networkCount++; throw new Error('down') }))
    } else {
      calls = mockFetch(async () => {
        const idx = Math.min(networkCount, c.responses.length - 1)
        networkCount++
        const response = c.responses[idx]
        // A complete, otherwise valid account makes a forbidden absorption observable.
        try {
          const body = JSON.parse(response.body)
          if (body.state) return { ...response, body: JSON.stringify({ ...body, state: { ...state, ...body.state } }) }
        } catch { /* intentionally malformed fixture */ }
        return response
      })
    }
    const out = await act(state, 'open', { kind: 'scout', payWith: 'pack' })
    assert.equal(out.ok, c.expectOk, `${c.name}: ok`)
    if (!out.ok) {
      assert.equal(out.unknown === true, c.expectUnknown, `${c.name}: unknown flag`)
    }
    assert.equal(networkCount, c.expectRetries ?? 1, `${c.name}: request count`)
    if (c.responses.length > 0) {
      const bodies = calls.map(call => JSON.parse(call.body))
      assert.equal(new Set(bodies.map(b => b.requestId)).size, 1, `${c.name}: same requestId`)
      assert.equal(JSON.stringify(bodies[0]), JSON.stringify(bodies[1] ?? bodies[0]), `${c.name}: payload identical`)
    }
    if (c.expectAbsorbCoins !== undefined) {
      assert.equal(state.coins, initialCoins, `${c.name}: must not absorb server coins into local state`)
    }
  }
  console.log('All check_account_unknown cases passed')
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
}).finally(() => {
  restores.reverse().forEach(r => r())
})
