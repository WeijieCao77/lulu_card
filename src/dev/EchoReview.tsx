import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ECHO_CARDS, LEGEND_CARDS, RARITY_CN } from '../engine/cards'
import CardFace from '../ui/Card'
import PackStage from '../ui/cards/PackStage'
import type { Pulled } from '../engine/gacha'
import { EchoCard, EchoCardBack } from '../ui/cards/echo/EchoCard'
import reference from './echo/reference.webp'
import '../styles.css'

/**
 * 峡谷回响审核页 (vite dev only, never built): every card face in the series, the card back and the
 * confirmed design reference, so the owner can sign off on all 193 before launch.
 */
const GROUPS = ['全部', 'LPL', 'LCK', 'LEC', 'LCS', 'WEST'] as const
const GROUP_CN: Record<string, string> = { 全部: '全部', LPL: 'LPL', LCK: 'LCK', LEC: '欧洲', LCS: '北美', WEST: '其他赛区' }
const RARITIES = ['全部', 'gold', 'silver', 'bronze'] as const
const SIZES = ['lg', 'md', 'sm'] as const
const SIZE_CN = { lg: '大（184px）', md: '中（132px）', sm: '小（96px）' }

function Review() {
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('全部')
  const [rarity, setRarity] = useState<(typeof RARITIES)[number]>('全部')
  const [size, setSize] = useState<(typeof SIZES)[number]>('lg')
  const [lowOnly, setLowOnly] = useState(false)
  const [pack, setPack] = useState<Pulled[] | null>(null)
  const openPack = () => { const fixed = new URLSearchParams(location.search).get('pack')?.split(','); const pick = (r: string, i: number) => { const l = ECHO_CARDS.filter((c) => c.rarity === r); return (fixed && ECHO_CARDS.find((c) => c.ign === fixed[i])) || l[Math.floor(Math.random() * l.length)] }; setPack([pick('gold', 0), pick('silver', 1), pick('bronze', 2)].map((card) => ({ card, dupe: false, salvage: 0 }))) }
  const cards = useMemo(() => ECHO_CARDS.filter((c) =>
    (group === '全部' || c.echo!.group === group) && (rarity === '全部' || c.rarity === rarity)
    && (!lowOnly || Math.min(c.echo!.photo?.w ?? 0, c.echo!.photo?.h ?? 0) < 500)), [group, rarity, lowOnly])
  return <main className="echo-review">
    <style>{`
      .echo-review{padding:24px 28px 80px;color:#e8ece6;background:#0d1417;min-height:100vh;font-family:'Microsoft YaHei',sans-serif}
      .echo-review h1{margin:0 0 4px;font-size:24px}.echo-review .sub{color:#9fb0a8;margin:0 0 18px}
      .er-bar{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;margin:0 0 20px}
      .er-bar button{background:#1b2a2b;color:#cfd8d2;border:1px solid #33494a;border-radius:6px;padding:5px 10px;cursor:pointer}
      .er-bar button.on{background:#c9b27c;color:#14201d;border-color:#c9b27c}
      .er-top{display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;margin-bottom:28px}
      .er-top img{max-width:620px;width:100%;border-radius:8px;border:1px solid #33494a}
      .er-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--w),1fr));gap:22px 18px}
      .er-cell{display:flex;flex-direction:column;gap:6px}
      .er-cell .cardface,.er-top .cardback{width:var(--w)}.er-metals .cardface.s-lg,.er-legend .cardface.s-lg{width:184px}.er-metals .cardface.s-sm{width:96px}
      .er-meta{font-size:11.5px;line-height:1.45;color:#9fb0a8}.er-meta b{color:#e8ece6}.er-warn{color:#e8a866}
    `}</style>
    <h1>峡谷回响 · 卡面审核</h1>
    <p className="sub">全部 {ECHO_CARDS.length} 张卡面、卡背与定稿对照。只在本地开发环境可见，不读账号、不会上线。</p>
    <div className="er-top">
      <div><div className="er-meta" style={{ marginBottom: 6 }}>站长确认的定稿</div><img src={reference} alt="定稿" /></div>
      <div style={{ ['--w' as string]: '184px' }}><div className="er-meta" style={{ marginBottom: 6 }}>卡背（全部稀有度统一）</div><EchoCardBack size="lg" /></div>
      <div className="er-legend"><div className="er-meta" style={{ marginBottom: 6 }}>彩卡（必须最高级） vs 回响卡</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          {['worlds-2013-faker', 'msi-2018-uzi', 'career-doublelift'].map((id) => <div key={id} style={{ width: 184 }}><CardFace card={LEGEND_CARDS.find((c) => c.id === id)!} size="lg" /></div>)}
          {['Uzi', 'Doublelift', 'Bang'].map((n) => <EchoCard key={n} card={ECHO_CARDS.find((c) => c.ign === n)!} size="lg" />)}
        </div></div>
      <div className="er-metals"><div className="er-meta" style={{ marginBottom: 6 }}>金 / 银 / 铜 对比</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          {(['gold', 'silver', 'bronze'] as const).map((r) => <EchoCard key={r} card={ECHO_CARDS.find((c) => c.rarity === r)!} size="lg" />)}
          {(['gold', 'silver', 'bronze'] as const).map((r) => <EchoCard key={r + 's'} card={ECHO_CARDS.find((c) => c.rarity === r)!} size="sm" />)}
        </div></div>
    </div>
    <div className="er-bar">
      <span>赛区：{GROUPS.map((g) => <button key={g} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>{GROUP_CN[g]}</button>)}</span>
      <span>卡色：{RARITIES.map((r) => <button key={r} className={r === rarity ? 'on' : ''} onClick={() => setRarity(r)}>{r === '全部' ? '全部' : RARITY_CN[r]}</button>)}</span>
      <span>尺寸：{SIZES.map((s) => <button key={s} className={s === size ? 'on' : ''} onClick={() => setSize(s)}>{SIZE_CN[s]}</button>)}</span>
      <span><button className={lowOnly ? 'on' : ''} onClick={() => setLowOnly(!lowOnly)}>只看低分辨率照片</button></span>
      <span className="er-meta">当前 {cards.length} 张</span>
      <span><button id="er-open" className="on" onClick={openPack}>预览祭坛开包（回响包）</button></span>
    </div>
    <div className="er-grid" style={{ ['--w' as string]: size === 'lg' ? '184px' : size === 'md' ? '132px' : '96px' }}>
      {cards.map((c) => {
        const p = c.echo!.photo
        const low = p && Math.min(p.w, p.h) < 500
        return <div className="er-cell" key={c.id}>
          <EchoCard card={c} size={size} />
          <div className="er-meta">
            <b>{c.ign}</b> · {RARITY_CN[c.rarity]} {c.rating} · {c.role}<br />
            {c.echo!.team} {c.echo!.span}<br />
            {c.clubTag ? `挂 ${c.clubTag}` : '无现役俱乐部'} · {c.nat}{c.echo!.attrsEstimated ? ' · 能力估算' : ''}<br />
            {p && <span className={low ? 'er-warn' : ''}>照片 {p.w}×{p.h}{low ? ' 偏低' : ''}</span>}
          </div>
        </div>
      })}
    </div>
    {pack && <PackStage pulled={pack} packName="峡谷回响包" echo onDone={() => setPack(null)} onSellAll={() => setPack(null)} />}
  </main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Review />)
