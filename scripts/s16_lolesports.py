#!/usr/bin/env python3
"""S16 世界赛逐局数据：不靠 Oracle's Elixir，直接读 Riot 官方 LoL Esports 的公开接口，生成和 OE 同列名的 CSV。

为什么有这个脚本：OE 的数据放在 Google Drive，世界赛期间经常「下载配额已满」几个小时下不来（站长 2026-10-17：
「没有别的地方下载数据吗？S16 的单独数据就行」）。lolesports.com 网页自己用的接口是公开的，比赛打完几分钟就有数据。

    python scripts/s16_lolesports.py                    生成/更新 CSV（只下载新打完的局，其余读缓存）
    python scripts/s16_lolesports.py --out X.csv --cache DIR --sleep 1.0
    python scripts/s16_ratings.py --oe "../../lol选手/data/oracleselixir/2026_WLDs_lolesports.csv" --dry-run

默认输出：C:\\Users\\15967\\OneDrive\\桌面\\lol选手\\data\\oracleselixir\\2026_WLDs_lolesports.csv（每局每人一行，只有世界赛）。
默认缓存：系统临时目录下的 lulucard-s16-lolesports\\（--cache 可改）。缓存删了也没关系，只是要重新下载（每局约 30 个请求，
请求之间至少隔 1 秒，一局约 1 分钟；入围赛 19 局第一次约 10 分钟）。之后每次只下新打完的局：没有新局几秒钟，
一个比赛日 6–8 局约 6–8 分钟，每 2 小时跑一次没问题。

数据来源（都不用登录；esports-api 要带 lolesports.com 网页里公开的 x-api-key）：
  esports-api.lolesports.com/persisted/gw/getLeagues → getTournamentsForLeague（worlds_2026）→ getSchedule（翻页）
      → getEventDetails?id=<比赛id>（每场的各局 id、红蓝方）
  feed.lolesports.com/livestats/v1/window/<局id>?startingTime=…   每秒几帧：每人总经济、等级、击杀/死亡/助攻、补刀；队伍推塔、小龙
  feed.lolesports.com/livestats/v1/details/<局id>?startingTime=…  每人：总经济、补刀、KDA、参团率、伤害占比、插眼数、排眼数、出装
  startingTime 必须是 10 秒的整数倍；给一个比结束还晚的时间，接口返回最后 10 秒的帧（gameState = finished）。

怎么取数：
  * 开局时刻 = 第一帧「选手血量 > 0」的时间 − 7 秒（之前是读条画面，所有数都是 0；见「近似」第 6 条）。
  * 暂停：暂停时接口不出新帧（gameState = paused），抽样找出来，二分到 10 秒（「近似」第 6 条）。
  * 15 分钟 = 游戏时钟 15:00（开局 + 15:00 + 之前的暂停）那一帧；结束 = 第一帧 gameState = finished；
    gamelength = 结束 − 开局 − 暂停，单位秒。
  * 赛后 KDA / 伤害占比 / 插眼排眼 / 总经济 / 补刀 取最后一帧（和 Riot 赛后数据一致：nexus 爆炸那一两秒里的击杀和赏金也算）。

和 OE 一样的列（scripts/s16_ratings.py 用到的全有）：
  gameid（lolesports 的局 id）, datacompleteness, url, league（WLDs）, year（2026）, split, playoffs, date（开局 UTC
  'YYYY-MM-DD HH:MM:SS'）, game（第几局）, patch, participantid, side（Blue/Red）, position（top/jng/mid/bot/sup）,
  playername（去掉队伍前缀的 ID，如 Faker）, playerid, teamname（名单 s16.json 里的队名）, teamid, champion, gamelength,
  result（1/0）, kills, deaths, assists, teamkills, teamdeaths, damageshare, wardsplaced, wardskilled, visionscore（空）,
  vspm（换算，见下）, totalgold, earnedgold（换算）, earned gpm, earnedgoldshare, total cs, cspm,
  goldat15, xpat15（换算）, csat15, opp_goldat15, opp_xpat15, opp_csat15, golddiffat15, xpdiffat15, csdiffat15,
  killsat15, assistsat15, deathsat15, opp_killsat15, opp_assistsat15, opp_deathsat15
  没有的列：伤害绝对值（dpm、damagetochampions）、视野得分本身（visionscore）、补刀里小兵/野怪的拆分、龙/先锋/塔的细项。

近似（官方接口没有、按下面的办法补；常数都是用本机的 2025_OE.csv 拟合出来的，2025 年 LCK/LPL/LEC/LTA/LCP/MSI/世界赛等
数据完整的 3640 局）：
  1. 经验 xpat15 / xpdiffat15：接口只给等级不给经验。按英雄联盟的升级经验表（2→3 级要 280，之后每级多 100，18 级共 18360）
     估：经验 ≈ 升到当前等级的累计经验 + 当前这一级所需经验的一半（18 级就是 18360）。差值是「整级」的粒度，
     同级的两个人差值记 0（OE 里同级也可能差几百）——这一项的分布比 OE 略「粗」，均值不偏。
  2. 分均视野 vspm：接口没有视野得分。用 (插眼数 wardsPlaced + 排眼数 wardsDestroyed) / 分钟 做代理，再按位置线性换算到
     OE 的视野得分尺度：vspm ≈ a + b × 代理（VSPM_MAP，2025 年数据最小二乘；代理和真 vspm 的相关系数 0.80–0.89，
     和对位的「差值」相关 0.75–0.89）。换算后均值和 OE 一致，差值的离散度略小于 OE（回归会往均值收一点），
     所以视野这一项在评分里的作用比用真 vspm 时略弱，不会放大噪音。不换算的话辅助的代理值只有真值的 ~0.6 倍，
     用 OE 的尺子（SCALES）去量会把差距低估 40%。
     对过 2026 入围赛 19 局（Leaguepedia 记分板有真视野得分）：换算值比真值平均低 0.1–0.3（今年视野得分整体偏高），
     和对位的差值相关 0.68（中单）–0.88（上单、下路），差值的离散度是真值的 0.6–0.95 倍。
  3. 经济占比 earnedgoldshare：OE 的「earned gold」= 总经济 − 出生金币 − 被动金币。2025 年 OE 里
     总经济 − earnedgold = 275.63 + 2.04 × 比赛秒数（R² ≈ 1，就是 500 出生钱 + 每秒 2.04 的被动收入从 1:50 开始），
     所以 earnedgold = totalGoldEarned − 275.63 − 2.04 × gamelength；占比 = 自己 / 全队五人之和。
  4. 补刀 total cs / csat15 = 接口的 creepScore（小兵 + 野怪，和 OE 的 total cs 同口径）。
  5. 伤害占比 damageshare = details 的 championDamageShare（对英雄伤害占全队的比例，五人和为 1，和 OE 同口径）。
  6. 时间：接口的帧时间是现实时间，不是游戏内时钟。第一帧「血量 > 0」比游戏时钟 0:00 平均晚 7 秒（和 Leaguepedia 的
     官方时长对过入围赛不暂停的局：差 −11…−4 秒），所以开局 = 那一帧 − 7 秒（START_LAG），剩下的误差约 ±5 秒。
     暂停：暂停期间接口不出帧，要暂停中的时间会拿到暂停前最后几帧（gameState = paused）。游戏时钟 16 分钟前每 60 秒
     （PAUSE_STEP）、之后每 3 分钟（PAUSE_STEP_LATE，之后的暂停只影响 gamelength）抽一窗，
     抽到暂停就往后找恢复、二分到 10 秒，暂停时长 = 恢复后第一帧 − 第一帧 paused。15 分钟帧往后挪、gamelength 扣掉。
     短于抽样间隔、又刚好落在两次抽样之间的暂停会漏掉（15 分钟前最多差 60 秒）。入围赛 KC–C9 第 2、4 局各暂停过（查到 96 / 202 秒），
     扣掉后 19 局的 gamelength 和 Leaguepedia 的官方时长差 −7…+4 秒。每局的请求大部分花在这个抽样上。
  7. 胜负 result：接口不直接给每局的胜者。按结束那一刻双方的推塔、高地塔（inhibitors）、人头、经济打分，
     再用整场比分约束（比如 3:1 → 胜方赢最后一局、负方只赢前三局里的一局）选出最合理的组合。打分很悬殊的局（几乎全部）
     不会错（入围赛 19 局和 Leaguepedia 全部一致）；脚本会把「打分和比分约束矛盾」的局打印出来。真要改可以在
     WINNER_OVERRIDES 写死。
  核对（入围赛 19 局 190 行 vs Leaguepedia 记分板）：KDA 全部一致；补刀 5 人差 1；总经济差 1–12（个别差 58，最后一秒的钱）；
  伤害占比和 Leaguepedia 的对英雄伤害算出来的占比一致到 0.0001。
  datacompleteness：所有列都算出来了写 complete，缺 15 分钟帧之类写 partial（评分脚本对缺的项自动跳过、按剩下的项重新加权）。

只用 Python 3.12 标准库。不登录、不改游戏数据；只写 --out 的 CSV 和 --cache 目录。
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from itertools import product
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROSTER_JSON = ROOT / "src" / "data" / "s16.json"
DEFAULT_OUT = Path(r"C:\Users\15967\OneDrive\桌面\lol选手\data\oracleselixir\2026_WLDs_lolesports.csv")
DEFAULT_CACHE = Path(tempfile.gettempdir()) / "lulucard-s16-lolesports"

API = "https://esports-api.lolesports.com/persisted/gw/"
FEED = "https://feed.lolesports.com/livestats/v1/"
API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"   # lolesports.com 网页里公开的 key（网页自己就这么调）
UA = "LuluCardBuild/0.1 (hobby esports card game; +https://lulucard-production.up.railway.app)"
LEAGUE_SLUG = "worlds"
TOURNAMENT_SLUG = "worlds_2026"
LEAGUE_CODE, YEAR = "WLDs", 2026

ROLE = {"top": "top", "jungle": "jng", "mid": "mid", "bottom": "bot", "support": "sup"}
POSITIONS = ("top", "jng", "mid", "bot", "sup")

# 近似 1：升级经验表（升到 L+1 级需要 180 + 100 × L）
XP_TO_NEXT = {lv: 180 + 100 * lv for lv in range(1, 18)}
XP_AT_LEVEL = {1: 0}
for _lv in range(2, 19):
    XP_AT_LEVEL[_lv] = XP_AT_LEVEL[_lv - 1] + XP_TO_NEXT[_lv - 1]

# 近似 2：vspm ≈ a + b × (插眼 + 排眼)/分钟，2025_OE.csv 按位置最小二乘
VSPM_MAP = {"top": (0.169, 1.474), "jng": (0.387, 1.652), "mid": (0.221, 1.339), "bot": (-0.098, 1.697), "sup": (0.733, 1.248)}
# 近似 3：总经济 − earned gold = PASSIVE_BASE + PASSIVE_PER_SEC × 比赛秒数
PASSIVE_BASE, PASSIVE_PER_SEC = 275.63, 2.04
# 近似 6：第一帧「血量 > 0」比游戏时钟 0:00 晚几秒（和 Leaguepedia 的官方时长对过 15 局：平均晚 7 秒）；
# 每 PAUSE_STEP 秒（现实时间）抽一窗看是不是暂停了
START_LAG = 7
PAUSE_STEP, PAUSE_STEP_LATE = 60, 180

# 近似 7：手工指定胜者（局 id → lolesports 队伍代码），只在脚本报「胜负对不上」时用
WINNER_OVERRIDES: dict[str, str] = {}
# lolesports 队伍代码 → 名单（s16.json）的 tag；一样的不用写
TEAM_CODE_ALIASES = {"LOS": "LØS", "FURIA": "FUR", "GENG": "GEN", "TLAW": "TL"}

OUT_COLUMNS = [
    "gameid", "datacompleteness", "url", "league", "year", "split", "playoffs", "date", "game", "patch",
    "participantid", "side", "position", "playername", "playerid", "teamname", "teamid", "champion", "gamelength",
    "result", "kills", "deaths", "assists", "teamkills", "teamdeaths", "damageshare", "wardsplaced", "wardskilled",
    "visionscore", "vspm", "totalgold", "earnedgold", "earned gpm", "earnedgoldshare", "total cs", "cspm",
    "goldat15", "xpat15", "csat15", "opp_goldat15", "opp_xpat15", "opp_csat15",
    "golddiffat15", "xpdiffat15", "csdiffat15",
    "killsat15", "assistsat15", "deathsat15", "opp_killsat15", "opp_assistsat15", "opp_deathsat15",
    "lolesports_matchid", "pause_before15", "pause_total", "start_utc_precise",
]


def log(*a):
    print(*a, flush=True)


# --- HTTP（礼貌：每个请求之间至少隔 --sleep 秒；不变的响应缓存到磁盘）-----------------------------
class Net:
    def __init__(self, cache: Path, sleep: float):
        self.cache = cache
        self.sleep = max(1.0, sleep)
        self.last = 0.0
        self.requests = 0
        (cache / "raw").mkdir(parents=True, exist_ok=True)

    def _wait(self):
        dt = time.monotonic() - self.last
        if dt < self.sleep:
            time.sleep(self.sleep - dt)
        self.last = time.monotonic()

    def get(self, url: str, *, api: bool = False, cache: bool = False, tries: int = 3):
        """JSON（dict）或 None（空响应 / 204 / 404）。cache=True 只给已经打完的局的 livestats 用。"""
        fn = self.cache / "raw" / (hashlib.sha1(url.encode()).hexdigest()[:20] + ".json")
        if cache and fn.exists():
            txt = fn.read_text(encoding="utf-8")
            return json.loads(txt) if txt else None
        headers = {"User-Agent": UA, "Accept": "application/json"}
        if api:
            headers["x-api-key"] = API_KEY
        body = b""
        for i in range(tries):
            self._wait()
            self.requests += 1
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=40) as r:
                    body = r.read()
            except urllib.error.HTTPError as e:
                if e.code in (404, 204):
                    return None
                if i == tries - 1:
                    raise
                time.sleep(3 * (i + 1))
                continue
            except (urllib.error.URLError, TimeoutError):
                if i == tries - 1:
                    raise
                time.sleep(3 * (i + 1))
                continue
            if body:
                break
            time.sleep(2 * (i + 1))   # 偶尔 200 + 空 body，过一会儿再要就有了
        if not body:
            return None
        data = json.loads(body)
        if cache:
            fn.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        return data


def ts_parse(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def ts_param(t: datetime) -> str:
    """startingTime：UTC、向下取整到 10 秒。"""
    t = t.astimezone(timezone.utc).replace(microsecond=0)
    t -= timedelta(seconds=t.second % 10)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


# --- 赛程 ----------------------------------------------------------------------------------
def find_tournament(net: Net) -> tuple[str, dict]:
    leagues = net.get(API + "getLeagues?hl=en-US", api=True)["data"]["leagues"]
    league = next(l for l in leagues if l["slug"] == LEAGUE_SLUG)
    ts = net.get(API + f"getTournamentsForLeague?hl=en-US&leagueId={league['id']}", api=True)["data"]["leagues"][0]["tournaments"]
    t = next((x for x in ts if x["slug"] == TOURNAMENT_SLUG), None)
    if not t:
        sys.exit(f"getTournamentsForLeague 里没有 {TOURNAMENT_SLUG}")
    return league["id"], t


def schedule_events(net: Net, league_id: str, tour: dict) -> list[dict]:
    """这一届的所有比赛（getSchedule 翻页，往前翻到开幕日之前、往后翻到闭幕日之后）。"""
    lo, hi = tour["startDate"], tour["endDate"]
    base = API + f"getSchedule?hl=en-US&leagueId={league_id}"
    seen: dict[str, dict] = {}

    def take(page):
        for e in page["events"]:
            m = e.get("match") or {}
            if e.get("type") == "match" and m.get("id") and lo <= e["startTime"][:10] <= hi:
                seen[m["id"]] = e

    first = net.get(base, api=True)["data"]["schedule"]
    take(first)
    for direction in ("older", "newer"):
        page, n = first, 0
        while page["pages"].get(direction) and n < 10:
            times = [e["startTime"][:10] for e in page["events"]] or [lo]
            if direction == "older" and min(times) < lo:
                break
            if direction == "newer" and max(times) > hi:
                break
            page = net.get(base + "&pageToken=" + urllib.parse.quote(page["pages"][direction]), api=True)["data"]["schedule"]
            take(page)
            n += 1
    return sorted(seen.values(), key=lambda e: e["startTime"])


def event_details(net: Net, match_id: str, completed: bool) -> dict | None:
    """打完的比赛缓存（不会再变）；进行中的每次重新要。"""
    fn = net.cache / "events" / f"{match_id}.json"
    if completed and fn.exists():
        return json.loads(fn.read_text(encoding="utf-8"))
    d = net.get(API + f"getEventDetails?hl=en-US&id={match_id}", api=True)
    ev = (d or {}).get("data", {}).get("event")
    if ev and completed:
        fn.parent.mkdir(parents=True, exist_ok=True)
        fn.write_text(json.dumps(ev, ensure_ascii=False), encoding="utf-8")
    return ev


# --- 单局 ------------------------------------------------------------------------------------
def window(net: Net, gid: str, t: datetime | None, cache: bool = True):
    url = FEED + f"window/{gid}" + (f"?startingTime={ts_param(t)}" if t else "")
    return net.get(url, cache=cache)


def parts(frame: dict) -> dict[int, dict]:
    return {p["participantId"]: p for side in ("blueTeam", "redTeam") for p in frame[side]["participants"]}


def live(frame: dict) -> bool:
    return any(p.get("maxHealth", 0) > 0 for p in parts(frame).values())


def total_gold(frame: dict) -> int:
    return sum(p["totalGold"] for p in parts(frame).values())


def frame_near(frames: list[dict], target: datetime) -> dict | None:
    return min(frames, key=lambda f: abs((ts_parse(f["rfc460Timestamp"]) - target).total_seconds())) if frames else None


def find_start(net: Net, gid: str) -> tuple[dict, datetime] | None:
    """(metadata, 开局时刻)：从第一窗往后每 10 秒找第一帧「有人血量 > 0」，再减 START_LAG（近似 6）。"""
    w = window(net, gid, None)
    if not w or not w.get("frames"):
        return None
    meta = w["gameMetadata"]
    for _ in range(90):  # 最多往后找 15 分钟的读条
        for f in w["frames"]:
            if live(f):
                return meta, ts_parse(f["rfc460Timestamp"]) - timedelta(seconds=START_LAG)
        nxt = ts_parse(w["frames"][-1]["rfc460Timestamp"]) + timedelta(seconds=10)
        w = window(net, gid, nxt)
        if not w or not w.get("frames"):
            return None
    return None


def _slot(t: datetime) -> datetime:
    return t.replace(microsecond=0) - timedelta(seconds=t.second % 10)


def _paused_window(net: Net, gid: str, t: datetime) -> tuple[bool, list[dict]]:
    """t 这一刻是不是在暂停里。暂停时接口不出新帧，要 t 的窗口会拿到暂停前的最后几帧（时间早于 t、gameState = paused）；
    也防一手「暂停时照样出帧、只是 gameState = paused」。只认 gameState = paused：单纯的断帧（数据源卡了一下，
    游戏时钟照走）不算暂停；比赛结束后的时间拿到的是 finished 帧，也不算。"""
    fr = (window(net, gid, t) or {}).get("frames") or []
    return any(f.get("gameState") == "paused" for f in fr), fr


def find_pauses(net: Net, gid: str, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """[(暂停开始, 恢复)]（现实时间）。每 PAUSE_STEP 秒抽一窗；抽到暂停就二分找到恢复的那 10 秒（近似 6）。"""
    out: list[tuple[datetime, datetime]] = []

    def step(t: datetime) -> timedelta:   # 15 分钟帧之前每 60 秒；之后只影响 gamelength，放宽到 3 分钟
        clock = (t - start).total_seconds() - sum((q - p).total_seconds() for p, q in out)
        return timedelta(seconds=PAUSE_STEP if clock < 16 * 60 else PAUSE_STEP_LATE)

    t = start + timedelta(seconds=PAUSE_STEP)
    prev_ok = start
    while t < end:
        paused, fr = _paused_window(net, gid, t)
        if not paused:
            prev_ok, t = t, t + step(t)
            continue
        stale = ts_parse(fr[0]["rfc460Timestamp"]) < _slot(t) - timedelta(seconds=1)
        pf = [f for f in fr if f.get("gameState") == "paused"]
        if stale:
            p0 = ts_parse((pf or fr[-1:])[0]["rfc460Timestamp"])
        else:   # 暂停时也在出帧：往回二分找第一帧 paused
            lo, hi = _slot(prev_ok), _slot(t)
            while (hi - lo).total_seconds() > 10:
                mid = _slot(lo + (hi - lo) / 2)
                if _paused_window(net, gid, mid)[0]:
                    hi = mid
                else:
                    lo = mid
            frh = _paused_window(net, gid, hi)[1]
            pf = [f for f in frh if f.get("gameState") == "paused"] or frh[:1]
            p0 = ts_parse(pf[0]["rfc460Timestamp"]) if pf else hi
        # 往后每 PAUSE_STEP 秒看，直到不在暂停里，再在最后一段里二分到 10 秒
        lo = _slot(t)
        hi = lo + timedelta(seconds=PAUSE_STEP)
        while hi < end + timedelta(seconds=PAUSE_STEP) and _paused_window(net, gid, hi)[0]:
            lo, hi = hi, hi + timedelta(seconds=PAUSE_STEP)
        while (hi - lo).total_seconds() > 10:
            mid = _slot(lo + (hi - lo) / 2)
            if _paused_window(net, gid, mid)[0]:
                lo = mid
            else:
                hi = mid
        frq = _paused_window(net, gid, hi)[1]
        live_fr = [f for f in frq if f.get("gameState") != "paused"]
        q0 = ts_parse(live_fr[0]["rfc460Timestamp"]) if live_fr else hi
        if q0 > p0:
            out.append((p0, q0))
        prev_ok, t = q0, q0 + step(q0)
    return out


def wall_at(start: datetime, clock_s: float, pauses: list[tuple[datetime, datetime]]) -> datetime:
    """游戏内时钟 clock_s 秒对应的现实时间（加上在那之前的暂停）。"""
    t = start + timedelta(seconds=clock_s)
    for p0, q0 in sorted(pauses):
        if p0 <= t:
            t += q0 - p0
    return t


def paused_before(t: datetime, pauses: list[tuple[datetime, datetime]]) -> float:
    return sum((min(q0, t) - p0).total_seconds() for p0, q0 in pauses if p0 < t)


def find_end(net: Net, gid: str, start: datetime, now: datetime):
    """(第一帧 finished 的时刻, 最后一帧 window, 最后一帧 details)；没打完返回 None。
    KDA、经济、补刀取最后一帧（和 Riot 赛后数据 / Leaguepedia 一致：最后一两秒的击杀和经济也算进去）。"""
    # 比结束晚的任意时间都返回最后 10 秒；开局 3 小时后这个 URL 固定，可以缓存。刚打完不到 3 小时的局用「现在」，不缓存
    far, stable = start + timedelta(hours=3), True
    if far > now - timedelta(minutes=2):
        far, stable = now - timedelta(minutes=2), False
    w = window(net, gid, far, cache=stable)
    fr = (w or {}).get("frames") or []
    fin = [f for f in fr if f.get("gameState") == "finished"]
    if not fin:
        return None
    first = fin[0]
    if fr[0].get("gameState") == "finished":   # 这一窗全是结束后的帧：往前一窗找真正的第一帧 finished
        for back in (10, 20, 40):
            w2 = window(net, gid, ts_parse(first["rfc460Timestamp"]) - timedelta(seconds=back))
            fr2 = (w2 or {}).get("frames") or []
            fin2 = [f for f in fr2 if f.get("gameState") == "finished"]
            if fin2 and fin2[0]["rfc460Timestamp"] < first["rfc460Timestamp"]:
                first = fin2[0]
            if fr2 and fr2[0].get("gameState") != "finished":
                break
    d = net.get(FEED + f"details/{gid}?startingTime={ts_param(far)}", cache=stable)
    dfr = (d or {}).get("frames") or []
    return ts_parse(first["rfc460Timestamp"]), fr[-1], (dfr[-1] if dfr else None)


def xp_est(level: int | None) -> float | None:
    if not level:
        return None
    level = max(1, min(18, int(level)))
    return XP_AT_LEVEL[level] + (XP_TO_NEXT[level] / 2 if level < 18 else 0)


def game_record(net: Net, gid: str, now: datetime) -> dict | None:
    """一局的原始要素（全部来自缓存或接口）：metadata、开局、15 分钟帧、结束、最后一帧、暂停。"""
    st = find_start(net, gid)
    if not st:
        return None
    meta, start = st
    end = find_end(net, gid, start, now)
    if not end:
        return None
    t_end, wend, dend = end
    pauses = find_pauses(net, gid, start, t_end)
    t15 = wall_at(start, 15 * 60, pauses)
    f15 = None
    if t_end > t15:
        w = window(net, gid, t15)
        f15 = frame_near([f for f in (w or {}).get("frames") or [] if f.get("gameState") != "paused"], t15)
    gl = (t_end - start).total_seconds() - paused_before(t_end, pauses)
    return {"meta": meta, "start": start, "f15": f15, "end": wend, "det": dend, "gamelength": gl,
            "paused15": paused_before(t15, pauses), "paused": paused_before(t_end, pauses)}


def winner_score(end_frame: dict) -> float:
    """> 0：蓝方像赢家；< 0：红方像赢家（近似 7）。"""
    b, r = end_frame["blueTeam"], end_frame["redTeam"]
    return ((b["towers"] - r["towers"]) + 3 * (b["inhibitors"] - r["inhibitors"])
            + (b["totalKills"] - r["totalKills"]) / 5 + (b["totalGold"] - r["totalGold"]) / 3000)


def assign_winners(games: list[dict], wins: dict[str, int], completed: bool) -> tuple[dict[str, str], list[str]]:
    """games: [{id, number, blue, red, score}]（按局序），wins: 队伍 id → 赢的局数（整场比分）。
    返回 局 id → 胜方队伍 id，以及警告。"""
    warns: list[str] = []
    teams = list(wins)
    best, best_val = None, None
    for combo in product((0, 1), repeat=len(games)):   # 0 = 蓝方赢
        cnt = {t: 0 for t in teams}
        ok = True
        need = max(wins.values()) if completed else None
        for i, (g, c) in enumerate(zip(games, combo)):
            w = g["blue"] if c == 0 else g["red"]
            if w not in cnt:
                ok = False
                break
            cnt[w] += 1
            if completed and cnt[w] == need and i != len(games) - 1:
                ok = False   # 有人先拿够了局数，后面就不会再打
                break
        if not ok or any(cnt[t] != wins.get(t, 0) for t in teams):
            continue
        val = sum(g["score"] if c == 0 else -g["score"] for g, c in zip(games, combo))
        if best_val is None or val > best_val:
            best, best_val = combo, val
    if best is None:   # 比分对不上（进行中、数据缺局）：每局按打分
        best = tuple(0 if g["score"] > 0 else 1 for g in games)
        warns.append("整场比分约束无解，按每局打分判胜负")
    out = {}
    for g, c in zip(games, best):
        out[g["id"]] = g["blue"] if c == 0 else g["red"]
        if (c == 0) != (g["score"] > 0):
            warns.append(f"第 {g['number']} 局（{g['id']}）：打分 {g['score']:+.1f} 和比分约束矛盾，按比分约束定")
    return out, warns


# --- 名字 ------------------------------------------------------------------------------------
def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z]", "", (s or "").lower())


def strip_prefix(summoner: str, codes: set[str]) -> str:
    s = " ".join((summoner or "").split())
    parts_ = s.split(" ", 1)
    if len(parts_) == 2 and norm(parts_[0]) in codes:
        return parts_[1].strip()
    return s


def load_roster() -> dict:
    try:
        return json.loads(ROSTER_JSON.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"teams": []}


# --- 主流程 ----------------------------------------------------------------------------------
def build(args) -> int:
    cache = Path(args.cache)
    net = Net(cache, args.sleep)
    now = datetime.now(timezone.utc)
    roster = load_roster()
    tag_to_name = {norm(t["tag"]): t["name"] for t in roster.get("teams", []) if t.get("tag")}
    codes = set(tag_to_name) | {norm(c) for c in TEAM_CODE_ALIASES} | {norm(v) for v in TEAM_CODE_ALIASES.values()}

    league_id, tour = find_tournament(net)
    events = schedule_events(net, league_id, tour)
    stage_of_block = lambda b: 1 if (b or "").lower() in ("quarterfinals", "semifinals", "finals", "final") else 0

    rows: list[dict] = []
    n_games, n_new, skipped, warns_all = 0, 0, [], []
    req0 = net.requests
    for e in events:
        if e["state"] not in ("completed", "inProgress"):
            continue
        m = e["match"]
        ev = event_details(net, m["id"], e["state"] == "completed")
        if not ev:
            skipped.append(f"{m['id']}: getEventDetails 没数据")
            continue
        mt = ev["match"]
        team_by_id = {t["id"]: t for t in mt["teams"]}
        for t in mt["teams"]:
            codes.add(norm(t.get("code", "")))
        recs = []
        for g in mt["games"]:
            if g.get("state") != "completed":
                continue
            before = net.requests
            rec = game_record(net, g["id"], now)
            if rec is None:
                skipped.append(f"{e['startTime'][:10]} {'/'.join(t['code'] for t in mt['teams'])} 第 {g['number']} 局 {g['id']}：livestats 还没有完整数据")
                continue
            if net.requests > before:
                n_new += 1
            sides = {s["side"]: s["id"] for s in g["teams"]}
            blue_id = rec["meta"]["blueTeamMetadata"]["esportsTeamId"] or sides.get("blue")
            red_id = rec["meta"]["redTeamMetadata"]["esportsTeamId"] or sides.get("red")
            recs.append({"id": g["id"], "number": g["number"], "blue": blue_id, "red": red_id,
                         "score": winner_score(rec["end"]), "rec": rec})
        if not recs:
            continue
        wins = {t["id"]: int((t.get("result") or {}).get("gameWins") or 0) for t in mt["teams"]}
        winners, warns = assign_winners(recs, wins, e["state"] == "completed" and len(recs) == sum(wins.values()))
        for w in warns:
            warns_all.append(f"{e['startTime'][:10]} {'/'.join(t['code'] for t in mt['teams'])}：{w}")
        for g in recs:
            if g["id"] in WINNER_OVERRIDES:
                code = WINNER_OVERRIDES[g["id"]]
                winners[g["id"]] = next(t["id"] for t in mt["teams"] if t["code"] == code)
            rows.extend(game_rows(g, winners[g["id"]], team_by_id, tag_to_name, codes, m["id"],
                                  stage_of_block(e.get("blockName"))))
            n_games += 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    os.replace(tmp, out)

    log(f"{tour['slug']}：{len(events)} 场比赛在赛程里，{n_games} 局写进 CSV（{len(rows)} 行），这次新下载 {n_new} 局，"
        f"共 {net.requests - req0} 个网络请求")
    log(f"→ {out}")
    teams_seen = sorted({r["teamname"] for r in rows})
    unknown = [t for t in teams_seen if norm(t) not in {norm(x["name"]) for x in roster.get("teams", [])}]
    if unknown:
        log("名单里没有的队名（检查 TEAM_CODE_ALIASES）：" + "、".join(unknown))
    for s in skipped:
        log("跳过：" + s)
    for w in warns_all:
        log("注意：" + w)
    partial = sorted({r["gameid"] for r in rows if r["datacompleteness"] != "complete"})
    if partial:
        log(f"partial（缺 15 分钟帧等）的局：{', '.join(partial)}")
    paused = sorted({(r["date"], r["gameid"], r["pause_before15"], r["pause_total"]) for r in rows if float(r["pause_total"] or 0) > 0})
    for date, gid, p15, pt in paused:
        log(f"暂停过：{date} {gid} 共 {pt} 秒（15 分钟前 {p15} 秒；15 分钟帧和 gamelength 已扣掉）")
    return 0


def fmt(x, nd=4):
    if x is None:
        return ""
    if isinstance(x, float):
        return f"{x:.{nd}f}".rstrip("0").rstrip(".") if nd else str(round(x))
    return str(x)


def game_rows(g: dict, winner_id: str, team_by_id: dict, tag_to_name: dict, codes: set[str],
              match_id: str, playoffs: int) -> list[dict]:
    rec = g["rec"]
    meta, start, f15, end, det = rec["meta"], rec["start"], rec["f15"], rec["end"], rec["det"]
    gl = rec["gamelength"]
    minutes = gl / 60.0
    p_end = parts(end)
    p_det = {p["participantId"]: p for p in (det or {}).get("participants", [])}
    p15 = parts(f15) if f15 else {}
    patch = ".".join((meta.get("patchVersion") or "").split(".")[:2])

    players = []
    for side_key, side in (("blueTeamMetadata", "Blue"), ("redTeamMetadata", "Red")):
        tm = meta[side_key]
        tid = tm["esportsTeamId"]
        code = (team_by_id.get(tid) or {}).get("code", "")
        tag = TEAM_CODE_ALIASES.get(code.upper(), code)
        teamname = tag_to_name.get(norm(tag)) or (team_by_id.get(tid) or {}).get("name", code)
        for pm in tm["participantMetadata"]:
            pid = pm["participantId"]
            pos = ROLE.get((pm.get("role") or "").lower())
            players.append({"pid": pid, "side": side, "pos": pos, "tid": tid, "teamname": teamname, "pm": pm})

    def earned(pid):
        d = p_det.get(pid)
        tg = d["totalGoldEarned"] if d else p_end[pid]["totalGold"]
        return tg - PASSIVE_BASE - PASSIVE_PER_SEC * gl, tg

    team_earned, team_kills, team_deaths = {}, {}, {}
    for p in players:
        d = p_det.get(p["pid"]) or p_end[p["pid"]]
        team_earned[p["tid"]] = team_earned.get(p["tid"], 0) + earned(p["pid"])[0]
        team_kills[p["tid"]] = team_kills.get(p["tid"], 0) + d["kills"]
        team_deaths[p["tid"]] = team_deaths.get(p["tid"], 0) + d["deaths"]
    opp_of = {}
    for p in players:
        for q in players:
            if q["tid"] != p["tid"] and q["pos"] == p["pos"]:
                opp_of[p["pid"]] = q["pid"]

    rows = []
    date = start.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    for p in players:
        pid, pos = p["pid"], p["pos"]
        d = p_det.get(pid)
        e = p_end[pid]
        src = d or e
        eg, tg = earned(pid)
        te = team_earned.get(p["tid"]) or 0
        r = {
            "gameid": g["id"], "url": f"https://lolesports.com/vod/{match_id}/{g['number']}", "league": LEAGUE_CODE,
            "year": YEAR, "split": "", "playoffs": playoffs, "date": date, "game": g["number"], "patch": patch,
            "participantid": pid, "side": p["side"], "position": pos or "",
            "playername": strip_prefix(p["pm"].get("summonerName", ""), codes), "playerid": p["pm"].get("esportsPlayerId", ""),
            "teamname": p["teamname"], "teamid": p["tid"], "champion": p["pm"].get("championId", ""),
            "gamelength": round(gl), "result": 1 if p["tid"] == winner_id else 0,
            "kills": src["kills"], "deaths": src["deaths"], "assists": src["assists"],
            "teamkills": team_kills.get(p["tid"], 0), "teamdeaths": team_deaths.get(p["tid"], 0),
            "damageshare": fmt(d["championDamageShare"]) if d else "",
            "wardsplaced": d["wardsPlaced"] if d else "", "wardskilled": d["wardsDestroyed"] if d else "",
            "visionscore": "",
            "totalgold": tg, "earnedgold": round(eg), "earned gpm": fmt(eg / minutes, 1) if minutes else "",
            "earnedgoldshare": fmt(eg / te) if te else "",
            "total cs": src["creepScore"], "cspm": fmt(src["creepScore"] / minutes, 2) if minutes else "",
            "lolesports_matchid": match_id, "pause_before15": round(rec["paused15"]), "pause_total": round(rec["paused"]),
            "start_utc_precise": start.astimezone(timezone.utc).isoformat(timespec="milliseconds"),
        }
        if d and pos and minutes:
            a, b = VSPM_MAP[pos]
            proxy = (d["wardsPlaced"] + d["wardsDestroyed"]) / minutes
            r["vspm"] = fmt(a + b * proxy)
        else:
            r["vspm"] = ""
        o = opp_of.get(pid)
        if p15 and o is not None:
            me, op = p15[pid], p15[o]
            xm, xo = xp_est(me["level"]), xp_est(op["level"])
            r.update({
                "goldat15": me["totalGold"], "xpat15": round(xm), "csat15": me["creepScore"],
                "opp_goldat15": op["totalGold"], "opp_xpat15": round(xo), "opp_csat15": op["creepScore"],
                "golddiffat15": me["totalGold"] - op["totalGold"], "xpdiffat15": round(xm - xo),
                "csdiffat15": me["creepScore"] - op["creepScore"],
                "killsat15": me["kills"], "assistsat15": me["assists"], "deathsat15": me["deaths"],
                "opp_killsat15": op["kills"], "opp_assistsat15": op["assists"], "opp_deathsat15": op["deaths"],
            })
        complete = bool(d and p15 and o is not None and pos)
        r["datacompleteness"] = "complete" if complete else "partial"
        rows.append(r)
    return rows


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="S16 世界赛逐局数据（LoL Esports 官方接口 → OE 同列名 CSV）")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help=f"输出 CSV（默认 {DEFAULT_OUT}）")
    ap.add_argument("--cache", default=os.environ.get("S16_LOLESPORTS_CACHE", str(DEFAULT_CACHE)),
                    help="缓存目录（默认系统临时目录/lulucard-s16-lolesports，或环境变量 S16_LOLESPORTS_CACHE）")
    ap.add_argument("--sleep", type=float, default=1.0, help="两个请求之间至少隔几秒（最少 1）")
    args = ap.parse_args(argv)
    return build(args)


if __name__ == "__main__":
    raise SystemExit(main())
