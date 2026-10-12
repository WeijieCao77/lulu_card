import { S16_CARDS } from '../../../engine/cards'
import { PACKS } from '../../../engine/gacha'
import { S16Card } from './S16Card'

/** Packs.tsx's S16Section listens for this and opens 赛事预测; the banner sits outside the page that owns it. */
export const S16_PREDICT_EVENT = 'lulu:s16-predict'
/** the pack page's S16 世界赛 section, which the banner's first button scrolls to */
export const S16_SECTION_ID = 's16-pack-section'
/** the banner and the login cover show S16 while its pack is on sale (PACKS.s16.until), then go back to 峡谷回响 */
export const s16OnSale = (today: string): boolean => !PACKS.s16.until || today <= PACKS.s16.until
/** the three famous faces on the banner, middle one in front */
const FACES = ['Chovy', 'Faker', 'Knight'] as const

/**
 * The pack page's banner, as the S16 世界赛 launch ad (2026-10-12): the series in a line, the pack price, the S16
 * 图鉴 count, two buttons — to the S16 pack and to 赛事预测 — and three players' cards, which read 「?」 until they
 * have played. Same slot and shape as EchoBanner.
 */
export default function S16Banner({ owned }: { owned: number }) {
  const def = PACKS.s16
  const toSection = () => document.getElementById(S16_SECTION_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="rift-banner s16-banner">
      <div className="s16-banner-copy">
        <span className="rift-banner-kicker">新系列 / WORLDS 2026</span>
        <h1 className="rift-banner-title">S16 世界赛 · 选手股</h1>
        <p className="s16-banner-key"><span>战队出局即揭晓、永久定格</span><i> · </i><span>赛事预测赢卡包</span></p>
        <p className="rift-banner-desc">
          {S16_CARDS.length} 位参赛选手，开赛前全是「?」，战队被淘汰时这队五人揭晓最终数值。S16 世界赛包 <b>{def.cost.toLocaleString('en-US')} 金币三张</b>
          ，S 赛期间限时开售。
        </p>
      </div>
      <div className="s16-banner-actions">
        <button className="primary sm" onClick={toSection}>去开 S16 包</button>
        <button className="sm" onClick={() => window.dispatchEvent(new Event(S16_PREDICT_EVENT))}>赛事预测 · 赢卡包</button>
        <span className="rift-stat">S16 图鉴 <b>{owned}</b>/{S16_CARDS.length}</span>
      </div>
      <div className="s16-banner-art" aria-hidden="true">
        {FACES.map((ign, i) => {
          const card = S16_CARDS.find((c) => c.ign === ign)
          return card && <div key={ign} className={`s16-banner-card c${i}`}><S16Card card={card} size="md" /></div>
        })}
      </div>
      <style>{`
        .rift-banner.s16-banner{display:grid;grid-template-columns:minmax(0,1fr) 360px;grid-template-areas:"copy art" "actions art";align-content:center;min-height:236px;background:radial-gradient(circle at 80% 50%,#57c7ff2e 0,transparent 44%),linear-gradient(110deg,#0a1530 0%,#0d1d3d 55%,#060c1c 100%);border-color:#57c7ff55}
        .rift-banner.s16-banner::after{background:linear-gradient(90deg,#57c7ff,transparent 75%)}
        .s16-banner-copy{grid-area:copy;position:relative;z-index:2;min-width:0;padding:28px 30px 0;align-self:end}
        .s16-banner .rift-banner-kicker{color:#57c7ff}
        .s16-banner .rift-banner-title{color:#eef4ff;margin-bottom:8px}
        .s16-banner-key{margin:0 0 8px;font-size:15px;font-weight:700;letter-spacing:.06em;color:#9fdcff}.s16-banner-key span{display:inline-block}.s16-banner-key i{font-style:normal}
        .s16-banner .rift-banner-desc{color:#b4c4de;max-width:600px;margin-bottom:16px}
        .s16-banner .rift-banner-desc b{color:#eef4ff}
        .s16-banner-actions{grid-area:actions;position:relative;z-index:2;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:0 30px 28px;align-self:start}
        .s16-banner .rift-stat b{color:#9fdcff}
        .s16-banner-art{grid-area:art;position:relative;min-height:236px;overflow:hidden}
        .s16-banner-card{position:absolute;left:50%;top:50%;width:132px;filter:drop-shadow(0 12px 20px #0009)}
        .s16-banner-card.c0{z-index:1;transform:translate(-125%,-50%) rotate(-9deg) scale(.8)}
        .s16-banner-card.c1{z-index:3;transform:translate(-50%,-52%);filter:drop-shadow(0 16px 26px #000a) drop-shadow(0 0 18px #57c7ff40)}
        .s16-banner-card.c2{z-index:2;transform:translate(25%,-50%) rotate(9deg) scale(.8)}
        @media (max-width:768px){
          .rift-banner.s16-banner{grid-template-columns:minmax(0,1fr) 116px;grid-template-areas:"copy art" "actions actions";min-height:0}
          .s16-banner-copy{padding:14px 0 0 14px;align-self:start}
          .s16-banner .rift-banner-title{font-size:20px;letter-spacing:1px;margin:4px 0 6px}
          .s16-banner-key{font-size:13px;letter-spacing:.02em;line-height:1.5;margin-bottom:6px}
          .s16-banner-key i{display:none}
          .s16-banner-key span{display:block}
          .s16-banner .rift-banner-desc{max-width:100%;margin-bottom:10px;font-size:12px;line-height:1.6}
          .s16-banner-actions{padding:0 14px 14px;gap:8px;flex-wrap:nowrap}
          .s16-banner-actions button{padding:0 11px;font-size:13px;white-space:nowrap}
          .s16-banner .s16-banner-actions .rift-stat{padding:0 0 0 9px;white-space:nowrap}
          .s16-banner .rift-stat b{font-size:16px;margin-left:4px}
          .s16-banner-art{min-height:0}
          .s16-banner-card.c0{transform:translate(-68%,-50%) rotate(-8deg) scale(.52)}
          .s16-banner-card.c1{transform:translate(-50%,-50%) scale(.6)}
          .s16-banner-card.c2{transform:translate(-32%,-50%) rotate(8deg) scale(.52)}
        }
      `}</style>
    </div>
  )
}
