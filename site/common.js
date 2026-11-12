// Shared by index.html and editors.html.
const COLORS = ["#4fc3f7", "#ffb74d", "#81c784", "#f06292", "#ba68c8", "#fff176", "#4db6ac", "#ff8a65", "#90caf9", "#e6ee9c"];

function colorFor(i) { return COLORS[i % COLORS.length]; }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dots(n) {
  if (!n) return "";
  let h = `<span class="dots" title="Difficulty ${n} of 5" aria-label="Difficulty ${n} of 5">`;
  for (let i = 1; i <= 5; i++) h += `<i class="${i <= n ? "on" : ""}"></i>`;
  return h + "</span>";
}

function baseMap(el, opts = {}) {
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17, subdomains: "abc",
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  });
  const map = L.map(el, { layers: [osm], zoomControl: true, preferCanvas: true }).setView([18.85, 98.98], 9);
  map.attributionControl.setPrefix(false);  // drop the "Leaflet" + flag credit; the map data credits stay
  if (opts.layersControl !== false) L.control.layers({ "Streets": osm, "Topo": topo }, null, { position: "topright" }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  return map;
}

// No-ride zones, on every map: Doi Suthep-Pui National Park striped red under the tracks, and a "No-ride zone"
// label while the cursor is inside it (a tap on a phone). key: true adds the legend in the corner.
const RESTRICTED = "#ff2a2a";
let zoneData = null;
function addNoRideZones(map, opts = {}) {
  zoneData = zoneData || fetch("areas/doi-suthep-pui.geojson").then(r => r.json());
  zoneData.then(area => {
    map.createPane("areas").style.zIndex = 350;  // under the tracks, so a track over the zone stays clickable
    // Filled with thin red stripes (an SVG pattern in the zone's own renderer) so it reads as "no riding", not just a border.
    const renderer = L.svg({ pane: "areas" }), patId = "noride" + L.stamp(map);
    L.geoJSON(area, { pane: "areas", renderer, interactive: false,
      style: { color: RESTRICTED, weight: 3, opacity: 1, fillColor: `url(#${patId})`, fillOpacity: 1 } }).addTo(map);
    const svg = renderer._container, ns = "http://www.w3.org/2000/svg";
    const pat = document.createElementNS(ns, "pattern");
    Object.entries({ id: patId, width: 8, height: 8, patternUnits: "userSpaceOnUse" }).forEach(([k, v]) => pat.setAttribute(k, v));
    pat.innerHTML = `<rect width="8" height="8" fill="${RESTRICTED}" fill-opacity="0.08"/><path d="M0 4H8" stroke="${RESTRICTED}" stroke-width="1.2" stroke-opacity="0.7"/>`;
    const defs = document.createElementNS(ns, "defs");
    defs.appendChild(pat);
    svg.insertBefore(defs, svg.firstChild);
    if (opts.key) {
      const key = L.control({ position: "bottomleft" });
      key.onAdd = () => L.DomUtil.create("div", "areakey");
      key.addTo(map).getContainer().innerHTML = `<i></i>Doi Suthep-Pui National Park: no off-road riding`;
    }

    // The tracks' canvas sits on top and takes every mouse event, so the zone can't have its own hover.
    // Instead test the cursor against the zone's shape, and stay quiet while a track's own label is showing.
    const polys = area.geometry.type === "Polygon" ? [area.geometry.coordinates] : area.geometry.coordinates;
    const inRing = (x, y, ring) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[j];
        if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) c = !c;
      }
      return c;
    };
    const inZone = ll => polys.some(rings => rings.reduce((c, ring) => c !== inRing(ll.lng, ll.lat, ring), false));
    const zoneTip = L.tooltip({ direction: "top", offset: [0, -10], className: "zonetip" })
      .setContent("No-ride zone<br><span>Doi Suthep-Pui National Park</span>");
    let trackTip = false;
    map.on("tooltipopen", e => { if (e.tooltip !== zoneTip) { trackTip = true; map.closeTooltip(zoneTip); } });
    map.on("tooltipclose", e => { if (e.tooltip !== zoneTip) trackTip = false; });
    const showZone = e => {
      if (!trackTip && inZone(e.latlng)) zoneTip.setLatLng(e.latlng).addTo(map);
      else map.closeTooltip(zoneTip);
    };
    map.on("mousemove", showZone);
    map.on("click", showZone);  // phones have no hover: a tap inside the zone shows it
    map.on("mouseout", () => map.closeTooltip(zoneTip));
  }).catch(() => {});
}

async function loadData() {
  const r = await fetch("data/tracks.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("Could not load track data");
  return r.json();
}

// Parse a GPX file in the browser into [[lat, lon], ...].
function parseGpxText(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const pts = [];
  for (const el of doc.querySelectorAll("trkpt, rtept")) {
    pts.push([parseFloat(el.getAttribute("lat")), parseFloat(el.getAttribute("lon"))]);
  }
  return pts;
}

// Nearest point on a [[lat, lon], ...] line to `pt`: {lat, lon, dist (m), i (segment start), f (0-1 along it)}.
function nearestOnLine(line, pt) {
  const kx = 111320 * Math.cos(pt[0] * Math.PI / 180), ky = 110540;
  const px = pt[1] * kx, py = pt[0] * ky;
  let best = { dist: Infinity, i: 0, f: 0, lat: line[0][0], lon: line[0][1] };
  for (let i = 0; i < line.length - 1; i++) {
    const x1 = line[i][1] * kx, y1 = line[i][0] * ky, x2 = line[i + 1][1] * kx, y2 = line[i + 1][0] * ky;
    const dx = x2 - x1, dy = y2 - y1, seg = dx * dx + dy * dy;
    const f = seg ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / seg)) : 0;
    const d = Math.hypot(px - (x1 + f * dx), py - (y1 + f * dy));
    if (d < best.dist) best = { dist: d, i, f, lat: (y1 + f * dy) / ky, lon: (x1 + f * dx) / kx };
  }
  return best;
}
