/** Real API handlers, isolated in-memory PostgreSQL; never uses preview accounts. */
process.env.ENGINE_FROM_SOURCE='1';process.env.PHONE_GATE='0'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {makeSql} from '../pglite-sql.js'
import {BASE_PLAYER_CARDS,LEGEND_CARDS} from '../src/engine/cards'
const {CARD_SCHEMA,makeCardApi,normalizeId}=await import('../cards-api.js')
const {makeMarketApi,TRADE_PULLS}=await import('../market-api.js')
const {displayName}=await import('../names.js')
const engine=await import('../src/engine/server.ts')
const db=new PGlite(),sql=makeSql(db);await db.exec(CARD_SCHEMA)
const opts={readBody:async(r:any)=>JSON.stringify(r.body),json:(r:any,code:number,body:any)=>{r.code=code;r.body=body},rateLimited:()=>false,engine,normalizeId,displayName,timer:false}
const market=makeMarketApi(sql,opts as never),cards=makeCardApi(sql,opts as never)
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
const seller='VM-2222-2222-2222-2222-2222',buyer='VM-3333-3333-3333-3333-3333'
const c=BASE_PLAYER_CARDS.find(c=>c.rarity==='bronze')!,d=BASE_PLAYER_CARDS.find(c=>c.rarity==='silver')!
async function call(path:string,body:object){const r:any={};await (path.startsWith('/api/market')?market:cards).route({body} as never,r,path,'test');return r.body}
async function state(id:string){return (await sql`select state from card_accounts where id_hash=${hash(id)}`)[0].state}
try {
 for(const [id,card] of [[seller,c],[buyer,d]] as const){
  const g=engine.newGacha(id,'本地测试','2026-09-21');g.pulls=TRADE_PULLS;g.coins=10000
  g.cards[card.id]={id:card.id,level:2,dupes:1,seen:2,got:'2026-09-21'}
  await sql`insert into card_accounts(id_hash,name,state,created) values(${hash(id)},'test',${sql.json(g)},now()-interval '4 days')`
 }
 const listed=await call('/api/market/list',{id:seller,cardId:c.id,ask:1000,buyout:1500})
 assert(listed.ok,JSON.stringify(listed))
 const browse=await call('/api/market/browse',{id:buyer});assert(browse.listings.some((x:any)=>String(x.id)===String(listed.id)))
 await sql`update card_listings set created=now()-interval '2 minutes' where id=${listed.id}::bigint`
 const sold=await call('/api/market/offer',{id:buyer,listing:String(listed.id),price:1500})
 assert(sold.ok && sold.bought,JSON.stringify(sold))
 for(const id of [seller,buyer]){const take=await call('/api/card/act',{id,action:'mail_take',args:{},client:{}});assert(take.ok,JSON.stringify(take))}
 const before=await state(buyer);assert(before.cards[c.id]);assert.equal(before.coins,8500)
 await call('/api/card/act',{id:buyer,action:'mail_take',args:{},client:{}})
 assert.deepEqual((await state(buyer)).cards,before.cards,'mail cannot mint duplicate cards')
 const wrong=await call('/api/market/swap',{id:seller,code:hash(buyer).slice(0,8),giveId:c.id,wantId:d.id})
 assert(wrong.rarity,'Original same-rarity swap rule is enforced')
 const swap=await call('/api/market/swap',{id:seller,code:hash(buyer).slice(0,8),giveId:c.id,wantId:c.id})
 assert(swap.ok,JSON.stringify(swap))
 const legend=LEGEND_CARDS.find(c=>c.ign==='Mata')!
 const sg=await state(seller);sg.cards[legend.id]={id:legend.id,level:0,dupes:1,seen:2,got:'2026-09-21'}
 await sql`update card_accounts set state=${sql.json(sg)} where id_hash=${hash(seller)}`
 const ml=await call('/api/market/list',{id:seller,cardId:legend.id,ask:4500,buyout:6000});assert(ml.ok,JSON.stringify(ml))
 await sql`update card_listings set created=now()-interval '2 minutes' where id=${ml.id}::bigint`
 const mb=await call('/api/market/offer',{id:buyer,listing:String(ml.id),price:6000});assert(mb.ok&&mb.bought,JSON.stringify(mb))
 await call('/api/card/act',{id:buyer,action:'mail_take',args:{},client:{}})
 assert((await state(buyer)).cards[legend.id]);assert.equal((await state(buyer)).coins,2500)
 console.log('PASS: LoL mythic and base listing, buyout, escrow, mailbox delivery/idempotency and friend swap request')
}finally{await db.close()}
