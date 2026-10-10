/**
 * The pack ceremony's sound, synthesized (owner, 2026-09-27: "完全不激情" — make it
 * feel like opening a Hearthstone pack). Nothing is downloaded: every cue is built
 * from oscillators and noise, through one bus with a compressor and a generated
 * reverb, so the hits are loud without clipping and the chimes ring out.
 *
 *   grab       picking the pack up: a soft thump and the start of a hum
 *   burst      dropped on the altar: 0.6s of build-up, then the pack blows open
 *              (the split animation lands at .6s — packStage.css `.altar-opening`)
 *   reveal     a bronze card turned: a crisp flip
 *   silver     a flip and a crystal chime
 *   gold       a flip, an impact, a brass chord and sparkles
 *   mythic     a彩卡: a deep boom, a rising choir chord, a cascade of sparkles
 *   anticipate hovering an unturned gold / 彩卡 back: a rising hum (once per card)
 */
export type PackCue = 'grab' | 'tear' | 'reveal' | 'burst' | 'silver' | 'gold' | 'mythic'

let context: AudioContext | null = null
let bus: GainNode | null = null
let wet: GainNode | null = null

/** Fixed level. The background-music player that once set it (dev only, never live) was removed 2026-09-28. */
const volume = (): number => .7

/** a decaying stereo noise tail: a hall without shipping an impulse file */
function hall(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.ceil(ctx.sampleRate * seconds)
  const ir = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2)
  }
  return ir
}

function audio(): { ctx: AudioContext; out: GainNode; verb: GainNode } | null {
  if (!volume()) return null
  try {
    if (!context) {
      context = new AudioContext()
      const comp = context.createDynamicsCompressor()
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5
      comp.attack.value = .003; comp.release.value = .22
      comp.connect(context.destination)
      bus = context.createGain(); bus.connect(comp)
      const conv = context.createConvolver(); conv.buffer = hall(context, 2.6)
      wet = context.createGain(); wet.gain.value = .32
      wet.connect(conv).connect(comp)
    }
    if (context.state === 'suspended') void context.resume()
    bus!.gain.value = volume()
    return { ctx: context, out: bus!, verb: wet! }
  } catch { return null }
}

interface Env { a?: number; r: number; g: number; verb?: number }

/** route a voice to the dry bus and (optionally) the reverb, with an attack/decay envelope */
function voice(k: NonNullable<ReturnType<typeof audio>>, src: AudioNode, at: number, e: Env): GainNode {
  const amp = k.ctx.createGain()
  const a = e.a ?? .004
  amp.gain.setValueAtTime(0.0001, at)
  amp.gain.exponentialRampToValueAtTime(e.g, at + a)
  amp.gain.exponentialRampToValueAtTime(.0001, at + a + e.r)
  src.connect(amp)
  amp.connect(k.out)
  if (e.verb) { const s = k.ctx.createGain(); s.gain.value = e.verb; amp.connect(s).connect(k.verb) }
  return amp
}

function osc(k: NonNullable<ReturnType<typeof audio>>, type: OscillatorType, at: number, f0: number, f1: number, glide: number, e: Env, detune = 0) {
  const o = k.ctx.createOscillator()
  o.type = type; o.detune.value = detune
  o.frequency.setValueAtTime(f0, at)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + glide)
  voice(k, o, at, e)
  o.start(at); o.stop(at + (e.a ?? .004) + e.r + .05)
}

function noise(k: NonNullable<ReturnType<typeof audio>>, at: number, type: BiquadFilterType, f0: number, f1: number, q: number, e: Env) {
  const len = (e.a ?? .004) + e.r + .05
  const buf = k.ctx.createBuffer(1, Math.ceil(k.ctx.sampleRate * len), k.ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const s = k.ctx.createBufferSource(); s.buffer = buf
  const f = k.ctx.createBiquadFilter(); f.type = type; f.Q.value = q
  f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + len)
  s.connect(f); voice(k, f, at, e)
  s.start(at); s.stop(at + len)
}

/** a struck metal bar: inharmonic partials that die at different rates */
function bell(k: NonNullable<ReturnType<typeof audio>>, at: number, f: number, g: number, r = 1.4, verb = .6) {
  for (const [ratio, amp, life] of [[1, 1, 1], [2.76, .45, .55], [5.4, .22, .3], [8.9, .1, .18]] as const) {
    osc(k, 'sine', at, f * ratio, f * ratio, 0, { a: .002, r: r * life, g: g * amp, verb })
  }
}

/** a sustained chord of detuned saws behind a lowpass that opens: brass when fast, choir when slow */
function chord(k: NonNullable<ReturnType<typeof audio>>, at: number, notes: number[], g: number, open: number, hold: number, cutoff: [number, number]) {
  const f = k.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2
  f.frequency.setValueAtTime(cutoff[0], at); f.frequency.exponentialRampToValueAtTime(cutoff[1], at + open)
  voice(k, f, at, { a: open, r: hold, g, verb: .5 })
  for (const n of notes) for (const cents of [-9, 0, 9]) {
    const o = k.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = n; o.detune.value = cents
    o.connect(f); o.start(at); o.stop(at + open + hold + .1)
  }
}

/** the low end of an impact: a sine that drops in pitch, plus a click on top */
function boom(k: NonNullable<ReturnType<typeof audio>>, at: number, g: number, from = 120, to = 38, r = .7) {
  osc(k, 'sine', at, from, to, r * .8, { a: .003, r, g })
  noise(k, at, 'lowpass', 2400, 300, .7, { a: .001, r: .09, g: g * .5 })
}

function sparkles(k: NonNullable<ReturnType<typeof audio>>, at: number, count: number, spread: number, g: number, base = 1568) {
  const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3]
  for (let i = 0; i < count; i++) {
    const t = at + (i / count) * spread + Math.random() * .03
    bell(k, t, base * scale[Math.floor(Math.random() * scale.length)], g * (1 - i / (count * 1.4)), .5, .8)
  }
}

/** the turn of a card itself: a short air whoosh and a papery tick */
function flip(k: NonNullable<ReturnType<typeof audio>>, at: number, g: number) {
  noise(k, at, 'bandpass', 900, 3800, 1.1, { a: .03, r: .16, g: g * .55 })
  noise(k, at + .1, 'highpass', 3000, 5000, .8, { a: .001, r: .045, g: g * .5 })
  osc(k, 'triangle', at + .1, 240, 140, .06, { a: .002, r: .08, g: g * .35 })
}

const C4 = 261.63, E4 = 329.63, G4 = 392, B4 = 493.88, C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, C3 = 130.81, G3 = 196

/**
 * Sound is decoration: it must never stop the pack opening. Some phone browsers throw from a Web Audio call (a
 * suspended or closed context, a value one engine accepts and another rejects), and the cue runs inside the altar's
 * open handler — a throw there left the deck sealed with the pack already paid for (reported 2026-10-05:
 * 「回响包显示获得了但是没法打开」, and several hundred script errors a day at this spot). Every cue is now silent on
 * failure.
 */
export function playPackCue(cue: PackCue): void {
  try { playCue(cue) } catch { /* no sound this time; the opening goes on */ }
}

function playCue(cue: PackCue): void {
  const k = audio()
  if (!k) return
  const now = k.ctx.currentTime + .01
  switch (cue) {
    case 'grab':
      noise(k, now, 'lowpass', 900, 300, .8, { a: .005, r: .12, g: .35 })
      osc(k, 'sine', now, 95, 70, .15, { a: .005, r: .18, g: .4 })
      osc(k, 'sine', now + .05, 220, 330, .5, { a: .25, r: .35, g: .05, verb: .4 })
      return
    case 'tear':
      noise(k, now, 'bandpass', 2400, 800, 1.2, { a: .01, r: .3, g: .5 })
      boom(k, now, .5, 100, 45, .35)
      return
    case 'burst': {
      // build-up: rising noise and a gliding tone swell toward the split
      const hit = now + .6
      noise(k, now, 'bandpass', 400, 4200, 2.5, { a: .55, r: .08, g: .35 })
      osc(k, 'sawtooth', now, 110, 440, .6, { a: .55, r: .06, g: .08 })
      osc(k, 'sine', now, 55, 110, .6, { a: .5, r: .1, g: .3 })
      // the pack blows open
      boom(k, hit, 1, 140, 34, 1.1)
      noise(k, hit, 'lowpass', 6000, 400, .6, { a: .002, r: .9, g: .75, verb: .5 })
      noise(k, hit, 'highpass', 5000, 9000, .6, { a: .002, r: 1.4, g: .18, verb: .7 })
      chord(k, hit, [C3, G3, C4, E4, G4], .06, .05, 1.2, [900, 3200])
      sparkles(k, hit + .08, 10, .9, .09, 1318)
      return
    }
    case 'reveal':
      flip(k, now, .8)
      bell(k, now + .1, 392, .06, .5, .3)
      return
    case 'silver':
      flip(k, now, .8)
      bell(k, now + .1, 1318.5, .16, 1.4)
      bell(k, now + .18, 1975.5, .12, 1.3)
      sparkles(k, now + .22, 5, .35, .06, 2093)
      return
    case 'gold':
      flip(k, now, .9)
      boom(k, now + .1, .75, 110, 40, .7)
      noise(k, now + .1, 'highpass', 4000, 8000, .7, { a: .002, r: 1, g: .14, verb: .8 })
      chord(k, now + .1, [C4, E4, G4, C5], .1, .07, .9, [700, 4200])
      bell(k, now + .12, C5 * 2, .16, 1.6)
      bell(k, now + .2, G5 * 2, .12, 1.6)
      sparkles(k, now + .25, 12, .8, .08, 1568)
      return
    case 'mythic': {
      // the entrance runs ~1.5s: a swell into a boom, a choir that rises and resolves, sparkles falling
      noise(k, now, 'bandpass', 300, 6000, 1.8, { a: .7, r: .05, g: .3, verb: .5 })
      osc(k, 'sine', now, 40, 80, .75, { a: .7, r: .1, g: .3 })
      const hit = now + .75
      boom(k, hit, 1, 150, 30, 1.6)
      noise(k, hit, 'lowpass', 7000, 500, .5, { a: .002, r: 1.4, g: .7, verb: .8 })
      chord(k, hit, [C3, G3, C4, D5 / 2, G4], .1, .35, .5, [500, 2400]) // suspended...
      chord(k, hit + .8, [C3, G3, C4, E4, G4, C5], .12, .5, 2.2, [700, 3800]) // ...resolved
      bell(k, hit + .05, C5 * 2, .2, 2.4, .9)
      bell(k, hit + .8, E5 * 2, .16, 2.4, .9)
      bell(k, hit + .8, G5 * 2, .14, 2.4, .9)
      sparkles(k, hit + .1, 24, 2.2, .1, 1568)
      return
    }
  }
}

const anticipated = new WeakSet<object>()

/**
 * Hovering an unturned card whose back already glows gold or 彩: a hum that rises, as
 * Hearthstone does before a legendary. Once per card (`token` is anything unique to it).
 */
export function playAnticipation(rarity: string, token: object): void {
  try { anticipate(rarity, token) } catch { /* silent on failure, see playPackCue */ }
}

function anticipate(rarity: string, token: object): void {
  if (rarity !== 'gold' && rarity !== 'mythic') return
  if (anticipated.has(token)) return
  anticipated.add(token)
  const k = audio()
  if (!k) return
  const now = k.ctx.currentTime + .01
  const big = rarity === 'mythic'
  osc(k, 'sine', now, big ? 55 : 82, big ? 110 : 164, 1.2, { a: 1.1, r: .5, g: big ? .35 : .22 })
  chord(k, now, big ? [C3, G3, B4 / 2] : [C4, G4], big ? .05 : .035, 1.1, .5, [300, big ? 2200 : 1600])
  noise(k, now, 'bandpass', 500, big ? 5000 : 3000, 3, { a: 1.1, r: .3, g: big ? .12 : .07, verb: .5 })
}
