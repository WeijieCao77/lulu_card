#!/usr/bin/env python3
"""S16：OE 还没更新时，从 Games of Legends（gol.gg）抓世界赛每一局的数据，转成 s16_ratings.py 能读的 OE 格式 CSV。

    python scripts/s16_golgg_to_oe.py --tournament "Worlds 2026 Play-In" --out scripts/s16_golgg_playin.csv
    python scripts/s16_ratings.py --oe scripts/s16_golgg_playin.csv --dry-run

gol.gg 每局的「fullstats」页有十个人的击杀/死亡/助攻、伤害占比、经济占比、分均视野、参团率、15 分钟经济/经验/补刀差，
正好是 s16_ratings.py 和对位比的八项。差别：
  * earnedgoldshare 用 gol.gg 的 GOLD%（含被动金币，和 OE 的 earned gold share 略有出入）；
  * teamkills 由 (击杀 + 助攻) / KP% 反推，只为让脚本算出和 gol.gg 一样的参团率；
  * 队名按名单（src/data/s16.json）认人：五个人里认出谁就是哪队（名单外的替补跟着同一边的队友）；
  * date = gol.gg 的比赛日（洛杉矶）19:00 UTC，脚本换成北京时间就是第二天凌晨——和出局登记（北京时间）对得上。

只用 Python 3.12 标准库。
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROSTER_JSON = HERE.parent / "src" / "data" / "s16.json"
BASE = "https://gol.gg"
UA = {"User-Agent": "Mozilla/5.0 (lulucard s16 ratings)"}
ROLE = {"TOP": "top", "JUNGLE": "jng", "MID": "mid", "ADC": "bot", "SUPPORT": "sup"}
COLS = ["gameid", "datacompleteness", "league", "year", "date", "side", "position", "playername", "teamname", "result",
        "kills", "deaths", "assists", "teamkills", "damageshare", "vspm", "earnedgoldshare",
        "golddiffat15", "xpdiffat15", "csdiffat15"]


def get(url: str, cache: Path | None) -> str:
    if cache:
        f = cache / (re.sub(r"[^0-9A-Za-z]+", "_", url.removeprefix(BASE)).strip("_") + ".html")
        if f.exists():
            return f.read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        s = r.read().decode("utf-8", errors="replace")
    time.sleep(0.5)
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        f.write_text(s, encoding="utf-8")
    return s


def cells(row: str) -> list[str]:
    return [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]


def num(v: str) -> float | None:
    v = (v or "").replace("%", "").strip()
    try:
        return float(v)
    except ValueError:
        return None


def series_list(tournament: str, cache) -> list[dict]:
    t = urllib.parse.quote(tournament)
    s = get(f"{BASE}/tournament/tournament-matchlist/{t}/", cache)
    out = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", s, re.S):
        c = cells(r)
        link = re.search(r"game/stats/(\d+)/page-summary", r)
        if link and len(c) >= 7 and re.fullmatch(r"\d{4}-\d{2}-\d{2}", c[6]):
            out.append({"first": link.group(1), "title": c[0], "a": c[1], "score": c[2], "b": c[3], "round": c[4], "date": c[6]})
    return sorted(out, key=lambda x: (x["date"], int(x["first"])))


def game_ids(first: str, cache) -> list[str]:
    s = get(f"{BASE}/game/stats/{first}/page-summary/", cache)
    ids = sorted({int(x) for x in re.findall(r"game/stats/(\d+)/page-game", s)} | {int(first)})
    return [str(i) for i in ids]


def game_table(gid: str, cache) -> dict[str, list[str]]:
    s = get(f"{BASE}/game/stats/{gid}/page-fullstats/", cache)
    t: dict[str, list[str]] = {}
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", s, re.S):
        c = cells(r)
        if len(c) == 11 and c[0]:
            t[c[0]] = c[1:]
    if len(t.get("Player", [])) != 10:
        sys.exit(f"gol.gg game {gid}: fullstats table not found")
    return t


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="gol.gg 世界赛对局 → OE 格式 CSV（给 s16_ratings.py）")
    ap.add_argument("--tournament", default="Worlds 2026 Play-In", help="gol.gg 的赛事名，如 \"Worlds 2026 Play-In\"、\"Worlds 2026 Main Event\"")
    ap.add_argument("--out", required=True)
    ap.add_argument("--append", action="store_true", help="接在已有 CSV 后面（入围赛 + 正赛合成一个文件），同一局不重复")
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--cache", default=None, help="把抓下来的网页存这里，重跑不再请求")
    ap.add_argument("--roster", default=str(ROSTER_JSON))
    args = ap.parse_args(argv)
    cache = Path(args.cache) if args.cache else None

    roster = json.loads(Path(args.roster).read_text(encoding="utf-8"))
    team_name = {t["club"]: t["name"] for t in roster["teams"]}
    club_of = {re.sub(r"[^0-9a-z]", "", p["ign"].lower()): p["club"] for p in roster["players"]}

    rows: list[dict] = []
    seen: set[str] = set()
    out = Path(args.out)
    if args.append and out.exists():
        with open(out, encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        seen = {r["gameid"] for r in rows}

    series = series_list(args.tournament, cache)
    if not series:
        sys.exit(f"gol.gg：{args.tournament} 没有找到比赛")
    added = 0
    for se in series:
        for gid in game_ids(se["first"], cache):
            key = f"golgg-{gid}"
            if key in seen:
                continue
            t = game_table(gid, cache)
            sides = []
            for half in (range(0, 5), range(5, 10)):
                clubs = [club_of.get(re.sub(r"[^0-9a-z]", "", t["Player"][i].lower())) for i in half]
                known = {c for c in clubs if c}
                if len(known) != 1:
                    sys.exit(f"gol.gg game {gid}: 认不出这一边是哪队（{[t['Player'][i] for i in half]}）")
                sides.append(team_name[known.pop()])
            for i in range(10):
                k, d, a = (num(t[x][i]) or 0.0 for x in ("Kills", "Deaths", "Assists"))
                kp = num(t["KP%"][i])
                tk = round((k + a) / (kp / 100), 3) if kp else (0 if k + a == 0 else "")
                rows.append({
                    "gameid": key, "datacompleteness": "golgg", "league": "WLDs", "year": str(args.year),
                    "date": f"{se['date']} 19:00:00", "side": "Blue" if i < 5 else "Red",
                    "position": ROLE[t["Role"][i]], "playername": t["Player"][i], "teamname": sides[i // 5], "result": "",
                    "kills": k, "deaths": d, "assists": a, "teamkills": tk,
                    "damageshare": (num(t["DMG%"][i]) or 0) / 100, "vspm": num(t["VSPM"][i]),
                    "earnedgoldshare": (num(t["GOLD%"][i]) or 0) / 100,
                    "golddiffat15": num(t["GD@15"][i]), "xpdiffat15": num(t["XPD@15"][i]), "csdiffat15": num(t["CSD@15"][i]),
                })
            added += 1
        print(f"{se['date']}  {se['a']} {se['score']} {se['b']}  ({se['round']})")

    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)
    print(f"{out}: 新增 {added} 局，共 {len({r['gameid'] for r in rows})} 局")
    return 0


if __name__ == "__main__":
    sys.exit(main())
