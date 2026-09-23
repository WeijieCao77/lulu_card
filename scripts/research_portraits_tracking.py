#!/usr/bin/env python3
"""Research portraits from trackingthepros.com - candidate discovery only.

Primary implementation: DeepSeek V4 Pro, reviewed for bounded HTTPS downloads,
real profile evidence, resumable staging and manual-only acceptance.
Input: .local-data/portrait-work-queue.json, {missing: [{id, kind, name, ...}]}.
The downloader never mutates game metadata or public image assets.
"""
import argparse
import hashlib
import io
import json
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path

import urllib.request, urllib.error, threading
from PIL import ImageFont
sys.stdout.reconfigure(encoding="utf-8")
HTTP_LOCK = threading.Lock()
HTTP_LAST = 0.0
HTTP_STOP = threading.Event()
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOCAL_DATA = ROOT / ".local-data"
INPUT_FILE = LOCAL_DATA / "portrait-work-queue.json"
CACHE_DIR = LOCAL_DATA / "portrait-20260923" / "tracking" / "profiles"
STAGED_DIR = LOCAL_DATA / "portrait-20260923" / "staged"
CONTACT_DIR = LOCAL_DATA / "portrait-20260923" / "contactsheets"
EXISTING_GLOB = LOCAL_DATA.glob("ttp-*.html")
MANIFEST_FILE = LOCAL_DATA / "portrait-20260923" / "manifest.json"

BASE_URL = "https://www.trackingthepros.com/player/{}"
IMG_PATTERNS = [
    re.compile(r"https://www\.trackingthepros\.com/img/players/[^'\"\s>]+", re.I),
    re.compile(r"https://media\.trackingthepros\.com/profile/[^'\"\s>]+", re.I),
]
EXCLUDE_PATTERNS = ["logo", "default", "unknown"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_HTML_BYTES = 8 * 1024 * 1024
MIN_IMAGE_DIM = 64
WEBP_QUALITY = 85
SHEET_SIZE = (320, 400)
CONTACTS_PER_SHEET = 24

# Windows Chinese font
FONT_PATH = Path("C:/Windows/Fonts/msyh.ttc")


def load_input():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("missing", [])


def urlquote(name):
    return urllib.parse.quote(name.strip())


def html_unescape(s):
    import html
    return html.unescape(s)


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_str(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def matches_img_pattern(src):
    src = html_unescape(src.strip())
    lower = src.lower()
    if any(e in lower for e in EXCLUDE_PATTERNS):
        return None
    for pat in IMG_PATTERNS:
        if pat.match(src):
            return src
    return None


class ProfileHTMLParser(HTMLParser):
    """Extract images and player info table from profile HTML."""
    def __init__(self):
        super().__init__()
        self.img_srcs = []
        self.in_player_info = False
        self.in_table = False
        self.in_td = False
        self.current_td = ""
        self.table_rows = []
        self.current_row = []
        self.player_info_div_depth = 0
        self.heading = None
        self._active_divs = []

    def handle_starttag(self, tag, attrs):
        attrs = {k.lower(): v for k, v in attrs}
        if tag == "img":
            src = attrs.get("src", "")
            if src:
                matched = matches_img_pattern(src)
                if matched and matched not in self.img_srcs:
                    self.img_srcs.append(matched)
            return
        if tag == "div" and "player-info-inner" in attrs.get("class", ""):
            if not self.in_player_info:
                self.in_player_info = True
                self.player_info_div_depth = 1
            else:
                self.player_info_div_depth += 1
            return
        if self.in_player_info and tag == "table":
            self.in_table = True
            return
        if self.in_table and tag == "tr":
            self.current_row = []
            return
        if self.in_table and tag in ("td", "th"):
            self.in_td = True
            self.current_td = ""

    def handle_endtag(self, tag):
        if self.in_table and tag in ("td", "th") and self.in_td:
            self.in_td = False
            self.current_row.append(self.current_td.strip())
            return
        if self.in_table and tag == "tr":
            if self.current_row:
                self.table_rows.append(self.current_row)
            return
        if self.in_table and tag == "table":
            self.in_table = False
            return
        if tag == "div" and self.in_player_info:
            self.player_info_div_depth -= 1
            if self.player_info_div_depth <= 0:
                self.in_player_info = False
                self.player_info_div_depth = 0

    def handle_data(self, data):
        if self.in_td:
            self.current_td += data

    def get_profile_fields(self):
        fields = {}
        for row in self.table_rows:
            if len(row) >= 2:
                key = row[0].lower().replace(" ", "_")
                fields[key] = html_unescape(row[1].strip())
        return fields


def parse_profile_html(html_text):
    parser = ProfileHTMLParser()
    parser.feed(html_text)
    images = parser.img_srcs
    fields = parser.get_profile_fields()
    heading = re.search(r'<h1[^>]*>(.*?)</h1>', html_text, re.S | re.I)
    fields['heading'] = html_unescape(re.sub('<[^>]+>', ' ', heading.group(1))).strip() if heading else ''
    return images, fields


def http_fetch(url, timeout=15):
    global HTTP_LAST
    if HTTP_STOP.is_set(): return None, 429
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in {'www.trackingthepros.com', 'media.trackingthepros.com'}:
        return None, -5
    with HTTP_LOCK:
        wait = max(0, HTTP_LAST + 1.0 - time.monotonic())
        if wait: time.sleep(wait)
        HTTP_LAST = time.monotonic()
    if HTTP_STOP.is_set(): return None, 429
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=timeout) as response:
            final = urllib.parse.urlparse(response.geturl())
            if final.scheme != 'https' or final.hostname not in {'www.trackingthepros.com', 'media.trackingthepros.com'}: return None, -5
            data = response.read(MAX_IMAGE_BYTES + 1)
            return (None, -2) if len(data) > MAX_IMAGE_BYTES else (data, 200)
    except urllib.error.HTTPError as e:
        if e.code == 429: HTTP_STOP.set()
        return None, e.code
    except Exception:
        return None, -4

def fetch_profile(name, timeout=15, max_retries=0):
    data, status = http_fetch(BASE_URL.format(urlquote(name)), timeout)
    return (data.decode('utf-8', errors='replace') if data else None), status

def download_image(url, timeout=15):
    return http_fetch(url, timeout)


def validate_and_convert_image(data: bytes, target_path: Path):
    """Validate image, resize fit to 320x400, save webp. Returns (ok, reason, sha256)."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        if img.width < MIN_IMAGE_DIM or img.height < MIN_IMAGE_DIM:
            return False, "too_small", hash_bytes(data)
        img.thumbnail(SHEET_SIZE, Image.LANCZOS)
        img.save(target_path, "WEBP", quality=WEBP_QUALITY)
        return True, "ok", hash_bytes(data)
    except Exception as e:
        return False, f"invalid:{e}", hash_bytes(data)


def save_html_cache(name: str, html_text: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fname = hash_str(name)[:16] + ".html"
    path = CACHE_DIR / fname
    path.write_text(html_text, encoding="utf-8")
    return path


def load_existing_html_caches():
    caches = {}
    for p in EXISTING_GLOB:
        try:
            caches[p.name] = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            pass
    for p in CACHE_DIR.glob("*.html"):
        try:
            caches[p.name] = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            pass
    return caches


def process_person(person, caches, rate_limiter, stop_flag):
    pid = person.get("id", "")
    name = person.get("name", "")
    real_name = person.get("realName") or ""
    region = person.get("region", "")
    club = person.get("club", "")
    kind = person.get("kind", "")
    is_player = "player" in kind.lower() or pid.startswith("P")
    is_coach = "coach" in kind.lower() or pid.startswith("c")
    target_role = "player" if is_player else "coach"
    if "TBD" in name or "TBD" in real_name:
        return {"id": pid, "name": name, "status": "skipped_tbd", "error": "TBD in name"}

    html_text = None
    source_html_path = None
    # Check existing caches, including explicitly fetched source examples.
    legacy = 'ttp-' + urllib.parse.quote(name) + '.html'
    cache_key = hash_str(name)[:16] + ".html"
    if cache_key not in caches and legacy in caches: caches[cache_key] = caches[legacy]
    if cache_key in caches:
        html_text = caches[cache_key]
        source_html_path = cache_key
    else:
        html_text, status = fetch_profile(name)
        if status == 429:
            stop_flag["stop"] = True
            return {"id": pid, "name": name, "status": "error", "error": "rate_limited_429"}
        if status == 403:
            return {"id": pid, "name": name, "status": "error", "error": "forbidden_403"}
        if html_text is None or status != 200:
            return {"id": pid, "name": name, "status": "not_found", "error": f"http_{status}"}
        source_html_path = save_html_cache(name, html_text)

    images, fields = parse_profile_html(html_text)
    if not images:
        return {
            "id": pid, "name": name, "status": "no_image", "error": "no profile image found",
            "sourcePage": BASE_URL.format(urlquote(name)),
            "profile_fields": fields,
            "sourceHtml": str(source_html_path),
        }

    # Treat all images as candidates
    candidates = []
    for img_url in images[:3]:  # max 3 candidates per person
        img_data, img_status = download_image(img_url)
        if img_data is None or img_status != 200:
            candidates.append({"url": img_url, "status": "download_failed", "error": f"http_{img_status}"})
            continue
        staged_name = f"{hash_str(pid + img_url)[:16]}.webp"
        staged_path = STAGED_DIR / staged_name
        STAGED_DIR.mkdir(parents=True, exist_ok=True)
        ok, reason, sha = validate_and_convert_image(img_data, staged_path)
        if not ok:
            candidates.append({
                "url": img_url, "status": "invalid_image", "error": reason,
                "sha256": sha, "bytes": len(img_data),
            })
            continue
        source_name = fields.get("name", "")
        source_role = fields.get("role", "Unknown")
        source_birthplace = fields.get("birthplace", "")
        source_team = fields.get("team", "")

        record = {
            "id": pid,
            "name": name,
            "targetRealName": real_name,
            "targetRegion": region,
            "targetClub": club,
            "kind": kind,
            "status": "candidate",
            "sourcePage": BASE_URL.format(urlquote(name)),
            "sourceImage": img_url,
            "sourceHtml": str(source_html_path),
            "profileName": source_name,
            "profileHeading": fields.get("heading", ""),
            "profileRole": source_role,
            "profileBirthplace": source_birthplace,
            "profileTeam": source_team,
            "stagedFile": str(staged_path.relative_to(ROOT)),
            "bytes": len(img_data),
            "sha256": sha,
            "width": Image.open(staged_path).width,
            "height": Image.open(staged_path).height,
            "license": "Profile-page photograph; rights not specified on source",
            "identityNote": "Candidate only - manual verification required",
        }
        # Role check for coaches
        if is_coach and "coach" not in source_role.lower():
            record["roleFlag"] = "AMBIGUOUS_ROLE"
        candidates.append(record)

    return {
        "id": pid,
        "name": name,
        "status": "candidate" if any(c.get("status") == "candidate" for c in candidates) else "no_candidate",
        "candidates": candidates,
        "profile_fields": fields,
        "sourceHtml": str(source_html_path),
    }


def build_contact_sheet(image_paths, labels, output_name):
    if not image_paths:
        return None
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)
    cols = 6
    rows = 4
    sheet_w = cols * SHEET_SIZE[0]
    sheet_h = rows * (SHEET_SIZE[1] + 45)
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    for idx, (img_path, label) in enumerate(zip(image_paths, labels)):
        if idx >= CONTACTS_PER_SHEET:
            break
        try:
            img = Image.open(img_path)
            img.thumbnail(SHEET_SIZE, Image.LANCZOS)
            x = (idx % cols) * SHEET_SIZE[0] + (SHEET_SIZE[0] - img.width) // 2
            y = (idx // cols) * (SHEET_SIZE[1] + 45) + 10
            sheet.paste(img, (x, y))
            from PIL import ImageDraw
            draw = ImageDraw.Draw(sheet)
            try:
                font = ImageFont.truetype(str(FONT_PATH), 14)
            except Exception:
                font = ImageFont.load_default()
            draw.text((x, y + img.height + 5), label, font=font, fill="black")
        except Exception:
            continue
    out_path = CONTACT_DIR / output_name
    sheet.save(out_path, "WEBP", quality=85)
    return out_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--kind", type=str, default="all", choices=["player", "coach", "all"])
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    if not INPUT_FILE.exists():
        print(f"Input file not found: {INPUT_FILE}", file=sys.stderr)
        sys.exit(1)

    people = load_input()
    if args.kind != "all":
        people = [p for p in people if args.kind in p.get("kind", "").lower() or p.get("id", "").lower().startswith(args.kind[:1])]
    priority = ['Guilhoto', 'shanji', 'Daeny', 'Edgar', 'RapidStar', 'bonO', 'oDin', 'Spawn', 'SeeEl', 'Keel', 'Revenge', 'Aki', 'xiaohuangren', 'Smiley']
    people.sort(key=lambda p: priority.index(p['name']) if p['name'] in priority else 100)
    if args.resume and MANIFEST_FILE.exists():
        previous = json.loads(MANIFEST_FILE.read_text('utf-8'))
        done = {p['id'] for p in previous}
        people = [p for p in people if p['id'] not in done]
    else: previous = []
    if args.limit:
        people = people[:args.limit]

    print(f"Processing {len(people)} people (kind={args.kind}, limit={args.limit if args.limit else 'all'})")

    STAGED_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)

    caches = load_existing_html_caches()
    rate_limiter = {"tokens": 0, "max_per_sec": 1, "window_start": time.time()}
    stop_flag = {"stop": False}

    manifest = previous.copy()
    risk_map = {}  # sha256 -> list of ids

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {executor.submit(process_person, p, caches, rate_limiter, stop_flag): p for p in people}
        for future in as_completed(futures):
            if stop_flag["stop"]:
                print("Rate limit 429 encountered, stopping further requests...")
                for f in futures:
                    if not f.done():
                        f.cancel()
                break
            person = futures[future]
            try:
                result = future.result()
            except Exception as e:
                result = {"id": person.get("id", ""), "name": person.get("name", ""), "status": "error", "error": str(e)}
            manifest.append(result)
            MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
            MANIFEST_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, default=str), 'utf-8')
            print(f"{result.get('id')} {result.get('name')}: {result.get('status')}", flush=True)
            if result.get("status") == "candidate":
                for cand in result.get("candidates", []):
                    if cand.get("status") == "candidate" and cand.get("sha256"):
                        sha = cand["sha256"]
                        risk_map.setdefault(sha, []).append(cand.get("id", ""))

    # Risk detection: same hash across different ids
    for entry in manifest:
        if entry.get("status") == "candidate":
            for cand in entry.get("candidates", []):
                if cand.get("status") == "candidate" and cand.get("sha256"):
                    sha = cand["sha256"]
                    ids = risk_map.get(sha, [])
                    unique_ids = list(set(ids))
                    if len(unique_ids) > 1:
                        cand["risk"] = "SAME_IMAGE_HASH_ACROSS_DIFFERENT_PEOPLE"
                        cand["riskIds"] = unique_ids

    # Build contact sheets
    sheet_items = []
    for entry in manifest:
        if entry.get("status") == "candidate":
            for cand in entry.get("candidates", []):
                if cand.get("status") == "candidate" and cand.get("stagedFile"):
                    staged_rel = Path(cand["stagedFile"])
                    full_path = ROOT / staged_rel
                    if full_path.exists():
                        label = f"{cand.get('id', '')} {cand.get('name', '')} (role:{cand.get('profileRole', '')})"
                        sheet_items.append((full_path, label))

    sheet_count = 0
    for i in range(0, len(sheet_items), CONTACTS_PER_SHEET):
        batch = sheet_items[i:i+CONTACTS_PER_SHEET]
        out_name = f"contactsheet_{sheet_count:03d}.webp"
        build_contact_sheet([p for p,_ in batch], [l for _,l in batch], out_name)
        sheet_count += 1

    MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False, default=str)

    # Statistics
    total = len(manifest)
    candidates = sum(1 for m in manifest if m.get("status") == "candidate")
    no_image = sum(1 for m in manifest if m.get("status") == "no_image")
    no_candidate = sum(1 for m in manifest if m.get("status") == "no_candidate")
    errors = sum(1 for m in manifest if m.get("status") == "error")
    not_found = sum(1 for m in manifest if m.get("status") == "not_found")
    skipped = sum(1 for m in manifest if m.get("status") == "skipped_tbd")
    total_images = sum(len(m.get("candidates", [])) for m in manifest if m.get("status") == "candidate")
    valid_candidates = sum(
        1 for m in manifest if m.get("status") == "candidate"
        for c in m.get("candidates", []) if c.get("status") == "candidate"
    )

    print("\n===== PORTRAIT RESEARCH COMPLETE =====")
    print(f"Total people processed: {total}")
    print(f"  Candidates with image: {candidates}")
    print(f"  No image on page: {no_image}")
    print(f"  No valid candidate: {no_candidate}")
    print(f"  Errors: {errors}")
    print(f"  Not found (non-200): {not_found}")
    print(f"  Skipped TBD: {skipped}")
    print(f"  Total candidate images: {total_images}")
    print(f"  Valid staged images: {valid_candidates}")
    print(f"  Contact sheets generated: {sheet_count}")
    print(f"Manifest written to: {MANIFEST_FILE}")
    print("=======================================")


if __name__ == "__main__":
    main()
