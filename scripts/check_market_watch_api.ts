process.env.ENGINE_FROM_SOURCE = '1';
process.env.PHONE_GATE = '0';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { makeSql } from '../pglite-sql.js';

const { CARD_SCHEMA, normalizeId } = await import('../cards-api.js');
const { displayName } = await import('../names.js');
const { makeMarketApi } = await import('../market-api.js');
const engine = await import('../src/engine/server.ts');

let bad = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) bad++;
};
const db = new PGlite();
const sql = makeSql(db);
await db.exec(CARD_SCHEMA);
const hashOf = (id: string) => createHash('sha256').update(id).digest('hex');
const ME = 'VM-TEST-0000-0000-0000-0001';
const playerIds = engine.ALL_CARDS.filter(c => c.kind === 'player').map(c => c.id);
const watched = engine.ALL_CARDS.filter(c => c.kind === 'player' && c.rarity === 'gold').slice(0,4).map(c => c.id);
const unwatched = playerIds.find(id => !watched.includes(id))!;
await sql`insert into card_accounts (id_hash, name, state, created, verified) values
  (${hashOf(ME)}, 'tester', ${JSON.stringify({ coins: 9, cards: {}, pulls: 99 })}, now() - interval '9 days', now())`;
await sql`insert into card_accounts (id_hash, name, state, created)
  select 'seller' || g, '卖家' || g, '{}'::jsonb, now() - interval '9 days' from generate_series(1, 100) g`;
for(let i=0;i<40;i++) {
 await sql`insert into card_listings (seller_h,card_id,level,ask,cur_price,ends,hours,created)
 values ('seller1',${unwatched},0,${100+i},${100+i},now()+interval '1 day',24,now()-interval '1 hour')`;
}
for(let i=0;i<4;i++) {
 await sql`insert into card_listings (seller_h,card_id,level,ask,cur_price,ends,hours,created)
 values ('seller2',${watched[i]},0,${5000+i},${5000+i},now()+interval '1 day',24,now()-interval '1 hour')`;
}

interface Res { code: number; body: Record<string, any> }
const make = (useSummary: boolean) => makeMarketApi(sql, {
  readBody: (req: { body: string }) => Promise.resolve(req.body),
  json: (res: Res, code: number, body: Record<string, unknown>) => { res.code = code; res.body = body; },
  normalizeId, displayName, rateLimited: () => false, engine, timer: false, useSummary,
} as never);
const fast = make(true);
const slow = make(false);
const call = async (api: ReturnType<typeof make>, path: string, body: unknown) => {
  const res: Res = { code: 0, body: {} };
  await api.route({ body: JSON.stringify(body), method: 'POST', headers: {} } as never, res as never, path, 't');
  return res.body;
};
const walk = async (api: ReturnType<typeof make>, body: Record<string, unknown>) => {
  const out: any[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const p = await call(api, '/api/market/browse', { id: ME, ...body, ...(cursor ? { cursor } : {}) });
    out.push(...p.listings);
    cursor = p.next ?? undefined;
    pages++;
  } while (cursor && pages < 100);
  return { rows: out, pages };
};

for (const api of [fast, slow]) {
  const name = api === fast ? 'summary' : 'legacy';
  const first = await call(api, '/api/market/browse', { id: ME, sort: 'price', limit:2 });
  check(`${name}: watched beyond normal first page`, first.listings.every((l:any)=>!watched.includes(l.cardId)));
  const all = await walk(api, { sort: 'price' });
  check(`${name}: no filter returns 44`, all.rows.length === 44, String(all.rows.length));
  const filtered = await walk(api, { sort: 'price', watchedIds: watched });
  check(`${name}: watchlist returns 4 watched`, filtered.rows.length === 4, String(filtered.rows.length));
  check(`${name}: watchlist all watched ids match`, filtered.rows.every((l: any) => watched.includes(l.cardId)));
  const paginated = await walk(api, { sort: 'price', watchedIds: watched, limit: 2 });
  check(`${name}: pagination limit 2 gets all 4`, paginated.rows.length === 4 && paginated.pages >= 2, `rows=${paginated.rows.length} pages=${paginated.pages}`);
  const empty = await call(api, '/api/market/browse', { id: ME, watchedIds: [] });
  check(`${name}: empty watchedIds → no results`, empty.listings.length === 0);
  check(`${name}: empty watchedIds → empty pool`, empty.pool.length === 0);
  check(`${name}: empty watchedIds → total 44`, empty.total === 44);
  const watchedPage = await call(api, '/api/market/browse', { id: ME, watchedIds: watched, limit: 2 });
  check(`${name}: watched limit2 → pool length 4`, watchedPage.pool.length === 4);
  check(`${name}: watched limit2 → sum n 4`, watchedPage.pool.reduce((acc: number, pair: [string, number]) => acc + pair[1], 0) === 4);
  check(`${name}: watched limit2 → all ids watched`, watchedPage.pool.every((pair: [string, number]) => watched.includes(pair[0])));
  check(`${name}: watched limit2 → total 44`, watchedPage.total === 44);
  check(`${name}: watched limit2 → listings 2`, watchedPage.listings.length === 2);
  const omitted = await call(api, '/api/market/browse', { id: ME });
  check(`${name}: omitted watchedIds → all results`, omitted.listings.length === 44);
  check(`${name}: omitted watchedIds → pool sum 44`, omitted.pool.reduce((acc: number, pair: [string, number]) => acc + pair[1], 0) === 44);
  const mixed = await call(api, '/api/market/browse', { id: ME, watchedIds: [...watched, 'bad', 'not-a-player'] });
  check(`${name}: mixed valid/invalid only valid`, mixed.listings.length === 4);
  const contradictory = await call(api, '/api/market/browse', { id: ME, watchedIds: watched, rarity: 'bronze' });
  const goldOnly = contradictory.listings.length === 0;
  check(`${name}: watched AND rarity`, goldOnly);
}

await db.close();
console.log(bad ? `${bad} failures` : 'all ok');
process.exit(bad ? 1 : 0);