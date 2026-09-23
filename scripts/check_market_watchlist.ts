process.env.ENGINE_FROM_SOURCE = '1';
process.env.PHONE_GATE = '0';
import { marketWatchIds } from '../market-watch.js';
import { normalizeMarketWatchIds, readMarketWatchState, saveMarketWatchlist, marketWatchStorageKey } from '../src/engine/marketWatchlist';
import { ALL_CARDS } from '../src/engine/cards';

let bad = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) bad++;
};
const valid = new Set(ALL_CARDS.filter(c => c.kind === 'player').map(c => c.id));
const playerIds = [...valid].slice(0, 3);
const coachId = ALL_CARDS.find(c => c.kind !== 'player')?.id ?? 'coach';

check('marketWatchIds undefined → null', marketWatchIds(undefined, valid) === null);
check('marketWatchIds non-array → []', JSON.stringify(marketWatchIds('x', valid)) === '[]');
check('marketWatchIds empty → []', marketWatchIds([], valid).length === 0);
check('marketWatchIds dedupes', marketWatchIds([playerIds[0], playerIds[0]], valid).length === 1);
check('marketWatchIds filters unknown/nonplayer', marketWatchIds([playerIds[0], 'bad', coachId], valid).length === 1);
const over = [...valid].slice(0, 60);
check('marketWatchIds caps at 50', marketWatchIds(over, valid).length === 50);
check('normalizeMarketWatchIds defaults to player set', normalizeMarketWatchIds([playerIds[0], coachId]).length === 1);

const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
};
const a1 = 'VM-TEST-0000-0000-0000-0001';
const a2 = 'VM-TEST-0000-0000-0000-0002';
saveMarketWatchlist(a1, [playerIds[0], playerIds[1]], storage);
saveMarketWatchlist(a2, [playerIds[2]], storage);
check('storage keys differ by account', marketWatchStorageKey(a1) !== marketWatchStorageKey(a2));
check('read returns own account ids', readMarketWatchState(a1, storage).ids.length === 2 && readMarketWatchState(a2, storage).ids.length === 1);
check('read filters invalid on load', readMarketWatchState(a1, { ...storage, getItem: () => JSON.stringify({ version: 1, ids: [playerIds[0], 'bad', coachId] }) }).ids.length === 1);
check('read invalid JSON → empty available', (() => { const s = readMarketWatchState(a1, { ...storage, getItem: () => '{oops' }); return s.ids.length === 0 && !s.available; })());
check('read wrong version → empty available', (() => { const s = readMarketWatchState(a1, { ...storage, getItem: () => JSON.stringify({ version: 2, ids: [playerIds[0]] }) }); return s.ids.length === 0 && s.available; })());
check('read throws → empty unavailable', (() => { const s = readMarketWatchState(a1, { getItem: () => { throw new Error('x'); }, setItem: () => {} }); return s.ids.length === 0 && !s.available; })());
check('save normalizes input', (() => { const s = { getItem: (k:string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } }; saveMarketWatchlist(a1, [playerIds[0], playerIds[0], 'x', coachId], s); return readMarketWatchState(a1, s).ids.length === 1; })());
check('save throws → false', saveMarketWatchlist(a1, [playerIds[0]], { getItem: () => null, setItem: () => { throw new Error('x'); } }) === false);

console.log(bad ? `${bad} failures` : 'all ok');
process.exit(bad ? 1 : 0);