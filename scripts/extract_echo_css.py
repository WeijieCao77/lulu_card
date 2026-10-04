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
# Owner feedback 2026-10-04: gold and bronze read as the same colour. The review round only re-coloured gold and
# silver, so bronze fell back to the default — itself a pale gold-copper — and the inner hairline was one fixed
# gold on every card. Each metal now has its own muted colour, the edge carries a little more of it, and the
# hairline follows the metal.
E = '.cardface.retired-echo.retired-echo.retired-echo'
kept.append(
    f'{E}.re-gold{{--re-metal:#cfac4e;--re-glint:#f0d98c;--re-shadow:#5e4818;background:color-mix(in srgb,var(--re-metal) 62%,#15251f)}}'
    f'{E}.re-silver{{--re-metal:#9cabb3;--re-glint:#dbe4e7;--re-shadow:#3d4b51;background:color-mix(in srgb,var(--re-metal) 52%,#15251f)}}'
    f'{E}.re-bronze{{--re-metal:#a8603a;--re-glint:#dc9a72;--re-shadow:#4a2a18;background:color-mix(in srgb,var(--re-metal) 58%,#15251f)}}'
    f'{E}::after{{border-color:color-mix(in srgb,var(--re-glint) 42%,transparent)}}')
# Owner feedback 2026-10-04 (2)+(3): 「卡面太花哨……和彩卡没啥差别……彩卡必须最高级」, then 「黑白照片不行……可以在边框和
#卡的形象上做手脚」. The 彩卡 is a rounded, full-bleed colour photograph with an iridescent edge. 回响 keeps the photo in
# full colour but changes the object: a plate with chamfered corners, a double hairline that follows the chamfer in
# the card's metal, and the photograph mounted in a chamfered window over a dark matte, the name in a calm band below.
CH = 'polygon(7% 0,93% 0,100% 5%,100% 95%,93% 100%,7% 100%,0 95%,0 5%)'
CHW = 'polygon(5% 0,95% 0,100% 4%,100% 96%,95% 100%,5% 100%,0 96%,0 4%)'
def frame(color):
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>"
           f"<polygon points='6.2,2.4 93.8,2.4 97.6,6.6 97.6,93.4 93.8,97.6 6.2,97.6 2.4,93.4 2.4,6.6' fill='none' stroke='{color}' stroke-opacity='.5' stroke-width='1' vector-effect='non-scaling-stroke'/></svg>")
    return 'url("data:image/svg+xml,' + svg.replace('#', '%23').replace('<', '%3C').replace('>', '%3E') + '")'
kept.append(
    f'{E}{{border-radius:0;clip-path:{CH};padding:1.2px;box-shadow:none;filter:drop-shadow(0 8px 14px #0007)}}'
    f'{E} .re-inner{{border-radius:0;clip-path:{CH};background:#0a1513 no-repeat center/100% 100%}}'
    f'{E}.re-gold .re-inner{{background-image:{frame("#e3c573")}}}'
    f'{E}.re-silver .re-inner{{background-image:{frame("#c9d6dc")}}}'
    f'{E}.re-bronze .re-inner{{background-image:{frame("#d58f66")}}}'
    f'{E}::after,{E}::before{{content:none}}'
    f'{E} .re-inner::before{{background:none}}'
    f'{E} .re-halo{{display:none}}'
    f'{E} .re-portrait{{inset:6.5% 7% 33% 7%;mask-image:none;-webkit-mask-image:none;clip-path:{CHW};overflow:hidden;background:#0b1715}}'
    f'{E} .re-portrait img{{filter:saturate(.8) contrast(.86) brightness(.86)}}'
    f'{E} .re-portrait::after{{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#0a1a17cc 0,transparent 24%,transparent 72%,#0a1a17b0 100%);pointer-events:none}}'
    f'{E} .re-header{{top:9%;left:11%}}'
    f'{E} .re-tier-stamp{{top:9%;right:11%}}'
    f'{E} .re-rating{{top:21%;left:11%;background:#0a151380}}'
    f'{E} .re-copy{{left:8%;right:8%;bottom:4.5%;height:28.5%}}'
    f'{E} .re-name{{font-size:11.5cqw;margin:1.2cqw 0 1cqw;text-shadow:none;letter-spacing:-.01em}}'
    f'{E} .re-stats{{padding-top:2.2cqw}}'
    f'{E} .re-stats b{{font-size:5cqw}}')
# Player report 2026-10-04 (phone): names cut to a sliver. Phone browsers (WeChat, Android with a larger font setting)
# enlarge text; the name band was a fixed 28.5% box whose name and team lines were allowed to shrink, so they gave way
# first. The text keeps its designed size where the browser allows it, and where it does not the band grows upward over
# the foot of the photograph instead of crushing the name.
kept.append(
    f'{E}{{-webkit-text-size-adjust:100%;text-size-adjust:100%}}'
    f'{E} .re-copy{{height:auto;min-height:28.5%;top:auto;background:linear-gradient(180deg,transparent 0,#0a1513 1.6em)}}'
    f'{E} .re-copy>*{{flex-shrink:0}}')
# Reported 2026-10-04 (phone, 图鉴 list): a strip of the metal plate below the card. The plate is held to the
# ordinary card's height by min-height, while the panel inside took 100% of a height that, inside a flex row, resolves
# to the plate's own 0.69 shape, so it stopped short. The panel is pinned to the plate's edges instead.
kept.append(f'{E} .re-inner{{position:absolute;inset:1.2px;width:auto;height:auto}}')
# Card back v2 (owner 2026-10-04: 「卡背不够帅」) is one SVG (EchoBackArt.tsx); the frame only sizes it like a card.
kept.append('.cardback.echo-back-v2.echo-back-v2{position:relative;aspect-ratio:63/88;width:100%;padding:0;border:0;border-radius:6px;'
            'background:#050d0c;box-shadow:0 8px 20px #0006;overflow:hidden;container-type:inline-size}'
            '.cardback.echo-back-v2.echo-back-v2::before,.cardback.echo-back-v2.echo-back-v2::after{content:none}'
            '.cardback.echo-back-v2 .echo-back-art{display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:cover}'
            # v3 type, after the 曼谷 back: hairline + inner frame, small header, oversized title, a bold line at the foot
            '.cardback.echo-back-v2.echo-back-v2{border:0;font-family:Arial,"Microsoft YaHei",sans-serif;color:#eef6f1}'
            '.echo-back-v2 .eb-inner{position:absolute;inset:2.2%;border:1px solid color-mix(in srgb,#c9b27c,transparent 55%);border-radius:3px;pointer-events:none;z-index:3}'
            '.echo-back-v2 .eb-head{position:absolute;z-index:2;top:6.5%;left:9%;right:9%;display:flex;justify-content:space-between;font-size:2.4cqw;letter-spacing:.09em;color:#bfd2c8}'
            '.echo-back-v2 .eb-head span{color:#e3cb8c}'
            '.echo-back-v2 .eb-title{position:absolute;z-index:2;top:11.5%;width:100%;text-align:center;text-shadow:0 2px 14px #000a}'
            '.echo-back-v2 .eb-title small{display:block;font-size:4.6cqw;letter-spacing:.42em;text-indent:.42em;color:#e3cb8c}'
            '.echo-back-v2 .eb-title strong{display:block;font:400 17cqw/1.02 Impact,"Arial Narrow",sans-serif;letter-spacing:.02em;'
            'color:#f4fbf7;text-shadow:0 2px 0 #0b2421,0 0 18px #6fd9c655}'
            '.echo-back-v2 .eb-bottom{position:absolute;z-index:2;bottom:6.5%;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2.4cqw;text-shadow:0 2px 10px #000c}'
            '.echo-back-v2 .eb-bottom b{font:800 6.6cqw/1.02 Impact,"Arial Narrow",sans-serif;letter-spacing:.01em;color:#f3ead2}'
            '.echo-back-v2 .eb-bottom span{font-size:3.1cqw;letter-spacing:.12em;color:#cfe0d7}'
            '.echo-back-v2 .eb-bottom small{font-size:2cqw;letter-spacing:.14em;color:#93a89e}')
DST.write_text('/* 峡谷回响卡面与卡背 — 由 scripts/extract_echo_css.py 从站长确认的定稿生成，不要手改。 */\n' + '\n'.join(kept) + '\n', encoding='utf-8')
print(len(kept), 'rules ->', DST)
