"""S16 赛况巡查（站长 2026-10-17：「以后不要每次都我来提醒你去查数据、暂停交易，自己上好定时任务」）。

读 Leaguepedia 的世界赛赛程数据页（入围赛、正赛：瑞士轮 5 轮 + 八强/四强/决赛），算出：
  - 每场比赛（双方俱乐部 id、比分、胜者、开赛 UTC 时间、打完没有）
  - 已经出局的队和名次（入围赛：输两场或输掉决胜场；瑞士轮：3 负；淘汰赛：输了就走；决赛：亚军/冠军）
  - 入围赛晋级队、瑞士轮 3 胜晋级的队
  - 下一场还没打完的比赛的开赛时间
  - 和 src/data/s16Results.json 比：哪些出局的队还没登记（要登记 → 暂停交易）
只读，不改任何文件。输出 JSON（--json）或中文摘要。

  python scripts/s16_watch.py           中文摘要
  python scripts/s16_watch.py --json    机器读
"""
import json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = 'LuluCardBuild/0.1 (hobby esports card game; +https://lulucard-production.up.railway.app)'
PAGES = {'playin': 'Data:2026 Season World Championship/Play-In', 'main': 'Data:2026 Season World Championship/Main Event'}
BJ = timezone(timedelta(hours=8))
# Leaguepedia short names → 俱乐部 id（s16.json 的 teams[].club）；s16.json 的 tag/name 也会自动加进来
ALIASES = {
    'kcorp': 'T28', 'karmine corp': 'T28', 'kc': 'T28', 'mvk esports': 'T49', 'mvk': 'T49', 'los': 'T55', 'løs': 'T55',
    'furia': 'T51', 'fur': 'T51', 'c9': 'T35', 'cloud9': 'T35', 'tl': 'T42', 'team liquid': 'T42', 'tlaw': 'T42',
    'lyon24': 'T39', 'lyon': 'T39', 'al cn': 'T1', 'al': 'T1', "anyone's legend": 'T1', 'gen.g': 'T18', 'gen': 'T18',
    'dplus': 'T17', 'dplus kia': 'T17', 'dk': 'T17', 'tstw': 'T50', 'tsw': 'T50', 'team secret whales': 'T50',
    'cfo': 'T43', 'ctbc flying oyster': 'T43', 'mkoi': 'T29', 'movistar koi': 'T29', 'hle': 'T20', 'hanwha life esports': 'T20',
    'blg': 'T2', 'bilibili gaming': 'T2', 'tes': 'T12', 'top esports': 'T12', 'ig': 'T4', 'invictus gaming': 'T4',
    't1': 'T24', 'g2': 'T26', 'g2 esports': 'T26',
}


def api(page):
    url = 'https://lol.fandom.com/api.php?' + urllib.parse.urlencode({'action': 'parse', 'page': page, 'prop': 'wikitext', 'format': 'json'})
    for i in range(6):
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=40))
        except Exception:
            time.sleep(10); continue
        if d.get('error', {}).get('code') == 'ratelimited':
            time.sleep(30 * (i + 1)); continue
        return d['parse']['wikitext']['*']
    raise SystemExit(f'Leaguepedia 读不到：{page}')


def club_map():
    s16 = json.load(open(ROOT / 'src' / 'data' / 's16.json', encoding='utf-8'))
    m = dict(ALIASES)
    for t in s16['teams']:
        m.setdefault(t['tag'].lower(), t['club']); m.setdefault(t['name'].lower(), t['club'])
    return m, {t['club']: t['tag'] for t in s16['teams']}


def field(block, name):
    m = re.search(r'\|' + name + r'=([^|\n]*)', block)
    return m.group(1).strip() if m else ''


def start_utc(block):
    d, t, tz, dst = field(block, 'date'), field(block, 'time'), field(block, 'timezone'), field(block, 'dst')
    if not d:
        return None
    off = {'PST': -8, 'PDT': -7, 'CET': 1, 'CEST': 2, 'KST': 9, 'CST': 8, 'UTC': 0, 'GMT': 0}.get(tz.upper(), 0)
    if dst.lower() == 'yes' and tz.upper() in ('PST', 'CET'):
        off += 1
    try:
        local = datetime.strptime(f'{d} {t or "00:00"}', '%Y-%m-%d %H:%M')
    except ValueError:
        return None
    return (local - timedelta(hours=off)).replace(tzinfo=timezone.utc)


def matches(page_key, wikitext, names, unknown):
    out, tab = [], ''
    for chunk in re.split(r'\{\{MatchSchedule', wikitext)[1:]:
        if chunk.startswith('/Start'):
            tab = field(chunk, 'tab'); continue
        if not chunk.startswith('|') or '|team1=' not in chunk[:400]:
            continue
        head = chunk.split('|game1=')[0]
        t1, t2 = field(head, 'team1'), field(head, 'team2')
        c1, c2 = names.get(t1.lower()), names.get(t2.lower())
        for raw, c in ((t1, c1), (t2, c2)):
            if raw and not c:
                unknown.add(raw)
        s1, s2, w = field(head, 'team1score'), field(head, 'team2score'), field(head, 'winner')
        winner = c1 if w == '1' else c2 if w == '2' else None
        out.append({'page': page_key, 'tab': tab, 'team1': c1, 'team2': c2, 'score': f'{s1}:{s2}' if (s1 or s2) else '',
                    'winner': winner, 'loser': (c2 if winner == c1 else c1) if winner else None,
                    'start': start_utc(head), 'done': bool(winner)})
    return out


def bj_day(dt):
    return dt.astimezone(BJ).strftime('%Y-%m-%d') if dt else None


def analyse():
    names, tags = club_map()
    unknown = set()
    ms = matches('playin', api(PAGES['playin']), names, unknown) + matches('main', api(PAGES['main']), names, unknown)
    out = {}
    # 入围赛：输两场出局；决胜场（Round 3）的输家出局、赢家晋级
    pi = [m for m in ms if m['page'] == 'playin' and m['done']]
    losses = {}
    for m in sorted(pi, key=lambda m: m['start'] or datetime.min.replace(tzinfo=timezone.utc)):
        losses.setdefault(m['loser'], []).append(m)
        if len(losses[m['loser']]) >= 2 or m['tab'].startswith('Round 3'):
            out.setdefault(m['loser'], {'placement': 'playin', 'out': bj_day(m['start'])})
    playin_winner = next((m['winner'] for m in pi if m['tab'].startswith('Round 3')), None)
    # 瑞士轮：3 负出局，3 胜晋级
    sw = [m for m in ms if m['page'] == 'main' and m['tab'].startswith('Round') and m['done']]
    rec = {}
    for m in sorted(sw, key=lambda m: m['start'] or datetime.min.replace(tzinfo=timezone.utc)):
        rec.setdefault(m['winner'], [0, 0])[0] += 1
        r = rec.setdefault(m['loser'], [0, 0]); r[1] += 1
        if r[1] == 3:
            out.setdefault(m['loser'], {'placement': 'swiss', 'out': bj_day(m['start'])})
    swiss_qualified = [c for c, (w, l) in rec.items() if w >= 3]
    # 淘汰赛
    for tab, place in (('Quarterfinals', 'qf'), ('Semifinals', 'sf'), ('Finals', 'runnerup')):
        for m in ms:
            if m['page'] == 'main' and m['tab'].startswith(tab) and m['done'] and m['loser']:
                out.setdefault(m['loser'], {'placement': place, 'out': bj_day(m['start'])})
                if place == 'runnerup':
                    out.setdefault(m['winner'], {'placement': 'champion', 'out': bj_day(m['start'])})
    results = json.load(open(ROOT / 'src' / 'data' / 's16Results.json', encoding='utf-8'))['teams']
    ratings = json.load(open(ROOT / 'src' / 'data' / 's16Ratings.json', encoding='utf-8'))
    club_of = {p['ign']: p['club'] for p in json.load(open(ROOT / 'src' / 'data' / 's16.json', encoding='utf-8'))['players']}
    revealed_clubs = {club_of.get(ign) for ign in ratings.get('ratings', {})}
    now = datetime.now(timezone.utc)
    upcoming = sorted([m for m in ms if not m['done'] and m['start'] and m['start'] > now - timedelta(hours=6)], key=lambda m: m['start'])
    nxt = upcoming[0] if upcoming else None
    return {
        'now_utc': now.isoformat(timespec='minutes'),
        'eliminated': out,
        'to_register': {c: v for c, v in out.items() if c and c not in results},
        'registered_not_revealed': [c for c in results if c not in revealed_clubs],
        'playin_winner': playin_winner,
        'swiss_record': {c: f'{w}-{l}' for c, (w, l) in rec.items() if c},
        'swiss_qualified': swiss_qualified,
        'next_match': {'tab': nxt['tab'], 'page': nxt['page'], 'teams': [nxt['team1'], nxt['team2']], 'start_utc': nxt['start'].isoformat(timespec='minutes'),
                       'start_bj': nxt['start'].astimezone(BJ).strftime('%m-%d %H:%M')} if nxt else None,
        'upcoming': [{'tab': m['tab'], 'teams': [m['team1'], m['team2']], 'start_bj': m['start'].astimezone(BJ).strftime('%m-%d %H:%M')} for m in upcoming[:8]],
        'unknown_names': sorted(unknown),
        'tags': tags,
    }


if __name__ == '__main__':
    r = analyse()
    if '--json' in sys.argv:
        print(json.dumps(r, ensure_ascii=False, indent=1)); sys.exit(0)
    T = lambda c: r['tags'].get(c, c or '待定')
    PL = {'playin': '入围赛出局', 'swiss': '瑞士轮出局', 'qf': '八强', 'sf': '四强', 'runnerup': '亚军', 'champion': '冠军'}
    print(f"现在 {r['now_utc']} UTC")
    print('已出局：' + ('、'.join(f"{T(c)}（{PL[v['placement']]}，{v['out']}）" for c, v in r['eliminated'].items() if c) or '无'))
    print('要登记（暂停交易）：' + ('、'.join(T(c) for c in r['to_register']) or '无'))
    print('已登记还没揭晓：' + ('、'.join(T(c) for c in r['registered_not_revealed']) or '无'))
    if r['playin_winner']: print(f"入围赛晋级：{T(r['playin_winner'])}")
    if r['swiss_record']: print('瑞士轮战绩：' + '、'.join(f'{T(c)} {s}' for c, s in r['swiss_record'].items()))
    n = r['next_match']
    print(f"下一场：{n['tab'].strip()} {T(n['teams'][0])} vs {T(n['teams'][1])}，北京时间 {n['start_bj']}" if n else '下一场：赛程里没有了')
    if r['unknown_names']: print('认不出的队名（要补进 ALIASES）：' + '、'.join(r['unknown_names']))
