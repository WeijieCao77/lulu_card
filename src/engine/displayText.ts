/**
 * Decode the limited set of HTML entities found in scraped real names.
 *
 * This is deliberately NOT an HTML parser: it only understands the six
 * named entities every scraper emits (amp, nbsp, quot, apos, lt, gt), the
 * three decimal numeric forms that matter (&#39; &#34; &#160;), and up to
 * three rounds of double-encoding like `&amp;nbsp;`. Unknown entities are
 * left exactly as they were scraped — a name containing a literal `&copy;`
 * stays `&copy;`, not `©`.
 */
export function decodeDisplayName(value: string | null | undefined): string | null {
  if (value == null) return null
  if (!value.includes('&')) return value

  let out = value
  for (let round = 0; round < 3; round++) {
    const before = out
    out = out
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&#34;/g, '"')
      .replace(/&#160;/g, ' ')
    if (out === before) break
  }
  return out
}
