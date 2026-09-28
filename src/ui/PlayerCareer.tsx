/**
 * The 选手档案's career panels — 荣誉, 生涯队伍, 赛事记录 — from public/data/careers.json
 * (scripts/fetch_careers.py, Leaguepedia). Fetched once, on the first dossier opened, so the game's
 * bundle does not carry every player's history.
 */
import { useEffect, useState } from 'react'
import { Panel } from './common'
import { titleCN } from './CoachHonours'

interface Tenure { team: string; from: string | null; to: string | null }
interface Placement { name: string; date: string; team: string; place: string }
interface Title { name: string; date: string; team: string }
export interface Career { teams: Tenure[]; events: Placement[]; titles: Title[] }
interface CareerFile { asOf: string; players: Record<string, Career> }

let loading: Promise<CareerFile | null> | null = null
const load = (): Promise<CareerFile | null> => {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/careers.json`)
    .then((r) => (r.ok ? (r.json() as Promise<CareerFile>) : null))
    .catch(() => null)
  return loading
}

/** undefined while loading, null when the file or this player is not there */
function useCareer(playerId: string): { career: Career | null | undefined; asOf: string | null } {
  const [state, setState] = useState<{ career: Career | null | undefined; asOf: string | null }>({ career: undefined, asOf: null })
  useEffect(() => {
    let alive = true
    void load().then((f) => { if (alive) setState({ career: f?.players[playerId] ?? null, asOf: f?.asOf ?? null }) })
    return () => { alive = false }
  }, [playerId])
  return state
}

const placeCN = (p: string): string =>
  p === '1' ? '冠军' : p === '2' ? '亚军' : p === 'Q' ? '晋级' : p === 'DQ' ? '取消资格' : /^\d/.test(p) ? `第 ${p.replace('-', '–')} 名` : p || '—'
const year = (d: string | null): string => (d ? d.slice(0, 7).replace('-', '.') : '')

const Empty = ({ loading }: { loading: boolean }) => <p className="empty">{loading ? '加载中…' : '尚未收录。'}</p>

export function CareerHonours({ playerId }: { playerId: string }) {
  const { career } = useCareer(playerId)
  return (
    <Panel title="荣誉">
      {career && !career.titles.length ? <p className="empty">暂无世界赛、MSI 或顶级联赛冠军。</p>
        : !career?.titles.length ? <Empty loading={career === undefined} /> : (
        <ul className="tiny" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          {career.titles.map((t) => (
            <li key={`${t.name}-${t.team}`}><b>{titleCN(t.name)}</b> <span className="faint">· {t.team}{t.date ? ` · ${t.date.slice(0, 4)}` : ''}</span></li>
          ))}
        </ul>
      )}
      <p className="tiny faint" style={{ margin: '8px 0 0' }}>只列世界赛、MSI 和各赛区顶级联赛的冠军（有季后赛的赛段以季后赛为准），数据来自 Leaguepedia。</p>
    </Panel>
  )
}

export function CareerTeams({ playerId }: { playerId: string }) {
  const { career } = useCareer(playerId)
  return (
    <Panel title="生涯队伍">
      {!career?.teams.length ? <Empty loading={career === undefined} /> : (
        <ul className="tiny" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          {career.teams.map((t, i) => (
            <li key={`${t.team}-${t.from ?? i}`}>
              <b>{t.team}</b>
              <span className="faint"> · {year(t.from) || '?'} – {year(t.to) || '?'}</span>
            </li>
          ))}
        </ul>
      )}
      {!!career?.teams.length && <p className="tiny faint" style={{ margin: '8px 0 0' }}>按参赛记录整理：代表该队参加的第一项到最后一项赛事，不是正式合同日期。</p>}
    </Panel>
  )
}

export function CareerEvents({ playerId }: { playerId: string }) {
  const { career, asOf } = useCareer(playerId)
  return (
    <Panel title="赛事记录">
      {!career?.events.length ? <Empty loading={career === undefined} /> : (
        <>
          <ul className="tiny" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, maxHeight: 320, overflowY: 'auto' }}>
            {career.events.map((e) => (
              <li key={`${e.name}-${e.team}`}>
                <span style={{ fontWeight: e.place === '1' || e.place === '2' ? 700 : 400, color: e.place === '1' ? 'var(--win)' : undefined }}>
                  {placeCN(e.place)}
                </span>
                {' '}{titleCN(e.name)}
                <span className="faint"> · {e.team}{e.date ? ` · ${e.date.slice(0, 4)}` : ''}</span>
              </li>
            ))}
          </ul>
          {asOf && <p className="tiny faint" style={{ margin: '8px 0 0' }}>最近 {career.events.length} 项赛事，数据截至 {asOf}，来自 Leaguepedia。</p>}
        </>
      )}
    </Panel>
  )
}
