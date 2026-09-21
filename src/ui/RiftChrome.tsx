import React from 'react';
import './riftChrome.css';

interface RiftNavigationProps {
  tabs: { key: string; label: string; beta?: boolean }[];
  active: string;
  utilities?: React.ReactNode;
  onSelect: (key: string) => void;
}

export function RiftNavigation({ tabs, active, onSelect, utilities }: RiftNavigationProps) {
  return (
    <nav className="rift-nav" aria-label="游戏导航">
      <div className="rift-identity" aria-hidden="true"><svg viewBox="0 0 80 80" fill="none"><path d="M40 4 72 23v34L40 76 8 57V23Z" stroke="currentColor"/><path d="m23 30-4-14 18 10m20 4 4-14-18 10" stroke="currentColor" strokeWidth="2"/><ellipse cx="40" cy="43" rx="23" ry="19" stroke="currentColor" strokeWidth="2"/><ellipse cx="40" cy="49" rx="12" ry="8" stroke="currentColor" strokeWidth="2"/><path d="M35 47v4m10-4v4" stroke="currentColor" strokeWidth="3"/><circle cx="30" cy="37" r="2" fill="currentColor"/><circle cx="50" cy="37" r="2" fill="currentColor"/></svg><span>猪之家 · 选手典藏</span></div>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`rift-nav-btn${active === tab.key ? ' rift-active' : ''}`}
          onClick={() => onSelect(tab.key)}
          aria-current={active === tab.key ? 'page' : undefined}
        >
          <span className="rift-nav-icon" aria-hidden="true">
            {getIcon(tab.key)}
          </span>
          <span className="rift-nav-label">{tab.label}</span>
          {tab.beta && <span className="rift-nav-beta">BETA</span>}
        </button>
      ))}
      <div className="rift-utilities">{utilities}</div>
    </nav>
  );
}

interface RiftBannerProps {
  page: string;
  owned: number;
  total: number;
}

export function RiftBanner({ page, owned, total }: RiftBannerProps) {
  if (page === 'worlds') return null
  const pages: Record<string, [string, string]> = {
    packs: ['召唤你的传奇', '一张卡，一个高光时刻。开启卡包，组建属于你的五人阵容。'],
    worlds: ['名人堂', '冠军时刻与赛区传奇，都在这一册。'],
    challenge: ['每日谜题', '辨认模糊图像里的选手、战队或英雄，用更少的猜测赢得奖励。'],
    minigames: ['峡谷训练营', '热热手，把反应、判断和操作练起来。'],
    squad: ['你的首发五人', '选手、位置、队伍羁绊，共同决定阵容的实力。'],
    collection: ['我的藏卡室', '收藏高光，培养你的核心选手。'],
    ladder: ['向更高处进发', '带上你的阵容，开启下一场天梯对决。'],
    friends: ['好友大厅', '找到一起收卡、切磋的伙伴。'],
    market: ['选手交易所', '寻找心仪的卡牌，也让重复的收藏找到新主人。'],
    cup: ['杯赛竞技场', '选择赛制，组建阵容，向冠军发起挑战。'],
    mail: ['峡谷信箱', '给猪之家提建议，为好点子点赞；也可以查收奖励和交易消息。'],
    account: ['我的俱乐部', '管理账号、偏好和收藏之旅。'],
    dossier: ['选手档案库', '查阅选手、战队和赛区资料。'],
  }
  const [title, desc] = pages[page] ?? ['噜噜卡', '猪之家出品']
  return (
    <div className="rift-banner">
      <div className="rift-banner-bg" aria-hidden="true">
        <SummonersRiftMap />
      </div>
      <div className="rift-banner-content">
        <span className="rift-banner-kicker">LULU CARDS / 峡谷典藏</span><h1 className="rift-banner-title">{title}</h1>
        <p className="rift-banner-desc">{desc}</p>
        <div className="rift-banner-stats">
          <span className="rift-stat">已收藏 <b>{owned}</b></span>
          <span className="rift-stat">全卡池 {total}</span>
        </div>
      </div>
    </div>
  );
}

function SummonersRiftMap() {
  return (
    <svg className="rift-map-svg" viewBox="0 0 900 600" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="rift-base-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a3a5c" />
          <stop offset="100%" stopColor="#0d1f33" />
        </linearGradient>
        <linearGradient id="rift-lane-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b6e8f" />
          <stop offset="100%" stopColor="#2a4f6e" />
        </linearGradient>
      </defs>
      <rect width="900" height="600" fill="url(#rift-base-grad)" />
      <path d="M180 500V100H720M180 500H720V100M180 500 720 100" fill="none" stroke="#77daca" strokeWidth="7" opacity=".6" />
      <path d="M210 80Q330 370 730 520" fill="none" stroke="#348a9b" strokeWidth="25" opacity=".4" />
      {[ [180,320], [180,180], [340,100], [540,100], [360,500], [570,500], [720,380], [720,230], [350,375], [550,225] ].map(([x,y],i)=><path key={i} d={`M${x} ${y-9}l9 9-9 9-9-9z`} fill="#d7ba80" />)}
      <path d="m180 462 38 38-38 38-38-38zM720 62l38 38-38 38-38-38z" fill="#102f40" stroke="#e0c98c" strokeWidth="5" />
      <circle cx="470" cy="405" r="22" fill="none" stroke="#ad9877" strokeWidth="3" />
      <circle cx="380" cy="195" r="22" fill="none" stroke="#ad9877" strokeWidth="3" />
    </svg>
  );
}

function getIcon(key: string): React.ReactNode {
 const paths: Record<string,string> = {
  packs:'M4 7l8-4 8 4-8 4-8-4zm0 0v10l8 4 8-4V7M12 11v10',
  worlds:'M8 20h8m-4-5v5M7 3h10v6a5 5 0 0 1-10 0V3zm0 2H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4',
  challenge:'m4 3 15 15m1-15L5 18M2 17l5 5m10 0 5-5M3 3l1 6 5-5m12-1-6 1 5 5',
  minigames:'M5 7h14l3 12-5-3H7l-5 3L5 7zm2 4h6m-3-3v6m6-3h.1m2 2h.1',
  ladder:'M5 21V3m14 18V3M5 6h14M5 12h14M5 18h14',
  cup:'M7 3h10v7l-5 5-5-5V3zm0 2H3v4l4 3m10-7h4v4l-4 3m-5 3v5m-5 0h10',
  market:'M3 7h18l-2-4H5L3 7zm2 0v14h14V7M9 21v-8h6v8',
  friends:'M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-6 16v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 3a4 4 0 0 1 3 4v3',
  collection:'M3 7h13v14H3V7zm5-4h13v14m-14-5h5m-5 4h5',
  squad:'M9 3h6v6H9V3zM2 15h7v6H2v-6zm13 0h7v6h-7v-6zm-3-6v3m-7 3v-3h14v3',
  dossier:'M12 5C8 2 4 2 2 3v17c4-2 7-1 10 1 3-2 6-3 10-1V3c-4-1-7 0-10 2zm0 0v16',
  account:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-8 18v-2a8 8 0 0 1 16 0v2',
 }
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[key] ?? paths.account}/></svg>
}

export function RiftPackArt({ kind }: { kind: string }) {
 const count = kind === 'ten' ? '10' : kind === 'elite' ? '03' : '01'
 return <div className={`rift-pack-art rift-pack-${kind}`} aria-hidden="true"><svg viewBox="0 0 180 120" fill="none">
  <ellipse cx="90" cy="106" rx="51" ry="7" fill="currentColor" opacity=".12"/>
  {kind !== 'scout' && <path d="M55 18 124 8 136 101 67 111z" fill="var(--rift-navy)" stroke="currentColor" opacity=".35"/>}
  <path d="m51 9 77 9-11 92-77-9z" fill="var(--rift-navy)" stroke="currentColor" strokeWidth="1.5"/>
  <path d="m56 16 64 7-10 80-64-8z" stroke="currentColor" opacity=".3"/>
  <path d="m85 32 21 15-4 25-24 10-21-16 4-24z" stroke="currentColor"/>
  {kind === 'coach' ? <path d="m72 61 5-18 6 12 11-10-2 21-20-5zm2 7 16 4" stroke="currentColor" strokeWidth="2"/> : <g stroke="currentColor" strokeWidth="1.5"><path d="m69 50-2-10 13 6m12 4 7-8-1 15"/><ellipse cx="82" cy="61" rx="13" ry="11"/><ellipse cx="81" cy="65" rx="7" ry="4"/><path d="M78 64v2m6-2v2m-10-9h2m11 1h2"/></g>}
  <text x="87" y="95" textAnchor="middle" fill="currentColor" fontSize="8" letterSpacing="3">{kind === 'coach' ? 'COACH' : count+' / RIFT'}</text>
  <path d="M25 49h10m-5-5v10m114-23h8m-4-4v8m-2 49h10m-5-5v10" stroke="currentColor" opacity=".5"/>
 </svg><span>{kind === 'ten' ? '十张，一起揭晓' : kind === 'elite' ? '寻找下一位核心' : kind === 'coach' ? '阵容背后的大脑' : '传奇，从一张开始'}</span></div>
}
