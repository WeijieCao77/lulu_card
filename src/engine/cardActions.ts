/**
 * Everything a card account can do that is worth anything, as one function
 * the SERVER runs.
 *
 * The save used to be written by the client, so the anti-cheat question had
 * exactly one honest answer: none. Editing localStorage was editing the
 * account. What could be checked afterwards was arithmetic — can this many
 * matches have been played — and arithmetic catches the clumsy and nobody
 * else.
 *
 * This is the other design. The collection lives on the server and the
 * server is the only thing that changes it: a client that wants to open a
 * pack sends 「开一个选拔包」 and gets back what came out, along with the
 * account as it now is. The pack is rolled here, from a seed the client never
 * held; the check-in is dated here; the ladder match is simulated here with
 * the five the server knows the player owns. An edited localStorage is an
 * edited DISPLAY — the next reply from the server replaces it.
 *
 * The rules are the same functions the client ran until now. Nothing about
 * what a pack pays or what a match is worth changed; only where it runs.
 *
 * Pure: state in, state mutated, result out. The database, the clock and the
 * opponent pool are the server's business and arrive in `env`, which is what
 * lets scripts/check_authority.ts drive every action without a database.
 */
import {
  awardMinigame, canPlay, claimEchoSet, note, checkIn, claimFullSet, claimQuest, claimSeries, clampState, cupBo, cupOpponent, drawOpponent, enterCup,
  levelOf, playLevelOf, oppBumpFor, openPack, packCost, pendingOpponent, primeStamina, recordCup, recordLadder,
  refreshDaily, salvage, salvageBulk, seriesOfPack, spendPlay, upgrade, ladderSlot, leagueEntry, isLadderLeague,
  LADDER_BO, LEAGUE_RULES, MASTER_DIV, RIVAL_MERCY_GAP, SERIES, STAMINA_COST, SWEEPABLE, isPackKind, registerCupSquad, cupSquadOf, ladderSquadOf,
} from './gacha'
import {
  judgeMinigame, MINI_GAMES, MINIGAME_DAILY, MINIGAME_TTL_MS, newMinigame, refreshMinigame,
} from './minigame'
import type { MiniGame } from './minigame'
import type { GachaState, QuestKey, Series } from './gacha'
import { isLegacyRegionPack } from './regionMigration'
import { buyShop, ensureShop } from './dailyShop'
import { BALANCE_VERSION, arenaOpponentRating, playArenaMatch, playCupMatch, playRivalMatch } from './arena'
import { CUP_TEAMS } from './cupTeams'
import type { ArenaResult, RivalSquad } from './arena'
import { challengeBlock, challengeSig, guessChallenge } from './challenge'
import type { ChallengeKind } from './challenge'
import { hashStr } from './rng'
import { cardById, isPlayerCard, personOf, squadRating } from './cards'
import type { Rarity, Squad } from './cards'
import { WORLD_TEAMS } from './teams'
import { markMailSeen } from './inbox'
import { dailyQuestion, echoQuizDone, startEchoQuiz, viewDaily, viewEchoQuiz } from './echoQuiz'
import type { EchoQuizQ } from './echoQuiz'
import { dismantle } from './dismantle'
import { evolve } from './evolve'
import { washEvo } from './evoWash'
import { SEOUL_TEAMS } from './seoul2024'
import { SEOUL_FIVES, SEOUL_POOL, SEOUL_ROUTES, quitRoute, recordRoute, routeState, startRoute } from './seoulRoute'

/** What the server knows that the rules need. */
export interface ActEnv {
  /** the server's clock, ms */
  now: number
  /** the server's date, YYYY-MM-DD in Asia/Shanghai */
  today: string
  /** unpredictable, for the match; a script may fix it */
  seed: number
  /** a real player's five for the ladder, when the division calls for one and the pool had one */
  rival?: RivalSquad | null
  /** Chosen and held on the server; never sent to a player before the puzzle ends. */
  challengePuzzle?: { kind: ChallengeKind; answer: string }
  /** 峡谷回响问答's bank (echo-quiz.js), which only the server holds — see engine/echoQuiz.ts */
  echoQuiz?: readonly EchoQuizQ[]
}

export type ActResult =
  | { ok: true; result?: unknown }
  | { ok: false; why: string }

export const ACTIONS = [
  'open', 'checkin', 'quest', 'series', 'fullset', 'salvage', 'salvage_dupes', 'salvage_bulk', 'upgrade',
  'ladder_draw', 'ladder', 'cup_enter', 'cup_play', 'cup_clear', 'challenge', 'mail_seen',
  'minigame_start', 'minigame_finish', 'dismantle', 'evolve', 'evo_wash', 'seoul_start', 'seoul_play', 'seoul_quit',
  'series_pick', 'shop', 'shop_buy', 'echo_quiz', 'echo_quiz_answer', 'echo_set', 'echo_daily', 'echo_daily_answer',
] as const
export type ActionName = (typeof ACTIONS)[number]

/** Whether this action may need a real player's five fetched before it runs. */
export const wantsRival = (g: GachaState, action: string): boolean =>
  (action === 'ladder' || action === 'ladder_draw') && !pendingOpponent(g) && g.ladder.div >= 4

/** What the five this account would field is worth on paper, for finding it a fair rival. */
export function ladderScore(g: GachaState): number | null {
  const five = squadForPlay(g)
  return five.ok ? squadRating(five.squad, (id) => playLevelOf(g, id)) : null
}

/**
 * The five as the server will field it.
 *
 * The squad is the one part of the account the client still writes, because
 * which five to run is the player's choice. What it is not allowed to do is
 * name a card the account does not hold, or seat the same man twice — both are
 * checked here, against the collection the server holds, at the moment the
 * five walks out.
 */
export function squadForPlay(g: GachaState): { ok: true; squad: Squad } | { ok: false; why: string } {
  const seen = new Set<string>()
  const slots = g.squad.slots.slice(0, 5).map((id) => {
    if (!id || !g.cards[id]) return null
    const c = cardById(id)
    if (!c || !isPlayerCard(c)) return null
    const who = personOf(c)
    if (seen.has(who)) return null
    seen.add(who)
    return id
  })
  while (slots.length < 5) slots.push(null)
  const coach = g.squad.coach && g.cards[g.squad.coach] && cardById(g.squad.coach)?.kind === 'coach'
    ? g.squad.coach : null
  if (slots.filter(Boolean).length < 5) return { ok: false, why: '先凑齐五个人。' }
  return { ok: true, squad: { slots, coach } }
}

const str = (v: unknown, max = 40): string => (typeof v === 'string' ? v.slice(0, max) : '')

export function runAction(
  g: GachaState, action: string, args: Record<string, unknown>, env: ActEnv,
): ActResult {
  // the day and the meter are the server's to keep, and every action starts
  // from where they actually are
  refreshDaily(g, env.today)
  primeStamina(g, env.now)

  const out = dispatch(g, action, args ?? {}, env)
  clampState(g)
  return out
}

function dispatch(
  g: GachaState, action: string, a: Record<string, unknown>, env: ActEnv,
): ActResult {
  switch (action) {
    case 'open': {
      const kind = a.kind
      if (!isPackKind(kind)) return { ok: false, why: '没有这种卡包' }
      if (isLegacyRegionPack(kind)) {
        return { ok: false, why: 'LCP、CBLOL 包已并入其他包，请刷新页面。' }
      }
      const payWith = a.payWith === 'coins' ? 'coins' : 'pack'
      // Coins buying a series pack must name the exact price the page showed
      // before the purchase. The page could have been open since before the
      // weekly pick changed, before a new week began, or before the prices
      // were rebalanced — the server must not silently charge a different
      // amount than the button the player clicked said it would.
      if (payWith === 'coins' && seriesOfPack(kind)) {
        const expected = a.expectedPrice
        if (typeof expected !== 'number' || Number.isNaN(expected) || !Number.isFinite(expected)) {
          return { ok: false, why: '页面版本已更新，请刷新后再购买赛区包。' }
        }
        if (expected !== packCost(kind, env.today, g)) {
          return { ok: false, why: '赛区包价格已变化，请刷新页面确认后再购买。' }
        }
      }
      // A pack must not be knowable before it is bought. `seed` lives in the
      // account, the account is handed to the client with every reply, and
      // openPack is a pure function of it — so a player holding their own
      // state could work out the next pack card for card and open only when a
      // 彩卡 was due. Folding in a number the server made and has never sent
      // anywhere makes the reply worthless for guessing the one after it.
      // Mixed here rather than inside openPack so the pack itself stays a
      // pure function of the state, which is what the odds scripts measure.
      g.seed = hashStr(`${g.seed}:${env.seed}`) >>> 0
      try {
        const pulled = openPack(g, kind, payWith, env.today)
        return {
          ok: true,
          result: {
            pulled: pulled.map((p) => ({ cardId: p.card.id, dupe: p.dupe, salvage: p.salvage })),
          },
        }
      } catch (e) {
        return { ok: false, why: e instanceof Error ? e.message : '开不了' }
      }
    }
    case 'checkin': {
      const r = checkIn(g, env.today)
      return { ok: true, result: r }
    }
    case 'quest': {
      const key = str(a.key) as QuestKey
      const coins = claimQuest(g, key)
      if (!coins) return { ok: false, why: '这个任务还领不了' }
      return { ok: true, result: { coins } }
    }
    case 'series': {
      const region = str(a.region) as Series
      if (!(SERIES as readonly string[]).includes(region)) return { ok: false, why: '没有这个赛区' }
      const got = claimSeries(g, region)
      if (!got) return { ok: false, why: '这个赛区没有可领的奖励' }
      return { ok: true, result: { got } }
    }
    case 'fullset': {
      const got = claimFullSet(g)
      if (!got) return { ok: false, why: '全图鉴还没集齐，或者已经领过了' }
      return { ok: true, result: { got } }
    }
    // ---- 每日老将问答: one question a day, never one this account has seen — engine/echoQuiz.ts
    case 'echo_daily': {
      const bank = env.echoQuiz
      if (!bank?.length) return { ok: false, why: '问答还没开放' }
      const next = dailyQuestion(g.echoDaily, g.echoQuiz, bank, env.today, hashStr(`${g.seed}:${env.seed}:${env.today}:echo-daily`))
      if (!next) return { ok: true, result: { daily: null, won: g.echoDaily?.won ?? 0, exhausted: true } }
      g.echoDaily = next
      return { ok: true, result: { daily: viewDaily(next, bank), won: next.won } }
    }
    case 'echo_daily_answer': {
      const bank = env.echoQuiz
      const s = g.echoDaily
      if (!bank?.length || !s || s.day !== env.today) return { ok: false, why: '先打开今天的题' }
      if (s.pick != null) return { ok: false, why: '今天的题已经答过了，明天再来' }
      const pick = Math.trunc(Number(a.pick))
      if (!(pick >= 0 && pick < 4)) return { ok: false, why: '没有这个选项' }
      const q = bank.find((x) => x.id === s.id)
      if (!q) return { ok: false, why: '题库更新了，请联系站长' }
      s.pick = pick
      const correct = s.order[pick] === q.answer
      if (correct) {
        s.won += 1
        g.packs.echoScout = (g.packs.echoScout ?? 0) + 1
        note(g, '每日老将问答答对：+1 回响试训包')
      }
      return { ok: true, result: { daily: viewDaily(s, bank), correct, won: s.won } }
    }
    case 'echo_set': {
      const got = claimEchoSet(g)
      if (!got) return { ok: false, why: '峡谷回响图鉴还没到下一档，或者已经领过了' }
      return { ok: true, result: { got } }
    }
    case 'salvage': {
      const cardId = str(a.cardId)
      const count = Math.max(0, Math.min(999, Math.trunc(Number(a.count) || 0)))
      const coins = salvage(g, cardId, count)
      if (!coins) return { ok: false, why: '没有可分解的重复卡' }
      return { ok: true, result: { coins } }
    }
    case 'salvage_dupes': {
      // the reveal's 「分解重复卡」: one spare of each card named, no more
      const ids = Array.isArray(a.cardIds) ? a.cardIds.map((x) => str(x)).filter(Boolean).slice(0, 20) : []
      let coins = 0
      for (const id of ids) coins += salvage(g, id, 1)
      return { ok: true, result: { coins } }
    }
    case 'salvage_bulk': {
      // 「一键分解」. The request names a pile — these rarities, these cards —
      // and never a count: how many spares are in it is read off the
      // collection here. A彩卡 is only ever in it by name (see SWEEPABLE).
      const rarities = (Array.isArray(a.rarities) ? a.rarities : [])
        .map((x) => str(x, 8))
        .filter((r): r is Rarity => (SWEEPABLE as readonly string[]).includes(r))
      const cardIds = (Array.isArray(a.cardIds) ? a.cardIds : [])
        .map((x) => str(x)).filter(Boolean).slice(0, 300)
      if (!rarities.length && !cardIds.length) return { ok: false, why: '没有选中要分解的卡' }
      const got = salvageBulk(g, { rarities, cardIds, keepForUpgrade: a.keepForUpgrade === true })
      if (!got.dupes) return { ok: false, why: '没有可分解的重复卡' }
      return { ok: true, result: got }
    }
    case 'upgrade': {
      const cardId = str(a.cardId)
      if (!upgrade(g, cardId)) return { ok: false, why: '还升不了' }
      return { ok: true, result: { level: levelOf(g, cardId) } }
    }
    case 'evolve': {
      // 进修: five spare copies for one attribute on a +5 card (engine/evolve.ts)
      const feed = Array.isArray(a.feed) ? a.feed.slice(0, 10).map((x) => str(x)) : []
      const r = evolve(g, str(a.cardId), str(a.attr, 16), feed, env.now)
      if (!r.ok) return r
      return { ok: true, result: { gain: r.gain, attr: r.attr, evo: r.evo } }
    }
    case 'evo_wash': {
      // 洗掉进修: the 进修 comes off, the cards it ate stay eaten (engine/evoWash.ts)
      const r = washEvo(g, str(a.cardId), a.spare == null ? null : Number(a.spare))
      if (!r.ok) return r
      return { ok: true, result: {} }
    }
    case 'dismantle': {
      const r = dismantle(g, str(a.cardId), Number(a.level))
      if (!r.ok) return r
      return { ok: true, result: { dupes: r.dupes, coins: r.coins } }
    }
    case 'ladder_draw': {
      const league = isLadderLeague(a.league) ? a.league : 'open'
      const L = ladderSlot(g, league)
      if (pendingOpponent(g, league)) return { ok: true, result: { league, pending: L.pending } }
      // only the open ladder puts another player's five across the net; a
      // metal ladder is about your own shelf and plays the clubs
      drawOpponent(g, league === 'open' && L.div >= 4 ? env.rival ?? undefined : undefined, league)
      return { ok: true, result: { league, pending: L.pending } }
    }
    case 'ladder': {
      const league = isLadderLeague(a.league) ? a.league : 'open'
      // a metal ladder plays its own lineup when one has been set (CupLineup), else the 卡组
      const five = squadForPlay({ ...g, squad: ladderSquadOf(g, league) })
      if (!five.ok) return five
      // the terms of entry, checked here — the client picks the ladder, the
      // server decides whether this five may walk into it
      const entry = leagueEntry(five.squad, league)
      if (!entry.ok) return { ok: false, why: entry.why }
      if (!canPlay(g, 'ladder', env.now)) return { ok: false, why: '体力不够' }
      const L = ladderSlot(g, league)
      // the opponent the screen showed is the opponent that gets played; a
      // client that never asked for one gets one drawn now
      if (!pendingOpponent(g, league)) {
        drawOpponent(g, league === 'open' && L.div >= 4 ? env.rival ?? undefined : undefined, league)
      }
      const pinned = pendingOpponent(g, league)!
      const rival = (pinned.rival ?? null) as RivalSquad | null
      const oppId = pinned.club ?? WORLD_TEAMS[0].id
      const master = L.div >= MASTER_DIV
      // the league's own handicap, and above 大师 the sharpening on top
      const bump = LEAGUE_RULES[league].oppBump + (master ? oppBumpFor(L.points ?? 0) : 0)
      if (!spendPlay(g, 'ladder', env.now)) return { ok: false, why: '体力不够' }
      const level = (id: string) => playLevelOf(g, id)
      const res: ArenaResult = rival
        ? playRivalMatch(five.squad, level, rival, LADDER_BO, env.seed, undefined, true)
        : playArenaMatch(five.squad, level, oppId, LADDER_BO, env.seed, bump)
      // a real five is worth what its own ladder position says it is worth
      const strength = rival
        ? 84 + Math.min(10, Math.floor(rival.points / 250))
        : (arenaOpponentRating(oppId) ?? 80) + bump
      const mine = squadRating(five.squad, level)
      const theirs = rival
        ? squadRating(rival, (id) => rival.levels[id] ?? 0)
        : Math.round((arenaOpponentRating(oppId) ?? 80) + bump)
      const mercy = !!rival && theirs - mine >= RIVAL_MERCY_GAP
      const out = recordLadder(g, res.win, strength, league, mercy)
      return {
        ok: true,
        // `rate`: both 阵容分, for the server's 胜率表 log (winrate-api.js)
        result: { league, res, opp: oppId, who: rival ? `${rival.name} ${rival.tag}` : undefined, out, rate: { mine, theirs, rival: !!rival } },
      }
    }
    case 'cup_enter': {
      if (g.cup && !g.cup.done) return { ok: true, result: { cup: g.cup } }
      // the club cup's own lineup, if one has been set (gacha.ts cupSquads)
      const five = squadForPlay({ ...g, squad: cupSquadOf(g, 'club') })
      if (!five.ok) return five
      if (!canPlay(g, 'cup', env.now)) return { ok: false, why: `体力不够，入场要 ${STAMINA_COST.cup} 点` }
      try {
        const level = (id: string) => playLevelOf(g, id)
        enterCup(g, squadRating(five.squad, level), env.now, registerCupSquad(five.squad, level))
        return { ok: true, result: { cup: g.cup } }
      } catch (e) {
        return { ok: false, why: e instanceof Error ? e.message : '报不了名' }
      }
    }
    case 'cup_play': {
      const cup = g.cup
      const oppId = cupOpponent(g)
      if (!cup || !oppId) return { ok: false, why: '没有进行中的杯赛' }
      // Older paid brackets acquire their registration on the first actual
      // match, without charging again or redrawing the opponents.
      if (!cup.registration) {
        const five = squadForPlay({ ...g, squad: cupSquadOf(g, 'club') })
        if (!five.ok) return { ok: false, why: '这届旧杯赛还没有报名阵容，请先凑齐五个人再继续；不会重新收费或抽签。' }
        cup.registration = registerCupSquad(five.squad, id => playLevelOf(g, id))
      }
      // the ticket was the whole price: nothing is charged per round
      const level = (id: string) => cup.registration!.levels[id] ?? 0
      const res = playCupMatch(cup.registration.squad, level, oppId, cupBo(cup), env.seed, cup.ease ?? 0, cup.balance ?? 1)
      const out = recordCup(g, {
        opponent: oppId, win: res.win, mapsWon: res.mapsWon, mapsLost: res.mapsLost,
      })
      // both 阵容分 for the 胜率表 (winrate-api.js), only for brackets on the current curve
      const team = CUP_TEAMS.find((t) => t.id === oppId)
      const rate = team && (cup.balance ?? 1) === BALANCE_VERSION
        ? { mine: squadRating(cup.registration.squad, level), theirs: team.rating - (cup.ease ?? 0) }
        : undefined
      return { ok: true, result: { res, opp: oppId, out, registration: cup.registration, rate } }
    }
    case 'cup_clear': {
      // only a finished bracket can be put away; an unfinished one is a paid
      // entry and stays until it is played out
      if (g.cup && !g.cup.done) return { ok: false, why: '这届杯赛还没打完' }
      g.cup = null
      return { ok: true }
    }
    case 'challenge': {
      const why = challengeBlock(g, env.today)
      if (why) return { ok: false, why }
      const guessId = str(a.guessId, 80)
      if (!guessId) return { ok: false, why: '先选一个' }
      // a page from before a data update marks its hints against the wrong answer (see challengeSig):
      // nothing is charged and no try is spent until it has been refreshed
      if (str(a.sig, 16) !== challengeSig()) return { ok: false, why: '游戏数据更新了，刷新页面后再猜。这次不扣次数。' }
      const turn = guessChallenge(g, env.today, guessId, env.challengePuzzle)
      return { ok: true, result: { turn } }
    }
    case 'mail_seen': {
      markMailSeen(g)
      return { ok: true }
    }
    // 每日商店 (engine/dailyShop.ts): the shelf is rolled here, on the server, and kept in the save
    case 'shop': {
      ensureShop(g, env.today, env.seed)
      return { ok: true, result: { shop: g.shop } }
    }
    case 'shop_buy': {
      // the shelf changed under the page (a new day, or an old-rule shelf rolled again): show it, sell nothing
      if (ensureShop(g, env.today, env.seed)) return { ok: false, why: '商店已经更新，看看新上架的卡再买。' }
      const slot = Math.trunc(Number(a.slot))
      const r = buyShop(g, slot, env.today, env.now)
      if (!r.ok) return r
      return { ok: true, result: { cardId: r.cardId, price: r.price, shop: g.shop } }
    }
    case 'series_pick':
      // since 2026-09-27 the week's discounted region is the same for everyone (featuredSeries)
      return { ok: false, why: '每周优惠赛区已改为全服统一，不用再选，刷新页面即可看到' }
    // ---- 位置小游戏: the server opens the round and judges it — engine/minigame.ts
    case 'minigame_start': {
      const game = str(a.game, 12) as MiniGame
      if (!MINI_GAMES.includes(game)) return { ok: false, why: '没有这个小游戏' }
      const m = (g.minigame ??= newMinigame())
      refreshMinigame(m, env.today)
      if (m.plays >= MINIGAME_DAILY) return { ok: false, why: `今天的 ${MINIGAME_DAILY} 次都用完了，明天再来` }
      // starting again abandons the round in progress; the play it spent stays spent,
      // or a bad seed could be rerolled for free
      m.plays += 1
      const seed = hashStr(`${g.seed}:${env.seed}:${env.now}:${game}:${m.plays}`) >>> 0
      m.live = { game, seed, startedAt: env.now }
      return { ok: true, result: { game, seed, startedAt: env.now, playsLeft: MINIGAME_DAILY - m.plays } }
    }
    case 'minigame_finish': {
      const m = g.minigame
      const live = m?.live
      if (!m || !live) return { ok: false, why: '没有进行中的小游戏' }
      const elapsed = env.now - live.startedAt
      m.live = null
      if (elapsed > MINIGAME_TTL_MS) return { ok: false, why: '这局放太久了，已经作废' }
      const verdict = judgeMinigame(live.game, live.seed, a.transcript, elapsed)
      if (!verdict.ok) return { ok: false, why: verdict.why }
      const reward = awardMinigame(g, live.game, verdict.tier, env.today)
      m.best[live.game] = Math.max(m.best[live.game] ?? 0, verdict.score)
      return { ok: true, result: { game: live.game, tier: verdict.tier, score: verdict.score, summary: verdict.summary, detail: verdict.detail, reward, playsLeft: MINIGAME_DAILY - m.plays } }
    }
    // ---- 峡谷回响问答: five questions once, a 回响包 for each right answer — engine/echoQuiz.ts
    case 'echo_quiz': {
      const bank = env.echoQuiz
      if (!bank?.length) return { ok: false, why: '问答还没开放' }
      g.echoQuiz ??= startEchoQuiz(bank, hashStr(`${g.seed}:${env.seed}:${env.now}:echo-quiz`))
      const questions = viewEchoQuiz(g.echoQuiz, bank)
      if (!questions) return { ok: false, why: '题库更新了，请联系站长' }
      return { ok: true, result: { questions, won: g.echoQuiz.won, done: echoQuizDone(g.echoQuiz) } }
    }
    case 'echo_quiz_answer': {
      const bank = env.echoQuiz
      const s = g.echoQuiz
      if (!bank?.length || !s) return { ok: false, why: '先打开问答' }
      const i = Math.trunc(Number(a.i))
      const pick = Math.trunc(Number(a.pick))
      if (!(i >= 0 && i < s.ids.length) || !(pick >= 0 && pick < 4)) return { ok: false, why: '没有这个选项' }
      if (s.picks[i] != null) return { ok: false, why: '这题已经答过了' }
      const q = bank.find((x) => x.id === s.ids[i])
      if (!q) return { ok: false, why: '题库更新了，请联系站长' }
      s.picks[i] = pick
      const correct = s.order[i][pick] === q.answer
      if (correct) {
        s.won += 1
        g.packs.echo = (g.packs.echo ?? 0) + 1
        note(g, `峡谷回响问答第 ${i + 1} 题答对：+1 峡谷回响包`)
      }
      return { ok: true, result: { questions: viewEchoQuiz(s, bank), correct, won: s.won, done: echoQuizDone(s) } }
    }
    // ---- 首尔征途: 2024's road with 2024's fives — engine/seoulRoute.ts
    case 'seoul_start': {
      const out = startRoute(g, a.team, env.now)
      return out.ok ? { ok: true, result: { route: g.seoulRoute } } : out
    }
    case 'seoul_play': {
      const run = routeState(g).run
      if (!run) return { ok: false, why: '先选一支队出发' }
      const st = SEOUL_ROUTES[run.team][run.stage]
      const name = (tag: string) => SEOUL_TEAMS.find((t) => t.tag === tag)?.name ?? tag
      // no 体力 and no collection: both sides are the 2024 fives at level 0,
      // on the 2024 map pool
      const res = playRivalMatch(
        { ...SEOUL_FIVES[run.team], name: name(run.team), tag: run.team }, () => 0,
        { ...SEOUL_FIVES[st.opp], name: name(st.opp), tag: st.opp, levels: {}, div: 0, points: 0 },
        st.bo, env.seed, SEOUL_POOL,
      )
      const out = recordRoute(g, {
        won: res.mapsWon,
        lost: res.mapsLost,
        maps: res.result.maps.map((m) => `${m.map} ${m.scoreA}:${m.scoreB}`),
      }, env.now)
      return { ok: true, result: { res, out } }
    }
    case 'seoul_quit': {
      quitRoute(g)
      return { ok: true }
    }
    default:
      return { ok: false, why: '没有这个操作' }
  }
}
