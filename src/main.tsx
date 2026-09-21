import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { startTelemetry, track } from './engine/telemetry'

startTelemetry()
// Only source locations and fixed categories; never exception text or account IDs.
let reportedErrors = 0
window.addEventListener('error', event => {
  if (reportedErrors++ >= 10) return
  let source = 'runtime'
  try { source = new URL(event.filename).pathname.split('/').pop() || source } catch { /* no filename */ }
  track('error', { msg: source.slice(0, 80) + ':' + event.lineno + ':' + event.colno })
})
window.addEventListener('unhandledrejection', () => {
  if (reportedErrors++ < 10) track('error', { msg: 'unhandled-promise-rejection' })
})

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// A dev save by URL, so a state built by a script can be looked at on a
// phone: `?devsave=poster` loads public/dev-save-poster.txt into the
// autosave, marks the tutorial as seen, and opens the career. Development
// only — Vite drops the branch from the production bundle.
const devSave = import.meta.env.DEV ? new URLSearchParams(location.search).get('devsave') : null
if (devSave) {
  fetch(`/dev-save-${devSave}.txt`).then((r) => (r.ok ? r.text() : Promise.reject(r.status))).then((raw) => {
    localStorage.setItem('lolcards:save:autosave', raw)
    localStorage.removeItem('lolcards:index')
    localStorage.setItem('lolcards.tutorial', '1')
    history.replaceState(null, '', location.pathname)
  }).catch((e) => console.warn('devsave', e)).finally(render)
} else {
  render()
}
