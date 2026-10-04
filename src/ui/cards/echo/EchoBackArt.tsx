/**
 * 峡谷回响卡背 v5 (owner, 2026-10-04: 「帅的是图片……召唤师奖杯加上一些生成的东西」).
 *
 * The Summoner's Cup on the 2015 Worlds stage (Riot / LoL Esports, data-source/worlds/22654804051.jpg), graded into
 * the series' teal and gold, with generated layers over it: light rays from the cup, echo rings spreading from the
 * bowl, drifting gold motes, a vignette. Small type only, a double hairline with gold corner marks.
 */
const CUP: [number, number] = [298, 296]   // centre of the bowl in the 630×880 frame

export default function EchoBackArt() {
  const motes = Array.from({ length: 34 }, (_, i) => {
    const a = i * 2.39996, r = 70 + ((i * 53) % 330)
    return { x: CUP[0] + Math.cos(a) * r * 0.8, y: CUP[1] + 80 + Math.sin(a) * r, s: 1.2 + ((i * 7) % 5) * 0.55, o: 0.25 + ((i * 11) % 7) * 0.08 }
  })
  const rays = Array.from({ length: 14 }, (_, i) => -80 + i * 12.3)
  return <svg className="echo-back-art" viewBox="0 0 630 880" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="eb5-vig" cx="58%" cy="38%" r="75%">
        <stop offset=".35" stopColor="#000" stopOpacity="0" /><stop offset=".8" stopColor="#020807" stopOpacity=".72" /><stop offset="1" stopColor="#020807" stopOpacity=".95" />
      </radialGradient>
      <linearGradient id="eb5-foot" x1="0" y1="0" x2="0" y2="1">
        <stop offset=".55" stopColor="#030a09" stopOpacity="0" /><stop offset=".82" stopColor="#030a09" stopOpacity=".88" /><stop offset="1" stopColor="#030a09" />
      </linearGradient>
      <linearGradient id="eb5-ray" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff2c8" stopOpacity=".55" /><stop offset="1" stopColor="#fff2c8" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="eb5-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fff4d0" stopOpacity=".55" /><stop offset=".35" stopColor="#e6c77e" stopOpacity=".2" /><stop offset="1" stopColor="#6fd9c6" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="eb5-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff1c4" /><stop offset=".5" stopColor="#d6b46a" /><stop offset="1" stopColor="#9c7a3a" />
      </linearGradient>
      <linearGradient id="eb5-rule" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#d6bd7c" stopOpacity="0" /><stop offset=".5" stopColor="#d6bd7c" /><stop offset="1" stopColor="#d6bd7c" stopOpacity="0" />
      </linearGradient>
      <filter id="eb5-soft"><feGaussianBlur stdDeviation="2.4" /></filter>
    </defs>
    <image href="/lol/echo/back-cup.webp" x="0" y="0" width="630" height="880" preserveAspectRatio="xMidYMid slice" />
    {/* light rays fanning down from the cup */}
    <g style={{ mixBlendMode: 'screen' }} opacity=".5">
      {rays.map((a) => <polygon key={a} points={`${CUP[0]},${CUP[1]} ${CUP[0] + Math.sin((a - 1.6) * Math.PI / 180) * 900},${CUP[1] + Math.cos((a - 1.6) * Math.PI / 180) * 900} ${CUP[0] + Math.sin((a + 1.6) * Math.PI / 180) * 900},${CUP[1] + Math.cos((a + 1.6) * Math.PI / 180) * 900}`} fill="url(#eb5-ray)" opacity=".35" />)}
    </g>
    <circle cx={CUP[0]} cy={CUP[1]} r="150" fill="url(#eb5-halo)" style={{ mixBlendMode: 'screen' }} />
    {/* the echo: rings spreading from the bowl */}
    <g fill="none" stroke="#e8d39a" style={{ mixBlendMode: 'screen' }}>
      {[70, 118, 172, 232, 298, 370].map((r, i) => <ellipse key={r} cx={CUP[0]} cy={CUP[1]} rx={r} ry={r * 0.86} strokeWidth={i < 2 ? 1.6 : 1.1} strokeOpacity={0.5 - i * 0.075} />)}
      {[95, 205].map((r) => <ellipse key={r} cx={CUP[0]} cy={CUP[1]} rx={r} ry={r * 0.86} strokeWidth="5" strokeOpacity=".12" filter="url(#eb5-soft)" />)}
    </g>
    {/* drifting motes */}
    <g fill="#ffe9b0" style={{ mixBlendMode: 'screen' }}>
      {motes.map((m, i) => <circle key={i} cx={m.x} cy={m.y} r={m.s} opacity={m.o} />)}
    </g>
    <rect width="630" height="880" fill="url(#eb5-vig)" />
    <rect width="630" height="880" fill="url(#eb5-foot)" />
    {/* small type */}
    <g fontFamily="'Segoe UI',Arial,sans-serif" textAnchor="middle">
      <text x="315" y="82" fill="#e3cb8c" fontSize="19" fontWeight="600" letterSpacing="10">RIFT ECHOES</text>
      <rect x="245" y="96" width="140" height="1.2" fill="url(#eb5-rule)" />
      <text x="315" y="782" fill="#f0e6c8" fontFamily="'Microsoft YaHei',sans-serif" fontSize="28" fontWeight="600" letterSpacing="12">峡谷回响</text>
      <text x="315" y="814" fill="#a9bbb1" fontFamily="'Microsoft YaHei',sans-serif" fontSize="16" letterSpacing="8">退役老将回归</text>
    </g>
    {/* double hairline and corner marks */}
    <rect x="6" y="6" width="618" height="868" rx="20" fill="none" stroke="#d6bd7c" strokeOpacity=".6" strokeWidth="2" />
    <rect x="20" y="20" width="590" height="840" rx="10" fill="none" stroke="#d6bd7c" strokeOpacity=".22" strokeWidth="1.3" />
    <g stroke="url(#eb5-gold)" strokeWidth="3" fill="none" strokeLinecap="round">
      <path d="M20 66 V20 H66" /><path d="M564 20 H610 V66" /><path d="M610 814 V860 H564" /><path d="M66 860 H20 V814" />
    </g>
  </svg>
}
