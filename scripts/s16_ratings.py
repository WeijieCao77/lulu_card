#!/usr/bin/env python3
"""S16 世界赛系列：每个比赛日后，按选手的世界赛对局重算卡面数值（虎扑选手股的玩法）。

    python scripts/s16_ratings.py --oe <2026_OE.csv> --year 2026 --since 2026-10-15 \
        [--until 2026-11-14] [--stage-dates playin:2026-10-15..2026-10-19,swiss:...,ko:...,final:2026-11-14] \
        [--champion T18] [--fmvp Chovy] [--tz 8] [--dry-run]

读：
  scripts/s16_base.json      每位名单选手的普通卡（先验），由 `npx tsx scripts/s16_base_export.ts` 生成
  src/data/s16Ratings.json   上一次的结果（取 prev，卡面上的 ↑↓）
写：
  src/data/s16Ratings.json   （--dry-run 时只打印表格，不写）

算法（详见 scripts/S16_RATINGS_README.md）：
  1. 每局每人取 KDA、参团率、分均伤害、伤害占比、15 分钟经济/补刀/经验差、分均视野、胜负，
     对本届世界赛同位置的全部对局做 z 分（截断在 ±3），按位置权重加权，再在同位置内重新标准化
     → 单局表现分（均值 0、标准差 1）。
  2. 选手的世界赛 z = 单局表现分的加权平均（入围赛/瑞士轮 ×1，八强/四强 ×1.5，决赛 ×2）。
  3. 世界赛评分 = clamp(80 + 12z, 55, 90)（原案 78 + 6z，2025 回测后放大，见 README）；与普通卡评分混合：w = 局数/(局数+2)，
     评分 = round(w·世界赛 + (1−w)·普通卡)。5 局后世界赛占 ~0.71。
  4. 冠军队（--champion）每人 +2，封顶 90。--fmvp 写入顶层 fmvp（引擎把那张卡做成彩卡，评分按 --fmvp-rating 94–97，不填 95，不受 90 封顶）。
  5. 金属按已亮相选手的名次：前 25% 金、再 35% 银、其余铜；同分取更好的那档。
  6. 八项属性 = 普通卡属性 + (新评分 − 普通卡评分)，各自夹在 1..99。

只用 Python 3.12 标准库。
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BASE_JSON = HERE / "s16_base.json"
RATINGS_JSON = ROOT / "src" / "data" / "s16Ratings.json"
ROSTER_JSON = ROOT / "src" / "data" / "s16.json"

WORLDS_LEAGUE = "WLDs"

# --- tunables -----------------------------------------------------------------
CENTER = 80.0          # 世界赛评分的中心：本届同位置平均水平（世界赛选手普通卡均值约 81–82）
SCALE = 12.0           # 每 1 个「单局标准差」= 12 分。选手多局平均后的 z 只有 ±0.4 左右，6 分太平（2025 回测）
WORLDS_MIN, WORLDS_MAX = 55, 90
BLEND_K = 2.0          # w = games / (games + BLEND_K)
CARD_MIN, CARD_MAX = 50, 90
CHAMPION_BONUS = 2
GOLD_SHARE, SILVER_SHARE = 0.25, 0.35
Z_CLIP = 3.0
STAGE_WEIGHT = {"playin": 1.0, "swiss": 1.0, "group": 1.0, "ko": 1.5, "qf": 1.5, "sf": 1.5, "final": 2.0}

ROLE_TO_POS = {"上单": "top", "打野": "jng", "中单": "mid", "下路": "bot", "辅助": "sup"}
POSITIONS = ("top", "jng", "mid", "bot", "sup")

# 每个位置的指标权重（每行和为 1）。视野对打野/辅助更重，伤害对上中下更重。
METRICS = ("kda", "kp", "dpm", "dmgshare", "gd15", "csd15", "xpd15", "vspm", "result")
WEIGHTS = {
    "top": {"kda": .18, "kp": .08, "dpm": .16, "dmgshare": .14, "gd15": .14, "csd15": .10, "xpd15": .08, "vspm": .02, "result": .10},
    "jng": {"kda": .18, "kp": .16, "dpm": .08, "dmgshare": .06, "gd15": .12, "csd15": .04, "xpd15": .10, "vspm": .14, "result": .12},
    "mid": {"kda": .18, "kp": .10, "dpm": .16, "dmgshare": .14, "gd15": .12, "csd15": .10, "xpd15": .08, "vspm": .02, "result": .10},
    "bot": {"kda": .20, "kp": .10, "dpm": .18, "dmgshare": .16, "gd15": .12, "csd15": .10, "xpd15": .02, "vspm": .02, "result": .10},
    "sup": {"kda": .22, "kp": .20, "dpm": .04, "dmgshare": .02, "gd15": .08, "csd15": .00, "xpd15": .08, "vspm": .24, "result": .12},
}

# OE 的 playername（小写、去掉空格符号后）→ 名单上的 ign。大小写和空格差异已自动处理，这里只放真正拼法不同的。
ALIASES: dict[str, str] = {
    "shadow": "Shad0w",
    "jojo": "Jojopyun",
    "hans": "Hans Sama",
}


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z]", "", s.lower())


def fnum(v: str) -> float | None:
    if v is None:
        return None
    v = v.strip()
    if v == "":
        return None
    try:
        x = float(v)
    except ValueError:
        return None
    return x if math.isfinite(x) else None


# --- reading -------------------------------------------------------------------
def parse_stage_dates(spec: str | None) -> list[tuple[str, str, str]]:
    """'playin:2026-10-15..2026-10-19,ko:2026-10-29..2026-11-08,final:2026-11-14' → [(stage, from, to)]"""
    out: list[tuple[str, str, str]] = []
    if not spec:
        return out
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        stage, _, rng = part.partition(":")
        stage = stage.strip().lower()
        if stage not in STAGE_WEIGHT:
            sys.exit(f"--stage-dates: unknown stage '{stage}' (known: {', '.join(STAGE_WEIGHT)})")
        lo, _, hi = rng.partition("..")
        lo, hi = lo.strip(), (hi.strip() or lo.strip())
        for d in (lo, hi):
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
                sys.exit(f"--stage-dates: bad date '{d}' in '{part}'")
        out.append((stage, lo, hi))
    return out


def stage_of(day: str, stages: list[tuple[str, str, str]]) -> str:
    for stage, lo, hi in stages:
        if lo <= day <= hi:
            return stage
    return "?"


def local_day(date_str: str, tz_hours: float) -> str:
    """OE 的 date 是 UTC（'2025-10-15 05:12:00'）；换成 tz 时区的日期作为「比赛日」。"""
    s = date_str.strip()
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


def read_worlds_rows(path: Path, year: int | None, since: str | None, until: str | None, tz: float) -> list[dict]:
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
            if r.get("league") != WORLDS_LEAGUE:
                continue
            if year is not None and (r.get("year") or "").strip() not in ("", str(year)):
                continue
            pos = (r.get("position") or "").strip()
            if pos not in POSITIONS:
                continue
            day = local_day(r.get("date") or "", tz)
            if since and day < since:
                continue
            if until and day > until:
                continue
            r["_day"] = day
            rows.append(r)
    return rows


def game_metrics(r: dict) -> dict[str, float | None]:
    k, d, a = fnum(r.get("kills")) or 0, fnum(r.get("deaths")) or 0, fnum(r.get("assists")) or 0
    tk = fnum(r.get("teamkills"))
    return {
        # log 压掉 15/0/10 这种局的极端值
        "kda": math.log1p((k + a) / max(1.0, d)),
        "kp": ((k + a) / tk) if tk and tk > 0 else None,
        "dpm": fnum(r.get("dpm")),
        "dmgshare": fnum(r.get("damageshare")),
        "gd15": fnum(r.get("golddiffat15")),
        "csd15": fnum(r.get("csdiffat15")),
        "xpd15": fnum(r.get("xpdiffat15")),
        "vspm": fnum(r.get("vspm")),
        "result": fnum(r.get("result")),
    }


def _mean_sd(xs: list[float]) -> tuple[float, float]:
    if not xs:
        return 0.0, 0.0
    m = sum(xs) / len(xs)
    if len(xs) < 2:
        return m, 0.0
    var = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return m, math.sqrt(var)


def score_games(rows: list[dict]) -> list[dict]:
    """Attach r['_z']: the game's performance index, standardised within its position (mean 0, sd 1)."""
    by_pos: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        r["_m"] = game_metrics(r)
        by_pos[r["position"]].append(r)
    for pos, prow in by_pos.items():
        stats = {}
        for m in METRICS:
            stats[m] = _mean_sd([r["_m"][m] for r in prow if r["_m"][m] is not None])
        comps = []
        for r in prow:
            tot, wsum = 0.0, 0.0
            for m in METRICS:
                w = WEIGHTS[pos][m]
                v = r["_m"][m]
                mu, sd = stats[m]
                if w <= 0 or v is None or sd <= 0:
                    continue
                z = max(-Z_CLIP, min(Z_CLIP, (v - mu) / sd))
                tot += w * z
                wsum += w
            r["_c"] = tot / wsum if wsum > 0 else 0.0
            comps.append(r["_c"])
        mu, sd = _mean_sd(comps)
        for r in prow:
            r["_z"] = (r["_c"] - mu) / sd if sd > 0 else 0.0
    return rows


# --- core ----------------------------------------------------------------------
def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def metal_for(ratings: dict[str, int]) -> dict[str, str]:
    """前 25% 金、再 35% 银、其余铜；同分取更好的那档。"""
    if not ratings:
        return {}
    vals = sorted(ratings.values(), reverse=True)
    n = len(vals)
    gold_cut = vals[max(1, math.ceil(n * GOLD_SHARE)) - 1]
    silver_cut = vals[max(1, math.ceil(n * (GOLD_SHARE + SILVER_SHARE))) - 1]
    out = {}
    for ign, v in ratings.items():
        out[ign] = "gold" if v >= gold_cut else "silver" if v >= silver_cut else "bronze"
    return out


def compute(rows: list[dict], prior: dict[str, dict], resolve, stages, champion: str | None,
            prev: dict[str, int | None] | None = None) -> dict:
    """rows: Worlds player rows (already filtered). prior: ign → {rating, attrs, club, role}.
    resolve(row) → roster ign or None. Returns {ign: {...}} for players with ≥ 1 game, plus diagnostics."""
    score_games(rows)
    per: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        ign = resolve(r)
        if ign:
            per[ign].append(r)
    out: dict[str, dict] = {}
    for ign, games in per.items():
        p = prior[ign]
        wsum = sum(STAGE_WEIGHT.get(stage_of(g["_day"], stages), 1.0) for g in games)
        z = sum(STAGE_WEIGHT.get(stage_of(g["_day"], stages), 1.0) * g["_z"] for g in games) / wsum
        n = len({g["gameid"] for g in games})
        worlds = clamp(CENTER + SCALE * z, WORLDS_MIN, WORLDS_MAX)
        w = n / (n + BLEND_K)
        rating = round(w * worlds + (1 - w) * p["rating"])
        if champion and p.get("club") == champion:
            rating += CHAMPION_BONUS
        rating = int(clamp(rating, CARD_MIN, CARD_MAX))
        out[ign] = {"rating": rating, "games": n, "z": z, "worlds": worlds, "prior": p["rating"],
                    "club": p.get("club"), "role": p.get("role"),
                    "teamname": games[-1].get("teamname", "")}
    metals = metal_for({k: v["rating"] for k, v in out.items()})
    for ign, v in out.items():
        v["rarity"] = metals[ign]
        shift = v["rating"] - prior[ign]["rating"]
        v["attrs"] = {k: int(clamp(round(a + shift), 1, 99)) for k, a in prior[ign]["attrs"].items()}
        v["prev"] = (prev or {}).get(ign)
    return out


# --- CLI -----------------------------------------------------------------------
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


def print_table(res: dict, base: dict, file=None):
    file = file or sys.stdout
    hdr = f"{'ign':<14}{'team':<24}{'games':>5}{'prior':>7}{'worlds':>8}{'new':>5}{'Δprev':>7}  metal"
    print(hdr, file=file)
    print("-" * len(hdr), file=file)
    for ign, v in sorted(res.items(), key=lambda kv: (-kv[1]["rating"], -kv[1]["z"])):
        d = "—" if v["prev"] is None else f"{v['rating'] - v['prev']:+d}"
        print(f"{ign:<14}{v['teamname'][:23]:<24}{v['games']:>5}{v['prior']:>7}{v['worlds']:>8.1f}{v['rating']:>5}{d:>7}  {v['rarity']}",
              file=file)


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="S16 世界赛卡面数值更新")
    ap.add_argument("--oe", required=True, help="Oracle's Elixir 当年 CSV，如 .../2026_OE.csv")
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--since", default=None, help="只算这天（含）之后的世界赛对局，YYYY-MM-DD；默认读 s16.json 的 meta.start")
    ap.add_argument("--until", default=None, help="只算到这天（含），用于回放某个比赛日")
    ap.add_argument("--stage-dates", default=None,
                    help="阶段日期：playin:A..B,swiss:A..B,ko:A..B,final:D（ko/qf/sf ×1.5，final ×2，其余 ×1）")
    ap.add_argument("--champion", default=None, help="冠军俱乐部 id，如 T18；每人 +2（封顶 90）")
    ap.add_argument("--fmvp", default=None, help="FMVP 的 ign；引擎把他的卡做成彩卡")
    ap.add_argument("--fmvp-rating", type=int, default=None, help="FMVP 彩卡评分，94–97（对标历届 S 赛 FMVP 彩卡），不填按 95")
    ap.add_argument("--final", action="store_true",
                    help="决赛打完后的最后一次：整个 S16 一场没上的选手（含替补）按普通卡（联赛）数值揭晓并定格，金银铜按普通卡的线（金 84 / 银 72）")
    ap.add_argument("--tz", type=float, default=8.0, help="比赛日按哪个时区划分（小时，默认 8 = 北京时间；OE 原始时间是 UTC）")
    ap.add_argument("--base", default=str(BASE_JSON))
    ap.add_argument("--out", default=str(RATINGS_JSON))
    ap.add_argument("--dry-run", action="store_true", help="只打印表格，不写文件")
    args = ap.parse_args(argv)

    roster = load_json(ROSTER_JSON, {"teams": [], "players": [], "meta": {}})
    since = args.since or (roster.get("meta") or {}).get("start")
    base = load_json(Path(args.base), None)
    if not base:
        sys.exit(f"{args.base} 不存在或为空：先跑 `npx tsx scripts/s16_base_export.ts`")
    for ign, b in base.items():
        b.setdefault("club", None)
    old = load_json(Path(args.out), {"meta": {}, "ratings": {}})
    stages = parse_stage_dates(args.stage_dates)
    if args.champion and args.champion not in {b.get("club") for b in base.values()}:
        sys.exit(f"--champion {args.champion}: 名单里没有这个俱乐部 id")
    if args.fmvp and args.fmvp not in base:
        sys.exit(f"--fmvp {args.fmvp}: 名单里没有这个 ign（注意大小写）")

    rows = read_worlds_rows(Path(args.oe), args.year, since, args.until, args.tz)
    days = sorted({r["_day"] for r in rows})
    games = {r["gameid"] for r in rows}
    last_day = days[-1] if days else None

    # prev：上次文件里的评分。同一个比赛日重跑时沿用上次的 prev，↑↓ 不会被抹掉。
    old_ratings = old.get("ratings") or {}
    same_day = last_day is not None and (old.get("meta") or {}).get("updatedAt") == last_day
    prev = {ign: (v.get("prev") if same_day else v.get("rating")) for ign, v in old_ratings.items()}

    unmatched: dict = {}
    mismatched: dict = {}
    resolve = make_resolver(base, roster, unmatched, mismatched)
    res = compute(rows, base, resolve, stages, args.champion, prev)

    print(f"OE: {args.oe}（文件里最新的一局：{LATEST_DATE or '无'} UTC）")
    print(f"世界赛对局（{WORLDS_LEAGUE}，{since or '…'} → {args.until or '…'}，tz={args.tz:+g}）："
          f"{len(games)} 局，{len(days)} 个比赛日，{len(res)} 名选手已亮相")
    if not rows:
        print("还没有世界赛数据（赛事没开始，或 OE 还没更新到这一天）——不改任何东西。")
        return 0
    if stages:
        unstaged = [d for d in days if stage_of(d, stages) == "?"]
        if unstaged:
            print(f"注意：这些比赛日不在 --stage-dates 里，按 ×1 算：{', '.join(unstaged)}")
    else:
        print("注意：没给 --stage-dates，所有对局按 ×1 算（淘汰赛 ×1.5、决赛 ×2 不生效）")
    if unmatched:
        print(f"\n对不上名单的世界赛选手（{len(unmatched)}）——是名单漏了人，还是要加 ALIASES：")
        for (name, team), c in sorted(unmatched.items(), key=lambda kv: (kv[0][1], kv[0][0])):
            print(f"  {name:<16} {team:<28} {c} 局")
    if mismatched:
        print(f"\n名字对上了、队伍对不上（没算）：")
        for (name, team, ign), c in sorted(mismatched.items()):
            print(f"  OE {name} @ {team} ≠ 名单 {ign} @ {base[ign].get('club')}  {c} 局")
    idle = sorted(ign for ign in base if ign not in res)
    if idle:
        print(f"\n名单上还没打过世界赛的（卡面仍是「?」，{len(idle)} 人）：{', '.join(idle)}")
    print()
    print_table(res, base)

    if args.final:
        # owner 2026-10-10: a sub who never played is filled in from his league (ordinary card) numbers after the final,
        # so nobody who bet on him is left holding a 「?」; written here so later re-rates of the ordinary card can't move it
        for ign in idle:
            b = base[ign]
            r = int(b["rating"])
            res[ign] = {"rating": r, "rarity": "gold" if r >= 84 else "silver" if r >= 72 else "bronze", "games": 0,
                        "prev": (prev or {}).get(ign), "attrs": {k: int(v) for k, v in b["attrs"].items()}, "teamname": ""}
        print(f"\n--final：{len(idle)} 名没上场的选手按普通卡数值定格")

    out = {
        "meta": {
            "updatedAt": last_day,
            "matchDays": len(days),
            "games": len(games),
            "final": bool(args.final),
            "note": "由 scripts/s16_ratings.py 每个比赛日后生成（updatedAt = 已计入的最后一个比赛日，北京时间）；"
                    "没有条目的选手卡面全是「?」",
        },
        "ratings": {
            ign: {"rating": v["rating"], "rarity": v["rarity"], "games": v["games"], "prev": v["prev"], "attrs": v["attrs"]}
            for ign, v in sorted(res.items(), key=lambda kv: (-kv[1]["rating"], kv[0].lower()))
        },
        "champion": args.champion,
        "fmvp": args.fmvp,
        "fmvpRating": args.fmvp_rating,
    }
    if args.dry_run:
        print("\n--dry-run：没有写文件。")
        return 0
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"\n已写入 {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
