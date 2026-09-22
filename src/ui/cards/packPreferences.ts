const FAST_PACK_KEY = 'lolcards:pack:fast'

export function loadFastPack(): boolean {
  try {
    return localStorage.getItem(FAST_PACK_KEY) === '1'
  } catch {
    return false
  }
}

export function saveFastPack(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(FAST_PACK_KEY, '1')
    else localStorage.removeItem(FAST_PACK_KEY)
  } catch {
    // ignore
  }
}
