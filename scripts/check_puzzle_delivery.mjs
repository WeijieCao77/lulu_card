import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { makeCardApi, serverDay } from '../cards-api.js'
import * as engine from '../dist-server/engine.mjs'
const root=resolve('public'), types=new Set(), kinds=new Set()
const api=makeCardApi(null,{rateLimited:()=>false,readBody:async r=>r.body,json:(r,code,body)=>{r.code=code;r.json=body},staticRoot:root})
for(let i=0;i<150 && (types.size<2||kinds.size<3);i++) {
 const id=`VM-ABCD-EFGH-JKMN-PQRS-${String(i).padStart(4,'0')}`
 const kind=engine.kindFor(serverDay(),id), rel=engine.imgOf(kind,engine.answerFor(serverDay(),id))
 const res={code:0,head:{},body:null,writeHead(code,head){this.code=code;this.head=head},end(body){this.body=body}}
 await api.route({method:'POST',body:JSON.stringify({id})},res,'/api/card/puzzle','test')
 assert.equal(res.code,200);assert.deepEqual(res.body,await readFile(resolve(root,rel)))
 const ext=rel.slice(rel.lastIndexOf('.')).toLowerCase(), expected={'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[ext]
 assert.equal(res.head['Content-Type'],expected)
 assert.equal(res.head['Content-Disposition'],`inline; filename="puzzle${ext}"`)
 assert.equal(res.head['Cache-Control'],'no-store');assert.equal(res.head['X-Puzzle-Sig'],engine.challengeSig())
 kinds.add(kind);types.add(expected)
}
assert.equal(kinds.size,3);assert.equal(types.size,2)
const bad={};await api.route({method:'POST',body:'{"id":"bad"}'},bad,'/api/card/puzzle','test');assert.equal(bad.code,400)
console.log('Puzzle delivery passed: three kinds, PNG/WebP bytes + MIME + anonymous filename + no-store + invalid ID')
