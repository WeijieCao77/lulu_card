"""把撸撸卡自己的评分表（build_lol_ratings.py --ratings-out）写进 src/data/world.json。

    python scripts/lol_rating/build_lol_ratings.py --ratings-out <ratings.json>
    python scripts/lol_rating/apply_lol_ratings.py <ratings.json> --report docs/card-rating-v7-changes.json [--write]

只动每位选手的来源分、八项英雄联盟属性和由它们推出的字段；名单、头像、ID、战队、近期数据都不动。
每一步和建卡时的 finalize_cards.py 一致：
  overall = 旧卡面刻度(来源分)；attrs = 英雄联盟属性按对应关系 + (overall − 来源分)，截到 1..99。
卡面评分与分档由 src/engine/cardRarity.ts 从来源分算出，门槛不在这里改。
没有比赛数据的「估算」选手（ratingEstimated）取本赛区同位置选手的新中位数。
"""
import argparse, json, math, statistics
from pathlib import Path

GAME = Path(__file__).resolve().parents[2]
WORLD = GAME / 'src' / 'data' / 'world.json'
ATTR = {'aim': 'mechanics', 'reaction': 'laning', 'awareness': 'awareness', 'utility': 'farming',
        'clutch': 'clutch', 'teamwork': 'teamfight', 'communication': 'teamwork', 'igl': 'macro'}
# the v6 card scale (src/engine/cardRarity.ts), only to report colour changes
PARAMS = {'LPL': dict(min=63, silver=76, gold=79, max=85, top=90), 'LCK': dict(min=55, silver=70, gold=80, max=93, top=90),
          'WEST': dict(min=50, silver=66, gold=71, max=77, top=88)}


def js_round(x):
    return math.floor(x + .5)


def old_scale(x):
    """finalize_cards.py 的旧刻度：world.json 的 overall 一直是它。"""
    return max(35, min(90, round(48 + (x - 50) * 36 / 22 if x <= 72 else 84 + (x - 72) * 6 / 21)))


def group(region):
    return region if region in ('LPL', 'LCK') else 'WEST'


def card_rating(source, region):
    p = PARAMS[group(region)]
    s = source
    if s >= p['gold']:
        x = 84 + (s - p['gold']) * (p['top'] - 84) / (p['max'] - p['gold'])
    elif s >= p['silver']:
        x = 72 + (s - p['silver']) * 11 / (p['gold'] - 1 - p['silver'])
    else:
        x = 50 + (s - p['min']) * 21 / (p['silver'] - 1 - p['min'])
    return max(50, min(p['top'], js_round(x)))


def tier(r):
    return 'gold' if r >= 84 else 'silver' if r >= 72 else 'bronze'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ratings')
    ap.add_argument('--report', required=True)
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()
    table = json.load(open(args.ratings, encoding='utf-8'))
    ratings = table['players']
    world = json.loads(WORLD.read_text('utf-8'))
    players = world['players']

    before = {p['id']: (p['sourceOverall'], card_rating(p['sourceOverall'], p['region'])) for p in players}
    measured = [p for p in players if not p.get('ratingEstimated')]
    missing = [p['ign'] for p in measured if f"{p['ign']}|{p['role']}" not in ratings]
    if missing:
        raise SystemExit(f'评分表里找不到：{missing}')
    for p in measured:
        r = ratings[f"{p['ign']}|{p['role']}"]
        p['sourceOverall'] = r['overall']
        p['lolAttrs'] = r['attrs']
        p['macroFrom'] = r['macroFrom']
        if r['honours']:
            p['honours'] = r['honours']
        else:
            p.pop('honours', None)
    for p in players:
        if not p.get('ratingEstimated'):
            continue
        peers = [q for q in measured if q['region'] == p['region'] and q['role'] == p['role']]
        p['sourceOverall'] = round(statistics.median(q['sourceOverall'] for q in peers))
        p['lolAttrs'] = {k: round(statistics.median(q['lolAttrs'][k] for q in peers)) for k in peers[0]['lolAttrs']}
    for p in players:
        source = p['sourceOverall']
        new = old_scale(source)
        p['attrs'] = {k: max(1, min(99, p['lolAttrs'][v] + new - source)) for k, v in ATTR.items()}
        p['overall'] = new
        p['potential'] = max(new, p.get('potential', new))
    for t in world['teams']:
        members = [p for p in players if p['id'] in t['roster']]
        if members:
            t['rating'] = round(sum(p['overall'] for p in members) / len(members))
    # 战队的世界赛 / MSI 冠亚军（完整战队背景的俱乐部介绍用）。比赛数据里是当年的队名，
    # 按 teamLineages.json 的曾用名接到今天的队上：SK Telecom T1 → T1，Samsung Galaxy → Gen.G
    lineages = json.loads((GAME / 'src' / 'data' / 'teamLineages.json').read_text('utf-8'))
    # full names only: tags collide across eras (SSG was Samsung Galaxy; today it is SillySilly Gaming)
    def same_club(t, name):
        return name == t['name'] or any(t['name'] in l['aliases'] and name in l['aliases'] for l in lineages)
    team_honours = table['meta'].get('teamHonours', {})
    for t in world['teams']:
        got = sorted(h for name, hs in team_honours.items() if same_club(t, name) for h in hs)
        if got:
            t['honours'] = got
        else:
            t.pop('honours', None)
    world['meta']['ratingModel'] = dict(
        version=7, builtBy='scripts/lol_rating/build_lol_ratings.py', **table['meta'],
        note='撸撸卡自己的评分：2016–2026，当年 50%，其余按每早 2 年减半只分给本人有比赛的年份；季后赛×1.5、MSI×2、世界赛×2.5；'
             '关键局权重减半；运营 55/30/15；荣誉少量加分（封顶 3）。游戏内估算，不是官方排名。')

    rows = []
    for p in players:
        o_src, o_card = before[p['id']]
        n_card = card_rating(p['sourceOverall'], p['region'])
        rows.append(dict(id=p['id'], ign=p['ign'], region=p['region'], group=group(p['region']), role=p['role'],
                         estimated=bool(p.get('ratingEstimated')), sourceBefore=o_src, sourceAfter=p['sourceOverall'],
                         cardBefore=o_card, cardAfter=n_card, tierBefore=tier(o_card), tierAfter=tier(n_card),
                         honours=p.get('honours', [])))
    counts = {}
    for g in ('LPL', 'LCK', 'WEST'):
        for when in ('Before', 'After'):
            c = {t: sum(1 for r in rows if r['group'] == g and r['tier' + when] == t) for t in ('gold', 'silver', 'bronze')}
            counts[f'{g} {when.lower()}'] = c
    report = dict(meta=world['meta']['ratingModel'], counts=counts,
                  colourChanges=[r for r in rows if r['tierBefore'] != r['tierAfter']],
                  cardChanges=[r for r in rows if r['cardBefore'] != r['cardAfter']])
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=1), 'utf-8')
    print(f"改色 {len(report['colourChanges'])} 张；评分变化 {len(report['cardChanges'])} 张；报告 {args.report}")
    for k, v in counts.items():
        print(' ', k, v)
    if args.write:
        WORLD.write_text(json.dumps(world, ensure_ascii=False), 'utf-8')
        print('已写入', WORLD)


if __name__ == '__main__':
    main()
