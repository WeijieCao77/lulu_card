// Screenshots of the 峡谷回响 altar opening on the review page (dev server on :5190, installed Chrome).
//   node scripts/capture_echo_altar.mjs outDir [width height]
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const out = resolve(process.argv[2] || 'altar-shots'); mkdirSync(out, { recursive: true })
const width = Number(process.argv[3] || 1280), height = Number(process.argv[4] || 800)
const port = 9345
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + port, '--user-data-dir=' + resolve(out, '.cdp'), 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pages
for (let i = 0; i < 80; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.some((x) => x.type === 'page')) break } catch {} await sleep(150) }
const ws = new WebSocket(pages.find((x) => x.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let seq = 0; const wait = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result); wait.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 }); writeFileSync(resolve(out, name), Buffer.from(s.data, 'base64')) }
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 })
await send('Page.navigate', { url: 'http://localhost:5190/echo-review.html' })
await sleep(5000)
await js(`document.getElementById('er-open').click()`)
await sleep(1200)
await shot('1-sealed.jpg')
await js(`document.querySelector('.ritual-pack').click()`)
await sleep(700)
await shot('2-burst.jpg')
await sleep(2400)
await shot('3-backs.jpg')
await js(`(async () => { for (const c of document.querySelectorAll('.ritual-card')) { c.click(); await new Promise(r => setTimeout(r, 450)) } return true })()`)
await sleep(1500)
await shot('4-revealed.jpg')
console.log(await js(`JSON.stringify({ cards: document.querySelectorAll('.ritual-card').length, backs: document.querySelectorAll('.ritual-card-back .echo-back-v2').length, faces: document.querySelectorAll('.ritual-card .retired-echo').length })`))
ws.close(); browser.kill()
