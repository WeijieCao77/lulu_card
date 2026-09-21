import { useEffect, useRef, useState } from 'react'
import CardFace from '../Card'
import { LEGEND_CARDS } from '../../engine/cards'
import type { PlayerCard } from '../../engine/cards'
import { LEGEND_KIND_CN, LEGEND_TIER_CN, legendEdition } from '../../engine/legends'
import { ATTR_CN, ATTR_KEYS } from '../../engine/types'
import { useCards } from './ctx'
import './worlds.css'

function Detail({ card, close }: { card: PlayerCard; close: () => void }) {
  const l = card.legend!
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { document.body.style.overflow = old; before?.focus() }
  }, [])
  return <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) close() }}>
    <div ref={dialog} className="modal worlds-modal" role="dialog" aria-modal="true" aria-labelledby="worlds-detail-title" onKeyDown={e => {
      if (e.key === 'Escape') close()
      if (e.key === 'Tab') {
        const list = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button,a[href]'))
        const first = list[0], last = list[list.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }}>
      <div className="modal-head"><h2 id="worlds-detail-title">{legendEdition(l)} · {card.ign}</h2><div className="spacer" /><button className="ghost sm" onClick={close}>关闭</button></div>
      <div className="modal-body worlds-detail">
        <CardFace card={card} size="lg" />
        <div><span className="worlds-eyebrow">{l.competition === 'Career' ? 'HALL OF FAME' : l.competition ?? 'WORLDS'} {l.year} · {LEGEND_KIND_CN[l.kind]}</span>
          <h3>{l.short}</h3><p>{l.note}</p>
          <p className="small muted">{l.clubTag} · {card.role} · {card.region} · {card.age} 岁（所选年份）</p>
          {l.ratingTier && <p className="worlds-tier">{LEGEND_TIER_CN[l.ratingTier]} · 当前 {card.rating}</p>}
          <dl>{ATTR_KEYS.map(k => <div key={k}><dt>{ATTR_CN[k]}</dt><dd>{card.attrs[k]}</dd></div>)}</dl>
          <p className="tiny muted">八项能力为游戏设定，总评按位置权重计算，非官方评分。同一选手的不同版本可以收藏，不能在一套阵容中重复上场。</p>
          <div className="worlds-credit">照片：{l.art!.credit}{l.art?.year && <> · {l.art.year} 年赛事影像</>}<br /><a href={l.art!.source} target="_blank" rel="noreferrer">查看照片出处 ↗</a>{' · '}<a href={l.source} target="_blank" rel="noreferrer">背景资料 ↗</a></div>
        </div>
      </div>
    </div>
  </div>
}

export default function WorldsGallery() {
  const { g } = useCards()
  const [filter, setFilter] = useState('全部')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<PlayerCard | null>(null)
  const owned = LEGEND_CARDS.filter(c => g.cards[c.id]).length
  const ig = (c: PlayerCard) => c.legend?.year === 2018 && c.clubTag === 'IG'
  const matches = (c: PlayerCard) => filter === '全部' || (filter === '已拥有' ? !!g.cards[c.id] : filter === '知名选手' ? c.legend?.collection === 'hall-of-fame' : filter === 'S8 IG' ? ig(c) : filter === 'MSI' ? c.legend?.competition === 'MSI' : filter === 'S赛历届' ? !c.legend?.collection : c.region === filter)
  const priority = (c: PlayerCard) => c.legend?.collection === 'hall-of-fame' ? 0 : ig(c) ? 1 : c.legend?.competition === 'MSI' ? 2 : 3
  const filtered = LEGEND_CARDS.filter(matches)
  const cards = filtered.filter(c => `${c.ign} ${c.realName} ${c.clubTag} ${c.legend?.short}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => priority(a) - priority(b))
  const feature = LEGEND_CARDS.find(c => filter === 'S8 IG' ? ig(c) && c.ign === 'TheShy' : filter === 'MSI' ? c.legend?.competition === 'MSI' && c.legend.year === 2026 : filter === '知名选手' ? c.legend?.collection === 'hall-of-fame' : c.id === 'worlds-2024-faker') ?? LEGEND_CARDS[0]
  const total = LEGEND_CARDS.length
  return <section className="worlds-gallery">
    <header className={`worlds-hero ${filter === 'S8 IG' ? 'ig-hero' : ''}`}>
      <div><div className="worlds-eyebrow">{filter === 'S8 IG' ? 'INVICTUS GAMING / WORLDS 2018' : filter === 'MSI' ? 'MID-SEASON INVITATIONAL / 2015—2026' : 'HALL OF FAME / LEGENDARY PLAYERS'}</div>
        <h1>{filter === 'S8 IG' ? <>翻过这座山，<br />他们是冠军。</> : filter === 'MSI' ? <>季中之巅，<br />王者加冕。</> : <>把巅峰，<br />留在这一张。</>}</h1>
        <p>{filter === 'S8 IG' ? <>TheShy · Duke · Ning · Rookie · JackeyLove · Baolan<br />六人冠军阵容，铭记 LPL 的第一座世界冠军。</> : filter === 'MSI' ? <>从 Clearlove 到 Zeus，十一届 MVP 的加冕时刻。<br />2020 年赛事取消；2015 年按赛事 MVP 标注。</> : <>铭记冠军时刻，也致敬留下传奇的选手。<br />把职业生涯的高光，收进这一册名人堂。</>}</p>
        <div className="worlds-hero-summary"><span><b>{filtered.length}</b>彩卡典藏</span><span><b>90—97</b>分层总评</span><span><b>{owned} / {total}</b>我的收藏</span></div>
      </div>
      {feature && (filter !== '知名选手' || filtered.length > 0) && <div className="worlds-feature"><CardFace card={feature} size="lg" onClick={() => setOpen(feature)} /></div>}
    </header>
    <div className="worlds-toolbar"><h2>名人堂 <span className="tiny muted">/ 点击卡面查看</span></h2>
      <div className="worlds-toggle">{['全部','知名选手','S赛历届','S8 IG','MSI','LCK','LPL','LEC','LCS','已拥有'].map(f => <button key={f} className={`sm ${filter === f ? 'primary' : 'ghost'}`} aria-pressed={filter === f} onClick={() => { setFilter(f); setQuery('') }}>{f}</button>)}</div>
      <label className="worlds-search">搜索选手<input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索选手、战队或称号" /></label>
    </div>
    <div className="worlds-grid">{cards.map(c => <article key={c.id} className="worlds-item">
      <CardFace card={c} size="lg" onClick={() => setOpen(c)} />
      <div className="worlds-item-label"><strong>{legendEdition(c.legend!)} · {c.ign}</strong><span>{g.cards[c.id] ? '已收藏 ✦' : '尚未收藏'}</span></div>
    </article>)}</div>
    {!cards.length && <p className="muted">{query ? '没有匹配的选手，试试其他名字或切换到全部。' : filter === '已拥有' ? '还没有收藏彩卡，切换到全部可免费预览。' : filter === '知名选手' ? '知名选手暂未匹配到卡牌。' : '该分类暂无彩卡。'}</p>}
    <p className="worlds-note">知名选手收录各赛区代表人物的生涯版本；已有 S 赛或 MSI MVP 彩卡的选手不重复收录。<br />普通选手金卡 84—90；知名选手 90—92；冠军成员 90—94；MSI MVP 93—95；S 赛 MVP 94—97。特别纪念卡单独评定。<br />同等级下，知名选手彩卡接近顶尖现役；强化每级 +1，最多 +5。总评是游戏能力估算，比赛还受位置、默契和教练影响。</p>
    <p className="worlds-note">S3 为 Faker「初代王朝」冠军纪念卡，当届没有官方 MVP；S4—S6 标注赛事 MVP，S7—S15 标注决赛 MVP。<br />
      IG 新增五张冠军纪念卡，与已有 Ning FMVP 卡组成六人收藏；MSI 共 11 张，2015 为赛事 MVP，2020 停办，其余为决赛 MVP。<br />
      试训包、选拔包、十连包及 LPL / LCK / LEC / LCS 包可出彩卡，共享彩卡保底：累计 1200 抽未出后，下一抽必出；其他赛区包、教练包和位置包不出本系列彩卡。收齐基础全图鉴可领取彩卡包。完整概率见右下角“概率”。</p>
    {open && <Detail card={open} close={() => setOpen(null)} />}
  </section>
}
