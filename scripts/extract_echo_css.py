"""Extract the 峡谷回响 card face/back styles from the owner-confirmed design HTML into src/ui/cards/echo/echoCard.css.

The design page stacks two layers: the designer's base rules (.retired-echo …) and the final review rules
(.proposal .retired-echo …), which win because `.proposal` makes them one class heavier. Here:
  * every kept rule keeps its order;
  * a review rule loses `.proposal ` but gets its own class written twice, so it still outweighs the base;
  * then every rule gets one more class, so the series beats the game's general .cardface styles, which
    changed after the design was made (f62def1) and would otherwise leak a thick frame and old animations.

    PYTHONIOENCODING=utf-8 python scripts/extract_echo_css.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent / '峡谷回响' / '新版卡面交接-20261004' / '峡谷回响-新版双线卡面.html'
DST = ROOT / 'src' / 'ui' / 'cards' / 'echo' / 'echoCard.css'

html = SRC.read_text(encoding='utf-8')
css = re.findall(r'<style[^>]*>(.*?)</style>', html, re.S)[0]
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def rules(text):
    out, i, n = [], 0, len(text)
    while i < n:
        j = text.find('{', i)
        if j < 0:
            break
        sel, depth, k = text[i:j].strip(), 1, j + 1
        while depth and k < n:
            depth += {'{': 1, '}': -1}.get(text[k], 0)
            k += 1
        out.append((sel, text[j + 1:k - 1]))
        i = k
    return out


def ours(part):
    return ('retired-echo' in part and ':not(.retired-echo' not in part) or (re.search(r'(^|[\s>])\.re-', part) and ':not(' not in part)


def heavier(sel, times):
    """write .retired-echo-back / .retired-echo `times` extra times at their first occurrence"""
    for cls in ('.retired-echo-back', '.retired-echo'):
        m = re.search(re.escape(cls) + r'(?![\w-])', sel)
        if m:
            return sel[:m.end()] + cls * times + sel[m.end():]
    return sel


def convert(sel):
    parts = [p.strip() for p in sel.split(',') if ours(p)]
    out = []
    for p in parts:
        review = p.startswith('.proposal ')
        p = p.replace('.proposal ', '')
        out.append(heavier(p, (2 if review else 1)))
    return ','.join(out)


kept = []
for sel, body in rules(css):
    if sel.startswith('@keyframes'):
        if re.search(r're-|echo', sel):
            kept.append(f'{sel}{{{body}}}')
        continue
    if sel.startswith('@'):
        inner = [(convert(a), b) for a, b in rules(body) if any(ours(p) for p in a.split(','))]
        inner = [(a, b) for a, b in inner if a]
        if inner:
            kept.append(sel + '{' + ''.join(f'{a}{{{b}}}' for a, b in inner) + '}')
        continue
    if any(ours(p) for p in sel.split(',')):
        c = convert(sel)
        if c:
            kept.append(f'{c}{{{body}}}')

# The design took its height from the game's card sizes (min-height 174/212/281 on .s-sm/.s-md/.s-lg), which the
# heavier selectors above would otherwise cancel: an echo card stands exactly as tall as an ordinary card.
kept.append('.cardface.retired-echo.retired-echo.retired-echo.s-sm{min-height:174px}'
            '.cardface.retired-echo.retired-echo.retired-echo.s-md{min-height:212px}'
            '.cardface.retired-echo.retired-echo.retired-echo.s-lg{min-height:281px}')
# per-photo framing (src/data/echoPhotoFocus.json): a far-off figure is enlarged around the same focus point
kept.append('.retired-echo.retired-echo.retired-echo .re-portrait img{transform:scale(var(--re-zoom,1));transform-origin:var(--re-origin,var(--re-portrait-position))}')
DST.write_text('/* 峡谷回响卡面与卡背 — 由 scripts/extract_echo_css.py 从站长确认的定稿生成，不要手改。 */\n' + '\n'.join(kept) + '\n', encoding='utf-8')
print(len(kept), 'rules ->', DST)
