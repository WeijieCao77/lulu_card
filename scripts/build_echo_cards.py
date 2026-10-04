"""峡谷回响卡池：把审阅过的数值、战队、国籍和照片拼成 src/data/echoCards.json，照片转成 public/lol/faces/echo/*.webp。

数据来源（都在仓库外，站长审过）：
  ../career-recalc/echo_v2/echo_cards.json   卡色、卡面评分、现役俱乐部（含站长手动调整）
  ../career-recalc/echo_v2/rep_team.json     代表战队与年份（含站长指定）
  ../career-recalc/echo_v2/nat.json          国籍
  ../career-recalc/echo_v2/ratings-top-only.json  八项能力（纯数据）
  ../career-recalc/echo_v2/lp_pages/         Leaguepedia 选手页缓存：真名
  research/retired_event_photos_20261003/manifest.json  选定的赛事照片

    PYTHONIOENCODING=utf-8 python scripts/build_echo_cards.py
"""
import html, json, re, statistics
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CR = ROOT.parent / 'career-recalc' / 'echo_v2'
PHOTOS = ROOT.parent / 'game' / 'research' / 'retired_event_photos_20261003'
OUT_IMG = ROOT / 'public' / 'lol' / 'faces' / 'echo'
OUT_IMG.mkdir(parents=True, exist_ok=True)

cards = json.load(open(CR / 'echo_cards.json', encoding='utf-8'))
rep = json.load(open(CR / 'rep_team.json', encoding='utf-8'))
nat = json.load(open(CR / 'nat.json', encoding='utf-8'))
hist = json.load(open(CR / 'history.json', encoding='utf-8'))
ratings = json.load(open(CR / 'ratings-top-only.json', encoding='utf-8'))['players']
rlow = {k.casefold(): v for k, v in ratings.items()}
titles = json.load(open(CR / 'lp_titles.json', encoding='utf-8'))
manifest = {e['id']: e for e in json.load(open(PHOTOS / 'manifest.json', encoding='utf-8'))['entries']}
manifest.update({e.get('roster_original_id'): e for e in manifest.copy().values() if e.get('roster_original_id')})
world = json.load(open(ROOT / 'src' / 'data' / 'world.json', encoding='utf-8'))
team_tag = {t['id']: t['tag'] for t in world['teams']}
# Clubs (owner 2026-10-04): a retired player keeps the club he is known for — today's club when it was renamed or taken
# over (DWG → DK, SKT → T1, Splyce → KOI …), otherwise that club as a historical club H:TAG (H:RNG, H:FPX …), the same
# ids the 名人堂 cards use, even with a single player in it. Worked out by career-recalc/echo_v2/club_resolve.py.
CLUBS = json.load(open(ROOT.parent / 'career-recalc' / 'echo_v2' / 'club_resolve.json', encoding='utf-8'))

ALIAS = {'Balls': 'BalIs'}
# lol attribute -> card attribute (same mapping as the live cards)
CARD_ATTR = {'aim': 'mechanics', 'reaction': 'laning', 'awareness': 'awareness', 'utility': 'farming',
             'clutch': 'clutch', 'teamwork': 'teamfight', 'communication': 'teamwork', 'igl': 'macro'}
# the game region a card belongs to, from its group (LLA counts with LCS — owner)
REGION = {'LPL': 'LPL', 'LCK': 'LCK', 'LEC': 'LEC', 'LCS': 'LCS'}
WEST_REGION = {'CBLOL': 'CBLOL'}   # everything else in 其他赛区 is the Pacific side (LMS/PCS, VCS, LJL, OPL)


NATIVE = {'cn', 'tw', 'hk', 'mo', 'kr', 'jp'}   # these show the name in its own script; everyone else romanised


def real_name(pid):
    page = titles.get(pid, pid)
    f = CR / 'lp_pages' / (re.sub(r'[^\w\-]+', '_', page) + '.json')
    if not f.exists():
        return None
    t = json.load(open(f, encoding='utf-8')).get('parse', {}).get('text', {}).get('*', '')
    m = re.search(r'<p>(.*?)</p>', t, re.S)
    if not m:
        return None
    lead = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).replace('\xa0', ' '))
    native = re.search(r'\((?:Hanzi|Hangul|Kanji|Japanese)[^:]*:\s*([^)]+)\)', lead)
    if native and nat.get(pid) in NATIVE:
        return native.group(1).split(';')[0].strip()
    # 'Yiliang "Doublelift" (listen) Peng (Hanzi: …) is a …' -> 'Yiliang Peng'
    head = re.split(r'\s+is\s+(?:a|an|the)\b', lead)[0]
    head = re.sub(r'\([^)]*\)', ' ', head)
    head = re.sub(r'"[^"]*"|“[^”]*”', ' ', head)
    head = re.sub(r'\s+', ' ', head).strip()
    return head or None


# position shape for players with no data: the average card-attribute offset of everyone in that position
shape = {}
for pos in ('上单', '打野', '中单', '下路', '辅助'):
    offs = []
    for c in cards:
        r = rlow.get(f"{ALIAS.get(c['id'], c['id'])}|{pos}".casefold())
        if c['pos'] == pos and r:
            offs.append({k: r['attrs'][src] - r['overall'] for k, src in CARD_ATTR.items()})
    shape[pos] = {k: statistics.mean(o[k] for o in offs) for k in CARD_ATTR}


def attrs_for(c):
    r = rlow.get(f"{ALIAS.get(c['id'], c['id'])}|{c['pos']}".casefold())
    if r:
        base = {k: r['attrs'][src] - r['overall'] for k, src in CARD_ATTR.items()}
        estimated = False
    else:
        base = shape[c['pos']]
        estimated = True
    return {k: max(1, min(99, round(c['rating'] + v))) for k, v in base.items()}, estimated


# Owner 2026-10-04 「把这4张低分辨率的照片换掉」: sharper sources, kept beside this script (scripts/echo_photo_overrides/).
OVERRIDES = Path(__file__).resolve().parent / 'echo_photo_overrides'
# Birthdays (owner 2026-10-04 「把 193 人的生日补上」): Leaguepedia infoboxes, checked against each card's real name;
# Sicca from Baidu/Sogou. Four have none published (HeaQ, Link) or no year (Chippys, Big) and show 「生日资料待补充」.
BIRTHS = json.load(open(Path(__file__).resolve().parent / 'echo_births.json', encoding='utf-8'))

PHOTO_OVERRIDE = {
    'Sicca': {'file': 'Sicca.jpg', 'source_page': 'https://www.doyo.cn/article/331542',
              'source_description': 'Sicca as an LPL caster at the desk, cropped from a two-person booth photo; identity matched to the @西卡_李浩宇 weibo photos'},
    'Alex Ich': {'file': 'Alex_Ich.jpg', 'source_page': 'https://lol.fandom.com/wiki/File:Alexich.jpg',
                 'source_description': 'Alex Ich at a Gambit match station in a Gambit hoodie'},
    'Yang': {'file': 'Yang.jpg', 'source_page': 'https://www.oficinadanet.com.br/post/15349-entrevista-com-felipe-yang-zhao',
             'source_description': 'INTZ Yang on stage with headset, CBLOL 2015 (same article as before, full-size cover image)'},
    'Acce': {'file': 'Acce.jpg', 'source_page': 'https://www.infobae.com/america/agencias/2020/07/23/argentino-acce-asegura-que-isurus-ya-no-da-miedo-en-la-liga-latina-de-lol/',
             'source_description': 'Rainbow7 Acce, Mexico City 2020 (EFE / courtesy Riot Games, editorial use); full-size original of the earlier 350px copy'},
}


def photo(pid):
    e = manifest.get(pid)
    if pid in PHOTO_OVERRIDE:
        e = PHOTO_OVERRIDE[pid]
        src = OVERRIDES / e['file']
    elif not e or not e.get('file'):
        return None
    else:
        src = PHOTOS / e['file']
    dst = OUT_IMG / f"{re.sub(r'[^A-Za-z0-9]+', '_', pid)}.webp"
    if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
        im = Image.open(src).convert('RGB')
        if im.height > 900:
            im = im.resize((round(im.width * 900 / im.height), 900), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=84, method=6)
    w, h = Image.open(src).size
    return {'img': f"/lol/faces/echo/{dst.name}", 'w': w, 'h': h,
            'credit': e.get('source_page'), 'note': (e.get('source_description') or '')[:160]}


rows = list(__import__('csv').DictReader(open(ROOT.parent / '峡谷回响' / '名单' / '名单_v13.tsv', encoding='utf-8'), delimiter='\t'))
origin = {r['ID'].strip(): r['原赛区'] for r in rows}
out = []
for c in sorted(cards, key=lambda c: (['LPL', 'LCK', 'LEC', 'LCS', 'WEST'].index(c['group']), -c['rating'], c['id'].lower())):
    pid = c['id']
    rt = rep.get(pid, {})
    attrs, estimated = attrs_for(c)
    region = REGION.get(c['group']) or WEST_REGION.get(origin.get(pid, ''), 'LCP')
    out.append({
        'id': f'echo:{pid}', 'person': f'H:{pid}', 'ign': pid, 'realName': real_name(pid),
        'nat': nat.get(pid), 'region': region, 'group': c['group'], 'role': c['pos'], 'roles': [c['pos']],
        'rating': c['rating'], 'rarity': {'金': 'gold', '银': 'silver', '铜': 'bronze'}[c['tier']],
        'attrs': attrs, 'attrsEstimated': estimated,
        'clubId': CLUBS[pid]['club'], 'clubTag': CLUBS[pid]['clubTag'] or team_tag.get(CLUBS[pid]['club']), 'clubName': CLUBS[pid]['clubName'],
        'team': rt.get('as_named') or None, 'span': rt.get('span') or None,
        'photo': photo(pid), 'manual': c['manual'], 'birth': BIRTHS.get(pid, {}).get('birth'),
    })
json.dump({'meta': {'series': '峡谷回响', 'count': len(out), 'note': '由 scripts/build_echo_cards.py 生成，不要手改'}, 'cards': out},
          open(ROOT / 'src' / 'data' / 'echoCards.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), Counter(x['rarity'] for x in out), 'no realName:', [x['ign'] for x in out if not x['realName']],
      'no photo:', [x['ign'] for x in out if not x['photo']], 'estimated attrs:', sum(x['attrsEstimated'] for x in out))
