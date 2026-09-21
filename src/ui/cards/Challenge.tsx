import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../engine/account'
import { useCards } from './ctx'
import { Panel } from '../common'
import { track } from '../../engine/telemetry'
import {
  allChoices, CHALLENGE_COST, CHALLENGE_TRIES, challengeBlock, challengeSig, challengeToday,
  detail, evaluate, KIND_CN, revealed, triesLeft,
} from '../../engine/challenge'
import type { ChallengeTurn, GuessRow, HintMark } from '../../engine/challenge'
import { FRAME_ASPECT, FRAME_MAX, paintPuzzle, puzzleShift } from './puzzle'
import { hashStr } from '../../engine/rng'
import { rankChallengeMatches, challengeChoiceLabel } from '../../engine/challengeSearch'

const MARK_STYLE: Record<HintMark, { bg: string; fg: string; suffix?: string }> = {
  hit: { bg: 'var(--win-wash)', fg: 'var(--win)' },
  near: { bg: 'var(--warn-wash)', fg: 'var(--warn)' },
  miss: { bg: 'var(--panel-2)', fg: 'var(--faint)' },
  up: { bg: 'var(--panel-2)', fg: 'var(--muted)', suffix: ' ↑' },
  down: { bg: 'var(--panel-2)', fg: 'var(--muted)', suffix: ' ↓' },
}

const assetBase = (): string =>
  typeof import.meta.env !== 'undefined' ? import.meta.env.BASE_URL : './'

/**
 * 每日挑战.
 *
 * The one screen in this mode that is neither a slot machine nor a spectator
 * seat — the session was four minutes long because everything in it resolved
 * in fifteen seconds, and this is the part that asks the player to actually
 * know something. Same puzzle for everybody, so it is a thing to argue about.
 */
export default function Challenge() {
  const { g, today, act, toast } = useCards()
  const [query, setQuery] = useState('')
  const composing = useRef(false)
  const [busy, setBusy] = useState(false)

  const { kind, answer, state, rows } = challengeToday(g, today)
  const choices = useMemo(() => allChoices(), [])
  const used = state.guesses.length
  const left = triesLeft(state)
  const block = challengeBlock(g, today)

  const guessed = new Set(state.guesses)
  const matches = query.trim() ? rankChallengeMatches(choices.filter((c) => !guessed.has(c.id)), query) : []

  const submit = async (id: string) => {
    const why = challengeBlock(g, today)
    if (why) { toast(why); return }
    if (busy || stale || !ready) return
    setBusy(true)
    const r = await act('challenge', { guessId: id, sig: challengeSig() })
    setBusy(false)
    if (!r.ok) { toast(r.why); return }
    const turn = (r.result as { turn: ChallengeTurn }).turn
    setQuery('')
    if (turn.finished) {
      const after = g.challenge
      const tries = after?.guesses.length ?? 0
      track('card_challenge', {
        kind, solved: turn.solved ? 1 : 0, tries, streak: after?.streak ?? 0,
      })
      if (turn.solved) {
        const rw = turn.reward
        toast(`猜中了！第 ${tries} 次 · +${rw?.coins ?? 0} 金币`
          + (rw?.pack ? ` + ${rw.pack === 'ten' ? '十连包' : rw.pack === 'elite' ? '选拔包' : '试训包'}` : '')
          + (rw?.streakPack ? ' + 连签七天的十连包' : ''))
      } else {
        toast(`没猜中，答案是 ${answerRow.name}。退回 ${turn.reward?.coins ?? 0} 金币，明天再来。`)
      }
    }
  }

  const answerRow: GuessRow = evaluate(kind, answer, answer)

  const show = state.done ? 1 : revealed(used)
  const zoom = 1 + (1 - show) * 1.6
  const cells = state.done ? Infinity : detail(used)
  const shift = useMemo(() => puzzleShift(hashStr(`puzzle:${today}:${g.id}`)), [today, g.id])

  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [pic, setPic] = useState<HTMLImageElement | null>(null)
  const [picMissing, setPicMissing] = useState(false)
  const [stale, setStale] = useState(false)
  const [ready, setReady] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let alive = true
    let url = ''
    let image: HTMLImageElement | null = null
    const controller = new AbortController()
    const release = () => { if (url) { URL.revokeObjectURL(url); url = '' } }
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    setPic(null); setPicMissing(false); setReady(false); setStale(false)
    const load = async () => {
      const response = await fetch(api('puzzle'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: g.id }), signal: controller.signal,
      })
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) throw new Error('picture')
      const theirs = response.headers.get('X-Puzzle-Sig')
      if (alive && theirs && theirs !== challengeSig()) setStale(true)
      const blob = await response.blob()
      if (!alive || controller.signal.aborted) throw new Error('cancelled')
      url = URL.createObjectURL(blob)
      image = new Image()
      const im = image
      await new Promise<void>((resolve, reject) => {
        const clear = () => { im.onload = null; im.onerror = null; controller.signal.removeEventListener('abort', abort) }
        const abort = () => { clear(); im.removeAttribute('src'); reject(new Error('cancelled')) }
        im.onload = () => { clear(); resolve() }
        im.onerror = () => { clear(); reject(new Error('decode')) }
        controller.signal.addEventListener('abort', abort, { once: true })
        im.src = url
      })
      if (alive && !controller.signal.aborted) setPic(im)
    }
    void load().catch(() => { if (alive) { setReady(false); setPicMissing(true) } }).finally(() => {
      window.clearTimeout(timeout)
      release()
    })
    return () => {
      alive = false; window.clearTimeout(timeout); controller.abort(); release()
      if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src') }
    }
  }, [g.id, today, answer, retry])

  useEffect(() => {
    const c = canvas.current
    if (!c || !pic) return
    let raf = 0
    const draw = () => {
      try {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const [aw, ah] = FRAME_ASPECT
        const logicalWidth = Math.min(FRAME_MAX, c.parentElement?.clientWidth || FRAME_MAX)
        const w = Math.max(aw, Math.round(logicalWidth * dpr / aw) * aw)
        if (c.width !== w) c.width = w
        if (c.height !== w / aw * ah) c.height = w / aw * ah
        const ctx = c.getContext('2d')
        if (!ctx) throw new Error('canvas')
        paintPuzzle(ctx, pic, c.width, c.height, zoom, cells, shift)
        setReady(true)
      } catch { setReady(false); setPicMissing(true) }
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw) }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    if (c.parentElement) observer?.observe(c.parentElement)
    window.addEventListener('resize', schedule)
    schedule()
    return () => { observer?.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(raf) }
  }, [pic, zoom, cells, shift])

  const inputDisabled = !!block || stale || busy || !ready
  const guessDisabled = inputDisabled || !matches[0]

  return (
    <>
      <Panel
        title="每日挑战"
        actions={
          <span className="tiny muted">
            {state.streak > 0 && <b style={{ color: 'var(--warn)' }}>连续 {state.streak} 天 · </b>}
            累计解开 {state.total}
          </span>
        }
      >
        <p className="small muted" style={{ marginTop: 0, lineHeight: 1.7 }}>
          答案可能是<b>选手、战队或英雄</b>，不告诉你是哪一类。每猜错一次图片清楚一点。
          <br />
          每天一题，<b>每个账号题目不同</b>，入场 <b>{CHALLENGE_COST} 金币</b>。
          猜中按次数给卡包（<b>一次猜中给十连包</b>），没猜中退一半。
        </p>
        {stale && (
          <p className="small warn" style={{ lineHeight: 1.7 }}>
            游戏数据更新了，这个页面还是旧的，提示会对不上。
            <button className="sm primary" style={{ marginLeft: 8 }} onClick={() => location.reload()}>刷新页面</button>
          </p>
        )}

        {/* image area */}
        <div style={{
          position: 'relative', width: `min(100%, ${FRAME_MAX}px)`,
          aspectRatio: `${FRAME_ASPECT[0]} / ${FRAME_ASPECT[1]}`,
          borderRadius: 4, overflow: 'hidden',
          background: 'var(--panel-2)', margin: '0 auto 12px',
          display: 'grid', placeItems: 'center',
        }}>
          {answerRow.img && !picMissing && !ready && <span role="status" className="small muted">正在加载挑战图片…</span>}
          {(!answerRow.img || picMissing) && (
            <span role="status" className="faint small">
              {picMissing ? (
                <>
                  图片加载失败
                  <button
                    className="sm primary"
                    style={{ marginLeft: 8 }}
                    onClick={() => { setReady(false); setPicMissing(false); setPic(null); setRetry(n => n + 1) }}
                  >
                    重试
                  </button>
                </>
              ) : '（这一题没有图）'}
            </span>
          )}
          {answerRow.img && !picMissing && (
            <canvas
              ref={canvas}
              aria-hidden
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: pic ? 'block' : 'none' }}
            />
          )}
          <div className="tiny" style={{
            position: 'absolute', right: 8, bottom: 8, padding: '2px 8px',
            borderRadius: 999, background: 'rgba(8,12,18,.72)', color: 'var(--muted)',
          }}>
            {state.done
              ? `${KIND_CN[kind]} · ${answerRow.name}`
              : `还剩 ${left} 次`}
          </div>
        </div>

        {/* picker */}
        {!state.done && (
          <form
            style={{ position: 'relative', marginBottom: 10 }}
            onSubmit={(e) => { e.preventDefault(); if (!composing.current && matches[0] && !guessDisabled) void submit(matches[0].id) }}
          >
            <div className="row" style={{ gap: 8 }}>
              <input
                id="challenge-guess"
                aria-label="输入选手、战队或英雄名字"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={block ?? `中文名、英文名或常用简称`}
                disabled={inputDisabled}
                autoComplete="off"
                onCompositionStart={() => { composing.current = true }}
                onCompositionEnd={() => { composing.current = false }}
                onKeyDown={e => { if (e.key === 'Enter' && (composing.current || e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault() }}
                enterKeyHint="go"
              />
              <button className="primary" type="submit" disabled={guessDisabled}>
                猜
              </button>
            </div>
            {query.trim() && !matches.length && <p role="status" className="tiny muted">未找到候选：试试完整中文名、英文 ID 或战队缩写；已经猜过的不会重复列出。</p>}
            {matches.length > 0 && (
              <div style={{
                position: 'relative', zIndex: 5,
                background: 'var(--panel)', border: '1px solid var(--line)',
                borderRadius: 3, marginTop: 3,
                overflowY: 'auto', maxHeight: 220,
                boxShadow: 'var(--shadow-card)',
              }}>
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="ghost"
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', border: 0,
                      borderRadius: 0, padding: '8px 11px', minHeight: 44,
                    }}
                    disabled={inputDisabled || busy}
                    onClick={() => void submit(c.id)}
                  >
                    <b>{challengeChoiceLabel(c)}</b>{' '}
                    <span className="tag" style={{ marginLeft: 2 }}>{KIND_CN[c.kind!]}</span>{' '}
                    <span className="tiny faint">{c.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        )}

        {block && !state.done && (
          <p className="tiny" style={{ color: 'var(--warn)', margin: '0 0 8px' }}>{block}</p>
        )}

        {rows.length > 0 && (() => {
          const head = rows.reduce((best, r) => (r.cells.length > best.length ? r.cells : best),
            [] as typeof rows[number]['cells'])
          return (
          <div className="table-wrap" style={{ marginTop: 4 }}>
            <table>
              {head.length > 0 && (
                <thead>
                  <tr>
                    <th>猜的</th>
                    {head.map((c) => <th key={c.label} className="center">{c.label}</th>)}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.slice().reverse().map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        {r.img && (
                          <img src={`${assetBase()}${r.img}`} alt="" style={{
                            width: 22, height: 22, borderRadius: 2, objectFit: 'cover',
                            objectPosition: 'top center', background: 'var(--panel-2)',
                          }} />
                        )}
                        <b>{r.name}</b>
                        {r.id === answer && <span className="tag t1">正解</span>}
                      </span>
                    </td>
                    {head.map((h, ci) => {
                      const c = r.cells[ci]
                      if (!c) return <td key={h.label} className="center faint">—</td>
                      const st = MARK_STYLE[c.mark]
                      return (
                        <td key={c.label} className="center">
                          <span style={{
                            display: 'inline-block', minWidth: 44, padding: '2px 7px',
                            borderRadius: 3, background: st.bg, color: st.fg,
                            fontSize: 'var(--t-tiny)', fontWeight: 700,
                          }}>
                            {c.value}{st.suffix ?? ''}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        })()}

        {state.done && (
          <>
            <p className="small" style={{ marginTop: 12, marginBottom: 6, color: state.solved ? 'var(--win)' : 'var(--muted)' }}>
              {state.solved
                ? `第 ${used} 次猜中，连续第 ${state.streak} 天。`
                : '今天没猜出来，连胜清零了。'}
              答案是<b style={{ color: 'var(--text)' }}>{KIND_CN[kind]}「{answerRow.name}」</b>。明天换一道。
            </p>
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              margin: '12px 0 0', padding: '11px 13px', borderRadius: 3,
              background: 'var(--warn-wash)',
              border: '1px solid var(--warn)', borderLeftWidth: 3,
            }}>
              <span style={{ fontSize: 19, lineHeight: 1.2 }}>🤐</span>
              <div>
                <b style={{ color: 'var(--warn)', fontSize: 'var(--t-body)' }}>
                  别把答案发出去
                </b>
                <div className="small muted" style={{ marginTop: 3, lineHeight: 1.7 }}>
                  <b>每个人的题目不一样</b>，发出去帮不上别人。想晒就晒猜中次数和连胜天数。
                </div>
              </div>
            </div>
          </>
        )}
      </Panel>

      <Panel title="怎么算分">
        <div className="table-wrap">
          <table>
            <thead><tr><th>几次猜中</th><th>奖励</th></tr></thead>
            <tbody>
              <tr><td>第 1 次</td><td><b style={{ color: 'var(--warn)' }}>十连包</b>（商店买不到）</td></tr>
              <tr><td>2~3 次</td><td>选拔包</td></tr>
              <tr><td>4~{CHALLENGE_TRIES} 次</td><td>试训包</td></tr>
              <tr><td>没猜中</td><td className="muted">退一半入场费</td></tr>
              <tr><td>连续第 7 天</td><td><b style={{ color: 'var(--warn)' }}>额外一个十连包</b></td></tr>
            </tbody>
          </table>
        </div>
        <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>
          猜中另按连胜天数加金币。题型每天轮换，选手题最多。
        </p>
      </Panel>
    </>
  )
}