"""
Player careers for the 选手档案 (生涯队伍 / 赛事记录 / 荣誉), from each player's Leaguepedia
"<page>/Tournament Results" page.

    python scripts/fetch_careers.py          # fetch (resumable; each page is cached) and build
    python scripts/fetch_careers.py --build  # rebuild public/data/careers.json from the cache only

Leaguepedia's Cargo API throttles anonymous clients to a trickle (2026-09-28: a single join query got the
address refused for hours), so this reads the rendered results table instead, one page every few seconds.
Pages are cached in .local-data/careers-cache/ by title.

A card is looked up by the page its stats came from (sourcePlayerId), else its IGN. Output, keyed by our
player id, is fetched by the 图鉴 page on demand (not bundled):
  events: [{name, date, team, place}]   every placement, newest first (capped)
  teams:  [{team, from, to}]            teams he played events for, first and last event date, newest first
  titles: [{name, date, team}]          first place in a top-level event (Worlds, MSI, top domestic leagues)
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "src" / "data" / "world.json"
CACHE = ROOT / ".local-data" / "careers-cache"
OUT = ROOT / "public" / "data" / "careers.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"
SPACING = 3
EVENTS_CAP = 60

# a title counts only in the World Championship, MSI and top domestic leagues — not academy / challenger
# leagues, qualifiers, promotion, regional finals or cups
TOP = re.compile(r"^(Worlds|World Championship|Mid-Season Invitational|MSI|LPL|LCK|LEC|EU LCS|LCS|NA LCS|LTA|LCP|PCS|LMS|VCS|LJL|CBLOL|LLA|OGN|Champions|TCL)\b")
NOT_TOP = re.compile(r"Academy|Challengers|\bCL\b|Qualifier|Promotion|Regional Finals|Cup|Proving|Rookie|Kickoff Qualif|"
                     r"Play-In|Preseason|Showmatch|All-Star|Div|Group|Season Opening|Rounds|Swiss|Regular Season|Stage|"
                     r"Road to|\bAS\b|(Spring|Summer|Winter) Season$|Lock[- ]In|Scrims|Partnaire|\bTour\b", re.I)


# exhibitions, all-star and show events: not part of a career record
EXHIBITION = re.compile(r"All-?Star|Allstars|Season Opening|Season Kickoff|TAKE OVER|Showmatch|HSBC|Pre Evaluation|"
                        r"Charity|Legends|Red Bull|Fan ?Fest|Rift Rivals", re.I)


def is_club(team: str) -> bool:
    """A club, not a national side or a one-off event squad. Leaguepedia disambiguates clubs as
    'Griffin (Korean Team)'; event squads read 'Team MID (Season Opening)'."""
    m = re.search(r"\(([^)]*)\)$", team)
    return not m or (m.group(1).endswith("Team") and "National" not in m.group(1))


def titles_of(rows: list[dict]) -> list[dict]:
    """First places that are championships. A split with a playoff is won in the playoff: topping the regular
    season (Leaguepedia files it as its own event, e.g. Griffin, LCK 2019 Summer) is not a title."""
    names = {r["name"] for r in rows}
    out = []
    for r in rows:
        n = r["name"]
        if r["place"] != "1" or not TOP.match(n) or NOT_TOP.search(n) or f"{n} Playoffs" in names:
            continue
        out.append({"name": re.sub(r" Playoffs$", "", n), "date": r["date"], "team": r["team"]})
    return out


def fetch(title: str) -> str | None:
    path = CACHE / (hashlib.sha1(title.encode()).hexdigest() + ".html")
    if path.exists():
        text = path.read_text("utf-8")
        return text or None
    if "--build" in sys.argv:
        return None
    url = "https://lol.fandom.com/api.php?" + urllib.parse.urlencode(
        {"action": "parse", "page": f"{title}/Tournament Results", "prop": "text", "format": "json", "disablelimitreport": 1})
    wait = 60
    while True:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90) as r:
            data = json.load(r)
        code = data.get("error", {}).get("code")
        if code == "ratelimited":
            print(f"  rate-limited, waiting {wait}s", flush=True)
            time.sleep(wait)
            wait = min(wait * 2, 900)
            continue
        text = "" if code else data["parse"]["text"]["*"]
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(text, "utf-8")
        time.sleep(SPACING)
        return text or None


def cell_text(c: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).replace("⁠", "").strip()


def parse(page_html: str) -> list[dict]:
    """rows of the results table: Date | Pl | Event | Last Result | Team | Roster"""
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 5 or not re.match(r"\d{4}-\d{2}-\d{2}$", cell_text(cells[0])):
            continue
        team_html = cells[4]
        m = re.search(r'<a [^>]*title="([^"]+)"', team_html)
        team = html.unescape(m.group(1)) if m else cell_text(team_html)
        out.append({"date": cell_text(cells[0]), "place": cell_text(cells[1]), "name": cell_text(cells[2]), "team": team})
    return out


def main() -> int:
    world = json.loads(WORLD.read_text("utf-8"))
    page_of = {p["id"]: (p.get("sourcePlayerId") or p["ign"]) for p in world["players"]}
    pages = sorted(set(page_of.values()))
    rows_of: dict[str, list[dict]] = {}
    for i, title in enumerate(pages, 1):
        text = fetch(title)
        rows_of[title] = parse(text) if text else []
        if i % 25 == 0:
            print(f"pages {i}/{len(pages)}", flush=True)

    out = {}
    for pid, title in page_of.items():
        rows = sorted((r for r in rows_of.get(title, []) if not EXHIBITION.search(r["name"])), key=lambda r: r["date"], reverse=True)
        if not rows:
            continue
        span: dict[str, list[str]] = {}
        for r in rows:
            if not is_club(r["team"]):
                continue
            s = span.setdefault(r["team"], [r["date"], r["date"]])
            s[0], s[1] = min(s[0], r["date"]), max(s[1], r["date"])
        teams = sorted(({"team": t, "from": a, "to": b} for t, (a, b) in span.items()), key=lambda x: x["to"], reverse=True)
        titles = titles_of(rows)
        out[pid] = {"teams": teams, "events": rows[:EVENTS_CAP], "titles": titles}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"asOf": time.strftime("%Y-%m-%d"), "players": out}, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"wrote {len(out)} players -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
