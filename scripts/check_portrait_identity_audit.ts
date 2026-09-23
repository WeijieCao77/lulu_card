import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ALL_CARDS, BASE_PLAYER_CARDS, COACH_CARDS, LEGEND_CARDS } from '../src/engine/cards';

const FACES_DIR = path.resolve('public/lol/faces');
const VALID_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

type Card = {
  id: string; kind: string; name?: string; ign?: string; playerId?: string;
  realName?: string | null; face: string | null; region?: string | null; clubTag?: string | null;
  legend?: { art?: { position?: string; zoom?: number }; year?: number };
};

type Row = Card & {
  localPath: string | null; exists: boolean; bytes: number | null; sha256: string | null;
  dimensions: { width: number; height: number } | null; status: string;
};

function decodeFaceUrl(url: string): string | null {
  try {
    const raw = url.split(/[?#]/, 1)[0];
    const decoded = decodeURIComponent(raw).replaceAll('\\', '/');
    if (decoded.includes('\0') || /(^|\/)\.\.(\/|$)/.test(decoded)) return null;
    const relative = decoded.replace(/^\.\//, '').replace(/^\//, '');
    if (!relative.startsWith('lol/faces/')) return null;
    return path.resolve('public', relative);
  } catch { return null; }
}

function isLocalAsset(p: string): boolean {
  const rel = path.relative(FACES_DIR, p);
  return !rel.startsWith('..') && !path.isAbsolute(rel) && VALID_EXT.has(path.extname(p).toLowerCase());
}

function parseImageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        const len = buf.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
        }
        offset += 2 + len;
        if (len < 2) break;
      }
      return null;
    }
    if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
      const chunk = buf.subarray(12, 16).toString('ascii');
      if (chunk === 'VP8X' && buf.length >= 30) {
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      }
      if (chunk === 'VP8 ' && buf.length >= 30) {
        const w = buf.readUInt16LE(26) & 0x3fff;
        const h = buf.readUInt16LE(28) & 0x3fff;
        if (w > 0 && h > 0 && w <= 16384 && h <= 16384) return { width: w, height: h };
        return null;
      }
      if (chunk === 'VP8L' && buf.length >= 25) {
        if (buf[20] !== 0x2f) return null;
        const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
        const bits = (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >>> 14) & 0x3fff) + 1;
        if (width > 0 && height > 0 && width <= 16384 && height <= 16384) return { width, height };
        return null;
      }
    }
  } catch {}
  return null;
}

function loadAssetHashes(): Map<string, string[]> {
  // These five source assets were visually reviewed as silhouettes/blank placeholders on 2026-09-23.
  const map = new Map<string, string[]>(Object.entries({"556db6d527d60454f5d7ce8f87530960796d397bc931b3b8f763dd79b95a0f55":["oe-431c76b6267eb46e.webp"],"f0c75f408942f71e7ea93ded1d9d2a7795d08746090751db3648fb14df60a0be":["oe-828c10f79820a385.webp"],"f110feec3493408acbb9a0a0d0c3edc5bde85b49466dde19e910cc9b008b4eb3":["P424.webp"],"45cd764309d5c8dd555c3f28438d19fd8a67e0207341237e1af8737a04034b98":["oe-da9b8058ed6a35e3.webp"],"e7a932b0267e8e61e5887a17c4a153e4fc7c23317ed36caa211b219c90354ed6":["oe-46d2150ec8fb68ed.webp"]}));
  if (!fs.existsSync(FACES_DIR)) return map;
  for (const file of fs.readdirSync(FACES_DIR)) {
    const p = path.join(FACES_DIR, file);
    if (!fs.statSync(p).isFile()) continue;
    if (!VALID_EXT.has(path.extname(file).toLowerCase())) continue;
    const name = file.toLowerCase();
    if (/(placeholder|default|silhouette|no-photo|unknown)/.test(name)) {
      const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(path.relative(FACES_DIR, p));
    }
  }
  return map;
}

function isPlaceholderName(p: string | null): boolean {
  if (!p) return false;
  return /(placeholder|default|silhouette|no-photo|unknown)/i.test(path.basename(p));
}

function normName(n: string | undefined): string {
  return (n || '').toLowerCase().replace(/\s+/g, '');
}

function identityKey(card: Card): string {
  if (card.kind === 'coach') return `coach:${card.id}`;
  if (card.playerId) return `player:${card.playerId}`;
  if (card.kind === 'legend') return `legend:${card.id}`;
  return `card:${card.id}`;
}

function main() {
  const cards = ALL_CARDS as Card[];
  const placeholderAssetHashes = loadAssetHashes();
  const rows: Row[] = [];
  const dupGroups: { hash: string; files: string[]; cards: Card[]; crossIdentity: boolean; placeholderInvolved: boolean }[] = [];
  const hashToGroup = new Map<string, { hash: string; files: string[]; cards: Card[] }>();
  const hardErrors: string[] = [];

  for (const card of cards) {
    const row: Row = {
      ...card,
      localPath: null, exists: false, bytes: null, sha256: null, dimensions: null,
      status: 'NO_FACE'
    };
    if (!card.face) {
      row.status = 'NO_FACE';
      rows.push(row);
      continue;
    }
    const local = decodeFaceUrl(card.face);
    if (!local || !isLocalAsset(local)) {
      row.status = 'ILLEGAL_PATH';
      hardErrors.push(`${card.id}: illegal face path`);
      rows.push(row);
      continue;
    }
    row.localPath = local;
    if (!fs.existsSync(local)) {
      row.status = 'MISSING_FILE';
      hardErrors.push(`${card.id}: missing file ${local}`);
      rows.push(row);
      continue;
    }
    row.exists = true;
    let buf: Buffer;
    try { buf = fs.readFileSync(local); } catch {
      row.status = 'MISSING_FILE';
      hardErrors.push(`${card.id}: cannot read ${local}`);
      rows.push(row);
      continue;
    }
    row.bytes = buf.length;
    if (buf.length === 0) {
      row.status = 'EMPTY_FILE';
      hardErrors.push(`${card.id}: empty file ${local}`);
      rows.push(row);
      continue;
    }
    const dims = parseImageSize(buf);
    if (!dims || dims.width < 1 || dims.height < 1) {
      row.status = 'UNRECOGNIZED_IMAGE';
      hardErrors.push(`${card.id}: unrecognized image header ${local}`);
      rows.push(row);
      continue;
    }
    row.dimensions = dims;
    row.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    row.status = placeholderAssetHashes.has(row.sha256) ? 'PLACEHOLDER' : 'OK';

    const h = row.sha256;
    if (!hashToGroup.has(h)) hashToGroup.set(h, { hash: h, files: [path.relative(FACES_DIR, local)], cards: [card] });
    else {
      const g = hashToGroup.get(h)!;
      g.files.push(path.relative(FACES_DIR, local));
      g.cards.push(card);
    }
    rows.push(row);
  }

  for (const g of hashToGroup.values()) {
    if (g.cards.length < 2 && !placeholderAssetHashes.has(g.hash)) continue;
    const identities = new Set(g.cards.map(identityKey));
    const names = new Set(g.cards.map(c => normName(c.name || c.ign)));
    const placeholderInvolved = g.files.some(f => isPlaceholderName(f)) || placeholderAssetHashes.has(g.hash);
    const crossIdentity = identities.size > 1 && names.size > 1;
    dupGroups.push({
      hash: g.hash, files: [...new Set([...g.files, ...(placeholderAssetHashes.get(g.hash) || [])])],
      cards: g.cards, crossIdentity, placeholderInvolved
    });
  }

  // also add placeholder-only assets not referenced
  for (const [hash, files] of placeholderAssetHashes) {
    if (!hashToGroup.has(hash)) {
      dupGroups.push({ hash, files, cards: [], crossIdentity: false, placeholderInvolved: true });
    }
  }

  const basePlayers = new Set(BASE_PLAYER_CARDS.map(c => c.id));
  const coaches = new Set(COACH_CARDS.map((c: Card) => c.id));
  const legends = new Set(LEGEND_CARDS.map((c: Card) => c.id));
  const withFace = rows.filter(r => r.exists && r.sha256 && r.status === 'OK');
  const coverage = {
    basePlayers: { total: basePlayers.size, withFace: new Set(withFace.filter(r => basePlayers.has(r.id)).map(r => r.id)).size },
    coaches: { total: coaches.size, withFace: new Set(withFace.filter(r => r.kind === 'coach' && coaches.has(r.id)).map(r => r.id)).size },
    legends: { total: legends.size, withFace: new Set(withFace.filter(r => legends.has(r.id)).map(r => r.id)).size }
  };

  const missingRows = rows.filter(r => ['NO_FACE', 'PLACEHOLDER', 'MISSING_FILE', 'EMPTY_FILE', 'UNRECOGNIZED_IMAGE', 'ILLEGAL_PATH'].includes(r.status));

  const risks: string[] = [];
  for (const g of dupGroups) {
    if (g.crossIdentity) risks.push(`crossIdentityDuplicates: ${g.hash.slice(0, 12)} files=${g.files.length}`);
  }
  const placeholderNames = rows.filter(r => isPlaceholderName(r.localPath)).map(r => r.id);
  if (placeholderNames.length) risks.push(`placeholderNameCandidates: ${placeholderNames.length} cards`);
  const placeholderHashes = dupGroups.filter(g => g.placeholderInvolved && g.cards.some(c => !isPlaceholderName(c.face))).length;
  if (placeholderHashes > 0) risks.push(`placeholderHashCandidates: ${placeholderHashes} groups`);
  const smallDims = rows.filter(r => r.exists && r.dimensions && (r.dimensions.width < 32 || r.dimensions.height < 32));
  if (smallDims.length) risks.push(`manualCropRisk: ${smallDims.length} cards with side < 32`);
  const wideCards = rows.filter(r => r.exists && r.dimensions && r.dimensions.width / r.dimensions.height > 1.5);
  if (wideCards.length) risks.push(`manualCropRisk: ${wideCards.length} wide cards (w/h > 1.5)`);
  const zoomRisk = rows.filter(r => r.exists && r.legend?.art?.zoom && r.legend.art.zoom > 1.5);
  if (zoomRisk.length) risks.push(`manualCropRisk: ${zoomRisk.length} legend cards zoom > 1.5`);

  const summary = [
    `Total cards: ${rows.length}`,
    `OK: ${rows.filter(r => r.status === 'OK').length}`,
    `No face (null): ${rows.filter(r => r.status === 'NO_FACE').length}`,
    `Known placeholder images: ${rows.filter(r => r.status === 'PLACEHOLDER').length}`,
    `Missing file: ${rows.filter(r => r.status === 'MISSING_FILE').length}`,
    `Empty file: ${rows.filter(r => r.status === 'EMPTY_FILE').length}`,
    `Illegal path: ${rows.filter(r => r.status === 'ILLEGAL_PATH').length}`,
    `Unrecognized image: ${rows.filter(r => r.status === 'UNRECOGNIZED_IMAGE').length}`,
    `Duplicate hash groups: ${dupGroups.length}`,
    `Cross-identity duplicate groups: ${dupGroups.filter(g => g.crossIdentity).length}`,
    `Placeholder name candidates: ${placeholderNames.length}`,
    `Placeholder hash candidates (groups): ${placeholderHashes}`,
    ...coverageText(coverage),
  ];

  console.log(summary.join('\n'));
  console.log('\nTop risks:');
  risks.slice(0, 15).forEach(r => console.log(' -', r));
  console.log('\nLimitations: cannot verify real identity, eye position, or correctness. Loaded image existence does NOT guarantee correct portrait.');

  const argIdx = process.argv.indexOf('--json');
  if (argIdx > -1 && process.argv[argIdx + 1]) {
    const outPath = path.resolve(process.argv[argIdx + 1]);
    if (path.relative(path.resolve('.local-data'), outPath).startsWith('..')) throw new Error('--json must be inside .local-data');
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const report = {
        coverage, missingRows, hardErrors, risks,
        limitations: ['Headers are inspected; full decoding and real-person identity are not verified.', 'Repeated names or hashes require manual source review; they do not prove an incorrect photo.'],
        placeholderNameCandidates: placeholderNames,
        placeholderHashCandidates: rows.filter(r => r.sha256 && placeholderAssetHashes.has(r.sha256)).map(r=>r.id),
        manualCropRisk: [...new Set([...smallDims, ...wideCards, ...zoomRisk].map(r=>r.id))],
        duplicateGroups: dupGroups, rows: rows.map(r => ({
          id: r.id, kind: r.kind, name: r.name || r.ign, playerId: r.playerId,
          realName: r.realName, region: r.region, club: r.clubTag,
          face: r.face, localPath: r.localPath, exists: r.exists, bytes: r.bytes,
          sha256: r.sha256, dimensions: r.dimensions, status: r.status
        })),
        generatedAt: new Date().toISOString()
      };
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    } catch (e) { console.error('Failed to write JSON report:', e); }
  }

  if (hardErrors.length) process.exitCode = 1;
}

function coverageText(c: any): string[] {
  return [
    `Coverage basePlayers: ${c.basePlayers.withFace}/${c.basePlayers.total}`,
    `Coverage coaches: ${c.coaches.withFace}/${c.coaches.total}`,
    `Coverage legends: ${c.legends.withFace}/${c.legends.total}`
  ];
}

main();
