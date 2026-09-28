"""
Fill blank player identity fields (nationality, real name, birth date) from Leaguepedia infoboxes.

    python scripts/fill_player_profiles.py            # dry run: writes .local-data/profile-fill.json, changes nothing
    python scripts/fill_player_profiles.py --apply    # writes the reviewed fills into src/data/world.json

Only empty fields are filled; nothing already in world.json is overwritten. Each player is looked up by the
Leaguepedia page his stats came from (sourcePlayerId), else by his handle, and the page must be him:
  - with a sourcePlayerId, rejected only when both team and role disagree (bios lag transfers);
  - by handle alone, at least one of team or role must agree, and disambiguation pages are skipped.
(2026-09-28: MG and Nia had been given a same-handle stranger's nationality and name.)

Requests are batched 50 pages at a time through the public MediaWiki API, with a plain browser User-Agent
and no personal identifiers.
"""
from __future__ import annotations

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
REPORT = ROOT / ".local-data" / "profile-fill.json"
YEAR = 2026
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"

COUNTRY = {
    "South Korea": "kr", "Korea": "kr", "China": "cn", "Taiwan": "tw", "Hong Kong": "hk", "Macau": "mo",
    "Japan": "jp", "Vietnam": "vn", "Thailand": "th", "Philippines": "ph", "Singapore": "sg", "Malaysia": "my",
    "Indonesia": "id", "Australia": "au", "New Zealand": "nz", "United States": "us", "Canada": "ca",
    "Mexico": "mx", "Brazil": "br", "Argentina": "ar", "Chile": "cl", "Peru": "pe", "Colombia": "co",
    "Uruguay": "uy", "Venezuela": "ve", "Ecuador": "ec", "Costa Rica": "cr", "El Salvador": "sv",
    "Paraguay": "py", "Bolivia": "bo", "Guatemala": "gt", "Puerto Rico": "pr", "Dominican Republic": "do",
    "United Kingdom": "gb", "England": "gb", "Scotland": "gb", "Wales": "gb", "Ireland": "ie", "France": "fr",
    "Germany": "de", "Spain": "es", "Portugal": "pt", "Italy": "it", "Netherlands": "nl", "Belgium": "be",
    "Denmark": "dk", "Sweden": "se", "Norway": "no", "Finland": "fi", "Iceland": "is", "Poland": "pl",
    "Czech Republic": "cz", "Czechia": "cz", "Slovakia": "sk", "Slovenia": "si", "Croatia": "hr",
    "Serbia": "rs", "Bosnia and Herzegovina": "ba", "Montenegro": "me", "North Macedonia": "mk",
    "Bulgaria": "bg", "Romania": "ro", "Hungary": "hu", "Greece": "gr", "Cyprus": "cy", "Turkey": "tr",
    "Austria": "at", "Switzerland": "ch", "Lithuania": "lt", "Latvia": "lv", "Estonia": "ee", "Ukraine": "ua",
    "Russia": "ru", "Belarus": "by", "Kazakhstan": "kz", "Israel": "il", "Morocco": "ma", "Algeria": "dz",
    "Tunisia": "tn", "Egypt": "eg", "Saudi Arabia": "sa", "United Arab Emirates": "ae", "Lebanon": "lb",
    "Jordan": "jo", "India": "in", "Pakistan": "pk", "Mongolia": "mn", "South Africa": "za", "Armenia": "am",
    "Georgia": "ge", "Moldova": "md", "Albania": "al", "Kosovo": "xk", "Luxembourg": "lu", "Malta": "mt",
    "USA": "us", "Iraq": "iq", "Cambodia": "kh", "Laos": "la", "Myanmar": "mm", "Iran": "ir", "Nigeria": "ng",
}
ROLE = {"Top": "上单", "Jungle": "打野", "Jungler": "打野", "Mid": "中单", "Bot": "下路", "ADC": "下路", "Support": "辅助"}
CJK = re.compile(r"[぀-ヿ㐀-鿿가-힯]")


def api(params: dict) -> dict:
    url = "https://lol.fandom.com/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    for attempt in range(4):
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
            data = json.load(r)
        if data.get("error", {}).get("code") != "ratelimited":
            return data
        time.sleep(20 * (attempt + 1))
    raise SystemExit("Leaguepedia is rate-limiting; try again later")


def infobox(text: str) -> dict[str, str]:
    m = re.search(r"\{\{Infobox Player(.*?)\n\}\}", text, re.S)
    if not m:
        return {}
    return {k.strip(): v.strip() for k, v in re.findall(r"^\|\s*([\w ]+?)\s*=(.*)$", m.group(1), re.M)}


def norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower().replace("&nbsp;", ""))


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("&nbsp;", " ")).strip()


def main() -> int:
    apply = "--apply" in sys.argv
    raw = WORLD.read_text("utf-8")
    world = json.loads(raw)
    tail = "\n" if raw.endswith("\n") else ""
    for fmt in (dict(ensure_ascii=False, separators=(",", ":")), dict(ensure_ascii=False)):
        if json.dumps(world, **fmt) + tail == raw:
            break
    else:
        raise SystemExit("world.json does not round-trip; refusing to write")
    teams = {t["id"]: t for t in world["teams"]}

    if apply:
        report = json.loads(REPORT.read_text("utf-8"))
        by = {p["id"]: p for p in world["players"]}
        n = 0
        for row in report["fills"]:
            p = by[row["id"]]
            for k, v in row["set"].items():
                if p.get(k) in (None, "") or (k in ("birth", "age", "ageEstimated") and p.get("ageEstimated")):
                    p[k] = v
                    n += 1
        WORLD.write_text(json.dumps(world, **fmt) + tail, "utf-8")
        print(f"applied {n} field(s) to {len(report['fills'])} player(s)")
        return 0

    need = [p for p in world["players"]
            if not p.get("nat") or not p.get("realName") or p.get("ageEstimated") or not p.get("birth")]
    title_of = {p["id"]: (p.get("sourcePlayerId") or p["ign"]) for p in need}
    titles = sorted(set(title_of.values()))
    pages: dict[str, str] = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = api({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                 "redirects": 1, "titles": "|".join(chunk)})
        q = r.get("query", {})
        alias = {x["from"]: x["to"] for x in q.get("normalized", []) + q.get("redirects", [])}
        got = {p["title"]: p.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("*", "")
               for p in q.get("pages", {}).values()}
        for t in chunk:
            tt = t
            while tt in alias:
                tt = alias[tt]
            pages[t] = got.get(tt, "")
        print(f"fetched {min(i + 50, len(titles))}/{len(titles)}")
        time.sleep(2)

    fills, skipped = [], []
    for p in need:
        title = title_of[p["id"]]
        text = pages.get(title, "")
        box = infobox(text)
        if not box:
            skipped.append({"id": p["id"], "ign": p["ign"], "why": "no player infobox (missing or disambiguation)", "title": title})
            continue
        team = teams.get(p.get("teamId") or "", {})
        team_ok = bool(box.get("team")) and norm(box["team"]) in (norm(team.get("name")), norm(team.get("tag")))
        role_ok = ROLE.get(box.get("role", "")) == p.get("role")
        by_source = bool(p.get("sourcePlayerId"))
        if (by_source and not team_ok and not role_ok and box.get("team") and box.get("role")) or (not by_source and not (team_ok or role_ok)):
            skipped.append({"id": p["id"], "ign": p["ign"], "why": f"identity: page team={box.get('team')} role={box.get('role')}, card {team.get('tag')} {p.get('role')}", "title": title})
            continue
        s: dict = {}
        country = box.get("country") or box.get("nationality", "").split(",")[0].strip()
        if not p.get("nat") and COUNTRY.get(country):
            s["nat"] = COUNTRY[country]
        if not p.get("realName"):
            native, name = clean(box.get("nativename", "")), clean(box.get("name", ""))
            real = native if native and CJK.search(native) and s.get("nat", p.get("nat")) in ("kr", "cn", "tw", "hk", "mo", "jp") else name
            if real:
                s["realName"] = real
        birth = box.get("birth_date", "")
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})$", birth)
        if (p.get("ageEstimated") or not p.get("birth")) and m:
            s.update(birth=birth, age=YEAR - int(m.group(1)) - (1 if (int(m.group(2)), int(m.group(3))) > (9, 28) else 0), ageEstimated=False)
        if country and not COUNTRY.get(country):
            skipped.append({"id": p["id"], "ign": p["ign"], "why": f"unmapped country {country}", "title": title})
        if s:
            fills.append({"id": p["id"], "ign": p["ign"], "team": team.get("tag"), "title": title,
                          "check": "source" if by_source else ("team" if team_ok else "role"), "set": s})
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps({"fills": fills, "skipped": skipped}, ensure_ascii=False, indent=1), "utf-8")
    print(f"needing: {len(need)}, fills: {len(fills)}, skipped: {len(skipped)} -> {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
