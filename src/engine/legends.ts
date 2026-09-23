import type { Attrs, Region, Role } from './types'
import WORLDS from '../data/worldsLegends.json'

export type LegendKind =
  
  | 'fmvp'
  
  | 'mvp'
  
  | 'icon'
  | 'hall'

export interface Legend {
  art?: { accent: string; position: string; zoom?: number; year?: number; credit: string; source: string; serial: number; total?: number }
  competition?: 'Worlds' | 'MSI' | 'Career'
  collection?: 'ig-2018' | 'msi-mvp' | 'hall-of-fame'
  ratingTier?: 'hall' | 'champion' | 'msi-mvp' | 'worlds-mvp' | 'special'
  source?: string
  peakSeason?: {
    year: number
    team: string
    role: Role
    selection: 'game-design'
    basis: string
    evidence: { url: string; claim: string }[]
  }
  id: string
  
  ign: string
  
  title: string
  
  short: string
  year: number
  kind: LegendKind
  
  clubId: string
  clubTag: string
  rating: number
  
  note: string
  
  attrs?: Partial<Attrs>
  
  roles?: Role[]
  
  isIgl?: boolean
  
  coach?: { tactics: number; development: number; motivation: number }
  
  person?: {
    id: string
    realName: string
    nat: string
    region: Region
    age: number
    roles: Role[]
    attrs: Attrs
    overall: number
    agents: string[]
  }
}

// Owner-selected historical cards. Ratings are game design, not official statistics.
export const LEGENDS: Legend[] = WORLDS as Legend[]
export const LEGEND_KIND_CN: Record<LegendKind, string> = { fmvp: '决赛 MVP', mvp: '赛事 MVP', icon: '冠军纪念', hall: '知名选手' }
export const legendEdition = (l: Legend) => l.competition === 'Career' ? `${l.year} ${l.peakSeason?.selection === 'game-design' ? '巅峰' : '赛季'}` : l.competition === 'MSI' ? `MSI ${l.year}` : `S${l.year - 2010}`
export const LEGEND_TIER_CN = { hall: '知名选手 · 90–92', champion: '冠军成员 · 90–94', 'msi-mvp': 'MSI MVP · 93–95', 'worlds-mvp': 'S 赛 MVP · 94–97', special: '特别纪念 · 单独评定' } as const
