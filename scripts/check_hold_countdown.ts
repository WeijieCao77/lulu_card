/** Trade-hold countdown wording (tradeLock.ts): node --import tsx scripts/check_hold_countdown.ts */
import assert from 'node:assert/strict'
import { HOLD_MS, lockedWhy, noteTradedIn, releaseText, releasesOf, waitText } from '../src/engine/tradeLock'

const MIN = 60_000, H = 60 * MIN, D = 24 * H
assert.equal(HOLD_MS, 3 * D, 'every way in holds for three days')
assert.equal(waitText(D + 5 * H + 12 * MIN), '1 天 5 小时 12 分')
assert.equal(waitText(25 * H), '1 天 1 小时', 'not rounded up to 2 天 any more')
assert.equal(waitText(2 * H), '2 小时')
assert.equal(waitText(90 * 1000), '2 分', 'a part minute counts up')
assert.equal(waitText(10 * 1000), '1 分')
assert.equal(waitText(0), '不到 1 分钟')
assert.equal(releaseText(Date.UTC(2026, 9, 2, 6, 30)), '10月2日 14:30', 'Beijing time')

// bought two days and some hours ago: the player sees the hours and minutes left
const boughtAt = Date.UTC(2026, 8, 29, 4, 0)
const owned = { id: 'p:x', level: 0, dupes: 0, seen: 1, got: '2026-09-29' }
noteTradedIn(owned, boughtAt)
const now = boughtAt + 2 * D + 13 * H + 20 * MIN
assert.deepEqual(releasesOf(owned, now), [boughtAt + 3 * D])
assert.equal(lockedWhy(owned, now), '这张卡是交易得来的，还要 10 小时 40 分（10月2日 12:00）才能再挂牌或交换')
assert.equal(lockedWhy(owned, boughtAt + 3 * D + 1), null, 'free once the hold is over')
console.log('hold countdown: 3-day hold, minute-precise wait text, Beijing release time')
