// Screenshot the top of the 峡谷回响 review page (reference, back, metal comparison).  node scripts/capture_echo_top.mjs out.jpg
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const out = resolve(process.argv[2] || 'echo-top.jpg')
const port = 9343
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + resolve(out + '.cdp'), 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pages
for (let i = 0; i < 80; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (pages.some((x) => x.type === 'page')) break } catch {} await sleep(150) }
const ws = new WebSocket(pages.find((x) => x.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let seq = 0; const wait = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result); wait.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1.5, mobile: false })
await send('Page.navigate', { url: 'http://localhost:5190/echo-review.html' })
await sleep(6000)
await send('Runtime.evaluate', { expression: "document.querySelector('.er-top').scrollIntoView()" })
await sleep(800)
const box = (await send('Runtime.evaluate', { expression: "JSON.stringify((process.env, null))", returnByValue: true }), null)
const rect = JSON.parse((await send('Runtime.evaluate', { expression: "(() => { const r = document.querySelector(process_SEL).getBoundingClientRect(); return JSON.stringify({ x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }) })()".replace('process_SEL', JSON.stringify(process.argv[3] || 'body')), returnByValue: true })).result.value)
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 2 } })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
ws.close(); browser.kill()
