import { useMemo, useState } from 'react'
import { WORLD_PLAYERS } from '../engine/world'
import { WORLD_TEAMS } from '../engine/teams'
import { coachDossier, dossierOf, titleCount } from '../engine/dossier'
import { BASE_PLAYER_CARDS, COACH_CARDS, LEGEND_CARDS, RARITY_CN } from '../engine/cards'
import type { CoachCard, PlayerCard } from '../engine/cards'
import CardFace, { Flag, natName } from './Card'
import { Panel, Bar } from './common'
import { ATTR_CN, ATTR_KEYS, REGION_CN, REGIONS } from '../engine/types'
import type { Region, Role } from '../engine/types'
import raw from '../data/world.json'
import './dossier.css'

type Source = { id: string; sourceOverall: number; ageEstimated?: boolean; ratingEstimated?: boolean; latestTournament?: string; recentStats?: Record<string, unknown> }
const source = new Map((raw.players as unknown as Source[]).map(p => [p.id, p]))

const ROLES: Role[] = ['上单', '打野', '中单', '下路', '辅助']
const playerCardOf = new Map(BASE_PLAYER_CARDS.map((c) => [c.playerId, c]))
const coachCardOf = new Map(COACH_CARDS.map((c) => [c.id, c]))
const teamOf = new Map(WORLD_TEAMS.map((t) => [t.id, t]))

const legendsOf = new Map<string, typeof LEGEND_CARDS>()
for (const c of LEGEND_CARDS) {
  const list = legendsOf.get(c.playerId) ?? []
  list.push(c)
  legendsOf.set(c.playerId, list)
}

type Page = 'players' | 'coaches'

export default function Dossier({
  playerId, onOpen, onClose,
}: {
  playerId?: string | null
  onOpen: (id: string | null) => void
  onClose?: () => void
}) {
  const [page, setPage] = useState<Page>('players')
  const [coachId, setCoachId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [region, setRegion] = useState<Region | 'all'>('all')
  const [rarity, setRarity] = useState<string>('all')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [playerPage, setPlayerPage] = useState(0)
  const [coachPage, setCoachPage] = useState(0)
  const PER_PAGE = 50

  const playerRows = useMemo(() => {
    const text = q.trim().toLowerCase()
    return BASE_PLAYER_CARDS
      .filter((c) => {
        if (region !== 'all' && c.region !== region) return false
        if (rarity !== 'all' && c.rarity !== rarity) return false
        if (role !== 'all' && !c.roles.includes(role)) return false
        if (!text) return true
        const team = c.clubId ? teamOf.get(c.clubId)?.name ?? '' : ''
        const hay = `${c.id} ${c.playerId} ${c.ign} ${c.realName ?? ''} ${c.clubTag ?? ''} ${team} ${natName(c.nat)} ${c.nat ?? ''}`
        return hay.toLowerCase().includes(text)
      })
      .sort((a, b) => b.rating - a.rating)
  }, [q, region, rarity, role])

  const coachRows = useMemo(() => {
    const text = q.trim().toLowerCase()
    return COACH_CARDS
      .filter((c) => {
        if (region !== 'all' && c.region !== region) return false
        if (rarity !== 'all' && c.rarity !== rarity) return false
        if (!text) return true
        const team = c.clubId ? teamOf.get(c.clubId)?.name ?? '' : ''
        const hay = `${c.id} ${c.name} ${c.realName ?? ''} ${c.clubTag ?? ''} ${team} ${natName(c.nat)} ${c.nat ?? ''}`
        return hay.toLowerCase().includes(text)
      })
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  }, [q, region, rarity])

  const open = playerId ? playerCardOf.get(playerId) : null
  if (open) return <PlayerDetail card={open} onBack={() => { if (onClose) onClose(); else onOpen(null) }} />
  if (coachId) {
    const coach = coachCardOf.get(coachId)
    if (coach) return <CoachDetail card={coach} onBack={() => setCoachId(null)} />
  }

  const rows = page === 'players' ? playerRows : coachRows
  const currentPage = page === 'players' ? playerPage : coachPage
  const setCurrentPage = page === 'players' ? setPlayerPage : setCoachPage
  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const safePage = Math.min(currentPage, totalPages - 1)
  const pageRows = rows.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE)

  const clearFilters = () => {
    setQ('')
    setRegion('all')
    setRarity('all')
    setRole('all')
    setPlayerPage(0)
    setCoachPage(0)
  }

  return (
    <Panel
      title="选手与教练图鉴"
      className="dossier-library"
      actions={
        <div className="row" style={{ gap: 8 }}>
          <span className="tiny muted mono">
            {rows.length} / {page === 'players' ? BASE_PLAYER_CARDS.length : COACH_CARDS.length} 条
          </span>
          {onClose && <button className="ghost sm" onClick={onClose}>返回</button>}
        </div>
      }
    >
      <p className="tiny faint" style={{ marginTop: 0, lineHeight: 1.7 }}>
        选手与教练资料库。能力评分为游戏内评分，非官方评价。生涯数据暂未收录。
      </p>

      <div className="row wrap" style={{ gap: 8, margin: '12px 0' }}>
        <div className="seg">
          <button className={page === 'players' ? 'on' : ''} onClick={() => setPage('players')}>选手</button>
          <button className={page === 'coaches' ? 'on' : ''} onClick={() => setPage('coaches')}>教练</button>
        </div>
        <input
          aria-label="搜索选手或教练"
          style={{ width: 200 }}
          placeholder="搜 ID / 真名 / 战队 / 国籍"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPlayerPage(0); setCoachPage(0) }}
        />
        <select aria-label="图鉴赛区" style={{ width: 'auto' }} value={region} onChange={(e) => { setRegion(e.target.value as Region | 'all'); setPlayerPage(0); setCoachPage(0) }}>
          <option value="all">全部赛区</option>
          {REGIONS.map((r) => <option key={r} value={r}>{REGION_CN[r]}</option>)}
        </select>
        <select aria-label="图鉴稀有度" style={{ width: 'auto' }} value={rarity} onChange={(e) => { setRarity(e.target.value); setPlayerPage(0); setCoachPage(0) }}>
          <option value="all">全部稀有度</option>
          {Object.entries(RARITY_CN).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {page === 'players' && (
          <select aria-label="图鉴位置" style={{ width: 'auto' }} value={role} onChange={(e) => { setRole(e.target.value as Role | 'all'); setPlayerPage(0) }}>
            <option value="all">全部位置</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <button className="sm" onClick={clearFilters}>清除筛选</button>
      </div>

      {rows.length > PER_PAGE && (
        <div className="row wrap" style={{ gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <span className="tiny faint">第 {safePage + 1} / {totalPages} 页 · 共 {rows.length} 条</span>
          <div className="seg dossier-pages">
            <button className="sm" disabled={safePage <= 0} onClick={() => setCurrentPage(0)}>第一页</button>
            <button className="sm" disabled={safePage <= 0} onClick={() => setCurrentPage(Math.max(0, safePage - 1))}>上一页</button>
            <button className="sm" disabled={safePage >= totalPages - 1} onClick={() => setCurrentPage(Math.min(totalPages - 1, safePage + 1))}>下一页</button>
            <button className="sm" disabled={safePage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)}>最后一页</button>
          </div>
        </div>
      )}

      {pageRows.length === 0 ? (
        <p className="empty">没有匹配的记录。试试清除筛选。</p>
      ) : (
        <div className="dossier-list">
          {page === 'players'
            ? playerRows.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE).map((card) => (
                <button
                  key={card.id}
                  className="dossier-card"
                  onClick={() => onOpen(card.playerId)}
                >
                  <div className="dossier-card-face"><CardFace card={card} size="sm" /></div>
                  <div className="dossier-card-info">
                    <div className="dossier-card-title">
                      <b>{card.ign}</b>
                      {legendsOf.has(card.playerId) && <span className="cf-star" style={{ position: 'static', marginLeft: 5 }}>★</span>}
                    </div>
                    <div className="tiny faint">{card.realName ?? '—'}</div>
                    <div className="tiny"><Flag nat={card.nat} /> {natName(card.nat)} · {REGION_CN[card.region]}</div>
                    <div className="tiny">{card.clubTag ?? '暂无战队'} · {card.roles.join('/')}</div>
                    <div className="tiny mono">能力 {card.rating}</div>
                    {source.get(card.playerId)?.ratingEstimated && <span className="tiny warn">暂定评分</span>}
                  </div>
                </button>
              ))
            : coachRows.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE).map((card) => (
                <button
                  key={card.id}
                  className="dossier-card"
                  onClick={() => setCoachId(card.id)}
                >
                  <div className="dossier-card-face"><CardFace card={card} size="sm" /></div>
                  <div className="dossier-card-info">
                    <div className="dossier-card-title">
                      <b>{card.name}</b>
                      {card.spec && <span className="tag t3" style={{ marginLeft: 5 }}>{card.spec}</span>}
                    </div>
                    <div className="tiny faint">{card.realName ?? '—'}</div>
                    <div className="tiny"><Flag nat={card.nat} /> {natName(card.nat)}{card.region ? ` · ${REGION_CN[card.region]}` : ''}</div>
                    <div className="tiny">{card.clubTag ?? '暂无战队'}</div>
                    <div className="tiny mono">能力 {card.rating ?? '—'} · 战术 {card.tactics ?? '—'} · 培养 {card.development ?? '—'} · 激励 {card.motivation ?? '—'}</div>
                  </div>
                </button>
              ))}
        </div>
      )}
    </Panel>
  )
}

function PlayerDetail({ card, onBack }: { card: PlayerCard; onBack: () => void }) {
  const player = WORLD_PLAYERS.find((p) => p.id === card.playerId)
  const club = card.clubId ? teamOf.get(card.clubId) : null
  const s = source.get(card.playerId)
  const d = dossierOf(card.playerId) as unknown as Record<string, unknown> | undefined
  const dossierSource = d && typeof d === 'object' && 'source' in d && typeof (d as Record<string, unknown>).source === 'string'
    ? String((d as Record<string, unknown>).source)
    : null
  const validSource = dossierSource && /^https?:\/\//.test(dossierSource) ? dossierSource : null

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="ghost sm" onClick={onBack}>← 返回图鉴</button>
      </div>
      <Panel title={card.ign}>
        <div className="dossier-head">
          <CardFace card={card} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{card.realName ?? card.ign}</div>
            <div className="small muted" style={{ marginTop: 6, lineHeight: 1.9 }}>
              <Flag nat={card.nat} /> {natName(card.nat)} · {REGION_CN[card.region]}
              <br />
              {s?.ageEstimated ? '生日资料待补充' : `${card.age} 岁`}
              {!s?.ageEstimated && player?.birth ? `（${player.birth}）` : ''}
              {' · '}
              {club ? club.name : '暂无战队'}
              <br />
              {card.roles.join(' / ')}
              {' · '}{RARITY_CN[card.rarity]} {card.rating}
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              {s?.latestTournament ? `最近核对赛事：${s.latestTournament}` : '2026 赛季资料库'}
            </div>
            {!!legendsOf.get(card.playerId)?.length && (
              <div className="small" style={{ marginTop: 10, padding: '8px 11px', borderRadius: 4, lineHeight: 1.7, background: 'rgba(180,120,255,.10)', border: '1px solid rgba(180,120,255,.35)' }}>
                <b>★ 彩卡</b>
                {legendsOf.get(card.playerId)!.map((l) => (
                  <div key={l.id} className="tiny" style={{ marginTop: 3 }}>
                    {l.legend!.title}
                    <span className="faint"> · {l.legend!.clubTag} · 评分 {l.rating}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              {titleCount(card.playerId) > 0 && <span className="trait" data-good="y">{titleCount(card.playerId)} 座冠军</span>}
              {validSource ? (
                <a className="trait" data-good="y" href={validSource} target="_blank" rel="noreferrer noopener">肖像来源 ↗</a>
              ) : (
                <span className="trait">来源暂未收录</span>
              )}
            </div>
          </div>
        </div>
      </Panel>
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <Panel title="能力">
          {ATTR_KEYS.map((k) => (
            <div key={k} className="row" style={{ gap: 10, margin: '5px 0' }}>
              <span className="tiny faint" style={{ width: 30 }}>{ATTR_CN[k]}</span>
              <div style={{ flex: 1 }}><Bar value={card.attrs[k]} /></div>
              <b className="mono tiny" style={{ width: 20, textAlign: 'right' }}>{card.attrs[k]}</b>
            </div>
          ))}
          <p className={`small ${s?.ratingEstimated ? 'warn' : 'muted'}`} style={{ lineHeight: 1.8 }}>
            {s?.ratingEstimated ? '暂定评分：新补录选手的样本不完整，暂按同赛区同位置基准估算，后续再校准。' : '能力评分为游戏内评分，非官方评价。生涯数据尚未收录。'}
          </p>
        </Panel>
        <Panel title="荣誉"><p className="empty">生涯补录中</p></Panel>
      </div>
      {s?.recentStats && (
        <Panel title="最近赛事统计">
          <div className="grid c3">
            {['GP','KDA','KP','DPM','CSPM','GD10','WPM','WCPM']
              .filter(k => s.recentStats?.[k] !== undefined)
              .map(k => (
                <div className="stat" key={k}>
                  <span className="tiny muted">{k}</span>
                  <b>{String(s.recentStats![k])}</b>
                </div>
              ))}
          </div>
        </Panel>
      )}
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <Panel title="生涯队伍"><p className="empty">尚未收录。</p></Panel>
        <Panel title="赛事记录"><p className="empty">尚未收录。</p></Panel>
      </div>
    </>
  )
}

function CoachDetail({ card, onBack }: { card: CoachCard; onBack: () => void }) {
  const club = card.clubId ? teamOf.get(card.clubId) : null
  const d = coachDossier(card.name) as unknown as Record<string, unknown> | undefined
  const source = d && typeof d === 'object' && 'source' in d && typeof (d as Record<string, unknown>).source === 'string'
    ? String((d as Record<string, unknown>).source)
    : null
  const validSource = source && /^https?:\/\//.test(source) ? source : null

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="ghost sm" onClick={onBack}>← 返回图鉴</button>
      </div>
      <Panel title={card.name}>
        <div className="dossier-head">
          <CardFace card={card} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{card.realName ?? card.name}</div>
            <div className="small muted" style={{ marginTop: 6, lineHeight: 1.9 }}>
              <Flag nat={card.nat} /> {natName(card.nat)}
              {card.region ? ` · ${REGION_CN[card.region]}` : ''}
              <br />
              {club ? club.name : '暂无战队'}
              {card.clubTag ? `（${card.clubTag}）` : ''}
              <br />
              {card.spec ? `团队身份：${card.spec}` : '团队身份未标注'}
              {' · '}{RARITY_CN[card.rarity]} {card.rating ?? '—'}
            </div>
            {card.legend && (
              <div className="small" style={{ marginTop: 10, padding: '8px 11px', borderRadius: 4, lineHeight: 1.7, background: 'rgba(180,120,255,.10)', border: '1px solid rgba(180,120,255,.35)' }}>
                <b>★ 彩卡</b>
                <div className="tiny" style={{ marginTop: 3 }}>{card.legend.title}</div>
              </div>
            )}
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              {validSource ? (
                <a className="trait" data-good="y" href={validSource} target="_blank" rel="noreferrer noopener">肖像来源 ↗</a>
              ) : (
                <span className="trait">来源暂未收录</span>
              )}
            </div>
          </div>
        </div>
      </Panel>
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <Panel title="战术">
          <div className="tiny">战术能力：<b>{card.tactics ?? '—'}</b></div>
          <p className="tiny faint" style={{ marginTop: 12, marginBottom: 0 }}>能力评分为游戏内评分，非官方评价。生涯数据尚未收录。</p>
        </Panel>
        <Panel title="培养">
          <div className="tiny">培养能力：<b>{card.development ?? '—'}</b></div>
        </Panel>
      </div>
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <Panel title="激励">
          <div className="tiny">激励能力：<b>{card.motivation ?? '—'}</b></div>
        </Panel>
        <Panel title="团队身份">
          <div className="tiny">{card.spec ?? '团队身份未标注'}</div>
        </Panel>
      </div>
    </>
  )
}
