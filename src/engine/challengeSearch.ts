import type { Choice } from './challenge'
import officialChampionNames from '../data/challengeChampionNames.json'

const COMMON_CHAMPION_CN_ALIASES: Record<string, string[]> = {
  'Lee Sin': ['盲僧', '瞎子'],
  Malphite: ['石头人'],
  'Miss Fortune': ['女枪'],
  'Twisted Fate': ['卡牌'],
  Graves: ['男枪'],
  Fiora: ['剑姬'],
  Wukong: ['猴子'],
  Ahri: ['狐狸'],
  Blitzcrank: ['机器人'],
  Orianna: ['发条'],
  Tristana: ['小炮'],
  Nasus: ['狗头'],
  Renekton: ['鳄鱼'],
  Vayne: ['VN'], Ezreal: ['EZ'], 'Jarvan IV': ['皇子'],
}

export const COMMON_PLAYER_ALIASES: Record<string, string[]> = {
  Faker: ['大飞', '李相赫'],
  Uzi: ['简自豪'],
  TheShy: ['姜承録', '姜承录'],
  Rookie: ['宋义进'],
  Clearlove: ['厂长', '明凯'], Bjergsen: ['比尔森'], Doublelift: ['大师兄'], Caps: ['帽皇'],
}

const normalize = (s: string): string => {
  const nfkc = s.normalize('NFKC')
  const nfd = nfkc.normalize('NFD')
  return nfd.replace(/\p{Mark}/gu, '').toLowerCase()
}

const fold = (s: string): string =>
  normalize(s).replace(/[^a-z0-9\u4e00-\u9fff]/g, '')

interface Candidate { names: string[]; hint: string }
const officialNamesData = officialChampionNames.names as Record<string, string[]>
const teamAliases: Record<string, string[]> = {
  T1: ['SKT', 'SK Telecom T1'], GEN: ['GEN.G'], BLG: ['哔哩哔哩'],
  IG: ['iG', 'IG战队', '极'], TES: ['滔搏'], JDG: ['京东'], LNG: ['李宁'], WBG: ['微博'],
  EDG: ['国电'], RNG: ['皇族'], WE: ['WE战队'], FNC: ['Fnatic'], G2: ['G2战队'],
}
const candidateCache = new WeakMap<Choice, Candidate>()
function buildCandidate(choice: Choice): Candidate {
  const cached = candidateCache.get(choice)
  if (cached) return cached
  const names = [choice.name]
  const player = choice.kind === 'player' || /^P\d+$/.test(choice.id)
  const team = choice.kind === 'team' || /^T\d+$/.test(choice.id)
  const tag = choice.hint.split('·')[0].trim()
  if (!player) names.push(tag)
  if (player) names.push(...(COMMON_PLAYER_ALIASES[choice.name] ?? []))
  if (team) names.push(...(teamAliases[tag.toUpperCase()] ?? []))
  if (choice.kind === 'agent') {
    names.push(choice.id, ...(officialNamesData[choice.id] ?? []), ...(COMMON_CHAMPION_CN_ALIASES[choice.id] ?? []))
  }
  const candidate = { names: [...new Set(names.map(fold).filter(Boolean))], hint: fold(choice.hint) }
  candidateCache.set(choice, candidate)
  return candidate
}
function rankCandidate(candidate: Candidate, q: string): number {
  if (candidate.names.includes(q)) return 5
  if (candidate.names.some(name => name.startsWith(q))) return 4
  if (candidate.names.some(name => name.includes(q))) return 3
  return candidate.hint.includes(q) ? 1 : 0
}
/** Keep the canonical title visible while making the familiar champion name obvious. */
export function challengeChoiceLabel(choice: Choice): string {
  const name = choice.kind === 'agent' ? officialNamesData[choice.id]?.find(n => n !== choice.name) : undefined
  return name && name !== choice.name ? name + ' · ' + choice.name : choice.name
}

export function rankChallengeMatches(all: Choice[], query: string): Choice[] {
  const q = fold(query)
  if (!q) return []

  const scored: Array<[number, Choice]> = []
  for (const choice of all) {
    const candidate = buildCandidate(choice)
    const score = rankCandidate(candidate, q)
    if (score > 0) {
      scored.push([score, choice])
    }
  }

  scored.sort((a, b) => b[0] - a[0])

  if (scored.length === 1) return [scored[0][1]]

  return scored.slice(0, 8).map(([, choice]) => choice)
}
