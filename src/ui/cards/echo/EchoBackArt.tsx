/**
 * 峡谷回响卡背 v3 (owner, 2026-10-04: 「卡背不够帅……参考开瓦包曼谷系列」).
 *
 * Built the way the 曼谷 back works (Val_Manager src/ui/cards/BangkokDesign.tsx): one luminous hero object that
 * fades into the ground at top and bottom, thin flowing lines behind it, oversized hard type, a single hairline
 * and an inner frame. The hero here is a faceted hextech crystal bloom in the series' teal with a gold rim —
 * the echo — with ripple arcs spreading from it. Pure SVG, generated, so it is sharp at every card size.
 */
type P = [number, number]
const rad = (d: number) => (d * Math.PI) / 180

/** a kite-shaped crystal petal from `base`, pointing at `angle` (0 = up), split into four facets */
function petal(base: P, angle: number, len: number, width: number) {
  const a = rad(angle)
  const ux = Math.sin(a), uy = -Math.cos(a)          // along the petal
  const vx = Math.cos(a), vy = Math.sin(a)           // across it
  const tip: P = [base[0] + ux * len, base[1] + uy * len]
  const mid: P = [base[0] + ux * len * 0.42, base[1] + uy * len * 0.42]
  const left: P = [mid[0] - vx * width, mid[1] - vy * width]
  const right: P = [mid[0] + vx * width, mid[1] + vy * width]
  const core: P = [base[0] + ux * len * 0.5, base[1] + uy * len * 0.5]
  return { tip, left, right, core, base }
}
const pts = (...p: P[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

export default function EchoBackArt() {
  const C: P = [315, 560]
  // back row first, the tall centre crystal last
  const petals = [
    { angle: -80, len: 175, width: 40 }, { angle: 80, len: 175, width: 40 },
    { angle: -56, len: 205, width: 46 }, { angle: 56, len: 205, width: 46 },
    { angle: -29, len: 235, width: 50 }, { angle: 29, len: 235, width: 50 },
    { angle: -135, len: 95, width: 28 }, { angle: 135, len: 95, width: 28 },
    { angle: 180, len: 105, width: 32 },
    { angle: 0, len: 270, width: 60 },
  ]
  return <svg className="echo-back-art" viewBox="0 0 630 880" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="eb3-bg" cx="50%" cy="48%" r="72%">
        <stop offset="0" stopColor="#163a35" /><stop offset=".5" stopColor="#0a1d1b" /><stop offset="1" stopColor="#040b0b" />
      </radialGradient>
      <radialGradient id="eb3-bloom" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#c9fff4" stopOpacity=".55" /><stop offset=".25" stopColor="#6fd9c6" stopOpacity=".22" /><stop offset="1" stopColor="#6fd9c6" stopOpacity="0" />
      </radialGradient>
      {/* four facet tones: lit, half-lit, shade, iridescent */}
      <linearGradient id="eb3-f1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f4fffb" /><stop offset=".5" stopColor="#9fe9dc" /><stop offset="1" stopColor="#4fb7a8" /></linearGradient>
      <linearGradient id="eb3-f2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fd6c8" /><stop offset=".6" stopColor="#2f8f86" /><stop offset="1" stopColor="#155a57" /></linearGradient>
      <linearGradient id="eb3-f3" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0e3b3b" /><stop offset=".55" stopColor="#1f6e69" /><stop offset="1" stopColor="#8fe3d6" /></linearGradient>
      <linearGradient id="eb3-f4" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#b9a8f2" /><stop offset=".45" stopColor="#8fe6d7" /><stop offset="1" stopColor="#fbfff4" /></linearGradient>
      <linearGradient id="eb3-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1c4" /><stop offset=".5" stopColor="#d6b46a" /><stop offset="1" stopColor="#9c7a3a" /></linearGradient>
      <linearGradient id="eb3-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".2" stopColor="#fff" stopOpacity="1" /><stop offset=".8" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id="eb3-mask"><rect width="630" height="880" fill="url(#eb3-fade)" /></mask>
      <filter id="eb3-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" /></filter>
    </defs>
    <rect width="630" height="880" fill="url(#eb3-bg)" />
    <g mask="url(#eb3-mask)">
      {/* the echo: arcs and flowing lines spreading from the crystal */}
      <g fill="none" stroke="#9fdccf" strokeWidth="1.3">
        {[150, 205, 262, 322, 386].map((r, i) => <circle key={r} cx={C[0]} cy={C[1] - 60} r={r} strokeOpacity={0.2 - i * 0.03} />)}
      </g>
      <g fill="none" stroke="#d8c48e" strokeWidth="1.1" strokeOpacity=".22">
        {[-1, 1].map((s) => [0, 1, 2, 3].map((k) => <path key={`${s}${k}`} d={`M ${C[0]} ${C[1] + 40} C ${C[0] + s * (90 + k * 55)} ${C[1] - 30 - k * 40}, ${C[0] + s * (150 + k * 60)} ${C[1] - 200 - k * 30}, ${C[0] + s * (70 + k * 30)} ${C[1] - 330 - k * 25}`} />))}
      </g>
      <ellipse cx={C[0]} cy={C[1] - 70} rx="250" ry="250" fill="url(#eb3-bloom)" />
      {/* glow pass */}
      <g filter="url(#eb3-glow)" opacity=".55">
        {petals.map((p, i) => { const k = petal(C, p.angle, p.len, p.width); return <polygon key={i} points={pts(k.base, k.left, k.tip, k.right)} fill="#7fe3d4" /> })}
      </g>
      {/* the crystal bloom */}
      {petals.map((p, i) => {
        const k = petal(C, p.angle, p.len, p.width)
        return <g key={i}>
          <polygon points={pts(k.left, k.tip, k.core)} fill="url(#eb3-f1)" />
          <polygon points={pts(k.right, k.tip, k.core)} fill="url(#eb3-f2)" />
          <polygon points={pts(k.left, k.base, k.core)} fill="url(#eb3-f3)" />
          <polygon points={pts(k.right, k.base, k.core)} fill="url(#eb3-f4)" />
          <polygon points={pts(k.base, k.left, k.tip, k.right)} fill="none" stroke="url(#eb3-gold)" strokeWidth={i === petals.length - 1 ? 2.4 : 1.6} strokeLinejoin="round" />
          <polyline points={pts(k.tip, k.core, k.base)} fill="none" stroke="#f6fff9" strokeOpacity=".55" strokeWidth="1" />
        </g>
      })}
      <circle cx={C[0]} cy={C[1]} r="7" fill="#fffbe9" />
      <circle cx={C[0]} cy={C[1]} r="22" fill="#fffbe9" opacity=".35" filter="url(#eb3-glow)" />
    </g>
  </svg>
}
