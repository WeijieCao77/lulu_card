import { S16Art, S16CupGlyph } from './S16Card'
import './s16Pack.css'

/** the S16 mark for the altar's core and the deck's seal: the cup inside a double ring */
export function S16Seal() {
  return <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="2" />
    <circle cx="50" cy="50" r="39" stroke="currentColor" strokeOpacity=".55" />
    {Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2
      return <line key={i} x1={50 + Math.cos(a) * 40.5} y1={50 + Math.sin(a) * 40.5} x2={50 + Math.cos(a) * 44.5} y2={50 + Math.sin(a) * 44.5} stroke="currentColor" strokeOpacity=".7" />
    })}
    <svg x="31" y="22" width="38" height="53" viewBox="0 0 100 140"><S16CupGlyph /></svg>
    <text x="50" y="86" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="700" fontFamily="Bahnschrift, Arial, sans-serif" letterSpacing="1">S16</text>
  </svg>
}

/**
 * S16 deck for PackAltar: both halves carry the whole arena artwork, so when the seal breaks the cup parts down
 * the middle; card-edge sides, a gold binding and the cup seal hold it shut and release first.
 */
export function S16DeckArt({ count = 3 }: { count?: number }) {
  return <>
    <span className="ritual-pack-shadow" aria-hidden="true" />
    <span className="ritual-pack-half left"><S16Art variant="pack" count={count} /></span>
    <span className="ritual-pack-half right"><S16Art variant="pack" count={count} /></span>
    <span className="ritual-pack-side left" /><span className="ritual-pack-side right" />
    <span className="s16-deck-binding" />
    <span className="s16-deck-seal"><S16Seal /></span>
  </>
}
