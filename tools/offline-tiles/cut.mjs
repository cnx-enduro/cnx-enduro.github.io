// Offline map pieces for every track, cut from a Protomaps world map build (OpenStreetMap data, ODbL).
// Run on a computer (not in CI) after a track is added or changed:
//   cd tools/offline-tiles && npm install && node cut.mjs
// Reads docs/data/tracks.json (run build.py first), writes:
//   site/offline/tiles/{z}/{x}/{y}.mvt   one file per map piece (vector tile, not zipped), shared by tracks
//   site/offline/tracks.json             which pieces each track needs + the total size
// The OSM tile server doesn't allow saving its map for offline use, so the offline map is our own copy.
import fs from "fs";
import path from "path";
import { PMTiles } from "pmtiles";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "site/offline");
const BUILD = process.argv[2] || "20261117";            // a date from https://build-metadata.protomaps.dev/builds.json
const SRC = `https://build.protomaps.com/${BUILD}.pmtiles`;
// How far around the track (km) each zoom level is kept: close-up near the line, wider when zoomed out.
const BUF = { 15: 1, 14: 2, 13: 4, 12: 8, 11: 12, 10: 20 };
const OVERVIEW = [6, 9];                                  // zooms 6-9: the whole area of all tracks

const R = Math.PI / 180;
const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z;
const lat2y = (lat, z) => (1 - Math.log(Math.tan(lat * R) + 1 / Math.cos(lat * R)) / Math.PI) / 2 * 2 ** z;
const box = (set, z, s, n, w, e) => {
  for (let x = Math.floor(lon2x(w, z)); x <= Math.floor(lon2x(e, z)); x++)
    for (let y = Math.floor(lat2y(n, z)); y <= Math.floor(lat2y(s, z)); y++) set.add(`${z}/${x}/${y}`);
};

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/data/tracks.json")));
let S = 90, N = -90, W = 180, E = -180;
for (const t of data.tracks) for (const [la, lo] of t.line) { S = Math.min(S, la); N = Math.max(N, la); W = Math.min(W, lo); E = Math.max(E, lo); }
const overview = new Set();
for (let z = OVERVIEW[0]; z <= OVERVIEW[1]; z++) box(overview, z, S - 0.2, N + 0.2, W - 0.2, E + 0.2);

const perTrack = {};
for (const t of data.tracks) {
  const set = new Set(overview);
  for (const [zs, km] of Object.entries(BUF)) {
    for (const [la, lo] of t.line) {
      const dLa = km / 111, dLo = km / (111 * Math.cos(la * R));
      box(set, +zs, la - dLa, la + dLa, lo - dLo, lo + dLo);
    }
  }
  perTrack[t.id] = [...set];
}
const all = new Set(Object.values(perTrack).flat());
console.log(`${data.tracks.length} tracks, ${all.size} map pieces to fetch from ${SRC}`);

const src = new PMTiles(SRC);
const size = {};
let done = 0, empty = 0;
const keys = [...all];
const one = async k => {
  const file = path.join(OUT, "tiles", k + ".mvt");
  if (fs.existsSync(file)) { size[k] = fs.statSync(file).size; return; }
  const [z, x, y] = k.split("/").map(Number);
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await src.getZxy(z, x, y);              // unzipped by the reader
      if (!r || !r.data.byteLength) { empty++; size[k] = 0; return; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data));
      size[k] = r.data.byteLength; return;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
};
for (let i = 0; i < keys.length; i += 12) {
  await Promise.all(keys.slice(i, i + 12).map(one));
  done = Math.min(i + 12, keys.length);
  if (done % 240 === 0 || done === keys.length) console.log(`  ${done}/${keys.length}`);
}
// Pieces no longer used by any track (a track changed or was removed) are deleted.
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
let removed = 0;
for (const f of walk(path.join(OUT, "tiles"))) {
  const k = path.relative(path.join(OUT, "tiles"), f).replace(/\.mvt$/, "");
  if (!all.has(k)) { fs.unlinkSync(f); removed++; }
}
const tracks = {};
for (const [id, list] of Object.entries(perTrack)) {
  const have = list.filter(k => size[k] > 0).sort();
  tracks[id] = { tiles: have, bytes: have.reduce((a, k) => a + size[k], 0), line: data.tracks.find(t => t.id === id).version || null };
}
fs.writeFileSync(path.join(OUT, "tracks.json"), JSON.stringify({
  source: `Protomaps build ${BUILD} (OpenStreetMap contributors, ODbL)`, made: new Date().toISOString().slice(0, 10), maxZoom: 15, tracks,
}));
const total = Object.keys(size).filter(k => size[k] > 0).reduce((a, k) => a + size[k], 0);
console.log(`done: ${Object.keys(size).length - empty} pieces, ${(total / 1e6).toFixed(1)} MB, ${empty} empty (sea/none), ${removed} old removed`);
for (const [id, t] of Object.entries(tracks)) console.log(`  ${id}: ${t.tiles.length} pieces, ${(t.bytes / 1e6).toFixed(1)} MB`);
