// Download /api/admin/backup to a local .ndjson.gz and check it arrived whole.
//
//   node scripts/download_backup.mjs https://<噜噜卡的域名> [out-file]
//
// The admin token is asked for on the terminal (or read from ADMIN_TOKEN) and
// only ever goes in a header. The file is written as it streams; a download is
// good only when its last line is the server's {done, counts} and every table
// has as many rows in the file as the server says it sent.
import { createWriteStream, createReadStream, renameSync, rmSync } from 'node:fs'
import { createGzip, createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const base = process.argv[2]
if (!base) { console.error('用法：node scripts/download_backup.mjs https://<噜噜卡的域名> [保存到]'); process.exit(2) }
const out = process.argv[3] || join(homedir(), 'Downloads', `lulucard-backup-${new Date().toISOString().slice(0, 10)}.ndjson.gz`)

const ask = async (q) => {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true })
  rl._writeToOutput = (s) => { if (s.includes(q)) process.stderr.write(s) }
  const a = await new Promise((ok) => rl.question(q, ok))
  rl.close(); process.stderr.write('\n')
  return a.trim()
}
const token = process.env.ADMIN_TOKEN || await ask('管理员 token（输入时不显示）：')

const res = await fetch(new URL('/api/admin/backup', base), { headers: { Authorization: `Bearer ${token}` } })
if (res.status !== 200) { console.error(`下载失败：HTTP ${res.status}${res.status === 404 ? '（token 不对，或者线上还没有这个接口）' : ''}`); process.exit(1) }

const part = out + '.part'
console.log(`下载中 → ${out}`)
await pipeline(Readable.fromWeb(res.body), createGzip(), createWriteStream(part))

const seen = {}
let head = null, last = null, lines = 0
for await (const line of createInterface({ input: createReadStream(part).pipe(createGunzip()), crlfDelay: Infinity })) {
  if (!line) continue
  lines++
  const o = JSON.parse(line)
  if (o.backup) head = o.backup
  else if (o.t) seen[o.t] = (seen[o.t] ?? 0) + 1
  last = o
}
const bad = []
if (!head) bad.push('没有开头的 backup 行')
if (!last?.done) bad.push(last?.failed ? `服务器中途失败：${last.failed}` : '没有结尾的 done 行（下载被截断）')
for (const [t, n] of Object.entries(last?.counts ?? {})) if ((seen[t] ?? 0) !== n) bad.push(`${t}：文件里 ${seen[t] ?? 0} 行，服务器说 ${n} 行`)
if (bad.length) { rmSync(part); console.error('❌ 备份不完整，已删掉：\n  ' + bad.join('\n  ')); process.exit(1) }

renameSync(part, out)
console.log(`✅ 备份完整：快照时间 ${head.at}，${head.tables.length} 张表，${lines} 行`)
for (const [t, n] of Object.entries(last.counts)) if (n) console.log(`   ${t.padEnd(28)} ${n}`)
