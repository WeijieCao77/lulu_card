import { RiftPackArt } from '../RiftChrome'
import { useEffect, useRef, useState } from 'react'
import { useCards } from './ctx'
import { Panel } from '../common'
import {
  PACKS, PACK_ORDER, POSITION_PACK_KINDS, QUESTS, CHECKIN_COINS, DAILY_CLEAR_PACKS, HARD_PITY, SOFT_PITY, packPosition,
  collectionProgress, refreshDaily, featuredSeries, packCost, seriesOfPack, seriesProgress,
  fullSetProgress, FULL_SET_REWARD,
} from '../../engine/gacha'
import type { CheckIn, PackKind, Pulled, QuestKey, Series } from '../../engine/gacha'
import { selectedWeeklySeries } from '../../engine/weeklySeries'
import { cardById } from '../../engine/cards'
import { GAME_REGION_CN } from '../../engine/gameRegions'
import { track } from '../../engine/telemetry'
import PackStage from './PackStage'
import SalvageConfirm from './SalvageConfirm'
import type { SalvageAsk } from './SalvageConfirm'
import { loadFastPack, saveFastPack } from './packPreferences'

/** What the server says came out of a pack, resolved back to cards. */
interface PulledWire { cardId: string; dupe: boolean; salvage: number }

export default function Packs() {
  const { g, today, act, toast } = useCards()
  const [opening, setOpening] = useState<Pulled[] | null>(null)
  const [openingKind, setOpeningKind] = useState<PackKind | null>(null)
  const [revealSequence, setRevealSequence] = useState(0)
  const [payWith, setPayWith] = useState<'pack' | 'coins'>('pack')
  const [busy, setBusy] = useState(false)
  const [unknownError, setUnknownError] = useState(false)
  /** the reveal's 分解重复卡, waiting for the player to read the list */
  const [ask, setAsk] = useState<SalvageAsk | null>(null)
  const [fastMode, setFastMode] = useState(() => loadFastPack())
  const [candidate, setCandidate] = useState<Series | ''>('')
  const [choosing, setChoosing] = useState(false)
  const openLock = useRef(false)
  const salvageLock = useRef(false)
  const chooseLock = useRef(false)
  const uncertain = useRef(false)
  const markUnknown = () => { uncertain.current = true; setUnknownError(true) }

  useEffect(() => {
    saveFastPack(fastMode)
  }, [fastMode])

  refreshDaily(g, today)
  const prog = collectionProgress(g)
  const series = seriesProgress(g)
  const featured = featuredSeries(today)
  const fullSet = fullSetProgress(g)
  const selectedDiscount = selectedWeeklySeries(g, today)

  // The pack is rolled on the server and comes back already in the
  // collection; what happens here is the reveal.
  const open = async (kind: PackKind, payWith: 'pack' | 'coins') => {
    if (busy || openLock.current || salvageLock.current || uncertain.current || unknownError || ask) return
    openLock.current = true
    setBusy(true)
    try {
      const args: Record<string, unknown> = { kind, payWith }
      if (payWith === 'coins' && seriesOfPack(kind)) {
        args.expectedPrice = packCost(kind, today, g)
      }
      let r
      try {
        r = await act('open', args)
      } catch (e) {
        toast('连不上服务器，结果还不确定，请刷新后核对。')
        markUnknown()
        return
      }
      if (!r.ok) {
        toast(r.why)
        if (r.unknown) markUnknown()
        return
      }
      const wire = ((r.result as { pulled?: PulledWire[] } | undefined)?.pulled ?? [])
      const out: Pulled[] = wire
        .map((p) => { const card = cardById(p.cardId); return card ? { card, dupe: p.dupe, salvage: p.salvage } : null })
        .filter((x): x is Pulled => !!x)
      if (!out.length) { toast('没读到开出的卡，请刷新存档核对收藏后继续。'); markUnknown(); return }
      // A card this page cannot name is a player added to the game after this
      // page was loaded: the server rolled him, the account holds him, and the
      // old bundle has no card to draw. 「十连包只有九张」「cn包只有两张」 — the
      // day 14 CN players went in, a phone still on the previous build lost one
      // card in a quarter of its ten-packs. Say so instead of drawing nine.
      if (out.length < wire.length) {
        toast(`这一包有 ${wire.length - out.length} 张是刚加进游戏的新选手，这个页面还是旧版本画不出来。卡已经在账号里，刷新后在收藏里能看到。`)
      }
      track('card_pull', {
        kind,
        paid: payWith,
        gold: out.filter((p) => p.card.rarity === 'gold').length,
        dupes: out.filter((p) => p.dupe).length,
        // which cards, so 「我抽到过他」 can be checked against something —
        // the ten ids of a ten-pull are under a hundred bytes
        cards: out.map((p) => p.card.id).join(','),
      })
      setOpening(out)
      setOpeningKind(kind)
      setPayWith(payWith)
      setRevealSequence((s) => s + 1)
    } finally {
      setBusy(false)
      openLock.current = false
    }
  }

  const done = () => {
    if (busy || openLock.current || salvageLock.current || ask) return
    setOpening(null)
    setOpeningKind(null)
    setAsk(null)
  }

  const continueNext = async () => {
    if (busy || openLock.current || unknownError || ask) return
    if (!openingKind) return
    if (payWith === 'pack') {
      if ((g.packs[openingKind] ?? 0) < 1) {
        toast('卡包不足。')
        return
      }
    } else {
      const price = packCost(openingKind, today, g)
      if (g.coins < price) {
        toast('金币不足。')
        return
      }
    }
    await open(openingKind, payWith)
  }

  const check = async () => {
    const r = await act('checkin')
    if (!r.ok) { toast(r.why); return }
    const c = r.result as CheckIn
    if (!c.already) track('card_signin', { streak: c.streak })
    toast(c.already ? '今天已经签过到了。' : `签到第 ${c.streak} 天：+${c.coins} 金币，卡包已入库。`)
  }

  const claim = async (key: QuestKey) => {
    const r = await act('quest', { key })
    if (!r.ok) { toast(r.why); return }
    toast(`任务完成，+${(r.result as { coins: number }).coins} 金币。`)
  }

  const chooseWeekly = async () => {
    if (!candidate || selectedDiscount || choosing || chooseLock.current) return
    chooseLock.current = true
    setChoosing(true)
    try {
      const r = await act('series_pick', { region: candidate })
      if (!r.ok) {
        toast(r.why)
        return
      }
      toast(`本周赛区已锁定：${GAME_REGION_CN[candidate]}，八折优惠。北京时间周一 0 点后可重新选择。`)
      setCandidate('')
    } catch (e) {
      toast('连不上服务器，结果还不确定，请刷新后核对。')
    } finally {
      setChoosing(false)
      chooseLock.current = false
    }
  }

  const takeSeries = async (region: Series) => {
    const r = await act('series', { region })
    if (!r.ok) { toast(r.why); return }
    toast(`系列奖励已领取：${(r.result as { got: string }).got}`)
  }

  const takeFullSet = async () => {
    const r = await act('fullset', {})
    if (!r.ok) { toast(r.why); return }
    toast(`全图鉴奖励已领取：${(r.result as { got: string }).got}`)
  }

  const signedToday = g.daily.claimed === today

  return (
    <>
      <div className="pack-preferences">
        <label><input type="checkbox" checked={fastMode} onChange={e => setFastMode(e.target.checked)} /> 快速开包</label>
        <span className="tiny faint">跳过祭坛、直接翻开普通卡，彩卡仍有独立特效。自动记住此设备的选择。</span>
      </div>
      {unknownError && <div role="alert" className="pack-sync-notice">
        <span>上一笔操作结果尚未确认，已暂停开包。请刷新存档后核对卡包与收藏。</span>
        <button onClick={() => window.location.reload()}>刷新存档</button>
      </div>}
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <Panel title="每日签到" actions={<span className="tiny muted">连续 {g.daily.streak} 天</span>}>
          <p className="small muted" style={{ marginTop: 0, lineHeight: 1.7 }}>
            每天送 {CHECKIN_COINS} 金币和 1 个试训包；每轮第 3、6 天加送选拔包，第 7 天加送十连包。日期以服务器（北京时间）为准。
          </p>
          <div className="row" style={{ gap: 4, margin: '10px 0 12px' }}>
            {Array.from({ length: 7 }, (_, i) => {
              const day = i + 1
              // the streak runs past seven, so the strip shows where in the
              // current cycle of seven it is
              const hit = g.daily.streak > 0 ? ((g.daily.streak - 1) % 7) + 1 : 0
              const on = day <= hit
              return (
                <div
                  key={i}
                  title={`${CHECKIN_COINS} 金币 + 试训包${day === 7 ? ' + 十连包' : day % 3 === 0 ? ' + 选拔包' : ''}`}
                  style={{
                    flex: 1, height: 30, borderRadius: 3, display: 'grid', placeItems: 'center',
                    fontSize: 10, fontWeight: 700,
                    background: on ? 'var(--warn-wash)' : 'var(--panel-2)',
                    border: `1px solid ${on ? 'var(--warn)' : 'var(--line)'}`,
                    color: on ? 'var(--warn)' : 'var(--faint)',
                  }}
                >
                  {day === 7 ? '十连' : day % 3 === 0 ? '选拔' : day}
                </div>
              )
            })}
          </div>
          <button className="primary" onClick={() => void check()} disabled={signedToday}>
            {signedToday ? '今天已签到' : '签到'}
          </button>
        </Panel>

        <Panel title="今日任务" actions={<span className="tiny muted">{g.daily.taken.length}/{g.daily.picked.length}</span>}>
          {g.daily.picked.map((key) => {
            const q = QUESTS[key]
            const at = g.daily.progress[key] ?? 0
            const full = at >= q.target
            const taken = g.daily.taken.includes(key)
            return (
              <div key={key} className="row" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div>
                  <div className="small">{q.label}</div>
                  <div className="tiny faint mono">{Math.min(at, q.target)}/{q.target} · +{q.reward} 金币</div>
                </div>
                <button className="sm" onClick={() => void claim(key)} disabled={!full || taken}>
                  {taken ? '已领' : full ? '领取' : '进行中'}
                </button>
              </div>
            )
          })}
          <p className="tiny faint" style={{ marginBottom: 0 }}>全部完成加送 {DAILY_CLEAR_PACKS} 个试训包。</p>
        </Panel>
      </div>


      <Panel
        title="卡包"
        actions={
          <span className="tiny muted">
            收集 {prog.owned}/{prog.total} ·
            距保底 {Math.max(0, HARD_PITY - g.pity)} 抽
            {g.pity >= SOFT_PITY ? '（概率递增中）' : ''}
          </span>
        }
      >
        <p className="tiny faint" style={{ marginTop: 0, lineHeight: 1.7 }}>
          用金币随时买，不限次数。十连包不卖，可通过升段、夺冠、连签和挑战等玩法获得。
        </p>
        <div className="pack-shelf">
          {(g.packs.legend ?? 0) > 0 && (
            <div className="pack-box" style={{ borderColor: 'var(--mythic, var(--warn))' }}>
              <h4>
                {PACKS.legend.name}
                <span className="pack-own"> ×{g.packs.legend}</span>
              </h4>
              <p>{PACKS.legend.blurb}</p>
              <div className="pack-shelf-actions">
                <button className="primary sm" onClick={() => void open('legend', 'pack')} disabled={busy || unknownError}>
                  打开（{g.packs.legend}）
                </button>
                <span className="tiny faint" style={{ alignSelf: 'center' }}>非卖品</span>
              </div>
            </div>
          )}
          {PACK_ORDER.filter((k) => !seriesOfPack(k) && k !== 'seoul2024').map((kind) => {
            const def = PACKS[kind]
            const own = g.packs[kind] ?? 0
            return (
              <div key={kind} className="pack-box"><RiftPackArt kind={kind} />
                <h4>
                  {def.name}
                  {own > 0 && <span className="pack-own"> ×{own}</span>}
                </h4>
                <p>{def.blurb}</p>
                <div className="pack-shelf-actions">
                  <button className="primary sm" onClick={() => void open(kind, 'pack')} disabled={busy || unknownError || own < 1}>
                    打开（{own}）
                  </button>
                  {def.shop === false ? (
                    <span className="tiny faint" style={{ alignSelf: 'center' }}>非卖品</span>
                  ) : (
                    <button
                      className="sm"
                      onClick={() => void open(kind, 'coins')}
                      disabled={busy || unknownError || g.coins < def.cost}
                    >
                      花 {def.cost} 金币
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      {POSITION_PACK_KINDS.some((k) => (g.packs[k] ?? 0) > 0) && (
        <Panel title="位置奖励包" actions={<span className="tiny muted">小游戏打出来的</span>}>
          <p className="tiny faint" style={{ marginTop: 0, lineHeight: 1.7 }}>
            开出一张该位置的选手卡，只能在「小游戏」里赢得。
          </p>
          <div className="pack-shelf">
            {POSITION_PACK_KINDS.filter((k) => (g.packs[k] ?? 0) > 0).map((kind) => {
              const def = PACKS[kind]
              const own = g.packs[kind] ?? 0
              return (
                <div key={kind} className="pack-box"><RiftPackArt kind={kind} />
                  <h4>{def.name}<span className="pack-own"> ×{own}</span></h4>
                  <p>{def.blurb}</p>
                  <div className="pack-shelf-actions"><button className="primary sm" onClick={() => void open(kind, 'pack')} disabled={busy || unknownError || own < 1}>打开（{own}）</button></div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      <Panel
        title="赛区系列"
        actions={<span className="tiny muted">三大区，分开收集</span>}
      >
        <p className="tiny faint" style={{ marginTop: 0, lineHeight: 1.7 }}>
          游戏内赛区包分为三大区：LPL、LCK、其他（原 LEC、LCS、LCP、CBLOL 库存合并保留，包含越南等地区队伍）。赛区包只出该大区的选手，出金率和选拔包相同；三个区包全部常驻可买，收齐各赛区都有奖励，并且全部可出彩卡、共享彩卡保底。
          {'　'}每个大区收到 25% / 50% / 75% / 90% / 100% 各有一档奖励，收齐送十连包。
          {'　'}每周可自选一个大区享受八折优惠，本周选定后不可更改，北京时间周一 0 点开放重新选择；锁定前按原价购买。本周推荐是{GAME_REGION_CN[featured]}，仅作推荐展示。
        </p>
        {!selectedDiscount ? (
          <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
            <label htmlFor="weekly-series-choice" className="tiny faint" style={{ whiteSpace: 'nowrap' }}>选择优惠赛区</label>
            <select
              id="weekly-series-choice"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value as Series | '')}
              disabled={choosing}
              style={{ maxWidth: '100%' }}
            >
              <option value="">请选择</option>
              {series.map((s) => (
                <option key={s.region} value={s.region}>{GAME_REGION_CN[s.region]}</option>
              ))}
            </select>
            <button className="sm primary" onClick={() => void chooseWeekly()} disabled={!candidate || choosing}>
              确认本周赛区（不可更改）
            </button>
          </div>
        ) : (
          <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
            <span className="tiny">已选优惠赛区：<b>{GAME_REGION_CN[selectedDiscount]}</b></span>
            <span className="tiny faint">该赛区包 2080 金币</span>
            <span className="tiny faint">北京时间周一 0 点重新选择</span>
          </div>
        )}
        <div className="pack-shelf">
          {series.map((s) => {
            const def = PACKS[s.pack]
            const own = g.packs[s.pack] ?? 0
            const pct = s.total ? Math.round((s.owned / s.total) * 100) : 0
            const hot = s.region === featured
            const discounted = s.region === selectedDiscount
            const price = packCost(s.pack, today, g)
            return (
              <div
                key={s.region}
                className="pack-box"
                style={hot ? { borderColor: 'var(--warn)' } : undefined}
              >
                <h4>
                  {GAME_REGION_CN[s.region]}
                  {hot && <span className="tag warn" style={{ marginLeft: 6 }}>本周推荐</span>}
                  {discounted && <span className="tag warn" style={{ marginLeft: 6 }}>自选八折</span>}
                  {own > 0 && <span className="pack-own"> ×{own}</span>}
                </h4>
                <div className="tiny mono faint" style={{ margin: '2px 0 5px' }}>
                  选手卡 {s.owned}/{s.total}（{pct}%）
                </div>
                <div
                  style={{
                    height: 5, borderRadius: 3, background: 'var(--panel-2)',
                    border: '1px solid var(--line)', overflow: 'hidden', marginBottom: 9,
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`, height: '100%',
                      background: s.owned >= s.total ? 'var(--good)' : 'var(--accent)',
                    }}
                  />
                </div>
                {/* The reward lives on its own line, next to the words that
                    announce it. It used to be a third button on the buy row,
                    and the box clips (overflow: hidden, for the glow in the
                    corner) — four boxes across a desktop are ~230px each,
                    and 打开 + 花 2600 金币 + 领奖 was wider than that, so the
                    one button that gives something away was the one you could
                    not see. Same for the struck price on the featured box. */}
                <div className="row" style={{ gap: 6, marginBottom: 8, minHeight: 22 }}>
                  <span className="tiny faint" style={{ lineHeight: 1.6 }}>
                    {s.ready.length
                      ? `有 ${s.ready.length} 档奖励可以领`
                      : s.next
                        ? `再收 ${s.next.need} 张到 ${Math.round(s.next.at * 100)}%：${s.next.label}`
                        : '全部收齐了'}
                  </span>
                  {s.ready.length > 0 && (
                    <button
                      className="sm warn" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
                      onClick={() => void takeSeries(s.region)}
                    >
                      领奖
                    </button>
                  )}
                </div>
                <div className="pack-shelf-actions">
                  <button className="primary sm" onClick={() => void open(s.pack, 'pack')} disabled={busy || unknownError || own < 1}>
                    打开（{own}）
                  </button>
                  <button
                    className="sm"
                    onClick={() => void open(s.pack, 'coins')}
                    disabled={busy || unknownError || g.coins < price}
                  >
                    花 {price} 金币
                    {discounted && <s className="faint" style={{ marginLeft: 4 }}>{def.cost}</s>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {/* 全图鉴: every card that is not a 彩卡, and the one pack that deals nothing else. */}
        <div
          className="row wrap"
          style={{
            gap: 10, alignItems: 'center', marginTop: 10, padding: '8px 10px',
            border: '1px solid var(--line)', borderRadius: 8,
            borderColor: fullSet.ready ? 'var(--warn)' : undefined,
          }}
        >
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
              <b style={{ fontSize: 13 }}>全图鉴</b>
              <span className="tiny mono faint">{fullSet.owned}/{fullSet.total}（{Math.floor((fullSet.owned / Math.max(1, fullSet.total)) * 100)}%）</span>
            </div>
            <div
              style={{
                height: 5, borderRadius: 3, background: 'var(--panel-2)',
                border: '1px solid var(--line)', overflow: 'hidden', margin: '5px 0',
              }}
            >
              <div
                style={{
                  width: `${(fullSet.owned / Math.max(1, fullSet.total)) * 100}%`, height: '100%',
                  background: fullSet.owned >= fullSet.total ? 'var(--good)' : 'var(--accent)',
                }}
              />
            </div>
            <span className="tiny faint" style={{ lineHeight: 1.6 }}>
              {fullSet.claimed
                ? '全部收齐，彩卡包已领。'
                : fullSet.ready
                  ? `全部收齐了：${PACKS[FULL_SET_REWARD.pack].name} ×${FULL_SET_REWARD.count} 可以领`
                  : `收齐全部基础选手卡和教练卡，还差 ${fullSet.total - fullSet.owned} 张。收齐可领取一包彩卡包，必出一张彩卡。`}
            </span>
          </div>
          {fullSet.ready && (
            <button className="sm warn" style={{ whiteSpace: 'nowrap' }} onClick={() => void takeFullSet()}>
              领奖
            </button>
          )}
        </div>
      </Panel>

      {opening && (
        <PackStage
          key={revealSequence}
          pulled={opening}
          packName={openingKind ? PACKS[openingKind].name : '选手卡包'}
          position={openingKind ? packPosition(openingKind) ?? undefined : undefined}
          fast={fastMode}
          busy={busy}
          unknownError={unknownError}
          onFastChange={setFastMode}
          continueLabel={
            payWith === 'pack'
              ? `继续下一包（消耗 1 个${openingKind ? PACKS[openingKind].name : '卡包'}）`
              : `继续下一包（消耗 ${openingKind ? packCost(openingKind, today, g) : 0} 金币）`
          }
          continueEnabled={!busy && !unknownError && !ask && openingKind !== null && (
            payWith === 'pack'
              ? (g.packs[openingKind] ?? 0) >= 1
              : g.coins >= (openingKind ? packCost(openingKind, today, g) : 0)
          )}
          onContinue={() => void continueNext()}
          onDone={done}
          onSellAll={() => {
            if (openLock.current || salvageLock.current || uncertain.current || busy || ask) return
            // one spare per card named, which is what salvage_dupes sells —
            // a pack holding the same dupe twice still lists it once
            const seen = new Set<string>()
            const lines = opening
              .filter((p) => p.dupe && !seen.has(p.card.id) && seen.add(p.card.id))
              .map((p) => ({ cardId: p.card.id, count: 1, coins: p.salvage }))
            if (!lines.length) { toast('这一包没有重复卡。'); return }
            setAsk({
              lines,
              onConfirm: async () => {
                if (busy || openLock.current || salvageLock.current || uncertain.current || unknownError) return
                salvageLock.current = true
                setBusy(true)
                try {
                  const r = await act('salvage_dupes', { cardIds: lines.map((l) => l.cardId) })
                  setAsk(null)
                  if (!r.ok) {
                    toast(r.why)
                    if (r.unknown) markUnknown()
                    return
                  }
                  const coins = (r.result as { coins: number }).coins
                  toast(coins ? `重复卡已分解，+${coins} 金币。` : '这一包的重复卡已经分解过了。')
                } catch (e) {
                  toast('连不上服务器，结果还不确定，请刷新后核对。')
                  setAsk(null)
                  markUnknown()
                } finally {
                  setBusy(false)
                  salvageLock.current = false
                }
              },
            })
          }}
        />
      )}
      {ask && <SalvageConfirm ask={ask} busy={busy} onClose={() => { if (!busy && !salvageLock.current) setAsk(null) }} />}
    </>
  )
}
