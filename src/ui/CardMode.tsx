import { RELEASE_POLICY, RELEASE_STAGE } from '../../release-policy.js'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import PhoneGate from './cards/PhoneGate'
import type { ComponentType } from 'react'
import { CardCtx } from './cards/ctx'
import Packs from './cards/Packs'
import WorldsGallery from './cards/WorldsGallery'
import Pity from './cards/Pity'
import Challenge from './cards/Challenge'
import Minigames from './cards/Minigames'
import Collection from './cards/Collection'
import SquadScreen from './cards/Squad'
import Ladder from './cards/Ladder'
import Friends from './cards/Friends'
import Market from './cards/Market'
import Cup from './cards/Cup'
import Predict from './cards/Predict'
import SeoulRoute from './cards/SeoulRoute'
import AccountScreen, { copyText } from './cards/Account'
import Dossier from './LoLCatalog'
import OddsFab from './cards/OddsFab'
import MailBox, { MailButton } from './cards/MailBox'
import Credit from './Credit'
import Changelog from './Changelog'
import ThemeToggle from './ThemeToggle'
import { RiftNavigation, RiftBanner } from './RiftChrome'
import { DemoWelcome, GateBrand, GateStory } from './GateWelcome'
import { ALL_CARDS } from '../engine/cards'
import {
  act as actOnServer, createAccount, dayOf, flushAccount, fetchDay, loadAccount, refreshAccount, retryPending,
  saveAccount, serverNow, whenStale,
} from '../engine/account'
import type { ActOutcome } from '../engine/account'
import { rememberId, rememberedId } from '../engine/cardid'
import {
  MASTER_DIV, STAMINA_COST, STAMINA_MAX, rankName, refreshDaily,
  staminaIn, staminaNow, staminaRate, starsOnTier, tierStars,
} from '../engine/gacha'
import type { GachaState } from '../engine/gacha'
import { track, countScreen } from '../engine/telemetry'
import { mailLine } from '../engine/market'
import type { MailItem } from '../engine/market'

/** "12:34" or "1:02:34" — seconds included, because a clock that does not move
 *  reads as a clock that is not running. */
const hhmmss = (ms: number): string => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  const s = t % 60
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * The 体力 meter, ticking once a second.
 *
 * Its own timer rather than the shell's: the countdown has to move every second
 * to read as running, and re-rendering the whole mode that often would redraw a
 * grid of six hundred cards for the sake of one digit. When a point actually
 * lands it calls up, so the screens that gate on 体力 refresh too.
 */
function StaminaChip({ g, onTick }: { g: GachaState; onTick: () => void }) {
  const [t, setT] = useState(() => serverNow())
  const wasRef = useRef(staminaNow(g, serverNow()))
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = serverNow()
      setT(now)
      const has = staminaNow(g, now)
      if (has !== wasRef.current) {
        wasRef.current = has
        onTick()
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [g, onTick])

  const have = staminaNow(g, t)
  const left = staminaIn(g, t)
  return (
    <div
      className={`chip${have === 0 ? ' spent' : ''}`}
      title={`天梯每场 ${STAMINA_COST.ladder} 点，杯赛入场 ${STAMINA_COST.cup} 点，之后每轮免费。`
        + `${staminaRate()}，上限 ${STAMINA_MAX} 点。`}
    >
      ⚡ <b>{have}/{STAMINA_MAX}</b>
      {have < STAMINA_MAX && (
        <span className="faint mono" style={{ marginLeft: 5, fontSize: 11 }}>
          +1 · {hhmmss(left)}
        </span>
      )}
    </div>
  )
}

const TABS: { key: string; label: string; beta?: boolean }[] = [
  { key: 'packs', label: '抽卡' },
  { key: 'worlds', label: '名人堂' },
  { key: 'challenge', label: '挑战' }, { key: 'minigames', label: '小游戏' },
  { key: 'ladder', label: '天梯' }, { key: 'cup', label: '杯赛' },
  { key: 'market', label: '交易市场' }, { key: 'friends', label: '好友' },
  { key: 'collection', label: '收藏' }, { key: 'squad', label: '卡组' }, { key: 'dossier', label: '图鉴' }, { key: 'account', label: '账号' },
]

/**
 * The card mode, top to bottom.
 *
 * Its own shell rather than another screen inside the career app: it has a
 * different save, a different identity, and a different top bar. The two modes
 * share the match engine and the world data, and nothing else.
 */
export default function CardMode({ onExit }: { onExit: () => void }) {
  const gRef = useRef<GachaState | null>(null)
  const [version, bump] = useReducer((x: number) => x + 1, 0)
  const [tab, setTab] = useState('packs')

  const [cloud, setCloud] = useState(false)
  // 「太多人开小号了」: until the server says a phone has answered for this
  // account, the only screen is the one that asks for one
  const [verified, setVerified] = useState(true)
  const [phone, setPhone] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [dossierId, setDossierId] = useState<string | null>(null)
  const [fresh, setFresh] = useState(false)
  const [showDemoWelcome, setShowDemoWelcome] = useState(false)
  const [now, setNow] = useState(() => serverNow())
  // NOT a fetched string. The date is derived from the ticking server clock,
  // so a tab left open across midnight rolls over on its own instead of
  // insisting all day that it is still yesterday — which brought the check-in
  // button back for a day already claimed and reset the quest board to the
  // wrong one. Same computation the server does, so the two always agree.
  const today = dayOf(now)
  const mainRef = useRef<HTMLDivElement>(null)

  // the 体力 meter refills on a clock and the day turns over on one, so the
  // screens need a clock that moves
  useEffect(() => {
    const t = window.setInterval(() => setNow(serverNow()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 3200)
  }, [])

  // Returns the save, so a screen that reads the server back — the leaderboard
  // — can wait for its own write instead of racing it.
  const commit = useCallback((immediate = false): Promise<void> => {
    bump()
    return gRef.current ? saveAccount(gRef.current, immediate) : Promise.resolve()
  }, [])

  // pick up the account this browser last used, if it has one
  useEffect(() => {
    let alive = true
    void (async () => {
      const id = rememberedId()
      if (!id) {
        const day = await fetchDay()
        if (!alive) return
        setNow(serverNow())
        setCloud(day.cloud)
        setBooting(false)
        return
      }
      const r = await loadAccount(id)
      if (!alive) return
      // loadAccount has just synced the clock offset, so re-read it before
      // anything derives a date or a 体力 figure from it
      setNow(serverNow())
      if (r.ok) {
        gRef.current = r.state
        setCloud(r.cloud)
        setVerified(r.verified)
        setPhone(r.phone)
        // the quest board for today, for display; the server rolls the day
        // over itself the moment anything is actually done
        refreshDaily(r.state, r.today)
        if (!r.cloud) toast('连不上服务器，只能看收藏。开包、签到、比赛需要联网。')
        track('card_start', {
          fresh: false, cloud: r.cloud,
          owned: Object.keys(r.state.cards).length,
          div: r.state.ladder.div,
        })
      } else {
        // the id is remembered but the server has never seen it and there is
        // no local copy either — nothing to restore, so start from the gate
        rememberId(null)
      }
      setBooting(false)
    })()
    return () => { alive = false }
  }, [])

  // When the server says this tab was holding an older copy, take its state
  // rather than argue. Nothing is lost that was not already overwritten
  // somewhere else, and the alternative is this tab clobbering it.
  useEffect(() => {
    whenStale((fresh) => {
      gRef.current = fresh
      bump()
      toast('账号在别的设备上有新进度，已同步。')
    })
    return () => whenStale(null)
  }, [toast])

  /**
   * Something that counts, done on the server.
   *
   * Every pack, check-in, match and upgrade goes through here. The account
   * comes back with the reply and replaces everything the server owns in the
   * local copy — see engine/actions.ts for why nothing of value is ever
   * changed on this side any more.
   */
  const act = useCallback(async (action: string, args: Record<string, unknown> = {}): Promise<ActOutcome> => {
    const g = gRef.current
    if (!g) return { ok: false, why: '还没登录' }
    if (!cloud) return { ok: false, why: '连不上服务器，这一步需要联网。', offline: true }
    const r = await actOnServer(g, action, args)
    bump()
    return r
  }, [cloud])

  /**
   * Everything the inbox owes — sales, refunds, cards that did not sell, a
   * grant from the owner, a gift sent before gifting was removed — collected
   * into the account by the server and handed back with it.
   */
  const collect = useCallback(async (quiet = false): Promise<number> => {
    const r = await act('mail_take')
    if (!r.ok) return 0
    const mail = ((r.result as { mail?: MailItem[] } | undefined)?.mail ?? [])
    if (mail.length && !quiet) {
      // the toast is the knock; the 信箱 button at the top is the letter
      toast(mail.length === 1
        ? `${mailLine(mail[0])}，已收下。`
        : `信箱收到 ${mail.length} 条，已收下。`)
    }
    return mail.length
  }, [act, toast])

  useEffect(() => {
    if (!gRef.current || !cloud) return
    void collect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, gRef.current?.id])

  // A tab that goes away with a five half-arranged should still land it —
  // and a tab that comes back should see what arrived while it was in the
  // background: a sale used to wait for a reload before it reached the
  // person it paid.
  useEffect(() => {
    // and the five chosen on another device since — the account is re-read
    // and, if it moved, taken into this tab (engine/account.ts refreshAccount)
    const catchUp = () => {
      const g = gRef.current
      if (!g) return
      retryPending(g)
      void refreshAccount(g).then((changed) => {
        if (!changed || gRef.current !== g) return
        bump()
        toast('已同步别的设备上的改动。')
      })
    }
    const onVis = () => {
      if (!gRef.current) return
      if (document.visibilityState === 'hidden') { flushAccount(gRef.current); return }
      catchUp()
      if (cloud) void collect()
    }
    const onOnline = () => catchUp()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
    }
  }, [cloud, collect])

  useEffect(() => { mainRef.current?.scrollTo(0, 0); countScreen('cards:' + tab) }, [tab])

  const ctx = useMemo(() => ({
    g: gRef.current!,
    version,
    today,
    now,
    cloud,
    phone,
    bound: (last4: string) => { setVerified(true); setPhone(last4) },
    commit,
    act,
    toast,
    collect,
    openDossier: (id: string) => { setDossierId(id); setTab('dossier') },
    go: setTab,
  // gRef is stable; bump() drives the re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [commit, act, toast, collect, today, now, cloud, phone, gRef.current, tab, version])

  if (booting) {
    return <div className="wrap" style={{ padding: 40 }}><p className="muted">正在读取卡牌账号…</p></div>
  }

  const g = gRef.current
  if (!g) {
    return (
      <>
      <Gate
        onExit={onExit}
        onReady={(state, isNew, isCloud, day, isVerified, last4) => {
          gRef.current = state
          setCloud(isCloud)
          setVerified(isVerified)
          setPhone(last4)
          setNow(serverNow())
          refreshDaily(state, day)
          track('card_start', { fresh: isNew, cloud: isCloud, owned: Object.keys(state.cards).length })
          setFresh(isNew)
          setShowDemoWelcome(isNew && RELEASE_STAGE === 'demo')
          setTab(isNew ? 'account' : 'packs')
          bump()
        }}
      />
      {/* the door is a page like any other, and the person standing at it is
          exactly the one who has not decided whether to come in */}
      <Changelog />
      
      </>
    )
  }

  // Looked up, never built inline as an arrow: a component type created during
  // render is a NEW type every render, which remounts the screen and throws
  // away whatever the player had typed into it.
  const Screen = ({
    packs: Packs,
    mail: MailBox,
    worlds: WorldsGallery,
    challenge: Challenge,
    minigames: Minigames,
    squad: SquadScreen,
    collection: Collection,
    ladder: Ladder,
    friends: Friends,
    market: Market,
    cup: Cup,
    predict: Predict,
    seoul: SeoulRoute,
  } as Record<string, ComponentType>)[tab]

  const signOut = () => {
    rememberId(null)
    gRef.current = null
    setFresh(false)
    bump()
  }

  if (RELEASE_POLICY.phoneEnabled && !verified) {
    return (
      <>
      <PhoneGate
        id={g.id}
        onBound={(last4) => { setVerified(true); setPhone(last4); toast(`绑好了，尾号 ${last4}。`) }}
        onSignOut={signOut}
      />
      <Changelog />
      
      </>
    )
  }

  return (
    <CardCtx.Provider value={ctx}>
      <div className="app cardmode rift-ui">
        <a className="skip-link" href="#main">跳到主内容</a>
        <header className="topbar">
          {/* 开 in the accent, 瓦包 in the gold this mode uses — the same
              two-tone split the career's mark has. The English keeps the .by
              line it inherited, which is where the career puts its credit. */}
          <div className="brand">噜<span>噜卡</span><em className="by">猪之家出品</em></div>
          <div className="chip" title="金币">🪙 <b>{g.coins.toLocaleString('en-US')}</b></div>
          <StaminaChip g={g} onTick={() => setNow(serverNow())} />
          <div className="chip" title="段位">
            {/* the rung, not the division — and past 大师 the score IS the rank */}
            {rankName(g.ladder.div, g.ladder.stars, g.ladder.points ?? 0)}
            {g.ladder.div < MASTER_DIV && (
              <b>{' '}{starsOnTier(g.ladder.div, g.ladder.stars)}/{tierStars(g.ladder.div)}★</b>
            )}
          </div>
          <div className="chip small muted" title="未开的卡包">
            📦 {Object.values(g.packs).reduce((s, n) => s + (n ?? 0), 0)}
          </div>
          <MailButton onClick={() => setTab('mail')} active={tab === 'mail'} />
          <div className="spacer" />
          {!cloud && <div className="chip small" style={{ color: 'var(--warn)' }} title="服务器连不上，进度只在本机">仅本机</div>}
          <ThemeToggle compact />
        </header>

        <RiftNavigation utilities={<MailButton onClick={() => setTab('mail')} active={tab === 'mail'} />} tabs={TABS} active={tab} onSelect={key => { setTab(key); if (key !== 'dossier') setDossierId(null) }} />

        <div className="cm-body" id="main" ref={mainRef}>
          <RiftBanner page={tab} owned={ALL_CARDS.filter(c => g.cards[c.id]).length} total={ALL_CARDS.length} />
          {fresh && tab === 'account' && (
            <div className="panel" style={{ borderColor: 'var(--accent-line)', marginBottom: 14 }}>
              <div className="panel-body">
                <b style={{ color: 'var(--accent)' }}>账号已创建，先把下面的 ID 存好。</b>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  没有密码和邮箱，ID 丢了就找不回来。
                </p>
                <button className="primary sm" style={{ marginTop: 10 }} onClick={() => { setFresh(false); setTab('packs') }}>
                  存好了，去抽卡 →
                </button>
              </div>
            </div>
          )}
          {tab === 'dossier' ? <Dossier playerId={dossierId} onOpen={setDossierId} />
            : tab === 'account' ? <AccountScreen onSignOut={signOut} />
            : Screen ? <>{tab === 'packs' && <Pity />}<Screen /></> : <Packs />}
          <Credit />
        </div>

        {toastMsg && <div className="toast">{toastMsg}</div>}
        {showDemoWelcome && <DemoWelcome onClose={() => setShowDemoWelcome(false)} />}
        <OddsFab />
        <Changelog />
        
      </div>
    </CardCtx.Provider>
  )
}

/** The door: make an account, or come back to one. */
function Gate({
  onReady,
}: {
  onReady: (state: GachaState, isNew: boolean, cloud: boolean, today: string, verified: boolean, phone: string | null) => void
  onExit: () => void
}) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [made, setMade] = useState<{ state: GachaState; cloud: boolean; today: string; verified: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  // the second press, in the page — see the button below
  const [sure, setSure] = useState(false)
  // 「用手机号进入」 from the front door: the way back into an account whose id is gone
  const [byPhone, setByPhone] = useState(false)
  const [entryMode, setEntryMode] = useState<'create' | 'login'>('create')

  const create = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    const r = await createAccount(name)
    setBusy(false)
    // the account is built on the server — there is no account without it
    if (!r.ok) { setErr(r.why); return }
    const verified = await loadAccount(r.state.id)
    setMade({ state: r.state, cloud: true, today: r.today, verified: verified.ok && verified.verified })
  }

  const signIn = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    const r = await loadAccount(id)
    setBusy(false)
    if (r.ok) {
      rememberId(r.state.id)
      onReady(r.state, false, r.cloud, r.today, r.verified, r.phone)
    } else {
      setErr({
        bad: 'ID 格式不对：VM- 开头，后面五组四位。',
        missing: '没有这个 ID，检查是否抄错。',
        offline: '连不上服务器，本机也没有这个账号的备份。',
      }[r.reason])
    }
  }

  if (RELEASE_POLICY.phoneEnabled && byPhone) {
    return <PhoneGate onBound={() => {}} onSignOut={() => setByPhone(false)} backLabel="返回" />
  }

  if (made) {
    return (
      <div className="lulu-gate">
        <GateBrand />
        <main className="gate-receipt">
        <div className="gate-receipt-mark" aria-hidden="true">✦</div>
        <p className="gate-eyebrow">档案已建立 · {made.state.name}</p>
        <h1>你的收藏，从此开始。</h1>
        <p className="gate-intro">
          这串 ID 是你返回收藏的凭证，请复制保存或截图。
          <br /><b>没有密码和邮箱，丢失 ID 将无法找回账号。</b>
        </p>
        <div className="gate-id-label">专属账号 ID<code className="gate-id">{made.state.id}</code></div>
        <div className="gate-receipt-actions">
          <button
            className="gate-secondary"
            onClick={async () => {
              const ok = await copyText(made.state.id)
              setCopied(ok)
              if (!ok) setErr('自动复制失败，请长按手动复制，或者截图。')
            }}
          >
            {copied ? '已复制 ✓' : '复制 ID'}
          </button>
          <button
            className="gate-submit"
            // Never disabled, and never a confirm(). Clipboard access fails
            // outright in a few in-app browsers, and those same webviews —
            // WeChat and Xiaohongshu, which is most of this audience — can
            // refuse a confirm() outright. When they do, the call returns
            // false and the button silently does nothing: the only door into
            // the game, dead, with no way to tell it is not simply broken.
            // Asking again in the page always works.
            onClick={() => {
              if (copied || sure) onReady(made.state, true, made.cloud, made.today, made.verified, null)
              else setSure(true)
            }}
          >
            {sure ? '确定，直接进入 →' : '存好了，进入游戏 →'}
          </button>
        </div>
        {sure && !copied && (
          <p className="gate-error" role="alert">
            还没复制 ID，丢了找不回来。再点一次直接进入。
          </p>
        )}
        {err && <p className="gate-error" role="alert">{err}</p>}
        </main>
        <div className="gate-footer"><Credit /></div>
      </div>
    )
  }

  return (
    <div className="lulu-gate">
      <GateBrand />
      <main className="gate-layout">
        <GateStory />
        <section className="gate-console" aria-label="收藏档案">
          <div className="gate-console-top"><span>COLLECTOR ACCESS</span><span aria-hidden="true">✦</span></div>
          <div className="gate-modes" role="group" aria-label="账号入口">
            <button type="button" aria-pressed={entryMode === 'create'} disabled={busy} onClick={() => { setEntryMode('create'); setErr(null) }}>初次建档</button>
            <button type="button" aria-pressed={entryMode === 'login'} disabled={busy} onClick={() => { setEntryMode('login'); setErr(null) }}>返回收藏</button>
          </div>
          <div className="gate-form-heading">
            <span className="gate-step">{entryMode === 'create' ? '01 / NEW JOURNEY' : '02 / WELCOME BACK'}</span>
            <h2>{entryMode === 'create' ? '为你的收藏署名' : '欢迎回到你的藏卡室'}</h2>
            <p>{entryMode === 'create' ? '取一个昵称，下一张传奇由你揭晓。' : '输入保存的账号 ID，继续你的收藏之旅。'}</p>
          </div>
          <form className="gate-form" aria-busy={busy} onSubmit={e => { e.preventDefault(); if (!busy) void (entryMode === 'create' ? create() : signIn()) }}>
            {entryMode === 'create' ? <>
              <label htmlFor="collector-name">玩家昵称<input id="collector-name" autoComplete="nickname" placeholder="怎么称呼你？" value={name} maxLength={20} required disabled={busy} onChange={e => setName(e.target.value)} /></label>
              <p className="gate-field-note">最多 20 个字符 · 昵称之后可以修改</p>
              <div className="gate-gift"><span>开局补给</span><strong>{RELEASE_POLICY.starterCoins.toLocaleString('en-US')} <small>金币</small></strong></div>
              <p className="gate-pack-gift">试训包 × {RELEASE_POLICY.starterPacks.scout} · 选拔包 × {RELEASE_POLICY.starterPacks.elite} · 十连包 × {RELEASE_POLICY.starterPacks.ten}</p>
            </> : <>
              <label htmlFor="collector-id">账号 ID<input id="collector-id" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="VM-XXXX-XXXX-XXXX-XXXX-XXXX" value={id} required disabled={busy} onChange={e => setId(e.target.value)} /></label>
              <p className="gate-field-note">完整粘贴建档时保存的 ID，请勿分享给他人。</p>
            </>}
            {err && <p className="gate-error" role="alert">{err}</p>}
            <button className="gate-submit" type="submit" disabled={busy || (entryMode === 'create' ? !name.trim() : id.trim().length < 8)}>
              {busy ? (entryMode === 'create' ? '正在建立档案…' : '正在读取收藏…') : (entryMode === 'create' ? '创建我的档案' : '进入我的收藏')}<span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="gate-account-note">{entryMode === 'create' ? '建档后请保存专属账号 ID，以便下次登录。' : '内测期间暂不开放手机号功能，请妥善保存账号 ID。'}</p>
          {RELEASE_POLICY.phoneEnabled && <button className="gate-secondary" onClick={() => setByPhone(true)}>用手机号进入</button>}
        </section>
      </main>
      <div className="gate-footer"><Credit /></div>
    </div>
  )
}
