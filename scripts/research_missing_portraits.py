#!/usr/bin/env python3
"""
Portrait research script for missing player images.

Discovers and stages candidate portraits from chaincc.lol source.
Does NOT auto-apply; all candidates remain staged for review.
"""

import argparse
import json
import re
import sys
import time
import hashlib
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / ".local-data" / "portrait-research"
SOURCE_HOST = "chaincc.lol"
SOURCE_PHOTO_PREFIX = "https://chaincc.lol/storage/leaguepedia/players/"
SOURCE_PROFILE_URL = "https://chaincc.lol/free/players/{}"
TIMEOUT = 20
MAX_CONCURRENT = 2
REQUEST_INTERVAL = 1.0  # seconds between requests per worker
MAX_PHOTO_BYTES = 8 * 1024 * 1024  # 8MB
MIN_PHOTO_DIM = 50
THUMB_SIZE = (320, 400)
WEBP_QUALITY = 85
CONTACT_SHEET_MAX = 48

ROLE_MAP = {
    "top": "top",
    "上单": "top",
    "jungle": "jungle",
    "打野": "jungle",
    "middle": "middle",
    "mid": "middle",
    "中单": "middle",
    "bottom": "bottom",
    "adc": "bottom",
    "bot": "bottom",
    "下路": "bottom",
    "support": "support",
    "辅助": "support",
}

REJECT_FILENAME_PATTERNS = ("placeholder", "silhouette", "default")


class DataPageParser(HTMLParser):
    """Extract data-page attribute JSON from HTML."""

    def __init__(self):
        super().__init__()
        self.data_page_json = None
        self._in_body = False

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "div":
            for name, value in attrs:
                if name == "data-page":
                    self.data_page_json = value
                    return


def log(msg):
    print(f"[{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}] {msg}", flush=True)


def load_world_players():
    world = json.loads((ROOT / 'src/data/world.json').read_text(encoding='utf-8'))
    dossier = json.loads((ROOT / 'src/data/dossier.json').read_text(encoding='utf-8'))
    teams = {t['id']: t for t in world['teams']}
    missing = []
    for p in world['players']:
        d = dossier['players'].get(p['id'], {})
        if d.get('img') and (ROOT / 'public/lol/faces' / d['img']).exists(): continue
        t = teams.get(p.get('teamId'), {})
        missing.append({**p, 'teamId':t.get('name',''), 'teamTag':t.get('tag',''), 'rosterSource':None})
    return missing

def load_roster_caches():
    return []

def find_missing_players(all_players, rosters):
    return all_players


class PortraitFetcher:
    """Thread-safe fetcher with rate limiting."""

    def __init__(self, cache_dir):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.stopped = threading.Event()
        self._lock = threading.Lock()
        self._last_request_time = {}

    def _wait_for_rate(self, worker_id):
        with self._lock:
            now = time.time()
            last = self._last_request_time.get(worker_id, 0)
            wait = REQUEST_INTERVAL - (now - last)
            if wait > 0:
                time.sleep(wait)
            self._last_request_time[worker_id] = time.time()

    def fetch_profile(self, ign, worker_id=0):
        """Fetch player profile HTML, with caching."""
        if self.stopped.is_set(): return None, False
        cache_key = re.sub(r'[^a-z0-9]+', '_', ign.casefold()).strip('_') or "unknown"
        cache_file = self.cache_dir / f"profile_{cache_key}.html"

        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    log(f"Cache hit for {ign}")
                    return f.read(), True
            except OSError:
                pass

        self._wait_for_rate(worker_id)
        url = SOURCE_PROFILE_URL.format(quote(ign, safe=""))
        req = Request(url, headers={"User-Agent": "Mozilla/5.0 (research script)"})

        try:
            with urlopen(req, timeout=TIMEOUT) as resp:
                html = resp.read().decode("utf-8", errors="replace")
                with open(cache_file, "w", encoding="utf-8") as f:
                    f.write(html)
                log(f"Fetched {url} ({len(html)} bytes)")
                return html, False
        except HTTPError as e:
            if e.code == 429:
                self.stopped.set()
                log(f"WARNING: Rate limited (429) on {ign}, stopping further requests")
                return None, False
            elif e.code == 403:
                log(f"403 Forbidden for {ign}, skipping (no retry)")
            else:
                log(f"HTTP {e.code} for {ign}, skipping")
            return None, False
        except URLError as e:
            log(f"URL error for {ign}: {e}, skipping")
            return None, False
        except Exception as e:
            log(f"Error fetching {ign}: {e}, skipping")
            return None, False

    def fetch_photo(self, photo_url, worker_id=0):
        """Download photo bytes with size limit."""
        try:
            parsed = photo_url
            if not parsed.startswith(SOURCE_PHOTO_PREFIX):
                log(f"Rejecting photo URL outside allowed host: {photo_url}")
                return None

            self._wait_for_rate(worker_id)
            req = Request(photo_url, headers={"User-Agent": "Mozilla/5.0 (research script)"})
            with urlopen(req, timeout=TIMEOUT) as resp:
                data = resp.read(MAX_PHOTO_BYTES + 1)
                if len(data) > MAX_PHOTO_BYTES:
                    log(f"Photo too large ({len(data)} bytes): {photo_url}")
                    return None
                return data
        except Exception as e:
            log(f"Photo download failed for {photo_url}: {e}")
            return None


def parse_profile_html(html):
    """Parse data-page JSON from HTML."""
    parser = DataPageParser()
    try:
        parser.feed(html)
    except Exception:
        pass

    if parser.data_page_json:
        try:
            return json.loads(parser.data_page_json)
        except json.JSONDecodeError:
            # Try to find JSON-like content
            match = re.search(r'\{.*\}', html, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
    return None


def extract_props(data_page):
    """Extract player and teams props from data-page structure."""
    if not data_page:
        return None, None

    props = data_page.get("props", data_page)
    player = props.get("player", None)
    teams = props.get("teams", [])
    return player, teams


def canonical_role(role_str):
    """Map role string to canonical form."""
    if not role_str:
        return ""
    key = role_str.casefold().strip()
    return ROLE_MAP.get(key, "")


def verify_identity(candidate, target):
    """Verify candidate identity against target data."""
    if not candidate or not isinstance(candidate, dict):
        return False, []

    issues = []
    cand_name = candidate.get("name", "")
    if cand_name.casefold() != target["ign"].casefold():
        issues.append(f"Name mismatch: {cand_name} != {target['ign']}")
        return False, issues

    # Role verification
    target_role_canon = canonical_role(target.get("role", ""))
    cand_role_canon = canonical_role(candidate.get("role", ""))
    if target_role_canon and cand_role_canon:
        if cand_role_canon != target_role_canon:
            issues.append(f"Role mismatch: {cand_role_canon} != {target_role_canon}")
    elif target_role_canon and not cand_role_canon:
        issues.append("Candidate has no role data")

    return not issues, issues



def check_photo_data(photo_bytes):
    """Validate photo bytes using PIL."""
    if not photo_bytes:
        return False, "No photo data"

    # Check filename patterns
    # (We check the URL separately)

    try:
        from io import BytesIO
        img = Image.open(BytesIO(photo_bytes))
        w, h = img.size
        if w < MIN_PHOTO_DIM or h < MIN_PHOTO_DIM:
            return False, f"Image too small: {w}x{h}"
        img.verify()
        return True, f"{w}x{h}"
    except Exception as e:
        return False, f"PIL verification failed: {e}"


def process_player(target, fetcher, worker_id):
    """Process a single player target."""
    result = {
        "target": target,
        "sourcePage": None,
        "photo": None,
        "identity_details": [],
        "confidence": "none",
        "rosterSource": target.get("rosterSource"),
        "candidate_found": False,
        "photo_staged": False,
        "error": None,
        "staged_webp": None,
        "source_photo_url": None,
        "country_evidence": None,
        "role_evidence": None,
        "team_evidence": None,
        "review_reason": None,
    }

    if not target.get("ign"):
        result["error"] = "No IGN provided"
        return result

    html, is_cached = fetcher.fetch_profile(target["ign"], worker_id)
    if html is None:
        result["error"] = "Profile fetch failed"
        return result

    data_page = parse_profile_html(html)
    if not data_page:
        result["error"] = "No data-page JSON found in HTML"
        return result

    player, teams = extract_props(data_page)
    if not player:
        result["error"] = "No player props in data-page"
        return result

    result["sourcePage"] = SOURCE_PROFILE_URL.format(quote(target["ign"], safe=""))

    # Identity verification
    is_valid, issues = verify_identity(player, target)
    result["identity_details"] = issues

    if not is_valid:
        result["error"] = f"Identity verification failed: {'; '.join(issues)}"
        result["confidence"] = "rejected"
        return result

    # Collect evidence
    result["country_evidence"] = player.get("country", "")
    result["role_evidence"] = player.get("role", "")
    result["team_evidence"] = player.get("team", "")

    target_team = (target.get('teamId') or '').strip().casefold()
    cand_team = (player.get('team') or '').strip().casefold()
    has_team_match = bool(target_team and cand_team in [target_team, (target.get('teamTag') or '').casefold()])
    role_matches = canonical_role(target.get('role')) == canonical_role(player.get('role'))
    result['confidence'] = 'high' if has_team_match and role_matches else 'review'
    if not has_team_match: result['review_reason'] = 'Team absent or changed; manual identity review required'
    result["candidate_found"] = True

    # Photo handling
    photo_url = player.get("photo", "")
    if photo_url:
        result["source_photo_url"] = photo_url
        # Check URL for rejected patterns
        url_lower = photo_url.casefold()
        rejected = any(p in url_lower for p in REJECT_FILENAME_PATTERNS)
        if rejected:
            result["error"] = f"Photo URL contains rejected pattern: {photo_url}"
            result["photo_staged"] = False
            return result

        photo_bytes = fetcher.fetch_photo(photo_url, worker_id)
        if photo_bytes:
            is_valid_img, img_info = check_photo_data(photo_bytes)
            if is_valid_img:
                # Stage photo
                target_id = target.get("id", target["ign"])
                id_hash = hashlib.sha256(str(target_id).encode()).hexdigest()[:16]
                webp_filename = f"{id_hash}.webp"
                staged_path = CACHE_DIR / "staged" / webp_filename
                staged_path.parent.mkdir(parents=True, exist_ok=True)

                try:
                    from io import BytesIO
                    img = Image.open(BytesIO(photo_bytes))
                    img = img.convert("RGBA")
                    img.thumbnail(THUMB_SIZE, Image.LANCZOS)
                    img.save(staged_path, "WEBP", quality=WEBP_QUALITY)
                    result["photo_staged"] = True
                    result["staged_webp"] = str(staged_path)
                    result["photo_hash_sha256"] = hashlib.sha256(photo_bytes).hexdigest()
                    result["photo_size"] = len(photo_bytes)
                    result["photo_dimensions"] = img_info
                    log(f"Staged photo for {target['ign']} -> {staged_path.name}")
                except Exception as e:
                    result["error"] = f"Failed to stage photo: {e}"
                    result["photo_staged"] = False
            else:
                result["error"] = f"Photo validation failed: {img_info}"
                result["photo_staged"] = False
        else:
            result["error"] = "Photo download failed"
            result["photo_staged"] = False
    else:
        result["error"] = "No photo URL in profile"

    return result


def generate_contact_sheet(results, output_path):
    """Generate a PNG contact sheet of staged photos."""
    staged_results = [r for r in results if r.get("photo_staged") and r.get("staged_webp")]
    if not staged_results:
        log("No staged photos for contact sheet")
        return

    # Limit to MAX per sheet
    staged_results = staged_results[:CONTACT_SHEET_MAX]

    cols = 6
    rows = (len(staged_results) + cols - 1) // cols
    thumb_w, thumb_h = 180, 220
    label_h = 30
    pad = 10

    sheet_w = cols * (thumb_w + pad) + pad
    sheet_h = rows * (thumb_h + label_h + pad) + pad

    img = Image.new("RGBA", (sheet_w, sheet_h), (255, 255, 255, 255))

    for idx, r in enumerate(staged_results):
        col = idx % cols
        row = idx // cols
        x = pad + col * (thumb_w + pad)
        y = pad + row * (thumb_h + label_h + pad)

        try:
            from io import BytesIO
            with open(r["staged_webp"], "rb") as f:
                photo_img = Image.open(BytesIO(f.read()))
                photo_img = photo_img.convert("RGBA")
                # Fit into thumb area
                photo_img.thumbnail((thumb_w, thumb_h), Image.LANCZOS)
                # Center
                px = x + (thumb_w - photo_img.width) // 2
                py = y + (thumb_h - photo_img.height) // 2
                img.paste(photo_img, (px, py), photo_img)

                # Label
                from PIL import ImageDraw
                draw = ImageDraw.Draw(img)
                label = f"{r['target']['ign']} - {r['target'].get('teamId', '?')} [{r['confidence']}]"
                draw.text((x, y + thumb_h + 2), label, fill=(0, 0, 0, 255))
        except Exception as e:
            log(f"Contact sheet error for {r['target']['ign']}: {e}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "PNG")
    log(f"Contact sheet saved to {output_path} ({len(staged_results)} photos)")


def main():
    parser = argparse.ArgumentParser(description="Research missing portrait images for players")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of players to process (pilot mode)")
    parser.add_argument("--contact-sheet", action="store_true", default=True,
                        help="Generate contact sheet PNG")
    args = parser.parse_args()

    log("=== Portrait Research Script ===")
    log(f"Repository root: {ROOT}")
    log(f"Cache directory: {CACHE_DIR}")

    # Ensure cache directory
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / "staged").mkdir(parents=True, exist_ok=True)

    # Load data
    all_players = load_world_players()
    rosters = load_roster_caches()
    missing = find_missing_players(all_players, rosters)

    if not missing:
        log("No missing players found. Nothing to do.")
        return

    if args.limit:
        missing = missing[:args.limit]
        log(f"Pilot mode: processing first {args.limit} players")

    log(f"Processing {len(missing)} players")

    fetcher = PortraitFetcher(CACHE_DIR)

    # Process with thread pool
    results = []
    stop_flag = threading.Event()

    def process_with_stop(target, worker_id):
        if stop_flag.is_set():
            return None
        result = process_player(target, fetcher, worker_id)
        if result.get("error") and "429" in result["error"]:
            stop_flag.set()
        return result

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as executor:
        futures = {}
        for i, target in enumerate(missing):
            worker_id = i % MAX_CONCURRENT
            future = executor.submit(process_with_stop, target, worker_id)
            futures[future] = target

        for future in as_completed(futures):
            if stop_flag.is_set():
                # Cancel remaining
                for f in futures:
                    f.cancel()
                break
            try:
                result = future.result()
                if result:
                    results.append(result)
                    target = futures[future]
                    if result.get("candidate_found"):
                        log(f"  Candidate for {target['ign']}: confidence={result['confidence']}, staged={result['photo_staged']}")
                    if result.get("error"):
                        log(f"  Error for {target['ign']}: {result['error']}")
            except Exception as e:
                target = futures[future]
                log(f"  Exception for {target['ign']}: {e}")
                results.append({"target": target, "error": str(e), "candidate_found": False})

    # Sort results to match input order
    missing_ids = [m["id"] for m in missing]
    results_sorted = []
    for mid in missing_ids:
        for r in results:
            if r.get("target", {}).get("id") == mid:
                results_sorted.append(r)
                break
    results = results_sorted

    # Summary
    total = len(results)
    found = sum(1 for r in results if r.get("candidate_found"))
    confirmed = sum(1 for r in results if r.get("confidence") in ("high", "medium"))
    staged = sum(1 for r in results if r.get("photo_staged"))
    errors = sum(1 for r in results if r.get("error") and not r.get("photo_staged"))
    rejected = sum(1 for r in results if r.get("confidence") == "rejected")

    log("\n=== Summary ===")
    log(f"Total processed: {total}")
    log(f"Candidates found: {found}")
    log(f"Confirmed (high/medium): {confirmed}")
    log(f"Photos staged: {staged}")
    log(f"Errors/failures: {errors}")
    log(f"Rejected (identity mismatch): {rejected}")
    log(f"Review required: {sum(1 for r in results if r.get('review_reason'))}")

    # Save candidates JSON
    output_file = CACHE_DIR / "candidates.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    log(f"\nCandidates JSON saved to {output_file}")

    # Generate contact sheet
    if args.contact_sheet:
        sheet_path = CACHE_DIR / "contact_sheet.png"
        staged_results = [r for r in results if r.get('photo_staged')]
        for i in range(0,len(staged_results),CONTACT_SHEET_MAX):
            generate_contact_sheet(staged_results[i:i+CONTACT_SHEET_MAX], CACHE_DIR / f'contact_sheet_{i//CONTACT_SHEET_MAX+1}.png')

    log("\nDone. All candidates staged for review. NO AUTO-APPLY performed.")


if __name__ == "__main__":
    main()