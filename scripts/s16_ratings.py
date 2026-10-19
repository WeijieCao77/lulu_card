#!/usr/bin/env python3
"""S16 世界赛系列：战队被淘汰时，给这支队的五个人定最终数值并永久定格（站长 2026-10-10 的新算法）。

    python scripts/s16_ratings.py --oe <2026_OE.csv> [--dry-run]
        [--fmvp Chovy] [--fmvp-rating 96] [--final] [--refreeze T35] [--unfreeze T35] [--force]

读：
  scripts/s16_base.json      每位名单选手的普通卡（评分 + 八项属性），由 `npx tsx scripts/s16_base_export.ts` 生成
  src/data/s16Results.json   手工登记：哪些队已经出局、名次、出局日期；还有各阶段的日期
  src/data/s16Ratings.json   上一次的结果（已定格的条目原样保留，永远不重算）
  src/engine/cards.ts        金银铜的线 GOLD_AT / SILVER_AT（和普通卡同一条线）
写：
  src/data/s16Ratings.json   （--dry-run 时只打印，不写）

规则（站长 2026-10-10）：
  * 战队还在比赛 → 五张卡都是「?」（文件里没有条目）。战队出局（登记进 s16Results.json）→ 这五个人的数值、
    金银铜、八项属性、箭头全部写进文件并定格，以后普通卡怎么调都不再变。
  * 评分按名次分档（站长 2026-10-19：先出局的给后面的队、给冠军留空间）：
    评分 = 档中心 + 0.6 ×（普通卡评分 + 表现分（±6） − 80），四舍五入，夹在 [50, 档封顶]。
    档中心/封顶：入围赛 68/74、瑞士轮 75/82、八强 79/86、四强 82/88、亚军 84/89、冠军 86/90。
    FMVP 彩卡另算（引擎里 94–97）。
  * 表现分：每局和对面同位置的人比（15 分钟经济/经验/补刀差、伤害占比差、参团率差、死亡差、分均视野差、
    经济占比差），按位置加权成「单局表现」；扣掉按两人普通卡差距本来就该有的优势；每局按对手全队普通卡均值加权
    （打弱队的局几乎不算）；再按有效局数收缩（打得越多越可信）。
  * 金银铜按普通卡的固定线（≥ GOLD_AT 金、≥ SILVER_AT 银），不按名次——先揭晓的队不会被后面的结果改档。
  * 卡面箭头 prev = 普通卡评分（「90 ▲4」= 比他的普通卡高 4）。
  * 一局没上的（替补）：表现按 0 算，和队友进同一档。

只用 Python 3.12 标准库。细节和每个常数的来历见 scripts/S16_RATINGS_README.md。
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BASE_JSON = HERE / "s16_base.json"
RATINGS_JSON = ROOT / "src" / "data" / "s16Ratings.json"
RESULTS_JSON = ROOT / "src" / "data" / "s16Results.json"
ROSTER_JSON = ROOT / "src" / "data" / "s16.json"
CARDS_TS = ROOT / "src" / "engine" / "cards.ts"

WORLDS_LEAGUE = "WLDs"

# --- tunables（2025 世界赛回测定的，见 README「常数」一节）------------------------------
CARD_MIN, CARD_MAX = 50, 90
# 站长 2026-10-19：先出局的队要给后面的队、给冠军留空间（冠军 90 上下，75–90 留给走得远的队）。
# 每个名次一个档：中心 = 普通卡 80、表现 0 的人在这一档拿几分；封顶 = 这一档最高几分。
# 评分 = 中心 + SPREAD ×（普通卡 + 表现分 − 80），夹在 [50, 封顶]：同一档里强的人还是比弱的人高，只是整档往下压。
PLACEMENT_BAND = {
    "playin": (68, 74), "swiss": (75, 82), "qf": (79, 86), "sf": (82, 88), "runnerup": (84, 89), "champion": (86, 90),
}
BAND_PIVOT = 80.0       # 普通卡 80 的人落在档的中心
SPREAD = 0.6            # 普通卡 / 表现差 1 分，S16 差 0.6 分（把 66–90 的普通卡压进一档）
PLACEMENT_CN = {"champion": "冠军", "runnerup": "亚军", "sf": "四强", "qf": "八强", "swiss": "瑞士轮出局", "playin": "入围赛出局"}
PLACEMENT_ORDER = ("playin", "swiss", "qf", "sf", "runnerup", "champion")
PLACEMENT_MAX_TEAMS = {"champion": 1, "runnerup": 1, "sf": 2, "qf": 4}

PERF_SCALE = 10.0       # 表现分 = PERF_SCALE × 收缩后的平均单局表现（单局表现的标准差 = 1）
PERF_CAP = 6.0          # 表现分夹在 ±6
SHRINK_K = 5.0          # 收缩：相当于先放 5 局「表现 0」的满权重对局；有效局数 n → 可信度 n/(n+5)
OPP_FLOOR, OPP_REF = 72.0, 84.0   # 对手全队普通卡均值 → 这局的权重 (均值 − 72)/(84 − 72)：84 记 1，78 记 0.5
OPP_W_MIN, OPP_W_MAX = 0.10, 1.25
EXPECT_PER_PT = 0.03    # 每差 1 分普通卡，单局表现「本来就该」高 0.03（2025 回测里的回归斜率）
UNKNOWN_BASE = 78.0     # 对面上了名单外的人（替补没登记）时，按 78 估他的普通卡
Z_CLIP = 3.0
STAGE_WEIGHT = {"playin": 1.0, "swiss": 1.0, "ko": 1.5, "final": 2.0}

ROLE_TO_POS = {"上单": "top", "打野": "jng", "中单": "mid", "下路": "bot", "辅助": "sup"}
POSITIONS = ("top", "jng", "mid", "bot", "sup")

# 和对位比的八项（每项都是「我 − 对面」，死亡是「对面 − 我」，越大越好）
METRICS = ("gd15", "xpd15", "csd15", "dmgshare", "kp", "deaths", "vspm", "egs")
WEIGHTS = {  # 每行和为 1。辅助看参团/视野/少死，上中下看对线和伤害
    "top": {"gd15": .18, "xpd15": .10, "csd15": .10, "dmgshare": .20, "kp": .10, "deaths": .16, "vspm": .04, "egs": .12},
    "jng": {"gd15": .12, "xpd15": .12, "csd15": .04, "dmgshare": .10, "kp": .20, "deaths": .16, "vspm": .16, "egs": .10},
    "mid": {"gd15": .16, "xpd15": .10, "csd15": .10, "dmgshare": .20, "kp": .12, "deaths": .16, "vspm": .04, "egs": .12},
    "bot": {"gd15": .16, "xpd15": .06, "csd15": .12, "dmgshare": .22, "kp": .10, "deaths": .18, "vspm": .02, "egs": .14},
    "sup": {"gd15": .10, "xpd15": .10, "csd15": .00, "dmgshare": .04, "kp": .24, "deaths": .22, "vspm": .26, "egs": .04},
}
# 每项「我 − 对面」的标准差（2025 年 LCK/LEC/LTA 南北/LCP/MSI/世界赛数据完整的 1752 局），固定写死：
# 先出局的队和后出局的队用同一把尺子，不随赛事里的对局多少而变
SCALES = {
    "top": {"gd15": 759.1, "xpd15": 717.3, "csd15": 17.6, "dmgshare": 0.0868, "kp": 0.2725, "deaths": 2.9, "vspm": 0.3372, "egs": 0.0429},
    "jng": {"gd15": 646.7, "xpd15": 701.3, "csd15": 15.0, "dmgshare": 0.0674, "kp": 0.2422, "deaths": 3.2, "vspm": 0.4699, "egs": 0.0355},
    "mid": {"gd15": 693.7, "xpd15": 603.1, "csd15": 14.7, "dmgshare": 0.0873, "kp": 0.2638, "deaths": 2.8, "vspm": 0.3731, "egs": 0.0409},
    "bot": {"gd15": 773.1, "xpd15": 624.1, "csd15": 15.2, "dmgshare": 0.0835, "kp": 0.2583, "deaths": 2.6, "vspm": 0.4417, "egs": 0.0413},
    "sup": {"gd15": 392.9, "xpd15": 502.8, "csd15": 7.6, "dmgshare": 0.0424, "kp": 0.2452, "deaths": 3.2, "vspm": 0.5622, "egs": 0.0209},
}
# 加权合成后的标准差（同一批对局），除掉它，单局表现的标准差就是 1
INDEX_SD = {"top": 0.636, "jng": 0.606, "mid": 0.616, "bot": 0.624, "sup": 0.608}

# OE 的 playername（小写、去掉空格符号后）→ 名单上的 ign。大小写和空格差异已自动处理，这里只放真正拼法不同的。
ALIASES: dict[str, str] = {
    "shadow": "Shad0w",
    "jojo": "Jojopyun",
    "hans": "Hans Sama",
}


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z]", "", s.lower())


def fnum(v) -> float | None:
    if v is None:
        return None
    v = str(v).strip()
    if v == "":
        return None
    try:
        x = float(v)
    except ValueError:
        return None
    return x if math.isfinite(x) else None


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def round_half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def metal_thresholds(path: Path = CARDS_TS) -> tuple[int, int]:
    """GOLD_AT / SILVER_AT straight from the engine, so the S16 metals use the ordinary cards' lines."""
    src = path.read_text(encoding="utf-8")
    g = re.search(r"export const GOLD_AT\s*=\s*(\d+)", src)
    s = re.search(r"export const SILVER_AT\s*=\s*(\d+)", src)
    if not g or not s:
        sys.exit(f"{path}: GOLD_AT / SILVER_AT not found")
    return int(g.group(1)), int(s.group(1))


def metal_of(rating: int, gold_at: int, silver_at: int) -> str:
    return "gold" if rating >= gold_at else "silver" if rating >= silver_at else "bronze"


# --- reading -------------------------------------------------------------------
def local_day(date_str: str, tz_hours: float) -> str:
    """OE 的 date 是 UTC（'2025-10-15 05:12:00'）；换成 tz 时区的日期作为「比赛日」。"""
    s = (date_str or "").strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            t = datetime.strptime(s[:19], fmt)
            break
        except ValueError:
            continue
    else:
        return s[:10]
    return (t + timedelta(hours=tz_hours)).strftime("%Y-%m-%d")


LATEST_DATE = ""  # the newest date anywhere in the CSV (any league) — shows how far OE has got


def read_worlds_rows(path: Path, year: int | None, since: str | None, until: str | None, tz: float,
                     league: str = WORLDS_LEAGUE) -> list[dict]:
    """Player rows of the Worlds event (league WLDs) within [since, until] (match-day dates in tz)."""
    global LATEST_DATE
    rows: list[dict] = []
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        need = {"league", "date", "gameid", "playername", "teamname", "position", "result", "kills", "deaths", "assists"}
        missing = need - set(reader.fieldnames or [])
        if missing:
            sys.exit(f"{path}: missing columns {sorted(missing)}")
        for r in reader:
            dt = (r.get("date") or "")[:19]
            if dt > LATEST_DATE:
                LATEST_DATE = dt
            if r.get("league") != league:
                continue
            if year is not None and (r.get("year") or "").strip() not in ("", str(year)):
                continue
            if (r.get("position") or "").strip() not in POSITIONS:
                continue
            day = local_day(r.get("date") or "", tz)
            if since and day < since:
                continue
            if until and day > until:
                continue
            r["_day"] = day
            rows.append(r)
    return rows


def _raw(r: dict) -> dict[str, float | None]:
    k, d, a = fnum(r.get("kills")) or 0.0, fnum(r.get("deaths")) or 0.0, fnum(r.get("assists")) or 0.0
    tk = fnum(r.get("teamkills"))
    return {
        "kp": ((k + a) / tk) if tk and tk > 0 else (0.0 if tk == 0 else None),
        "deaths": d,
        "dmgshare": fnum(r.get("damageshare")),
        "vspm": fnum(r.get("vspm")),
        "egs": fnum(r.get("earnedgoldshare")),
        "gd15": fnum(r.get("golddiffat15")),
        "xpd15": fnum(r.get("xpdiffat15")),
        "csd15": fnum(r.get("csdiffat15")),
    }


def pair_rows(rows: list[dict]) -> list[dict]:
    """Attach r['_opp'] (the opposing row in his position, same game) and r['_mates'] (his team's five rows)."""
    by_game: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_game[r["gameid"]].append(r)
    out = []
    for gid, rs in by_game.items():
        teams: dict[str, list[dict]] = defaultdict(list)
        for r in rs:
            teams[r.get("teamname") or r.get("side") or ""].append(r)
        if len(teams) != 2:
            continue
        (ta, ra), (tb, rb) = teams.items()
        for mine, theirs in ((ra, rb), (rb, ra)):
            opp_by_pos = {x["position"]: x for x in theirs}
            for r in mine:
                o = opp_by_pos.get(r["position"])
                if o is None:
                    continue
                r["_opp"] = o
                r["_mates"] = mine
                r["_foes"] = theirs
                out.append(r)
    return out


def diffs(r: dict) -> dict[str, float | None]:
    """「我 − 对面同位置」for each metric (deaths: 对面 − 我). The @15 columns in OE are already vs the lane opponent."""
    me, op = _raw(r), _raw(r["_opp"])
    out: dict[str, float | None] = {}
    for m in METRICS:
        if m in ("gd15", "xpd15", "csd15"):
            out[m] = me[m]
        elif m == "deaths":
            out[m] = op[m] - me[m]
        else:
            out[m] = (me[m] - op[m]) if me[m] is not None and op[m] is not None else None
    return out


def game_index(r: dict) -> float:
    """Per-game index vs his lane opponent: weighted, clipped z of the eight diffs, scaled to sd 1."""
    pos = r["position"]
    d = diffs(r)
    tot, wsum = 0.0, 0.0
    for m in METRICS:
        w = WEIGHTS[pos][m]
        v = d[m]
        if w <= 0 or v is None:
            continue
        tot += w * clamp(v / SCALES[pos][m], -Z_CLIP, Z_CLIP)
        wsum += w
    if wsum <= 0:
        return 0.0
    # missing columns (partial data) → average over what is there, weights renormalised
    return (tot / wsum) / INDEX_SD[pos]


# --- the model -------------------------------------------------------------------
def opp_weight(opp_avg: float) -> float:
    return clamp((opp_avg - OPP_FLOOR) / (OPP_REF - OPP_FLOOR), OPP_W_MIN, OPP_W_MAX)


def stage_of(day: str, stages: dict[str, list[str]]) -> str | None:
    for stage, (lo, hi) in stages.items():
        if lo <= day <= hi:
            return stage
    return None


def performance(games: list[dict], base_of, stages: dict[str, list[str]]) -> dict:
    """games: his paired rows. base_of(row) → that player's ordinary rating (or UNKNOWN_BASE).
    Returns {perf, n_eff, raw, games} — perf already scaled to rating points and capped at ±PERF_CAP."""
    num, wsum = 0.0, 0.0
    for g in games:
        idx = game_index(g)
        # 本来就该有的优势：他比对位强多少分，单局表现就该高 EXPECT_PER_PT × 分差
        expect = EXPECT_PER_PT * (base_of(g) - base_of(g["_opp"]))
        opp_avg = sum(base_of(x) for x in g["_foes"]) / max(1, len(g["_foes"]))
        w = opp_weight(opp_avg) * STAGE_WEIGHT.get(stage_of(g["_day"], stages) or "", 1.0)
        g["_idx"], g["_exp"], g["_w"], g["_oppavg"] = idx, expect, w, opp_avg
        num += w * (idx - expect)
        wsum += w
    shrunk = num / (wsum + SHRINK_K) if (wsum + SHRINK_K) > 0 else 0.0
    perf = clamp(PERF_SCALE * shrunk, -PERF_CAP, PERF_CAP)
    raw = num / wsum if wsum > 0 else 0.0
    return {"perf": perf, "n_eff": wsum, "raw": raw, "games": len({g["gameid"] for g in games})}


def rate_player(base_rating: int, perf: float, placement: str, champion: bool) -> int:
    center, cap = PLACEMENT_BAND[placement]
    x = center + SPREAD * (base_rating + perf - BAND_PIVOT)
    return int(clamp(round_half_up(x), CARD_MIN, min(cap, CARD_MAX)))


def make_entry(ign: str, b: dict, rating: int, games: int, placement: str, out_day: str,
               perf: float, gold_at: int, silver_at: int) -> dict:
    shift = rating - int(b["rating"])
    return {
        "rating": rating,
        "rarity": metal_of(rating, gold_at, silver_at),
        "games": games,
        "prev": int(b["rating"]),          # 卡面箭头：比普通卡高/低多少
        "attrs": {k: int(clamp(round_half_up(a + shift), 1, 99)) for k, a in b["attrs"].items()},
        "placement": placement,
        "out": out_day,
        "perf": round(perf, 2),
        "place": PLACEMENT_BAND[placement][0],   # 这一档的中心（普通卡 80、表现 0 的人拿几分）
    }


# --- CLI helpers -------------------------------------------------------------------
def load_json(path: Path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def make_resolver(base: dict[str, dict], roster: dict, unmatched: dict, mismatched: dict):
    by_norm = {norm(ign): ign for ign in base}
    team_to_club: dict[str, str] = {}
    for t in roster.get("teams", []):
        team_to_club[norm(t.get("name", ""))] = t["club"]
        if t.get("tag"):
            team_to_club.setdefault(norm(t["tag"]), t["club"])

    def resolve(r: dict) -> str | None:
        name = r.get("playername") or ""
        key = norm(name)
        ign = by_norm.get(key) or (ALIASES.get(key) if ALIASES.get(key) in base else None)
        if not ign:
            unmatched[(name, r.get("teamname", ""))] = unmatched.get((name, r.get("teamname", "")), 0) + 1
            return None
        club = team_to_club.get(norm(r.get("teamname") or ""))
        if club and club != base[ign].get("club"):
            # 同名不同队（别的赛区也有叫 Bin 的）或者换队了：不算，报出来人工看
            mismatched[(name, r.get("teamname", ""), ign)] = mismatched.get((name, r.get("teamname", ""), ign), 0) + 1
            return None
        return ign

    return resolve


def club_of_row(r: dict, roster: dict) -> str | None:
    key = norm(r.get("teamname") or "")
    for t in roster.get("teams", []):
        if key in (norm(t.get("name", "")), norm(t.get("tag") or "")):
            return t["club"]
    return None


def validate_results(results: dict, roster: dict) -> list[str]:
    errs = []
    clubs = {t["club"] for t in roster.get("teams", [])}
    teams = results.get("teams") or {}
    count: dict[str, int] = defaultdict(int)
    for club, t in teams.items():
        if club not in clubs:
            errs.append(f"s16Results.json: {club} 不是名单里的俱乐部 id")
        p = (t or {}).get("placement")
        if p not in PLACEMENT_BAND:
            errs.append(f"s16Results.json: {club} 的 placement「{p}」不认识（可选：{', '.join(PLACEMENT_ORDER)}）")
        else:
            count[p] += 1
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str((t or {}).get("out") or "")):
            errs.append(f"s16Results.json: {club} 的 out 要写出局那天的日期 YYYY-MM-DD（北京时间）")
    for p, mx in PLACEMENT_MAX_TEAMS.items():
        if count[p] > mx:
            errs.append(f"s16Results.json: {PLACEMENT_CN[p]} 登记了 {count[p]} 支队（最多 {mx}）")
    for stage, rng in (results.get("stages") or {}).items():
        if stage not in STAGE_WEIGHT or not isinstance(rng, list) or len(rng) != 2:
            errs.append(f"s16Results.json: stages.{stage} 要写成 [\"开始\", \"结束\"]，阶段只认 {', '.join(STAGE_WEIGHT)}")
    return errs


def run(args) -> dict:
    """The whole update. Returns the output document (also written unless --dry-run)."""
    roster = load_json(Path(args.roster), {"teams": [], "players": [], "meta": {}})
    base = load_json(Path(args.base), None)
    if not base:
        sys.exit(f"{args.base} 不存在或为空：先跑 `npx tsx scripts/s16_base_export.ts`")
    results = load_json(Path(args.results), {"stages": {}, "teams": {}})
    old = load_json(Path(args.out), {"meta": {}, "ratings": {}})
    gold_at, silver_at = metal_thresholds(Path(args.cards))
    errs = validate_results(results, roster)
    if errs:
        sys.exit("\n".join(errs))
    stages = results.get("stages") or {}
    teams_out: dict[str, dict] = results.get("teams") or {}
    since = args.since or (roster.get("meta") or {}).get("start")

    roster_by_club: dict[str, list[dict]] = defaultdict(list)
    for p in roster.get("players", []):
        roster_by_club[p["club"]].append(p)
    team_name = {t["club"]: t.get("tag") or t.get("name") or t["club"] for t in roster.get("teams", [])}
    missing_base = [p["ign"] for p in roster.get("players", []) if p["ign"] not in base]
    if missing_base:
        sys.exit(f"s16_base.json 里没有：{', '.join(missing_base)}——名单改过就重跑 `npx tsx scripts/s16_base_export.ts`")

    champion = next((c for c, t in teams_out.items() if t["placement"] == "champion"), None)
    if args.champion and args.champion != champion:
        sys.exit(f"--champion {args.champion} 和 s16Results.json 里登记的冠军（{champion or '还没登记'}）对不上")
    if args.fmvp:
        if args.fmvp not in base:
            sys.exit(f"--fmvp {args.fmvp}: 名单里没有这个 ign（注意大小写）")
        if teams_out.get(base[args.fmvp].get("club"), {}).get("placement") not in ("champion", "runnerup"):
            sys.exit(f"--fmvp {args.fmvp}: 他的队还没在 s16Results.json 里登记成冠军/亚军")
    if args.final:
        alive = [team_name[c] for c in roster_by_club if c not in teams_out]
        if alive:
            sys.exit(f"--final：这些队还没登记名次：{', '.join(alive)}")

    old_ratings: dict[str, dict] = dict(old.get("ratings") or {})
    for club in args.unfreeze:
        for p in roster_by_club.get(club, []):
            old_ratings.pop(p["ign"], None)
    refreeze = set(args.refreeze)

    rows = read_worlds_rows(Path(args.oe), args.year, since, args.until, args.tz)
    paired = pair_rows(rows)
    days = sorted({r["_day"] for r in rows})
    last_day = days[-1] if days else None

    unmatched: dict = {}
    mismatched: dict = {}
    resolve = make_resolver(base, roster, unmatched, mismatched)
    for r in rows:
        r["_ign"] = resolve(r)

    def base_of(r: dict) -> float:
        ign = r.get("_ign")
        return float(base[ign]["rating"]) if ign else UNKNOWN_BASE

    per: dict[str, list[dict]] = defaultdict(list)
    for r in paired:
        if r.get("_ign"):
            per[r["_ign"]].append(r)
    last_game_of_club: dict[str, str] = {}
    for r in rows:
        c = club_of_row(r, roster)
        if c and r["_day"] > last_game_of_club.get(c, ""):
            last_game_of_club[c] = r["_day"]

    log: list[str] = []
    ratings: dict[str, dict] = {}
    detail: dict[str, dict] = {}
    frozen_now: list[str] = []
    waiting: list[str] = []
    for club, players in roster_by_club.items():
        t = teams_out.get(club)
        already = [p for p in players if p["ign"] in old_ratings]
        if t is None:
            if already:
                # 文件里已经定格了，但结果表里删掉了这队：不动（定格是永久的）。登记错了就用 --unfreeze 撤销
                log.append(f"注意：{team_name[club]} 已经定格，但 s16Results.json 里没有它了——保持定格不动；确实登记错了用 --unfreeze {club}")
                for p in already:
                    ratings[p["ign"]] = old_ratings[p["ign"]]
            continue
        todo = [p for p in players if p["ign"] not in old_ratings or club in refreeze]
        for p in players:
            if p not in todo:
                ratings[p["ign"]] = old_ratings[p["ign"]]
        if not todo:
            continue
        out_day = t["out"]
        if last_game_of_club.get(club, "") > out_day:
            log.append(f"注意：{team_name[club]} 登记 {out_day} 出局，但 OE 里 {last_game_of_club[club]} 还有它的比赛——检查 s16Results.json")
        if (last_day or "") < out_day and not args.force:
            waiting.append(f"{team_name[club]}（{out_day} 出局，OE 只到 {last_day or '无'}）")
            for p in todo:
                if p["ign"] in old_ratings:
                    ratings[p["ign"]] = old_ratings[p["ign"]]
            continue
        for p in todo:
            ign = p["ign"]
            b = base[ign]
            games = [g for g in per.get(ign, []) if g["_day"] <= out_day]
            if games:
                pf = performance(games, base_of, stages)
                rating = rate_player(int(b["rating"]), pf["perf"], t["placement"], club == champion)
            else:
                # 一局没上（替补）：表现按 0 算，和队友进同一档
                pf = {"perf": 0.0, "n_eff": 0.0, "raw": 0.0, "games": 0}
                rating = rate_player(int(b["rating"]), 0.0, t["placement"], club == champion)
            ratings[ign] = make_entry(ign, b, rating, pf["games"], t["placement"], out_day, pf["perf"], gold_at, silver_at)
            detail[ign] = pf
        frozen_now.append(team_name[club])

    fmvp = args.fmvp if args.fmvp else old.get("fmvp")
    fmvp_rating = args.fmvp_rating if args.fmvp_rating is not None else old.get("fmvpRating")
    if fmvp and fmvp not in ratings:
        log.append(f"注意：FMVP {fmvp} 的卡还没定格，先不标彩卡")
        fmvp, fmvp_rating = None, None
    done_clubs = sorted({base[i]["club"] for i in ratings})
    out = {
        "meta": {
            "updatedAt": last_day,
            "eliminated": len([c for c in roster_by_club if c in teams_out]),
            "revealed": len(ratings),
            "final": len(done_clubs) == len(roster_by_club) and len(roster_by_club) > 0,
            "note": "由 scripts/s16_ratings.py 生成：战队出局（src/data/s16Results.json）时这队五人定格，之后永远不变；"
                    "prev = 普通卡评分（卡面箭头）；没有条目的选手卡面全是「?」",
        },
        "ratings": {ign: ratings[ign] for ign in sorted(ratings, key=lambda i: (-ratings[i]["rating"], i.lower()))},
        "champion": champion,
        "fmvp": fmvp,
        "fmvpRating": fmvp_rating,
    }
    report = {
        "rows": rows, "days": days, "unmatched": unmatched, "mismatched": mismatched, "log": log,
        "frozen_now": frozen_now, "waiting": waiting, "detail": detail, "base": base, "roster": roster,
        "team_name": team_name, "teams_out": teams_out,
    }
    return {"out": out, "report": report}


def print_report(res: dict, args, file=None) -> None:
    file = file or sys.stdout
    out, rep = res["out"], res["report"]
    rows, days = rep["rows"], rep["days"]
    p = lambda *a: print(*a, file=file)
    p(f"OE: {args.oe}（文件里最新的一局：{LATEST_DATE or '无'} UTC）")
    p(f"世界赛对局（{WORLDS_LEAGUE}，{args.since or '开幕日'} → {args.until or '…'}，tz={args.tz:+g}）："
      f"{len({r['gameid'] for r in rows})} 局，{len(days)} 个比赛日（最后一天 {days[-1] if days else '无'}）")
    if rep["unmatched"]:
        p(f"\n对不上名单的世界赛选手（{len(rep['unmatched'])}）——是名单漏了人，还是要加 ALIASES：")
        for (name, team), c in sorted(rep["unmatched"].items(), key=lambda kv: (kv[0][1], kv[0][0])):
            p(f"  {name:<16} {team:<28} {c} 局")
    if rep["mismatched"]:
        p("\n名字对上了、队伍对不上（没算）：")
        for (name, team, ign), c in sorted(rep["mismatched"].items()):
            p(f"  OE {name} @ {team} ≠ 名单 {ign} @ {rep['base'][ign].get('club')}  {c} 局")
    if not rows:
        p("还没有世界赛数据（赛事没开始，或 OE 还没更新）——只保留已经定格的卡。")
    for line in rep["log"]:
        p(line)
    if rep["waiting"]:
        p(f"\n登记了出局、但 OE 还没更新到出局那天，这次先不定格（OE 更新后再跑；确认要定格加 --force）：")
        for w in rep["waiting"]:
            p(f"  {w}")
    p(f"\n这次新定格：{'、'.join(rep['frozen_now']) or '无'}")
    p(f"已揭晓 {out['meta']['revealed']} 人，{out['meta']['eliminated']} 支队已出局登记\n")
    hdr = f"{'ign':<13}{'team':<7}{'名次':<8}{'局':>3}{'有效':>6}{'普通卡':>6}{'表现':>6}{'档中心':>6}{'S16':>5}{'箭头':>6}  金属"
    p(hdr)
    p("-" * 78)
    det = rep["detail"]
    for ign, v in out["ratings"].items():
        if ign not in det:
            continue
        club = rep["base"][ign]["club"]
        d = v["rating"] - v["prev"]
        arrow = "—" if d == 0 else (f"▲{d}" if d > 0 else f"▼{-d}")
        p(f"{ign:<13}{rep['team_name'].get(club, club):<7}{PLACEMENT_CN[v['placement']]:<8}{v['games']:>3}"
          f"{det[ign]['n_eff']:>6.1f}{v['prev']:>6}{v['perf']:>+6.1f}{v['place']:>6d}{v['rating']:>5}{arrow:>6}  {v['rarity']}")


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="S16 世界赛卡：出局的队定格最终数值")
    ap.add_argument("--oe", required=True, help="Oracle's Elixir 当年 CSV，如 .../2026_OE.csv")
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--since", default=None, help="只算这天（含）之后的世界赛对局；默认读名单的 meta.start（开幕日）")
    ap.add_argument("--until", default=None, help="只算到这天（含），用于回放")
    ap.add_argument("--champion", default=None, help="（可不填）核对用：冠军俱乐部 id，必须和 s16Results.json 一致")
    ap.add_argument("--fmvp", default=None, help="FMVP 的 ign；引擎把他的卡做成彩卡。之后不填会沿用上次的")
    ap.add_argument("--fmvp-rating", type=int, default=None, help="FMVP 彩卡评分，94–97，不填按 95")
    ap.add_argument("--final", action="store_true", help="决赛后的最后一次：核对所有队都登记了名次")
    ap.add_argument("--refreeze", default="", help="重新计算这些已定格的队（俱乐部 id，逗号分隔）——只在登记错了、要更正时用")
    ap.add_argument("--unfreeze", default="", help="撤销这些队的定格（卡面回到「?」）——只在登记错了时用")
    ap.add_argument("--force", action="store_true", help="OE 还没更新到出局那天也照样定格（会漏掉最后那场的数据）")
    ap.add_argument("--tz", type=float, default=8.0, help="比赛日按哪个时区划分（默认 8 = 北京时间；OE 原始时间是 UTC）")
    ap.add_argument("--base", default=str(BASE_JSON))
    ap.add_argument("--roster", default=str(ROSTER_JSON))
    ap.add_argument("--results", default=str(RESULTS_JSON))
    ap.add_argument("--cards", default=str(CARDS_TS))
    ap.add_argument("--out", default=str(RATINGS_JSON))
    ap.add_argument("--dry-run", action="store_true", help="只打印，不写文件")
    args = ap.parse_args(argv)
    args.refreeze = [c.strip() for c in args.refreeze.split(",") if c.strip()]
    args.unfreeze = [c.strip() for c in args.unfreeze.split(",") if c.strip()]

    res = run(args)
    print_report(res, args)
    if args.dry_run:
        print("\n--dry-run：没有写文件。")
        return 0
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(res["out"], f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"\n已写入 {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
