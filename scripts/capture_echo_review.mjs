// Headless screenshots of the 峡谷回响 review page (needs the dev server on :5190 and installed Chrome).
//   node scripts/capture_echo_review.mjs [size=lg] [outDir]
// Writes review-<n>.png in slices of ~1400px, plus a geometry report (clipped names, overlaps, broken images).
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const size = process.argv[2] || 'lg'
const out = resolve(process.argv[3] || 'review-shots')
mkdirSync(out, { recursive: true })
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const port = 9341
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port,
  '--user-data-dir=' + resolve(out, '.cdp'), 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pages
for (let i = 0; i < 80; i++) {
  try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.some((x) => x.type === 'page')) break } catch {}
  await sleep(150)
}
const ws = new WebSocket(pages.find((x) => x.type === 'page').webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0
const waiting = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { const { r, j } = waiting.get(m.id); waiting.delete(m.id); m.error ? j(Error(m.error.message)) : r(m.result) } }
const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; waiting.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })) })
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value

const width = 1500
await send('Emulation.setDeviceMetricsOverride', { width, height: 1400, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://localhost:5190/echo-review.html' })
await sleep(4000)
await evalJs(`(async () => {
  const want = ${JSON.stringify(size)}
  const btn = [...document.querySelectorAll('.er-bar button')].find(b => b.textContent.includes(want === 'lg' ? '大' : want === 'md' ? '中' : '小'))
  btn && btn.click()
  await new Promise(r => setTimeout(r, 500))
  document.querySelectorAll('.er-grid img').forEach(i => { i.loading = 'eager' })
  for (let t = 0; t < 60; t++) { if ([...document.querySelectorAll('.er-grid img')].every(i => i.complete)) break; await new Promise(r => setTimeout(r, 500)) }
  return true
})()`)
const report = await evalJs(`JSON.stringify({
  cards: document.querySelectorAll('.er-grid .cardface').length,
  broken: [...document.querySelectorAll('.er-grid img')].filter(i => i.complete && !i.naturalWidth).map(i => i.alt),
  clippedNames: [...document.querySelectorAll('.er-grid .re-name')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent),
  clippedTeams: [...document.querySelectorAll('.er-grid .re-skill')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.closest('.cardface').querySelector('.re-name').textContent),
  // a photo must cover its framed window on every side (object-fit cover + zoom >= 1)
  gaps: [...document.querySelectorAll('.er-grid .cardface')].map(c => {
    const w = c.querySelector('.re-portrait').getBoundingClientRect(), i = c.querySelector('.re-portrait img').getBoundingClientRect()
    const nat = c.querySelector('.re-portrait img'); const s = Math.max(w.width / nat.naturalWidth, w.height / nat.naturalHeight)
    const shown = { w: nat.naturalWidth * s, h: nat.naturalHeight * s }
    const zoom = Number(getComputedStyle(c).getPropertyValue('--re-zoom') || 1)
    const bad = i.left > w.left + 0.5 || i.top > w.top + 0.5 || i.right < w.right - 0.5 || i.bottom < w.bottom - 0.5 || shown.w * zoom < w.width - 0.5 || shown.h * zoom < w.height - 0.5
    return bad ? c.querySelector('.re-name').textContent : null
  }).filter(Boolean),
  height: document.documentElement.scrollHeight,
})`)
console.log(report)
const top = await evalJs(`document.querySelector('.er-grid').getBoundingClientRect().top + scrollY`)
const total = JSON.parse(report).height
let n = 0
for (let y = Math.floor(top) - 10; y < total; y += 1400) {
  // paint each slice in the viewport: images outside it are never decoded in headless mode
  await evalJs(`window.scrollTo(0, ${y}); new Promise(r => setTimeout(r, 900))`)
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 })
  writeFileSync(resolve(out, `review-${String(++n).padStart(2, '0')}.jpg`), Buffer.from(shot.data, 'base64'))
}
console.log('slices', n, '->', out)
ws.close()
browser.kill()
