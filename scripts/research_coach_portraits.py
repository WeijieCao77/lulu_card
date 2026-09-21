import json, os, re, time, html, urllib.parse, urllib.request, urllib.error, threading, queue, random
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image, ImageOps
from io import BytesIO

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / ".local-data"
OUT = DATA / "coach-portrait-research"
STAGED = OUT / "staged"
CONTACTS = OUT / "contactsheets"
JOURNAL = OUT / "journal.jsonl"
INVENTORY = DATA / "missing-faces.json"

UA = {"User-Agent": "Mozilla/5.0 research script"}
TIMEOUT = 12
MAX_WORKERS = 2
SLEEP = 0.75
MAX_BYTES = 8 * 1024 * 1024
MIN_SIZE = 50
TARGET_W, TARGET_H = 320, 400

CHAIN_HOST = "https://chaincc.lol"
WIKI_API = "https://en.wikipedia.org/w/api.php"

# Only non-ambiguous coach mappings, never players like Doran (wrong player)
WIKI_MAP = {
    "kkOma": "https://en.wikipedia.org/wiki/Kkoma",
    "Reignover": "https://en.wikipedia.org/wiki/Reignover",
    "cvMax": "https://en.wikipedia.org/wiki/CvMax",
    "SSONG": "https://en.wikipedia.org/wiki/Ssong",
    "Tabe": "https://en.wikipedia.org/wiki/Tabe_(League_of_Legends)",
    "WarHorse": "https://en.wikipedia.org/wiki/WarHorse_(League_of_Legends)",
    "Spica": "https://en.wikipedia.org/wiki/Spica_(League_of_Legends)",
}

stop = threading.Event()
journal_lock = threading.Lock()
stage_lock = threading.Lock()


def safe_print(msg):
    print(msg.encode("utf-8", "replace").decode("utf-8"))


def journal(entry):
    with journal_lock:
        with open(JOURNAL, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def http_get(url, timeout=TIMEOUT):
    if stop.is_set(): raise RuntimeError("Stopped after rate limit")
    time.sleep(SLEEP)
    req = urllib.request.Request(url, headers=UA)
    try:
        response = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        if e.code == 429: stop.set()
        raise
    with response as r:
        if r.status == 429:
            raise RuntimeError("HTTP 429")
        return r.read(MAX_BYTES + 1), r.headers


def fetch_chaincc(name):
    """Fetch ChainCC page for a name. Returns dict or None."""
    slug = urllib.parse.quote(name)
    url = f"{CHAIN_HOST}/free/players/{slug}"
    raw, _ = http_get(url)
    text = raw.decode("utf-8", "replace")
    from research_missing_portraits import DataPageParser
    parser = DataPageParser()
    parser.feed(text)
    if not parser.data_page_json: return None
    data = json.loads(parser.data_page_json)
    player = data.get('props', {}).get('player')
    if not player: return None
    return {
        "name": player.get("name"),
        "photo": player.get("photo"),
        "country": player.get("country"),
        "role": player.get("role"),
        "team": player.get("team"),
        "sourcePage": url,
    }


def resolve_chaincc_photo(photo_val):
    """ChainCC photo may be relative or absolute. Return full URL."""
    if not photo_val:
        return None
    if isinstance(photo_val, str):
        if photo_val.startswith("http"):
            return photo_val
        if photo_val.startswith("/storage/"):
            return CHAIN_HOST + photo_val
        return None
    return None


def fetch_wikipedia(url):
    """Extract infobox main image URL from Wikipedia article."""
    raw, _ = http_get(url)
    text = raw.decode("utf-8", "replace")
    # Look for infobox image patterns
    m = re.search(r'class="infobox-image"[^>]*>\s*<img[^>]+src="([^"]+)"', text, re.IGNORECASE)
    if not m:
        # Alternative pattern
        m = re.search(r'<table[^>]*class="infobox[^"]*"[^>]*>.*?<img[^>]+src="([^"]+)"', text, re.DOTALL | re.IGNORECASE)
    if not m:
        # Any image in infobox section
        m = re.search(r'<div[^>]*class="infobox-image[^"]*"[^>]*>\s*<img[^>]+src="([^"]+)"', text, re.IGNORECASE)
    if not m:
        return None
    img_url = m.group(1)
    # Ensure https
    if img_url.startswith("//"):
        img_url = "https:" + img_url
    return img_url


def fetch_wiki_api_title(title):
    """Use Wikipedia API to get page image."""
    params = {
        "action": "query",
        "titles": title,
        "prop": "pageimages",
        "format": "json",
        "pithumbsize": "500",
        "redirects": "1",
    }
    url = WIKI_API + "?" + urllib.parse.urlencode(params)
    raw, _ = http_get(url)
    data = json.loads(raw.decode("utf-8", "replace"))
    pages = data.get("query", {}).get("pages", {})
    for pid, page in pages.items():
        if pid == "-1":
            return None
        thumb = page.get("thumbnail", {})
        return thumb.get("source")
    return None


def download_and_validate(url):
    """Download image bytes. Return bytes if valid, else None."""
    if not url:
        return None
    try:
        raw, _ = http_get(url)
    except Exception:
        return None
    if len(raw) > MAX_BYTES:
        return None
    try:
        img = Image.open(BytesIO(raw))
        img.verify()
    except Exception:
        return None
    img = Image.open(BytesIO(raw))
    w, h = img.size
    if w < MIN_SIZE or h < MIN_SIZE:
        return None
    # Reject default images (placeholder)
    # Simple heuristic: very small aspect ratio or solid colors
    if w / h > 5 or h / w > 5:
        return None
    # Reject likely placeholders: single pixel diversity low
    img_gray = img.convert("L")
    colors = img_gray.getcolors(maxcolors=10000000)
    if colors and len(colors) < 100:
        return None
    return raw


def process_image(raw):
    """Resize and return webp bytes."""
    img = Image.open(BytesIO(raw))
    img = ImageOps.exif_transpose(img)
    img.thumbnail((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    if img.mode not in ('RGB', 'RGBA'): img = img.convert('RGBA')
    buf = BytesIO()
    img.save(buf, format="WEBP", quality=85)
    return buf.getvalue()


def normalize_name(name):
    if not name:
        return ""
    return html.unescape(name).strip()


def validate_evidence(target, evidence):
    """Check evidence name matches target name."""
    if not evidence or not evidence.get("name"):
        return False
    ev_name = normalize_name(evidence["name"]).lower()
    tgt_name = target.lower()
    # Remove spaces/underscores for matching
    ev_clean = re.sub(r"[\s_\-]", "", ev_name)
    tgt_clean = re.sub(r"[\s_\-]", "", tgt_name)
    return ev_clean == tgt_clean


def research_coach(coach):
    target = coach["name"]
    coach_id = coach.get("id") or target
    result = {
        "target": target,
        "kind": coach.get("kind", "coach"),
        "team": coach.get("team"),
        "region": coach.get("region"),
        "sourcePage": None,
        "source_photo_url": None,
        "evidence": None,
        "staged_file": None,
        "error": None,
    }
    try:
        # 1. ChainCC
        if target != "TBD":
            try:
                cc_data = fetch_chaincc(target)
                if cc_data:
                    evidence = {
                        "name": cc_data.get("name"),
                        "country": cc_data.get("country"),
                        "role": cc_data.get("role"),
                        "team": cc_data.get("team"),
                    }
                    if validate_evidence(target, evidence):
                        photo_url = resolve_chaincc_photo(cc_data.get("photo"))
                        result["sourcePage"] = cc_data.get("sourcePage")
                        result["evidence"] = evidence
                        result["source_photo_url"] = photo_url
                    else:
                        journal({"coach": target, "action": "chaincc_name_mismatch", "got": evidence.get("name")})
            except Exception as e:
                journal({"coach": target, "action": "chaincc_error", "error": str(e)})

        # 2. Wikipedia fallback (only mapped)
        if not result["source_photo_url"] and target in WIKI_MAP:
            wiki_url = WIKI_MAP[target]
            try:
                img_url = fetch_wikipedia(wiki_url)
                if not img_url:
                    # Try API
                    title = wiki_url.rstrip("/").rsplit("/", 1)[-1]
                    title = urllib.parse.unquote(title)
                    img_url = fetch_wiki_api_title(title)
                if img_url:
                    result["sourcePage"] = wiki_url
                    result["source_photo_url"] = img_url
                    result["evidence"] = {
                        "name": target,  # We trust our explicit mapping
                        "country": None,
                        "role": "coach",
                        "team": coach.get("team"),
                    }
            except Exception as e:
                journal({"coach": target, "action": "wikipedia_error", "error": str(e)})

        # Download and stage
        if result["source_photo_url"]:
            raw = download_and_validate(result["source_photo_url"])
            if raw:
                webp = process_image(raw)
                stage_name = f"{coach_id}_{target}.webp".replace("/", "_")
                stage_path = STAGED / stage_name
                with stage_lock:
                    with open(stage_path, "wb") as f:
                        f.write(webp)
                result["staged_file"] = str(stage_path)
            else:
                journal({"coach": target, "action": "image_rejected", "url": result["source_photo_url"]})

    except Exception as e:
        result["error"] = str(e)
    return result


def make_contact_sheet(results):
    """Create contact sheets with 40 photos per page."""
    staged_results = [r for r in results if r.get("staged_file")]
    if not staged_results:
        return
    CONTACTS.mkdir(parents=True, exist_ok=True)
    page = 1
    photos = []
    for r in staged_results:
        try:
            img = Image.open(r["staged_file"])
            photos.append((r["target"], img))
            if len(photos) == 40:
                sheet = create_sheet_page(photos, page)
                sheet.save(CONTACTS / f"sheet_{page:03d}.webp", "WEBP", quality=85)
                safe_print(f"Contact sheet {page} saved with {len(photos)} photos")
                page += 1
                photos = []
        except Exception as e:
            safe_print(f"Error adding {r['target']} to sheet: {e}")
    if photos:
        sheet = create_sheet_page(photos, page)
        sheet.save(CONTACTS / f"sheet_{page:03d}.webp", "WEBP", quality=85)
        safe_print(f"Contact sheet {page} saved with {len(photos)} photos")


def create_sheet_page(photos, page_num):
    """Create a single contact sheet page with IGN labels."""
    COLS = 5
    ROWS = 8
    cell_w, cell_h = TARGET_W + 10, TARGET_H + 60
    margin = 20
    sheet_w = margin * 2 + COLS * cell_w
    sheet_h = margin * 2 + ROWS * cell_h + 40
    from PIL import ImageDraw, ImageFont
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
    except Exception:
        font = ImageFont.load_default()
        title_font = font
    draw.text((margin, 10), f"Coach Portraits - Page {page_num}", fill="black", font=title_font)
    y_offset = margin + 30
    for i, (name, img) in enumerate(photos[:40]):
        row, col = divmod(i, COLS)
        x = margin + col * cell_w
        y = y_offset + row * cell_h
        # Paste image
        sheet.paste(img, (x, y))
        # Draw IGN label
        draw.text((x, y + TARGET_H + 5), name[:20], fill="black", font=font)
    return sheet


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    STAGED.mkdir(parents=True, exist_ok=True)
    with open(INVENTORY, "r", encoding="utf-8") as f:
        inventory = json.load(f)
    coaches = [c for c in inventory if c.get("kind") == "coach" and c.get("name") != "TBD"]
    safe_print(f"Processing {len(coaches)} coaches...")

    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(research_coach, c): c for c in coaches}
        for future in as_completed(futures):
            coach = futures[future]
            try:
                result = future.result()
                results.append(result)
                journal(result)
                status = "OK" if result.get("staged_file") else "FAIL"
                msg = f"[{status}] {coach['name']}"
                if result.get("error"):
                    msg += f" - {result['error']}"
                if result.get("source_photo_url") and not result.get("staged_file"):
                    msg += " - image rejected"
                safe_print(msg)
            except Exception as e:
                safe_print(f"[ERROR] {coach['name']}: {e}")
            time.sleep(SLEEP + random.uniform(0, 0.1))

    # Save results
    results_sorted = sorted(results, key=lambda r: r["target"])
    out_file = OUT / "results.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results_sorted, f, ensure_ascii=False, indent=2)
    safe_print(f"Results saved to {out_file}")

    # Make contact sheets
    make_contact_sheet(results_sorted)
    safe_print("Done.")


if __name__ == "__main__":
    main()