import { useState, useEffect, useRef, useCallback } from 'react';
import { readMarketWatchState, saveMarketWatchlist, marketWatchStorageKey } from '../../engine/marketWatchlist';
import { ALL_CARDS } from '../../engine/cards';

const STORAGE_EVENT = 'lulucard:market-watch-change';
const MAX_WATCHLIST = 50;
const EMPTY_IDS: string[] = [];
const validPlayerIds = new Set(ALL_CARDS.filter(c => c.kind === 'player').map(c => c.id));

export function useMarketWatchlist(accountId: string) {
  const [state, setState] = useState(() => ({
    accountId,
    ids: readMarketWatchState(accountId).ids,
  }));
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef({ accountId, ids: state.ids });
  stateRef.current = state;
  const dirty = useRef(false);

  useEffect(() => {
    dirty.current = false;
    const initial = { accountId, ids: readMarketWatchState(accountId).ids };
    stateRef.current = initial;
    setState(initial);
    setError(null);
    if (!accountId) return;
    const load = () => {
      const { ids, available } = readMarketWatchState(accountId);
      if (available) {
        const next = { accountId, ids };
        stateRef.current = next;
        dirty.current = false;
        setState(next);
        setError(null);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === marketWatchStorageKey(accountId)) load();
    };
    const onCustom = (e: CustomEvent) => {
      if (e.detail?.key === marketWatchStorageKey(accountId)) load();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(STORAGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STORAGE_EVENT, onCustom as EventListener);
    };
  }, [accountId]);

  const toggle = useCallback((cardId: string) => {
    if (!accountId || !validPlayerIds.has(cardId)) return;
    const current = stateRef.current.accountId === accountId ? stateRef.current.ids : readMarketWatchState(accountId).ids;
    const fresh = readMarketWatchState(accountId);
    const ids = fresh.available && !dirty.current ? fresh.ids : current;
    const has = ids.includes(cardId);
    const next = has ? ids.filter(id => id !== cardId) : ids.length >= MAX_WATCHLIST ? null : [...ids, cardId];
    if (next === null) {
      setError(`最多关注${MAX_WATCHLIST}张卡牌`);
      return;
    }
    stateRef.current = { accountId, ids: next };
    if (saveMarketWatchlist(accountId, next)) {
      dirty.current = false;
      setState({ accountId, ids: next });
      setError(null);
      window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key: marketWatchStorageKey(accountId) } }));
    } else {
      dirty.current = true;
      setState({ accountId, ids: next });
      setError('浏览器无法保存，关注清单仅在本次页面有效。');
    }
  }, [accountId]);

  const ids = state.accountId === accountId ? state.ids : EMPTY_IDS;
  return {
    ids,
    has: (cardId: string) => ids.includes(cardId),
    toggle,
    error: state.accountId === accountId ? error : null,
    limit: MAX_WATCHLIST,
  };
}

export function MarketWatchButton({ cardId, name, watched, onToggle, disabled }: {
  cardId: string; name: string; watched: boolean; onToggle: (cardId: string) => void; disabled?: boolean;
}) {
  if (!validPlayerIds.has(cardId)) return null;
  return (
    <button
      type="button"
      className="sm ghost"
      aria-pressed={watched}
      aria-label={watched ? `取消关注 ${name}` : `关注 ${name}`}
      onClick={e => { e.stopPropagation(); onToggle(cardId); }}
      disabled={disabled}
    >
      {watched ? '★ 取消关注' : '☆ 关注'}
    </button>
  );
}