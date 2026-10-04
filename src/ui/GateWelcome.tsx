import './gateWelcome.css'
import { useEffect, useRef } from 'react'
import { RELEASE_POLICY, RELEASE_STAGE } from '../../release-policy.js'
import { ECHO_CARDS } from '../engine/cards'
import { EchoCard, EchoCardBack } from './cards/echo/EchoCard'
import { ECHO_QUIZ_COUNT } from '../engine/echoQuiz'

function PigSeal() {
  return <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
    <path d="M40 4 72 23v34L40 76 8 57V23Z" stroke="currentColor" />
    <path d="m23 30-4-14 18 10m20 4 4-14-18 10" stroke="currentColor" strokeWidth="2" />
    <ellipse cx="40" cy="43" rx="23" ry="19" stroke="currentColor" strokeWidth="2" />
    <ellipse cx="40" cy="49" rx="12" ry="8" stroke="currentColor" strokeWidth="2" />
    <path d="M35 47v4m10-4v4" stroke="currentColor" strokeWidth="3" />
    <circle cx="30" cy="37" r="2" fill="currentColor" /><circle cx="50" cy="37" r="2" fill="currentColor" />
  </svg>
}

export function GateBrand() {
  return <header className="gate-brand"><PigSeal /><div><strong>噜噜卡</strong><span>猪之家出品 / LULU CARDS</span></div><span className="gate-beta">{RELEASE_STAGE === 'demo' ? '内测试玩' : '选手典藏'}</span></header>
}

export function GateStory() {
  return <section className="gate-story">
    <p className="gate-eyebrow">峡谷典藏 · 由你开场</p>
    <h1>每一张高光，<br /><em>都值得收藏。</em></h1>
    <p className="gate-intro">开包寻找心仪选手，组建你的首发五人。<br />让同队默契，成为下一场胜利的伏笔。</p>
    {/* the cover is the 峡谷回响 launch ad (owner 2026-10-04): the series' card back, two of its cards, and what a new account gets */}
    <div className="gate-art gate-echo" aria-label="新系列 峡谷回响">
      <div className="gate-orbit" />
      <span className="gate-echo-tag">新系列 · 峡谷回响</span>
      {(['Uzi', 'Clearlove'] as const).map((ign, i) => {
        const card = ECHO_CARDS.find((c) => c.ign === ign)
        return card && <div key={ign} className={`gate-echo-side ${i ? 'right' : 'left'}`}><EchoCard card={card} size="md" /></div>
      })}
      <div className="gate-echo-back"><EchoCardBack size="md" /></div>
      <div className="gate-art-caption">{ECHO_CARDS.length} 位退役老将回归峡谷 · 每个账号送 1 个回响包 · 老将问答最多再送 {ECHO_QUIZ_COUNT} 包</div>
    </div>
    <div className="gate-features"><span>01 / 收集选手</span><span>02 / 组建阵容</span><span>03 / 征战峡谷</span></div>
  </section>
}

export function DemoWelcome({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
    return () => { if (el?.open) el.close() }
  }, [])
  return <dialog ref={dialog} className="demo-welcome" aria-labelledby="demo-welcome-title" onCancel={e => e.preventDefault()}>
    <div className="demo-welcome-kicker">猪之家出品 · 内测试玩须知</div>
    <h2 id="demo-welcome-title">欢迎成为首批收藏家</h2>
    <p>噜噜卡目前处于内测阶段，感谢你来帮我们试玩、发现问题。</p>
    <div className="demo-welcome-reset"><strong>这是一次删档内测</strong><p>正式上线时，所有内测数据都会清除，包括账号、金币、卡牌、交易记录及排名，不会继承到正式服。</p></div>
    <ul>
      <li><strong>放开交易等待：</strong>暂时取消注册天数、抽卡次数门槛和一口价等待；拍卖仍按倒计时正常结算。</li>
      <li><strong>暂不绑定手机：</strong>请保存好账号 ID，作为下次登录的凭证。</li>
      <li><strong>一起维护试玩环境：</strong>请尽量使用一个账号体验，避免大量创建小号或利用小号转移资源。</li>
    </ul>
    <div className="demo-welcome-gift"><strong>新账号补给已到账</strong><span>{RELEASE_POLICY.starterCoins.toLocaleString('en-US')} 金币</span><p>试训包 × {RELEASE_POLICY.starterPacks.scout}　选拔包 × {RELEASE_POLICY.starterPacks.elite}　十连包 × {RELEASE_POLICY.starterPacks.ten}</p></div>
    <button autoFocus type="button" onClick={onClose}>了解了，开始试玩 →</button>
  </dialog>
}
