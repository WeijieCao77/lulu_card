import { useMemo, useState } from 'react'
import CardFace from './Card'
import { Panel } from './common'
import { BASE_PLAYER_CARDS, cardById } from '../engine/cards'
import { REGION_CN, REGIONS, ROLES, ATTR_CN, ATTR_KEYS } from '../engine/types'
import raw from '../data/world.json'

type Source = { id: string; sourceOverall: number; ageEstimated?: boolean; ratingEstimated?: boolean; latestTournament?: string; recentStats?: Record<string, unknown> }
const source = new Map((raw.players as unknown as Source[]).map(p => [p.id, p]))

export default function LoLCatalog({ playerId, onOpen, onClose }: { playerId?: string | null; onOpen: (id: string | null) => void; onClose?: () => void }) {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('all')
  const [role, setRole] = useState('all')
  const [page, setPage] = useState(0)
  const list = useMemo(() => BASE_PLAYER_CARDS.filter(c => (region === 'all' || c.region === region)
    && (role === 'all' || c.role === role)
    && `${c.ign} ${c.realName ?? ''} ${c.clubTag ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b) => b.rating-a.rating || a.ign.localeCompare(b.ign)), [query,region,role])
  const selected = playerId ? cardById(`p:${playerId}`) : null
  if (selected?.kind === 'player') {
    const s = source.get(selected.playerId)
    return <>
      <button className="ghost sm" onClick={() => onClose ? onClose() : onOpen(null)}>← 返回</button>
      <Panel title={selected.ign}>
        <div className="row wrap" style={{alignItems:'flex-start',gap:24}}>
          <CardFace card={selected} />
          <div style={{flex:'1 1 240px'}}>
            <h2>{selected.realName || selected.ign}</h2>
            <p>{REGION_CN[selected.region]} · {selected.clubTag || '赛季自由选手'} · {selected.role}</p>
            <p className="small muted">{s?.ageEstimated ? '生日资料待补充' : `${selected.age} 岁`}</p>
            <p className="small muted">{s?.latestTournament ? `最近核对赛事：${s.latestTournament}` : '2026 赛季资料库'}</p>
            <div className="grid c2">{ATTR_KEYS.map(k => <div key={k} className="small">{ATTR_CN[k]} <b>{selected.attrs[k]}</b></div>)}</div>
            <p className={`small ${s?.ratingEstimated ? 'warn' : 'muted'}`} style={{lineHeight:1.8}}>
              {s?.ratingEstimated ? '暂定评分：新补录选手的样本不完整，暂按同赛区同位置基准估算，后续再校准。' : '卡牌能力由 2026 赛季模型换算，不是官方评分。'}
            </p>
            <p className="tiny faint">照片来自选手资料与赛事图片；没有可靠照片时使用剪影。</p>
          </div>
        </div>
      </Panel>
      {s?.recentStats && <Panel title="最近赛事统计"><div className="grid c3">{['GP','KDA','KP','DPM','CSPM','GD10','WPM','WCPM'].filter(k => s.recentStats?.[k] !== undefined).map(k => <div className="stat" key={k}><span className="tiny muted">{k}</span><b>{String(s.recentStats![k])}</b></div>)}</div></Panel>}
    </>
  }
  return <Panel title="2026 选手图鉴" actions={<span className="tiny muted">{BASE_PLAYER_CARDS.length} 位选手 · 六大赛区</span>}>
    <p className="small muted">名单按最新下载的 2026 赛事出场记录核对，包含一级与部分次级联赛选手。此页展示基础选手，彩卡见“名人堂”；评分为游戏估算。</p>
    <div className="row wrap" style={{gap:8,marginBottom:20}}>
      <input aria-label="搜索选手或战队" placeholder="搜索选手、真名、战队" value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}} />
      <select aria-label="图鉴赛区" value={region} onChange={e=>{setRegion(e.target.value);setPage(0)}}><option value="all">全部赛区</option>{REGIONS.map(r=><option key={r} value={r}>{REGION_CN[r]}</option>)}</select>
      <select aria-label="图鉴位置" value={role} onChange={e=>{setRole(e.target.value);setPage(0)}}><option value="all">全部位置</option>{ROLES.map(r=><option key={r}>{r}</option>)}</select>
      <span className="tiny muted">{list.length} 位</span>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))',gap:14}}>{list.slice(page*48,(page+1)*48).map(c=><div key={c.id}><CardFace card={c} onClick={()=>onOpen(c.playerId)} />{source.get(c.playerId)?.ratingEstimated && <span className="tiny warn">暂定评分</span>}</div>)}</div>
    {!list.length && <p className="empty">没有找到符合条件的选手。</p>}
    {list.length>48 && <div className="row" style={{justifyContent:'center',gap:14,marginTop:20}}><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>上一页</button><span>{page+1} / {Math.ceil(list.length/48)}</span><button disabled={(page+1)*48>=list.length} onClick={()=>setPage(p=>p+1)}>下一页</button></div>}
  </Panel>
}
