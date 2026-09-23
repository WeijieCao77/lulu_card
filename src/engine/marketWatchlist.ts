import { ALL_CARDS } from './cards';

const MAX_IDS = 50;
const STORAGE_PREFIX = 'lolcards:market-watch:v1:';
const validPlayerIds = new Set(ALL_CARDS.filter(c => c.kind === 'player').map(c => c.id));

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function marketWatchStorageKey(accountId: string): string | null {
  return accountId ? STORAGE_PREFIX + encodeURIComponent(accountId) : null;
}

export function normalizeMarketWatchIds(value: unknown, validIds: Set<string> = validPlayerIds): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of value.slice(0, MAX_IDS)) {
    if (out.length >= MAX_IDS) break;
    if (typeof id !== 'string' || id.length > 64) continue;
    if (!validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function readMarketWatchState(accountId: string, storage?: StorageLike): { ids: string[]; available: boolean } {
  if (!accountId) return { ids: [], available: false };
  let store: StorageLike;
  try { store = storage || localStorage; } catch { return { ids: [], available: false }; }
  const key = marketWatchStorageKey(accountId);
  if (!key) return { ids: [], available: false };
  try {
    const raw = store.getItem(key);
    if (!raw) return { ids: [], available: true };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return { ids: [], available: true };
    return { ids: normalizeMarketWatchIds(parsed.ids), available: true };
  } catch {
    return { ids: [], available: false };
  }
}

export function readMarketWatchlist(accountId: string, storage?: StorageLike): string[] {
  return readMarketWatchState(accountId, storage).ids;
}

export function saveMarketWatchlist(accountId: string, ids: string[], storage?: StorageLike): boolean {
  if (!accountId) return false;
  let store: StorageLike;
  try { store = storage || localStorage; } catch { return false; }
  const key = marketWatchStorageKey(accountId);
  if (!key) return false;
  try {
    store.setItem(key, JSON.stringify({ version: 1, ids: normalizeMarketWatchIds(ids) }));
    return true;
  } catch {
    return false;
  }
}