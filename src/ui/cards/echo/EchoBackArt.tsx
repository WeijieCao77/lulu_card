/**
 * 峡谷回响卡背 v4 (owner, 2026-10-04: no crystal — 「把卡背做的帅一点，还是要回响元素」).
 *
 * The echo IS the art: 「回」 and 「响」 stacked large in gold, each trailed by widening, fading outline copies the
 * way a sound rings out, a voiceprint line running between them, sound rings spreading from the centre, a double
 * hairline with gold corner marks. The calligraphy uses the same font stack as the confirmed card face.
 */
const FONT = "'KaiTi','STKaiti','Noto Serif SC','Songti SC',serif"

function EchoGlyph({ ch, x, y, size }: { ch: string; x: number; y: number; size: number }) {
  const trails = [1.5, 1.32, 1.16]
  return <g>
    {trails.map((s, i) => <text key={s} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontSize={size} fontWeight="700"
      fill="none" stroke="#d6bd7c" strokeWidth={1.5 / s} strokeOpacity={0.14 + i * 0.12}
      transform={`translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`}>{ch}</text>)}
    <text x={x} y={y + 4} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontSize={size} fontWeight="700" fill="#020807" opacity=".55">{ch}</text>
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontSize={size} fontWeight="700" fill="url(#eb4-gold)" stroke="#fff3cf" strokeWidth="1" strokeOpacity=".35">{ch}</text>
  </g>
}

export default function EchoBackArt() {
  // a voiceprint: bars whose height follows an envelope, loudest at the centre
  const bars = Array.from({ length: 41 }, (_, i) => {
    const t = (i - 20) / 20
    const env = Math.exp(-t * t * 3.2)
    const wobble = 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6))
    return { x: 115 + i * 10, h: 6 + 70 * env * wobble }
  })
  return <svg className="echo-back-art" viewBox="0 0 630 880" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="eb4-bg" cx="50%" cy="50%" r="72%">
        <stop offset="0" stopColor="#163a34" /><stop offset=".55" stopColor="#0a1c19" /><stop offset="1" stopColor="#030908" />
      </radialGradient>
      <linearGradient id="eb4-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff5d6" /><stop offset=".38" stopColor="#ecd08d" /><stop offset=".72" stopColor="#c49a4c" /><stop offset="1" stopColor="#f1d896" />
      </linearGradient>
      <linearGradient id="eb4-rule" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#d6bd7c" stopOpacity="0" /><stop offset=".5" stopColor="#d6bd7c" /><stop offset="1" stopColor="#d6bd7c" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="eb4-hush" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#6fd9c6" stopOpacity=".16" /><stop offset="1" stopColor="#6fd9c6" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="630" height="880" fill="url(#eb4-bg)" />
    {/* sound rings from the centre */}
    <g fill="none" stroke="#9fd9cb">
      {[120, 175, 235, 300, 370, 445].map((r, i) => <circle key={r} cx="315" cy="452" r={r} strokeWidth={i < 2 ? 1.4 : 1.1} strokeOpacity={0.17 - i * 0.022} />)}
    </g>
    <ellipse cx="315" cy="452" rx="260" ry="300" fill="url(#eb4-hush)" />
    {/* the two characters, echoing */}
    <EchoGlyph ch="回" x={315} y={318} size={205} />
    <EchoGlyph ch="响" x={315} y={596} size={205} />
    {/* the voiceprint between them */}
    <g transform="translate(0 456)">
      <rect x="70" y="-0.8" width="490" height="1.6" fill="url(#eb4-rule)" opacity=".7" />
      {bars.map((b) => <rect key={b.x} x={b.x - 2.2} y={-b.h / 2} width="4.4" height={b.h} rx="2.2" fill="url(#eb4-gold)" opacity={0.35 + 0.6 * (b.h / 76)} />)}
    </g>
    {/* header and foot */}
    <g fontFamily="'Segoe UI',Arial,sans-serif" textAnchor="middle">
      <text x="315" y="96" fill="#d6bd7c" fontSize="20" fontWeight="600" letterSpacing="9">RIFT ECHOES</text>
      <rect x="235" y="112" width="160" height="1.2" fill="url(#eb4-rule)" />
      <text x="315" y="792" fill="#e9e0c4" fontFamily="'Microsoft YaHei',sans-serif" fontSize="24" letterSpacing="10">退役老将回归</text>
      <text x="315" y="826" fill="#7f978c" fontSize="13" letterSpacing="5">RETURNING LEGENDS · SERIES 01</text>
    </g>
    {/* double hairline and corner marks */}
    <rect x="6" y="6" width="618" height="868" rx="20" fill="none" stroke="#d6bd7c" strokeOpacity=".6" strokeWidth="2" />
    <rect x="20" y="20" width="590" height="840" rx="10" fill="none" stroke="#d6bd7c" strokeOpacity=".22" strokeWidth="1.3" />
    <g stroke="url(#eb4-gold)" strokeWidth="3" fill="none" strokeLinecap="round">
      <path d="M20 66 V20 H66" /><path d="M564 20 H610 V66" /><path d="M610 814 V860 H564" /><path d="M66 860 H20 V814" />
    </g>
  </svg>
}
