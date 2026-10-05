import { lazy } from 'react'
import type { ComponentType } from 'react'

/**
 * A lazily loaded screen that survives a deploy.
 *
 * Each deploy renames the code files. A tab opened before it still asks for the old name the first time a lazy
 * screen is opened, the request fails, and with nothing to catch it React unmounts the whole page: a white screen
 * (reported 2026-10-05: 「有时候点进图鉴会白屏卡死」, the day of ten deploys). A failed load now reloads the page
 * once — the new page knows the new names — and only once per minute, so a real outage cannot loop.
 */
const KEY = 'lulucard:chunk-reload'
export function reloadOnceForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch { /* private mode: still reload once */ }
  location.reload()
  return true
}

export function lazyReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load()
    } catch (e) {
      if (reloadOnceForNewBuild()) return new Promise<{ default: T }>(() => {})
      throw e
    }
  })
}
