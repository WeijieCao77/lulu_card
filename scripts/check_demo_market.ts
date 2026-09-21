process.env.ENGINE_FROM_SOURCE='1';process.env.PHONE_GATE='0'
delete process.env.TRADE_PULLS
delete process.env.TRADE_DAYS
delete process.env.MARKET_PROTECT_SEC
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {makeSql} from '../pglite-sql.js'
import {BASE_PLAYER_CARDS} from '../src/engine/cards'
const {CARD_SCHEMA,makeCardApi,normalizeId}=await import('../cards-api.js')
const {makeMarketApi}=await import('../market-api.js')
const {displayName}=await import('../names.js')
const engine=await import('../src/engine/server.ts')
const db=new PGlite(),sql=makeSql(db);await db.exec(CARD_SCHEMA)
const opts={readBody:async(r:any)=>JSON.stringify(r.body),json:(r:any,code:number,body:any)=>{r.code=code;r.body=body},rateLimited:()=>false,engine,normalizeId,displayName,timer:false}
const market=makeMarketApi(sql,opts as never),cards=makeCardApi(sql,opts as never)
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
const seller='VM-2222-2222-2222-2222-2222',buyer='VM-3333-3333-3333-3333-3333'
const c=BASE_PLAYER_CARDS.find(c=>c.rarity==='bronze')!
async function call(path:string,body:object){const r:any={};await (path.startsWith('/api/market')?market:cards).route({body} as never,r,path,'test');return r.body}
async function state(id:string){return (await sql`select state from card_accounts where id_hash=${hash(id)}`)[0].state}
try {
 for(const id of [seller,buyer]){
  const claim=await call('/api/card/claim',{id})
  assert(claim.ok && claim.state.coins===100000,JSON.stringify(claim))
  assert.deepEqual(claim.state.packs,{scout:10,elite:10,ten:10,coach:1})
 }
 const g=engine.newGacha(seller,'本地测试','2026-09-21')
 g.coins=100000
 g.cards[c.id]={id:c.id,level:2,dupes:1,seen:2,got:'2026-09-21'}
 await sql`update card_accounts set state=${sql.json(g)} where id_hash=${hash(seller)}`
 const listed=await call('/api/market/list',{id:seller,cardId:c.id,ask:1000,buyout:1500})
 assert(listed.ok,JSON.stringify(listed))
 const browse=await call('/api/market/browse',{id:buyer})
 const item=browse.listings.find((x:any)=>String(x.id)===String(listed.id))
 assert(item,JSON.stringify(browse))
 assert.equal(browse.gate,null)
 assert.equal(browse.protectSec,0)
 assert.equal(item.drawAt,null)
 const sold=await call('/api/market/offer',{id:buyer,listing:String(listed.id),price:1500})
 assert(sold.ok && sold.bought,JSON.stringify(sold))
 assert.equal((await state(buyer)).coins,98500)
 const take=await call('/api/card/act',{id:seller,action:'mail_take',args:{},client:{}})
 assert(take.ok,JSON.stringify(take))
 assert.equal((await state(seller)).coins,101500)
 await call('/api/card/act',{id:buyer,action:'mail_take',args:{},client:{}})
 assert((await state(buyer)).cards[c.id])
 await call('/api/card/act',{id:buyer,action:'mail_take',args:{},client:{}})
 const after=await state(buyer)
 assert.equal(after.coins,98500)
 const claim2=await call('/api/card/claim',{id:buyer})
 assert.equal((await state(buyer)).coins,98500,JSON.stringify(claim2))
 assert.deepEqual((await state(buyer)).packs,after.packs,'Repeat claim must not award extra starter packs')
 const sg=await state(seller)
 sg.cards[c.id]={id:c.id,level:0,dupes:1,seen:2,got:'2026-09-21'}
 await sql`update card_accounts set state=${sql.json(sg)} where id_hash=${hash(seller)}`
 const nl=await call('/api/market/list',{id:seller,cardId:c.id,ask:1000})
 assert(nl.ok,JSON.stringify(nl))
 const nb=await call('/api/market/browse',{id:buyer})
 const ni=nb.listings.find((x:any)=>String(x.id)===String(nl.id))
 assert(ni,JSON.stringify(nb))
 assert(ni.ends>Date.now())
 assert.equal(ni.buyout,null)
 const ownedBeforeBid=structuredClone((await state(buyer)).cards)
 const bid=await call('/api/market/offer',{id:buyer,listing:String(nl.id),price:1000})
 assert(bid.ok && !bid.bought,JSON.stringify(bid))
 assert.deepEqual((await state(buyer)).cards,ownedBeforeBid)
 const opened=await call('/api/card/act',{id:buyer,action:'open',args:{kind:'ten',payWith:'pack'},client:{}})
 assert(opened.ok,'Gifted ten-pack can be opened')
 const used=await state(buyer)
 assert.equal(used.packs.ten,9)
 assert.equal(used.pulls,10)
 await call('/api/card/claim',{id:buyer})
 assert.deepEqual((await state(buyer)).packs,used.packs,'Reclaim must not refill used starter packs')
 console.log('PASS: demo market starter coins, immediate listing/buyout, mailbox settlement idempotency, auction retains card')
}finally{await db.close()}
