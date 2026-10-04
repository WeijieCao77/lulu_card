import { ECHO_CARDS } from '../../../engine/cards'
import { ECHO_QUIZ_COUNT } from '../../../engine/echoQuiz'
import { EchoCard, EchoCardBack } from './EchoCard'

/** Packs.tsx listens for this and opens the quiz; the banner sits outside the page that owns it. */
export const ECHO_QUIZ_EVENT = 'lulu:echo-quiz'
/** the pack page's 峡谷回响 section, which the banner's first button scrolls to */
export const ECHO_SECTION_ID = 'echo-section'

/**
 * The pack page's banner, as the 峡谷回响 launch ad (owner 2026-10-04): the series in a line, two buttons — to the
 * 回响包 and to the quiz — and the card back with two of the series' cards fanned behind it.
 */
export default function EchoBanner({ owned, quizDone }: { owned: number; quizDone: boolean }) {
  const toSection = () => document.getElementById(ECHO_SECTION_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="rift-banner echo-banner">
      <div className="echo-banner-content">
        <span className="rift-banner-kicker">新系列 / RIFT ECHOES</span>
        <h1 className="rift-banner-title">峡谷回响 · 老将回归</h1>
        <p className="rift-banner-desc">
          {ECHO_CARDS.length} 位退役老将回归峡谷。老将问答：上线活动 {ECHO_QUIZ_COUNT} 道题答对一题送一包，另有每日一题，答对送回响试训包。
        </p>
        <div className="echo-banner-actions">
          <button className="primary sm" onClick={toSection}>去开回响包</button>
          <button className="sm" onClick={() => window.dispatchEvent(new Event(ECHO_QUIZ_EVENT))}>
            {quizDone ? '老将问答 · 每日一题' : '老将问答 · 答对送包'}
          </button>
          <span className="rift-stat">回响图鉴 <b>{owned}</b>/{ECHO_CARDS.length}</span>
        </div>
      </div>
      <div className="echo-banner-art" aria-hidden="true">
        {(['Uzi', 'Clearlove'] as const).map((ign, i) => {
          const card = ECHO_CARDS.find((c) => c.ign === ign)
          return card && <div key={ign} className={`echo-banner-side ${i ? 'right' : 'left'}`}><EchoCard card={card} size="md" /></div>
        })}
        <div className="echo-banner-back"><EchoCardBack size="md" /></div>
      </div>
      <style>{`
        .rift-banner.echo-banner{display:flex;align-items:stretch;min-height:236px;background:radial-gradient(circle at 78% 50%,#6fd9c62a 0,transparent 42%),linear-gradient(110deg,#0b1d1b 0%,#0d2420 55%,#081311 100%);border-color:#d6bd7c55}
        .echo-banner-content{position:relative;z-index:2;flex:1;min-width:0;padding:28px 30px;display:flex;flex-direction:column;justify-content:center}
        .echo-banner .rift-banner-kicker{color:#d6bd7c}
        .echo-banner .rift-banner-title{color:#f0e2b8}
        .echo-banner .rift-banner-desc{color:#bfd2c8;max-width:520px}
        .echo-banner-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
        .echo-banner-art{position:relative;flex:0 0 340px;overflow:hidden}
        .echo-banner-back{position:absolute;z-index:3;left:50%;top:50%;width:132px;transform:translate(-50%,-50%);filter:drop-shadow(0 14px 22px #0009) drop-shadow(0 0 18px #d6bd7c30)}
        .echo-banner-back .cardback{width:100%;height:auto;min-height:0;aspect-ratio:63/88}
        .echo-banner-side{position:absolute;z-index:2;left:50%;top:50%;width:132px}
        .echo-banner-side.left{transform:translate(-128%,-50%) rotate(-9deg) scale(.78)}
        .echo-banner-side.right{transform:translate(28%,-50%) rotate(9deg) scale(.78)}
        @media (max-width:768px){
          .rift-banner.echo-banner{min-height:0}
          .echo-banner-content{padding:16px 16px 18px}
          .echo-banner-art{position:absolute;right:-70px;top:0;bottom:0;width:240px;flex:none;opacity:.35}
          .echo-banner-art .echo-banner-side{display:none}
          .echo-banner-back{width:110px}
          .echo-banner .rift-banner-desc{max-width:100%}
        }
      `}</style>
    </div>
  )
}
