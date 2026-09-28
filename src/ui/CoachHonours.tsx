/**
 * A coach's championships, one line each (owner, 2026-09-28: 「教练卡点进去都不显示他们的荣誉」).
 * Shared by the 图鉴 coach page and the card detail. Data: data/coachHonours.json via engine/coachHonours.
 */
import { honoursOf } from '../engine/coachHonours'
import type { CoachTitle } from '../engine/coachHonours'

const SPLIT_CN: [RegExp, string][] = [
  [/Season Finals/, '季后总决赛'], [/Grand Finals/, '总决赛'], [/Season Kickoff/, '开幕赛'], [/Mid Season/, '季中赛'],
  [/Championship/, '年度总决赛'], [/Lock-In/, '揭幕赛'], [/Versus/, '对抗赛'], [/Spring/, '春季赛'],
  [/Summer/, '夏季赛'], [/Winter/, '冬季赛'], [/Opening/, '上半年'], [/Closing/, '下半年'],
  [/Split (\d)/, '第 $1 赛段'], [/Season$/, '赛季'], [/^CBLOL Cup (\d+)$/, 'CBLOL 杯 $1'],
]

/** 'LCK 2015 Spring' -> 'LCK 2015 春季赛' */
export function titleCN(t: string): string {
  let s = t
  for (const [re, cn] of SPLIT_CN) s = s.replace(re, cn)
  return s
}

const Line = ({ text, t }: { text: string; t: CoachTitle }) => (
  <li>{text}{t.assistant && <span className="faint">（助教）</span>}</li>
)

export default function CoachHonours({ name, empty = true }: { name: string; empty?: boolean }) {
  const h = honoursOf(name)
  const total = h ? h.worlds.length + h.msi.length + h.leagues.length : 0
  if (!h || !total) return empty ? <p className="tiny faint" style={{ margin: 0 }}>暂无执教冠军（只统计世界赛、MSI 和顶级联赛，不含选手时期）。</p> : null
  return (
    <div className="tiny" style={{ lineHeight: 1.8 }}>
      {h.worlds.length > 0 && <><b>世界赛冠军</b><ul style={{ margin: '2px 0 8px', paddingLeft: 18 }}>
        {h.worlds.map((t) => <Line key={t.title} t={t} text={`${t.title} 全球总决赛`} />)}</ul></>}
      {h.msi.length > 0 && <><b>MSI 冠军</b><ul style={{ margin: '2px 0 8px', paddingLeft: 18 }}>
        {h.msi.map((t) => <Line key={t.title} t={t} text={`${t.title} 季中冠军赛`} />)}</ul></>}
      {h.leagues.length > 0 && <><b>联赛冠军</b><ul style={{ margin: '2px 0 8px', paddingLeft: 18 }}>
        {h.leagues.map((t) => <Line key={t.title} t={t} text={titleCN(t.title)} />)}</ul></>}
      <p className="faint" style={{ margin: 0 }}>只统计执教（主教练或教练组）期间的冠军，不含选手时期；助教身份在评分里按一半计。</p>
    </div>
  )
}
