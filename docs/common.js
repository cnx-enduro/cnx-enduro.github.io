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
  // opts.routeBearing → this map can turn (compass button); the turning add-on is only loaded on the main page.
  const turns = !!opts.routeBearing && typeof L.Map.prototype.setBearing === "function";
  const map = L.map(el, { layers: [osm], zoomControl: true, preferCanvas: true,
    ...(turns ? { rotate: true, bearing: 0, rotateControl: false, touchRotate: false, shiftKeyRotate: false, compassBearing: false } : {}) }).setView([18.85, 98.98], 9);
  map.attributionControl.setPrefix(false);  // drop the "Leaflet" + flag credit; the map data credits stay
  // Satellite (Esri World Imagery, key locked to the site's address in Chu's Esri account, expires 2027-11-13).
  // Tiles download only after someone picks Satellite, so it costs nothing for everyone else.
  const bases = { "Streets": osm, "Topo": topo };
  if (opts.satelliteKey) bases["Satellite"] = L.tileLayer(
    "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=" + encodeURIComponent(opts.satelliteKey), {
      maxZoom: 19, attribution: 'Powered by <a href="https://www.esri.com">Esri</a> | Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    });
  const layersCtl = opts.layersControl !== false ? L.control.layers(bases, null, { position: "topright" }).addTo(map) : null;
  L.control.scale({ imperial: false }).addTo(map);
  if (opts.locate !== false) addLocate(map, opts.whereText, turns ? opts.routeBearing : null);
  if (opts.locate !== false) addRainLock(map);
  if (opts.offlineTrack) addOffline(map, { bases, layersCtl, track: opts.offlineTrack });  // added last: sits above the lock
  return map;
}

// "Where am I" button, bottom right: one tap = location ON, next tap = OFF (a small ON/OFF sign shows which).
// While ON the phone's position shows as a blue dot and the map keeps it in the middle as the rider moves.
// Dragging the map (or opening another track) pauses that so the rider can look around; after 5 s without
// touching the map it centres on the rider again by itself.
// The screen stays awake while it's ON. The phone asks permission the first time (its own pop-up). Nothing is sent anywhere.
// whereText(latlng) → extra line for the dot's label (the track page uses it for "km X of this track").
const LOCATE_RESUME_MS = 5000;
function addLocate(map, whereText, routeBearing) {
  if (!("geolocation" in navigator)) return;
  let watch = null, dot = null, ring = null, last = null, follow = false, resume = null, btn = null, msg = null, sign = null;
  // Keep the screen on while location is ON, so the phone doesn't lock mid-ride and freeze the dot.
  // The phone drops this hold whenever the page is hidden, so take it again when the rider comes back.
  let wake = null;
  const holdScreen = async () => {
    if (!("wakeLock" in navigator) || watch === null || wake) return;
    try { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } catch (e) { wake = null; }
  };
  const freeScreen = () => { if (wake) { wake.release().catch(() => {}); wake = null; } };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") holdScreen(); });
  // A small tag beside the dot with the km on the open track (e.g. "19.8 km"), small so it doesn't hide the map.
  // On the track list there's nothing to say, so the dot stands alone.
  // 🧭 Compass (main map only): grey while location is OFF; tap = North up, tap again = Route up (the map turns
  // so the way ahead points up), tap again = North up. The needle always points to real north.
  // Route up follows the open track's direction at your km; away from the track it follows the way you move.
  let cmpMode = "north", cmpBtn = null, prev = null, heading = null, cmp = null;
  const cmpShow = () => {
    if (!cmpBtn) return;
    const on = watch !== null && !!last;  // awake only once the phone has found you
    cmpBtn.classList.toggle("off", !on); cmpBtn.classList.toggle("route", on && cmpMode === "route");
    const t = !on ? "Compass: turn location on first" : cmpMode === "route" ? "Route up. Tap for north up" : "North up. Tap to turn the map with the route";
    cmpBtn.title = t; cmpBtn.setAttribute("aria-label", t);
    cmpBtn.querySelector("svg").style.transform = `rotate(${map.getBearing ? map.getBearing() : 0}deg)`;
  };
  const bearingTo = (a, b) => {  // degrees clockwise from north, a → b
    const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
    const x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) - Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos((b.lng - a.lng) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  const turnTo = h => {
    if (h == null || !map.setBearing) return;
    const now = (360 - map.getBearing()) % 360, diff = Math.abs(((h - now) + 540) % 360 - 180);
    if (diff < 4) return;  // ignore tiny wobbles
    map.setBearing(-h); cmpShow();
  };
  const cmpFix = () => {  // called on every GPS fix
    if (!routeBearing) return;
    const moved = prev && last.distanceTo(prev) >= 15;
    if (!prev || moved) {
      const h = routeBearing(last, prev);
      heading = h != null ? h : moved ? bearingTo(prev, last) : heading;
      prev = L.latLng(last.lat, last.lng);
    }
    if (cmpMode === "route") turnTo(heading);
    cmpShow();
  };
  const cmpReset = () => { cmpMode = "north"; prev = null; heading = null; if (map.setBearing) map.setBearing(0); cmpShow(); };
  if (routeBearing) {
    map.on("rotate", () => { if (cmpBtn) cmpBtn.querySelector("svg").style.transform = `rotate(${map.getBearing()}deg)`; });
    cmp = L.control({ position: "bottomright" });
    cmp.onAdd = () => {
      const box = L.DomUtil.create("div", "leaflet-bar compass");
      box.innerHTML = `<a href="#" role="button"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 2 15.5 12h-7z" class="n"/><path d="M12 22 8.5 12h7z" class="s"/><circle cx="12" cy="12" r="1.6" class="c"/></svg></a>`;
      L.DomEvent.disableClickPropagation(box);
      cmpBtn = box.querySelector("a");
      cmpBtn.addEventListener("click", e => {
        e.preventDefault();
        if (watch === null || !last) return;  // grey: location is off or not found yet
        if (cmpMode === "north") { cmpMode = "route"; turnTo(heading); }
        else { cmpMode = "north"; map.setBearing(0); }
        cmpShow();
      });
      setTimeout(cmpShow, 0);
      return box;
    };
  }
  const label = () => (whereText && last ? whereText(last) : "");
  const setLabel = () => {
    if (!dot) return;
    const text = label();
    if (!text) { if (dot.getTooltip()) dot.unbindTooltip(); return; }
    if (dot.getTooltip()) dot.setTooltipContent(text);
    else dot.bindTooltip(text, { permanent: true, direction: "right", offset: [10, 0], className: "youkm" });
  };
  const say = text => { if (msg) { msg.textContent = text; msg.hidden = !text; } };
  const pause = () => {
    if (watch === null) return;
    follow = false;
    clearTimeout(resume);
    resume = setTimeout(() => { if (watch !== null && last) { follow = true; map.panTo(last, { animate: true }); } }, LOCATE_RESUME_MS);
  };
  // Another track opened / back to the list: new label text, and let the map show that track for a moment.
  map.on("whererefresh", () => { if (dot) { setLabel(); pause(); } });
  map.on("dragstart zoomstart", e => { if (e.type === "dragstart" || !follow) pause(); });
  map.on("dragend", pause);  // restart the 5 s from when the finger lifts
  const ctl = L.control({ position: "bottomright" });
  ctl.onAdd = () => {
    const box = L.DomUtil.create("div", "leaflet-bar locate");
    box.innerHTML = `<span class="locsign">OFF</span><a href="#" role="button" title="Location off. Tap to show where I am" aria-label="Location off. Tap to show where I am" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M21 3 3 10.5l7.5 3 3 7.5L21 3z" fill="currentColor"/></svg></a><span class="locmsg" hidden></span>`;
    L.DomEvent.disableClickPropagation(box);
    btn = box.querySelector("a"); msg = box.querySelector(".locmsg"); sign = box.querySelector(".locsign");
    const show = on => {
      btn.classList.toggle("on", on); sign.classList.toggle("on", on); sign.textContent = on ? "ON" : "OFF";
      const t = on ? "Location on. Tap to turn it off" : "Location off. Tap to show where I am";
      btn.title = t; btn.setAttribute("aria-label", t); btn.setAttribute("aria-pressed", String(on));
    };
    const stop = () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      watch = null; last = null; follow = false; clearTimeout(resume);
      if (dot) { map.removeLayer(dot); map.removeLayer(ring); dot = ring = null; }
      freeScreen(); show(false); say(""); cmpReset();
      map.fire("whereupdate", { latlng: null });  // location off: the page clears its own "you are here" marks
    };
    btn.addEventListener("click", e => {
      e.preventDefault();
      if (watch !== null) return stop();
      show(true); follow = true; say("Finding you…");
      let first = true;
      // No timeout: in the hills the GPS can drop for a while; the watch keeps going and the dot
      // comes back by itself. Only a "blocked" answer stops it.
      watch = navigator.geolocation.watchPosition(pos => {
        last = L.latLng(pos.coords.latitude, pos.coords.longitude);
        const acc = pos.coords.accuracy;
        if (!dot) {
          ring = L.circle(last, { radius: acc, color: "#2f7cf6", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
          dot = L.circleMarker(last, { radius: 8, color: "#fff", weight: 3, fillColor: "#2f7cf6", fillOpacity: 1 })
            .addTo(map);
        } else {
          dot.setLatLng(last); ring.setLatLng(last).setRadius(acc);
        }
        say("");
        map.fire("whereupdate", { latlng: last });
        cmpFix();  // the page can mark the rider elsewhere too (the height chart)
        setLabel();
        if (first) { map.setView(last, Math.max(map.getZoom(), 14)); first = false; }
        else if (follow) map.panTo(last, { animate: true });
      }, err => {
        if (err.code === 1) { stop(); say("Location is blocked. Allow it for this site in your phone's settings."); }
        else if (!dot) say("Looking for GPS signal…");
      }, { enableHighAccuracy: true, maximumAge: 5000 });
      holdScreen();
      cmpShow();  // location is on now: the compass wakes up
    });
    return box;
  };
  ctl.addTo(map);
  if (cmp) cmp.addTo(map);  // added after, so it sits above the location button
}

// 🔒 Rain lock, bottom left: one tap and the screen ignores every touch (rain drops make phones tap and scroll
// by themselves). The map keeps following the rider and the screen stays awake. To unlock, hold the lock
// for 2 s (a ring fills up); a quick tap or a drop does nothing. The phone's own buttons and gestures still work.
const UNLOCK_HOLD_MS = 2000;
function addRainLock(map) {
  let locked = false, wake = null, timer = null, cover = null, btn = null, sign = null, justUnlocked = 0;
  const holdScreen = async () => {
    if (!locked || wake || !("wakeLock" in navigator)) return;
    try { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } catch (e) { wake = null; }
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") holdScreen(); });
  const swallow = e => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); };
  const setLocked = on => {
    locked = on;
    document.body.classList.toggle("rainlocked", on);
    cover.hidden = !on;
    btn.classList.toggle("on", on);
    sign.textContent = on ? "Hold 2 s to unlock" : "";
    sign.hidden = !on;
    const t = on ? "Screen locked. Hold for 2 seconds to unlock" : "Lock the screen (rain)";
    btn.title = t; btn.setAttribute("aria-label", t); btn.setAttribute("aria-pressed", String(on));
    if (on) holdScreen(); else if (wake) { wake.release().catch(() => {}); wake = null; }
  };
  const cancel = () => { clearTimeout(timer); timer = null; btn.classList.remove("holding"); };
  // Finger (touch) and mouse handled apart: touch events don't get cut short by the phone's own long-press
  // menu, and the finger lifting after the 2 s hold must not count as a new tap (or it locks straight back).
  const press = e => {
    if (e.cancelable) e.preventDefault();
    if (!locked) return;
    btn.classList.add("holding");
    timer = setTimeout(() => { cancel(); justUnlocked = Date.now(); setLocked(false); }, UNLOCK_HOLD_MS);
  };
  const lift = e => {
    if (e.cancelable) e.preventDefault();
    if (timer) return cancel();  // let go too early: stays locked
    if (!locked && Date.now() - justUnlocked > 800) setLocked(true);
  };
  // The cover sits over the whole page and eats every touch, click, scroll and pinch.
  cover = document.createElement("div");
  cover.className = "raincover"; cover.hidden = true;
  ["touchmove", "pointerdown", "pointerup", "click", "dblclick", "wheel", "contextmenu", "gesturestart"]
    .forEach(ev => cover.addEventListener(ev, swallow, { passive: false }));
  // On phones the cover can end up on top of the lock button itself, so a press that lands on the cover
  // where the button is counts as pressing the button.
  const onBtn = e => { const p = e.changedTouches ? e.changedTouches[0] : e, r = btn.getBoundingClientRect();
    return p.clientX >= r.left - 6 && p.clientX <= r.right + 6 && p.clientY >= r.top - 6 && p.clientY <= r.bottom + 6; };
  cover.addEventListener("touchstart", e => { swallow(e); if (onBtn(e)) press(e); }, { passive: false });
  cover.addEventListener("mousedown", e => { swallow(e); if (e.button === 0 && onBtn(e)) press(e); });
  cover.addEventListener("touchend", e => { swallow(e); if (timer) cancel(); }, { passive: false });
  cover.addEventListener("mouseup", e => { swallow(e); if (timer) cancel(); });
  cover.addEventListener("touchcancel", cancel);
  document.body.appendChild(cover);
  const ctl = L.control({ position: "bottomleft" });
  ctl.onAdd = () => {
    const box = L.DomUtil.create("div", "leaflet-bar rainlock");
    box.innerHTML = `<a href="#" role="button" aria-pressed="false"><svg class="ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/></svg><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.5c.8 0 1.5.7 1.5 1.5v8c0 .8-.7 1.5-1.5 1.5h-13C4.7 21 4 20.3 4 19.5v-8C4 10.7 4.7 10 5.5 10H7zm2 0h6V8a3 3 0 0 0-6 0v2z" fill="currentColor"/></svg></a><span class="locksign" hidden></span>`;
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.disableScrollPropagation(box);
    btn = box.querySelector("a"); sign = box.querySelector(".locksign");
    btn.addEventListener("touchstart", press, { passive: false });
    btn.addEventListener("touchend", lift, { passive: false });
    btn.addEventListener("touchcancel", cancel);
    btn.addEventListener("mousedown", e => { if (e.button === 0) press(e); });
    btn.addEventListener("mouseup", e => { if (e.button === 0) lift(e); });
    btn.addEventListener("mouseleave", cancel);
    btn.addEventListener("click", e => { e.preventDefault(); if (e.detail === 0 && !locked) setLocked(true); });  // keyboard: Enter locks
    btn.addEventListener("contextmenu", e => e.preventDefault());  // a long press must not open the phone's menu
    setTimeout(() => setLocked(false), 0);
    return box;
  };
  ctl.addTo(map);
}

// 💾 Offline map, bottom left above the lock. On a track page one tap saves that track's map to the phone
// (our own map pieces in site/offline/, cut by tools/offline-tiles: the OSM map server doesn't allow saving
// its map), plus the page itself, so the track, the map and the blue dot all work with no signal.
// Saved = green with a tick; tap again to remove it. With no signal the map switches to the saved map by itself
// (also when the OSM map stops loading), and back when the signal returns. The saved map is also in the layer
// menu as "Saved map (offline)". It's a simpler map: roads, villages, rivers, green forest, and dirt tracks and
// paths as brown dashed lines like on the OSM map.
const OFFLINE_TILES = "cnx-offline-v1", OFFLINE_SHELL = "cnx-shell-v1";
function addOffline(map, o) {
  if (!("caches" in window)) return;
  let index = null, lib = null, pm = null, auto = false, before = null, busy = false, btn = null, sign = null, signT = null;
  const getIndex = async () => index || (index = await (await fetch("offline/tracks.json", { cache: "no-cache" })).json());
  const loadLib = () => lib || (lib = new Promise((ok, bad) => {
    if (window.protomapsL) return ok();
    const sc = document.createElement("script"); sc.src = "vendor/protomaps-leaflet.js"; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc);
  }));
  // The map layer itself, made the first time it's needed (the drawing library loads only then).
  const group = L.layerGroup();
  group.on("add", async () => {
    try {
      await loadLib();
      if (!pm) {
        const P = window.protomapsL, brown = "#8a4b14";
        // Outside the saved strip there's no map piece: the server answers "not found" (a web page), which the
        // reader would try to read as map data. Treat any piece that can't be read as an empty piece.
        if (!P.ZxySource.prototype.__cnxSafe) {
          const get = P.ZxySource.prototype.get;
          P.ZxySource.prototype.get = async function (c, size) {
            try { return await get.call(this, c, size); } catch (e) { if (e && e.name === "AbortError") throw e; return new Map(); }
          };
          P.ZxySource.prototype.__cnxSafe = true;
          // Saved pieces are read straight from the phone's store, so the map works with no signal even when the
          // background helper (sw.js) isn't running yet (first visit, or a phone that stopped it).
          const f0 = window.fetch.bind(window);
          window.fetch = async (u, opt) => {
            const url = typeof u === "string" ? u : (u && u.url) || "";
            if (url.includes("offline/tiles/")) {
              try { const hit = await (await caches.open(OFFLINE_TILES)).match(new URL(url, location.href).href); if (hit) return hit; } catch (e) {}
            }
            return f0(u, opt);
          };
        }
        pm = P.leafletLayer({ url: "offline/tiles/{z}/{x}/{y}.mvt", flavor: "light", lang: "en", maxDataZoom: 15, maxZoom: 19,
          attribution: '<a href="https://protomaps.com">Protomaps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
        const line = (w, dash, test) => ({ dataLayer: "roads", filter: (z, f) => f.props.kind === "path" && test(f.props.kind_detail),
          symbolizer: new P.LineSymbolizer({ color: brown, dashColor: brown, width: z => w(z), dashWidth: z => w(z), dash, lineCap: "butt" }) });
        const wood = { dataLayer: "landuse", filter: (z, f) => ["wood", "forest", "nature_reserve"].includes(f.props.kind),
          symbolizer: new P.PolygonSymbolizer({ fill: "#b5d39a", opacity: 0.85 }) };
        const i = pm.paintRules.findIndex(r => r.dataLayer === "roads");
        pm.paintRules.splice(i < 0 ? pm.paintRules.length : i, 0, wood);
        pm.paintRules.push(
          line(z => (z < 13 ? 1.2 : z < 15 ? 1.8 : 2.4), [6, 3], k => k === "track"),                                     // dirt tracks
          line(z => (z < 14 ? 1 : 1.6), [2, 3], k => ["path", "footway", "bridleway", "cycleway", "steps"].includes(k)));  // paths
      }
      if (map.hasLayer(group) && !group.hasLayer(pm)) group.addLayer(pm);
    } catch (e) { say("The saved map couldn't load", 4000); }
  });
  if (o.layersCtl) o.layersCtl.addBaseLayer(group, "Saved map (offline)");
  const baseOn = () => Object.values(o.bases).find(b => map.hasLayer(b));
  const toSaved = why => {
    if (map.hasLayer(group)) return;
    before = baseOn() || before; auto = true;
    Object.values(o.bases).forEach(b => map.removeLayer(b));
    map.addLayer(group);
    if (why) say(why, 5000);
  };
  const toOnline = () => {
    if (!auto || !map.hasLayer(group)) return;
    auto = false; map.removeLayer(group); map.addLayer(before || Object.values(o.bases)[0]);
  };
  map.on("baselayerchange", e => { if (e.layer !== group) auto = false; });  // the rider picked a map: leave it
  window.addEventListener("offline", () => toSaved("No signal: showing your saved map"));
  window.addEventListener("online", toOnline);
  // Weak signal: the phone says "online" but the map pieces stop arriving.
  let fails = 0, failT = null;
  Object.values(o.bases).forEach(b => b.on("tileerror", () => {
    fails++; clearTimeout(failT); failT = setTimeout(() => { fails = 0; }, 15000);
    if (fails >= 6) toSaved("Map not loading: showing your saved map");
  }));
  Object.values(o.bases).forEach(b => b.on("tileload", () => { fails = 0; }));
  if (navigator.onLine === false) setTimeout(() => toSaved("No signal: showing your saved map"), 0);

  // ---- the button ----
  const marker = id => new URL(`offline/saved/${id}`, location.href).href;  // a small record in the phone: "this track is saved"
  const say = (text, ms) => {
    if (!sign) return;
    clearTimeout(signT); sign.textContent = text; sign.hidden = !text;
    if (ms) signT = setTimeout(() => { sign.hidden = true; }, ms);
  };
  const ICON_SAVE = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3v11m0 0-4.5-4.5M12 14l4.5-4.5M4 15v4.5h16V15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_DONE = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const show = (state, label) => {
    if (!btn) return;
    btn.className = state; btn.innerHTML = state === "saved" || state === "update" ? ICON_DONE : ICON_SAVE;
    btn.title = label; btn.setAttribute("aria-label", label);
  };
  const savedRec = async id => { const r = await (await caches.open(OFFLINE_TILES)).match(marker(id)); return r ? r.json() : null; };
  const refresh = async () => {
    if (busy) return;
    const t = o.track();
    if (!t) return show("", "Save a track's map for no signal: open a track first");
    const rec = await savedRec(t.id).catch(() => null);
    if (!rec) return show("", `Save the map of ${t.name} for no signal`);
    loadLib().catch(() => {});  // get the map drawing code now, while there's signal
    let fresh = true;
    if (navigator.onLine !== false) try { fresh = (await getIndex()).made === rec.made; } catch (e) {}
    show(fresh ? "saved" : "update", fresh ? `Map of ${t.name} saved. Tap to remove it` : `A newer map of ${t.name} is out. Tap to update`);
  };
  map.on("whererefresh", refresh);  // a track opened, or back to the list
  const shellUrls = t => {
    const u = ["./", "data/tracks.json", "offline/tracks.json", "areas/doi-suthep-pui.geojson", "vendor/protomaps-leaflet.js",
      "vendor/images/layers.png", "vendor/images/layers-2x.png", `gpx/${t.file}`];
    document.querySelectorAll("script[src], link[rel=stylesheet][href]").forEach(e => u.push(e.getAttribute("src") || e.getAttribute("href")));
    return [...new Set(u)].filter(x => !/^https?:/.test(x));
  };
  const save = async t => {
    if (navigator.onLine === false) return say("No signal. Save it where there's signal or Wi-Fi", 5000);
    busy = true; show("busy", "Saving…");
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      const idx = await getIndex(), list = (idx.tracks[t.id] || {}).tiles || [];
      if (!list.length) throw new Error("no map for this track");
      const shell = await caches.open(OFFLINE_SHELL), tiles = await caches.open(OFFLINE_TILES);
      const jobs = [...shellUrls(t).map(u => [shell, u]), ...list.map(k => [tiles, `offline/tiles/${k}.mvt`])];
      let done = 0, next = 0;
      const worker = async () => {
        while (next < jobs.length) {
          const [c, u] = jobs[next++];
          if (!(await c.match(u))) {
            let ok = false;
            for (let a = 0; a < 3 && !ok; a++) { try { await c.add(new Request(u, { cache: "no-cache" })); ok = true; } catch (e) { if (a === 2) throw e; } }
          }
          done++; if (done % 10 === 0 || done === jobs.length) say(`Saving ${Math.round(done / jobs.length * 100)}%`);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      await tiles.put(marker(t.id), new Response(JSON.stringify({ made: idx.made, tiles: list.length, bytes: idx.tracks[t.id].bytes })));
      busy = false; await refresh();
      say(`Saved ✓ ${t.name} works with no signal`, 5000);
    } catch (e) {
      busy = false; await refresh();
      say("Couldn't save. Check the signal and try again", 6000);
    }
  };
  const remove = async t => {
    const tiles = await caches.open(OFFLINE_TILES), idx = await getIndex().catch(() => null);
    await tiles.delete(marker(t.id));
    if (idx) {
      // keep pieces another saved track still uses
      const keep = new Set();
      for (const id of Object.keys(idx.tracks)) if (id !== t.id && (await tiles.match(marker(id)))) idx.tracks[id].tiles.forEach(k => keep.add(k));
      await Promise.all((idx.tracks[t.id] || { tiles: [] }).tiles.filter(k => !keep.has(k)).map(k => tiles.delete(`offline/tiles/${k}.mvt`)));
    }
    await refresh(); say("Removed from the phone", 3000);
  };
  const ctl = L.control({ position: "bottomleft" });
  ctl.onAdd = () => {
    const box = L.DomUtil.create("div", "leaflet-bar offsave");
    box.innerHTML = `<a href="#" role="button"></a><span class="offsign" hidden></span>`;
    L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
    btn = box.querySelector("a"); sign = box.querySelector(".offsign");
    btn.addEventListener("click", async e => {
      e.preventDefault();
      if (busy) return;
      const t = o.track();
      if (!t) return say("Open a track, then tap here to save its map", 4000);
      const rec = await savedRec(t.id).catch(() => null);
      if (rec && btn.className !== "update") { if (confirm(`Remove the saved map of ${t.name} from this phone?`)) remove(t); return; }
      save(t);
    });
    show("", "Save a track's map for no signal: open a track first");
    setTimeout(refresh, 0);
    return box;
  };
  ctl.addTo(map);
}

// No-ride zones, on every map: Doi Suthep-Pui National Park striped red under the tracks, and a "No-ride zone"
// label while the cursor is inside it (a tap on a phone). key: true adds the legend in the corner.
const RESTRICTED = "#ff2a2a";
let zoneData = null;
function addNoRideZones(map, opts = {}) {
  zoneData = zoneData || fetch("areas/doi-suthep-pui.geojson").then(r => r.json());
  zoneData.then(area => {
    // under the tracks, so a track over the zone stays clickable; inside the rotating layer when the map can turn
    // (leaflet-rotate), or the zone drifts off its real place
    map.createPane("areas", map.getPane("rotatePane") || undefined).style.zIndex = 350;
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
