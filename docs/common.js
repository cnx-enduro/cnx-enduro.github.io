// Shared by index.html and editors.html.
const COLORS = ["#4fc3f7", "#ffb74d", "#81c784", "#f06292", "#ba68c8", "#fff176", "#4db6ac", "#ff8a65", "#90caf9", "#e6ee9c"];

// ▶ Navigate, ⏺ Record, 👥 Ride together and the green phone line: public since 21 Nov (Chu: "Don't need to be
// beta"). Old ?beta links still work; the word is simply ignored.
const CNX_BETA = true;

// A short message near the top of the screen that goes away by itself (no tap needed).
function cnxToast(html, ms = 3000) {
  let t = document.querySelector(".cnxtoast");
  if (!t) { t = document.createElement("div"); t.className = "cnxtoast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.innerHTML = html; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, ms);
}
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
  if (opts.offlineTrack) addOffline(map, { bases, layersCtl, track: opts.offlineTrack });  // sits above the lock
  if (opts.record && opts.locate !== false && CNX_BETA) addRecord(map);  // above the saved-map button
  if (opts.record && opts.locate !== false && typeof addWalk === "function") addWalk(map);  // 🚶 above ⏺
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
    if (follow && last && map.cnxLead) map.panTo(aim(last), { animate: false });  // turning moves the dot: put it back low
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
        if (stuck) {  // the tap wakes the compass (iPhone allows the restart only from a tap); the mode stays
          if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function")
            DeviceOrientationEvent.requestPermission().catch(() => {});
          listen(); restartAt = Date.now(); turnAt = Date.now(); setStuck(false); return;
        }
        if (watch === null || !last) return;  // grey: location is off or not found yet
        if (cmpMode === "north") { cmpMode = "route"; turnTo(heading); }
        else { cmpMode = "north"; map.setBearing(0); }
        cmpShow();
      });
      setTimeout(cmpShow, 0);
      return box;
    };
  }
  // ▶ Navigate sets map.cnxLead (e.g. 0.22): the dot sits that share of the screen below the middle, more road ahead
  const aim = ll => {
    if (!map.cnxLead) return ll;
    const p = map.latLngToContainerPoint(ll), sz = map.getSize();
    return map.containerPointToLatLng([p.x, p.y - sz.y * map.cnxLead]);
  };
  // Thin bright green line from the dot = where the phone points (its compass), whenever location is ON (Chu 11/21).
  // iPhone asks once ("Allow motion & orientation") when location is turned on; it must be asked straight from the tap.
  // Riding (faster than walking): the line follows the way GPS says you're going, so the bike's metal can't freeze it.
  // Stopped / on foot: the compass. iPhone's compass can stop sending (Chu 11/21, ~10× a ride): after 3 s of silence
  // the site reconnects it by itself; still silent → the line fades (never a wrong line) and 🧭 pulses: one tap wakes it.
  let phoneDir = null, beam = null, beamRaf = 0, gpsDir = null, gpsAt = 0, turnAt = 0, gotTurn = false, stuck = false, restartAt = 0, unsure = false, wakeTag = null, prevFix = null;
  const dirNow = () => (gpsDir != null && Date.now() - gpsAt < 6000 && !map.cnxWalking) ? { d: gpsDir, gps: true } : { d: phoneDir, gps: false };
  const beamDraw = () => {
    cancelAnimationFrame(beamRaf);
    beamRaf = requestAnimationFrame(() => {
      if (!beam) return;
      const { d, gps } = dirNow();
      if (d == null || !last || watch === null) { beam.hidden = true; return; }
      const p = map.latLngToContainerPoint(last), b = map.getBearing ? map.getBearing() : 0;
      beam.style.left = p.x + "px"; beam.style.top = (p.y - 2000) + "px";
      beam.style.transform = `rotate(${d + b}deg)`; beam.hidden = false;
      beam.classList.toggle("dim", !gps && (stuck || unsure));
    });
  };
  const onTurn = e => {
    let h = null;
    if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;  // iPhone
    else if (e.absolute && e.alpha != null) h = (360 - e.alpha + ((screen.orientation && screen.orientation.angle) || 0)) % 360;  // Android
    if (h == null) return;
    turnAt = Date.now(); gotTurn = true;
    unsure = e.webkitCompassAccuracy != null && (e.webkitCompassAccuracy < 0 || e.webkitCompassAccuracy > 35);
    if (stuck) setStuck(false);
    phoneDir = h; beamDraw();
  };
  const setStuck = on => {
    stuck = on;
    if (cmpBtn) cmpBtn.classList.toggle("wake", on);
    if (!wakeTag) { wakeTag = document.createElement("div"); wakeTag.className = "cmpwake"; wakeTag.textContent = "Tap 🧭 to wake the compass"; map.getContainer().appendChild(wakeTag); }
    wakeTag.hidden = !on; beamDraw();
  };
  const listen = () => { window.removeEventListener(turnEvent, onTurn); window.addEventListener(turnEvent, onTurn); };
  setInterval(() => {  // the compass watchdog
    if (watch === null || !gotTurn) return;
    const quiet = Date.now() - turnAt;
    if (quiet > 3000 && Date.now() - restartAt > 8000) { restartAt = Date.now(); listen(); }
    else if (quiet > 6500 && !stuck) setStuck(true);
  }, 1000);
  const gpsFix = pos => {  // direction of travel from GPS, only while really moving
    const c = pos.coords, now = pos.timestamp || Date.now(), here = L.latLng(c.latitude, c.longitude);
    if (c.speed != null && c.speed >= 2.2 && c.heading != null && !isNaN(c.heading)) { gpsDir = c.heading; gpsAt = now; }
    else if (prevFix && now - prevFix.t <= 6000 && here.distanceTo(prevFix.ll) >= 12 && here.distanceTo(prevFix.ll) / ((now - prevFix.t) / 1000) >= 2.2) {
      gpsDir = bearingTo(prevFix.ll, here); gpsAt = now; }
    if (!prevFix || here.distanceTo(prevFix.ll) >= 5 || now - prevFix.t > 6000) prevFix = { ll: here, t: now };
  };
  const turnEvent = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  const beamStart = () => {
    if (!beam) { beam = document.createElement("div"); beam.className = "phonebeam"; beam.hidden = true; map.getContainer().appendChild(beam); }
    // (newer Chrome asks too; listen either way: a phone that says no simply sends nothing)
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function")
      DeviceOrientationEvent.requestPermission().catch(() => {});
    listen();
  };
  const beamStop = () => { window.removeEventListener(turnEvent, onTurn); phoneDir = null; gotTurn = false; if (stuck) setStuck(false); beamDraw(); };
  map.on("move zoom rotate viewreset resize", beamDraw);
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
    resume = setTimeout(() => { if (watch !== null && last) { follow = true; map.panTo(aim(last), { animate: true }); } }, LOCATE_RESUME_MS);
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
      freeScreen(); show(false); say(""); cmpReset(); beamStop();
      map.fire("whereupdate", { latlng: null });  // location off: the page clears its own "you are here" marks
    };
    btn.addEventListener("click", e => {
      e.preventDefault();
      if (watch !== null) return stop();
      show(true); follow = true; say("Finding you…");
      if (routeBearing) cmpMode = "route";  // track up by default (Chu 11/21: 95% of the time); 🧭 switches
      if (CNX_BETA) beamStart();  // straight from the tap (iPhone's compass question needs that)
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
        gpsFix(pos);
        map.fire("whereupdate", { latlng: last, pos });  // pos: time, accuracy and height, for Navigate and Record
        cmpFix();  // the page can mark the rider elsewhere too (the height chart)
        beamDraw();
        setLabel();
        if (first) { map.setView(last, Math.max(map.getZoom(), 14)); first = false; if (map.cnxLead) map.panTo(aim(last), { animate: false }); }
        else if (follow) map.panTo(aim(last), { animate: true });
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
  // For ▶ Navigate and ⏺ Record: turn location on (same as tapping the button) and turn the map with the route.
  map.cnxLocate = {
    on: () => { if (watch === null && btn) btn.click(); },
    isOn: () => watch !== null,
    where: () => last,
    routeUp: () => { if (!routeBearing) return; cmpMode = "route"; if (last) turnTo(heading); cmpShow(); },
  };
}

// 🔒 Rain lock, bottom left: one tap and the screen ignores every touch (rain drops make phones tap and scroll
// by themselves). The map keeps following the rider and the screen stays awake. To unlock: slide the 🔒 from the
// left edge into the circle in the middle (Chu 11/21: a 2 s hold could happen by itself in a pocket; a slide can't).
// Let go before the circle = it springs back. 👖 Pocket screen (ride.js) is the same lock on black.
// The phone's Back button while locked stays on the page and points at the slide (Android "Back" used to leave the
// site with no signal and lose the ride).
function addRainLock(map) {
  let locked = false, wake = null, cover = null, btn = null, knob = null, hint = null, hintT = null, ourState = false;
  const holdScreen = async () => {
    if (!locked || wake || !("wakeLock" in navigator)) return;
    try { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } catch (e) { wake = null; }
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") holdScreen(); });
  const flash = () => { hint.classList.add("flash"); clearTimeout(hintT); hintT = setTimeout(() => hint.classList.remove("flash"), 1400); };
  const setLocked = on => {
    if (locked === on) return;
    locked = on;
    document.body.classList.toggle("rainlocked", on);
    if (!on) document.body.classList.remove("pocket");
    cover.hidden = !on;
    btn.classList.toggle("on", on);
    const t = on ? "Screen locked. Slide the lock into the circle to unlock" : "Lock the screen (rain)";
    btn.title = t; btn.setAttribute("aria-label", t); btn.setAttribute("aria-pressed", String(on));
    if (on) {
      holdScreen();
      try { history.pushState({ cnxLock: 1 }, ""); ourState = true; } catch (e) {}
    } else {
      if (wake) { wake.release().catch(() => {}); wake = null; }
      if (ourState && history.state && history.state.cnxLock) { ourState = false; try { history.back(); } catch (e) {} }
      ourState = false;
    }
  };
  window.addEventListener("popstate", () => {  // Back while locked: stay, show how to unlock
    if (!locked) return;
    try { history.pushState({ cnxLock: 1 }, ""); ourState = true; } catch (e) {}
    flash();
  });
  const swallow = e => { if (e.target.closest && e.target.closest(".rl-knob")) return; if (e.cancelable) e.preventDefault(); e.stopPropagation(); };
  cover = document.createElement("div");
  cover.className = "raincover"; cover.hidden = true;
  cover.innerHTML = `<div class="rl-slide"><div class="rl-ring"></div><div class="rl-arr">› › ›</div>
    <div class="rl-knob" role="slider" aria-label="Slide to unlock">🔒</div><p class="rl-hint">Slide 🔒 to the circle to unlock</p></div>`;
  ["touchstart", "touchmove", "touchend", "pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "wheel", "contextmenu", "gesturestart"]
    .forEach(ev => cover.addEventListener(ev, swallow, { passive: false }));
  document.body.appendChild(cover);
  knob = cover.querySelector(".rl-knob"); hint = cover.querySelector(".rl-hint");
  const ring = cover.querySelector(".rl-ring");
  // the slide: finger down on the knob, follow it sideways, unlock if let go inside the circle
  let x0 = null, pid = null;
  const knobAt = dx => { knob.style.transform = `translateX(${Math.max(0, dx)}px)`; };
  const inRing = () => { const k = knob.getBoundingClientRect(), r = ring.getBoundingClientRect();
    const kx = k.left + k.width / 2, ky = k.top + k.height / 2, rx = r.left + r.width / 2, ry = r.top + r.height / 2;
    return Math.hypot(kx - rx, ky - ry) <= r.width / 2; };
  knob.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation(); x0 = e.clientX; pid = e.pointerId;
    try { knob.setPointerCapture(pid); } catch (er) {}
    knob.style.transition = "none"; ring.classList.add("near");
  });
  knob.addEventListener("pointermove", e => {
    if (x0 == null || e.pointerId !== pid) return; e.preventDefault();
    const max = ring.getBoundingClientRect().right - knob.getBoundingClientRect().width / 2 - (knob.getBoundingClientRect().left - (parseFloat((knob.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0)) ;
    knobAt(Math.min(e.clientX - x0, max)); ring.classList.toggle("in", inRing());
  });
  const drop = e => {
    if (x0 == null || (e && e.pointerId !== pid)) return;
    const ok = inRing(); x0 = null; pid = null;
    knob.style.transition = ""; knobAt(0); ring.classList.remove("near", "in");
    if (ok) setLocked(false); else flash();
  };
  knob.addEventListener("pointerup", drop); knob.addEventListener("pointercancel", drop);
  const ctl = L.control({ position: "bottomleft" });
  ctl.onAdd = () => {
    const box = L.DomUtil.create("div", "leaflet-bar rainlock");
    box.innerHTML = `<a href="#" role="button" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.5c.8 0 1.5.7 1.5 1.5v8c0 .8-.7 1.5-1.5 1.5h-13C4.7 21 4 20.3 4 19.5v-8C4 10.7 4.7 10 5.5 10H7zm2 0h6V8a3 3 0 0 0-6 0v2z" fill="currentColor"/></svg></a>`;
    L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
    btn = box.querySelector("a");
    btn.addEventListener("click", e => { e.preventDefault(); if (locked) flash(); else setLocked(true); });
    btn.addEventListener("contextmenu", e => e.preventDefault());
    setTimeout(() => { locked = true; setLocked(false); }, 0);
    return box;
  };
  ctl.addTo(map);
  map.cnxLock = { lock: () => setLocked(true), unlock: () => setLocked(false), isOn: () => locked };
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
  // Folded paper map with a down arrow (save the map) / with a tick (saved): reads as "map", not just "download".
  const MAP = `<path d="M3 6.5 8.5 4.5 15.5 7 21 5v12.5L15.5 19.5 8.5 17 3 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 4.5V17M15.5 7v5" fill="none" stroke="currentColor" stroke-width="1.6"/>`;
  const ICON_SAVE = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${MAP}<circle cx="17.5" cy="17.5" r="5.2" fill="#2f7cf6"/><path d="M17.5 14.6v5.2m0 0-2.2-2.2m2.2 2.2 2.2-2.2" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_DONE = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${MAP}<circle cx="17.5" cy="17.5" r="5.2" fill="#fff"/><path d="M15.2 17.6l1.6 1.6 3.1-3.3" fill="none" stroke="#2f9e6e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
  let saving = null;
  const save = t => saving || (saving = save1(t).finally(() => { saving = null; }));
  const save1 = async t => {
    if (navigator.onLine === false) { say("No signal. Save it where there's signal or Wi-Fi", 5000); return "nosignal"; }
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
      return "done";
    } catch (e) {
      busy = false; await refresh();
      say("Couldn't save. Check the signal and try again", 6000);
      return "failed";
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
  // ▶ Navigate and 👥 Start / Join save the track's map by themselves (no question). Resolves when it's done:
  // "saved" (it already was), "done" (just saved), "nosignal" or "failed".
  map.cnxOffline = {
    ensure: async t => {
      if (await savedRec(t.id).catch(() => null)) return "saved";
      if (navigator.onLine === false) return "nosignal";
      return save(t);
    },
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

// ⏺ Record, bottom left above the saved-map button: tap = start recording the ride (turns location on),
// tap again (red ⏹) = stop, then a box asks for a name and Save… lets the phone pick where the GPX file goes
// (computer and newer Android Chrome: a real save screen; iPhone: the share sheet, "Save to Files").
// The ride is kept in the phone while recording, so a reload or a closed tab doesn't lose it: the box comes back.
// Websites only get GPS while the page is on screen, so the screen is kept awake (location ON does that).
const REC_KEY = "cnx-rec-v1";
function addRecord(map) {
  if (!("geolocation" in navigator)) return;
  let rec = null, on = false, casing = null, line = null, btn = null, sign = null, tick = null, sheet = null;
  const store = () => { try { if (rec) rec.on = on; localStorage.setItem(REC_KEY, JSON.stringify(rec)); } catch (e) {} };
  const forget = () => { try { localStorage.removeItem(REC_KEY); } catch (e) {} };
  const loadRec = () => { try { const r = JSON.parse(localStorage.getItem(REC_KEY)); return r && Array.isArray(r.pts) ? r : null; } catch (e) { return null; } };
  const meters = pts => { let d = 0; for (let i = 1; i < pts.length; i++) d += L.latLng(pts[i - 1][0], pts[i - 1][1]).distanceTo([pts[i][0], pts[i][1]]); return d; };
  const climbOf = pts => {  // GPS height jumps a lot: count a climb only once it's 5 m above the last low point
    const e = pts.map(p => p[2]).filter(v => v != null);
    if (e.length < pts.length * 0.8 || e.length < 2) return null;
    let up = 0, ref = e[0];
    for (const v of e) { if (v > ref + 5) { up += v - ref; ref = v; } else if (v < ref) ref = v; }
    return Math.round(up);
  };
  const dur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
  const pad = n => String(n).padStart(2, "0");
  const defaultName = r => { const d = new Date(r.start); return `Ride ${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()} ${pad(d.getHours())}-${pad(d.getMinutes())}`; };
  const draw = () => {
    const ll = rec.pts.map(p => [p[0], p[1]]);
    if (!line) {
      casing = L.polyline(ll, { color: "#000", weight: 8, opacity: 0.5, interactive: false }).addTo(map);
      line = L.polyline(ll, { color: "#e53935", weight: 5, opacity: 1, interactive: false }).addTo(map);
    } else { casing.setLatLngs(ll); line.setLatLngs(ll); }
    casing.bringToFront(); line.bringToFront();
  };
  const undraw = () => { if (line) { map.removeLayer(line); map.removeLayer(casing); line = casing = null; } };
  const show = () => {
    if (!btn) return;
    btn.classList.toggle("on", on); sign.hidden = !on;
    const t = on ? "Recording. Tap to stop" : "Record your ride (GPX)";
    btn.title = t; btn.setAttribute("aria-label", t); btn.setAttribute("aria-pressed", String(on));
    clearInterval(tick);
    if (on) { const up = () => { sign.textContent = dur(Date.now() - rec.start); }; up(); tick = setInterval(up, 15000); }
  };
  map.on("whereupdate", e => {
    if (!on || !e.pos) return;
    const c = e.pos.coords;
    if (c.accuracy > 50) return;  // a wild fix (inside a valley, just woken up): skip it
    const p = [+c.latitude.toFixed(6), +c.longitude.toFixed(6), c.altitude != null ? Math.round(c.altitude * 10) / 10 : null, e.pos.timestamp || Date.now()];
    const prev = rec.pts[rec.pts.length - 1];
    if (prev && L.latLng(prev[0], prev[1]).distanceTo([p[0], p[1]]) < 4 && p[3] - prev[3] < 15000) return;
    rec.pts.push(p); store(); draw();
  });
  const gpx = (r, name) => {
    const x = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="CNX Enduro Tracks" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${x(name)}</name><trkseg>\n` +
      r.pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}">${p[2] != null ? `<ele>${p[2]}</ele>` : ""}<time>${new Date(p[3]).toISOString()}</time></trkpt>`).join("\n") +
      `\n</trkseg></trk>\n</gpx>\n`;
  };
  // Where to save: the phone's own screen. "cancel" = the rider closed it (keep the box open).
  const saveFile = async (text, filename) => {
    const blob = new Blob([text], { type: "application/gpx+xml" });
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "GPX track", accept: { "application/gpx+xml": [".gpx"] } }] });
        const w = await h.createWritable(); await w.write(blob); await w.close(); return "saved";
      } catch (e) { if (e.name === "AbortError") return "cancel"; }
    }
    const file = new File([blob], filename, { type: "application/gpx+xml" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return "saved"; } catch (e) { if (e.name === "AbortError") return "cancel"; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return "saved";
  };
  const closeSheet = () => { if (sheet) { sheet.remove(); sheet = null; } };
  const openSheet = unfinished => {
    closeSheet();
    const km = meters(rec.pts) / 1000, climb = climbOf(rec.pts), last = rec.pts[rec.pts.length - 1];
    sheet = document.createElement("div"); sheet.className = "recsheet";
    sheet.innerHTML = `<div class="recdim"></div><div class="recbox" role="dialog" aria-label="Save your ride">
      ${unfinished ? `<p class="recnote">Your ride wasn't saved yet</p>` : ""}
      <div class="recstats"><span><b>${km.toFixed(1)}</b> km</span><span><b>${dur((last ? last[3] : Date.now()) - rec.start)}</b></span>${climb != null ? `<span><b>⛰ ${climb}</b> m</span>` : ""}</div>
      <label>Name<span class="recname"><input type="text" maxlength="80" autocomplete="off" spellcheck="false"><i>.gpx</i></span></label>
      <button type="button" class="btn primary recsave">💾 Save…</button>
      <button type="button" class="btn reckeep">Keep recording</button>
      <button type="button" class="recdel">Delete ride</button>
      <p class="recmsg small" role="status"></p></div>`;
    document.body.appendChild(sheet);
    const input = sheet.querySelector("input"), msg = sheet.querySelector(".recmsg");
    input.value = rec.name || defaultName(rec);
    input.addEventListener("input", () => { rec.name = input.value; store(); });
    sheet.querySelector(".recsave").onclick = async () => {
      if (!rec.pts.length) { msg.textContent = "Nothing recorded yet: no GPS fix came in."; return; }
      const name = (input.value.trim() || defaultName(rec)).replace(/\.gpx$/i, "");
      const res = await saveFile(gpx(rec, name), name.replace(/[\\/:*?"<>|]+/g, "-") + ".gpx");
      if (res !== "saved") return;
      rec = null; forget(); undraw(); closeSheet(); show();
    };
    sheet.querySelector(".reckeep").onclick = () => { on = true; store(); closeSheet(); map.cnxLocate && map.cnxLocate.on(); show(); };
    sheet.querySelector(".recdel").onclick = () => {
      if (!confirm("Delete this ride? It can't be brought back.")) return;
      rec = null; forget(); undraw(); closeSheet(); show();
    };
  };
  const ctl = L.control({ position: "bottomleft" });
  ctl.onAdd = () => {
    const box = L.DomUtil.create("div", "leaflet-bar recbtn");
    box.innerHTML = `<span class="recsign" hidden></span><a href="#" role="button" aria-pressed="false"><i></i></a>`;
    L.DomEvent.disableClickPropagation(box);
    btn = box.querySelector("a"); sign = box.querySelector(".recsign");
    btn.addEventListener("click", e => {
      e.preventDefault();
      if (on) { on = false; store(); show(); openSheet(false); return; }
      if (rec && rec.pts.length) return openSheet(true);  // an unsaved ride is waiting
      on = true; rec = { start: Date.now(), pts: [] }; store();
      map.cnxLocate && map.cnxLocate.on();
      show();
    });
    show();
    return box;
  };
  ctl.addTo(map);
  // A reload / closed tab while recording: it just carries on (Chu 11/21: never ask; only ⏹ stops it).
  // A ride that was stopped but not saved yet: draw it and ask what to do with it.
  const left = loadRec();
  if (left && left.on && Date.now() - left.start < 24 * 3600e3) {
    rec = left; on = true; if (rec.pts.length) draw(); show();
    setTimeout(() => { map.cnxLocate && map.cnxLocate.on(); show(); }, 300);
  } else if (left && left.pts.length) { rec = left; draw(); setTimeout(() => openSheet(true), 600); }
  else if (left) forget();
  map.cnxRecord = {
    isOn: () => on,
    gpx: () => rec && rec.pts.length ? { text: gpx(rec, rec.name || defaultName(rec)), file: (rec.name || defaultName(rec)).replace(/[\\/:*?"<>|]+/g, "-") + ".gpx" } : null,
  };
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
      // In the map's bottom row, just before the map credits (Chu 11/19), same small size.
      if (map.attributionControl) map.attributionControl.setPrefix(`<span class="areakey"><i></i>Doi Suthep-Pui National Park: no off-road riding</span>`);
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

// 🚶 Walk (Chu 11/21): exploring the trail on foot. Tap 🚶 when the phone comes off the bike: the bike is pinned
// where you stand, your steps are drawn as orange footprints, the top-left box says how far the bike is, and
// "Find my bike" (bottom row) leads you back along your own steps, with a buzz + beep that gets faster from 100 m
// (iPhone: beeps only, websites can't vibrate it). Works with no signal (GPS + the saved map). Kept in the phone
// ("cnx-walk-v1"), so a refresh or leaving the site loses nothing. The phone's power button pauses the site: when
// the screen is back on, the missing part is joined with a straight dashed line, so Find my bike still works.
// Tap the orange 🚶 twice to end Walk; reaching the bike ends it by itself.
const WALK_KEY = "cnx-walk-v1";
const BIKE_SVG = `<svg class="bikeic" viewBox="0 0 48 30" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="6.5"/><circle cx="39" cy="21" r="6.5"/><path d="M9 21 18 12h11l10 9M18 12l4 9h7l-6-9M27 7h5l3 6M14 12h7"/></svg>`;
function addWalk(map) {
  if (!("geolocation" in navigator)) return;
  let W = null, btn = null, guiding = false, endAsk = 0, buzzT = null, lastM = null, battery = null, layers = null;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(WALK_KEY)); return v && Date.now() - v.start < 24 * 3600e3 ? v : null; } catch (e) { return null; } };
  const store = () => { try { W ? localStorage.setItem(WALK_KEY, JSON.stringify(W)) : localStorage.removeItem(WALK_KEY); } catch (e) {} };
  const fmt = m => m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.max(5, Math.round(m / 5) * 5) + " m";
  const status = document.createElement("div"); status.className = "walkst"; status.hidden = true;
  const find = document.createElement("button"); find.type = "button"; find.className = "findbike"; find.hidden = true;
  const warn = document.createElement("div"); warn.className = "walkwarn"; warn.hidden = true;
  warn.innerHTML = `⚠ Don't turn the screen off<small>use 🔒 instead, so your steps keep recording</small>`;
  // While Find my bike guides you, iPhone plays the beeps even with the silent switch on (iOS 17+ "playback");
  // back to normal after, so it doesn't stop the rider's music the rest of the time.
  const loud = on => { try { if (navigator.audioSession) navigator.audioSession.type = on ? "playback" : "auto"; } catch (e) {} };
  [status, find, warn].forEach(el => { map.getContainer().appendChild(el); L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); });
  if (navigator.getBattery) navigator.getBattery().then(b => { battery = b; }).catch(() => {});
  const bikeIcon = () => L.divIcon({ className: "", iconSize: [44, 44], iconAnchor: [22, 22], html: `<div class="bikepin">${BIKE_SVG}</div>` });
  const ll = p => L.latLng(p[0], p[1]);

  // the way back: from where you are, back along your steps to the bike
  const pathBack = here => {
    const pts = W.pts;
    if (!pts.length) return { path: [here, W.bike], m: here.distanceTo(W.bike) };
    let bi = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = here.distanceTo(ll(p)); if (d < bd) { bd = d; bi = i; } });
    const path = [here], back = [];
    let m = bd;
    for (let i = bi; i >= 0; i--) { back.push(ll(pts[i])); if (i > 0) m += ll(pts[i]).distanceTo(ll(pts[i - 1])); }
    m += ll(pts[0]).distanceTo(W.bike);
    return { path: [...path, ...back, ll(W.bike)], m };
  };
  const draw = () => {
    if (!layers) return;
    const solid = [[ll(W.bike)]], dashed = [];
    W.pts.forEach(p => {
      const cur = solid[solid.length - 1];
      if (p[3]) { dashed.push([cur[cur.length - 1], ll(p)]); solid.push([ll(p)]); } else cur.push(ll(p));
    });
    layers.steps.setLatLngs(solid); layers.gaps.setLatLngs(dashed);
    layers.feet.clearLayers();
    let acc = 0;
    const from = Math.max(1, W.pts.length - 400);
    for (let i = from; i < W.pts.length; i++) {
      acc += ll(W.pts[i - 1]).distanceTo(ll(W.pts[i]));
      if (acc >= 22 && !W.pts[i][3]) { acc = 0; L.marker(ll(W.pts[i]), { interactive: false, keyboard: false, icon: L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: '<span class="foot">👣</span>' }) }).addTo(layers.feet); }
    }
    if (W.bike) { if (!layers.bike) layers.bike = L.marker(W.bike, { icon: bikeIcon(), zIndexOffset: 950, interactive: false }).addTo(layers.g); else layers.bike.setLatLng(W.bike); }
  };
  const paintStatus = () => {
    if (!W) return;
    const bat = battery && battery.level != null && !battery.charging && battery.level < 0.3 ? Math.round(battery.level * 100) : null;
    status.classList.toggle("batlow", bat != null && bat < 15);
    status.innerHTML = `${BIKE_SVG}<span><b>${lastM == null ? "…" : fmt(lastM)}</b><small>${bat != null ? "🔋 " + bat + "% · " : ""}to your bike</small></span>` +
      (guiding && document.body.classList.contains("navmode") ? `<button type="button" class="wnav">▶ Navigate</button>` : "");
    const nb = status.querySelector(".wnav"); if (nb) nb.onclick = () => end(true);
    find.innerHTML = `${BIKE_SVG}<span>${guiding ? "Finding your bike…" : bat != null && bat < 15 ? "🔋 " + bat + "% · Find my bike" : "Find my bike"}</span>`;
    find.classList.toggle("on", guiding); find.classList.toggle("batlow", bat != null && bat < 15);
    status.classList.toggle("wide", guiding); document.body.classList.toggle("walkguide", guiding);
  };
  const tick = () => {  // parking-sensor buzz: from 100 m, faster as you get closer
    clearTimeout(buzzT); buzzT = null;
    if (!W || !guiding || lastM == null || lastM > 100) return;
    try { navigator.vibrate && navigator.vibrate(lastM < 30 ? 60 : 90); } catch (e) {}
    if (map.cnxBeep) map.cnxBeep(1, 2600, 0.09, "square", 1);  // loudest, sharpest: the engine is off, this is how iPhones find the bike
    buzzT = setTimeout(tick, Math.max(250, Math.min(2000, lastM * 18)));
  };
  const update = here => {
    if (!W || !W.bike) return;
    const pb = pathBack(here);
    lastM = pb.m;
    const straight = here.distanceTo(W.bike);
    if (straight > (W.maxAway || 0)) { W.maxAway = Math.round(straight); }
    if (guiding) { layers.guideEdge.setLatLngs(pb.path); layers.guide.setLatLngs(pb.path); if (!buzzT && lastM <= 100) tick(); }
    paintStatus();
    if (straight <= 15 && (guiding || (W.maxAway || 0) > 40)) arrive();
  };
  const arrive = () => {
    try { navigator.vibrate && navigator.vibrate(700); } catch (e) {}
    if (map.cnxBeep) map.cnxBeep(1, 1800, 0.7, "square", 1);
    if (typeof cnxToast === "function") cnxToast(`<span class="tbike">${BIKE_SVG}</span>✓ You're at your bike<small>Walk off${document.body.classList.contains("navmode") ? ". Navigate carries on." : "."}</small>`, 4000);
    end(false);
  };
  map.on("whereupdate", e => {
    if (!W || !e.latlng) return;
    const c = e.pos && e.pos.coords;
    if (c && c.accuracy > 40) return;  // a wild fix under trees: skip
    const here = e.latlng, now = (e.pos && e.pos.timestamp) || Date.now();
    if (!W.bike) { W.bike = [+here.lat.toFixed(6), +here.lng.toFixed(6)]; store(); draw(); paintStatus(); return; }
    const prev = W.pts[W.pts.length - 1], ref = prev ? ll(prev) : ll(W.bike), d = here.distanceTo(ref);
    if (d >= 5) {
      const gap = prev && now - prev[2] > 20000 && d > 25 ? 1 : 0;  // the screen was off: join with a dashed line
      W.pts.push([+here.lat.toFixed(6), +here.lng.toFixed(6), now, gap]);
      if (W.pts.length > 5000) W.pts.splice(0, W.pts.length - 5000);
      store(); draw();
    }
    update(here);
  });
  const show = () => {
    map.cnxWalking = true; document.body.classList.add("walking");
    if (!layers) {
      const g = L.featureGroup().addTo(map);
      layers = { g,
        guideEdge: L.polyline([], { color: "#fff", weight: 11, opacity: 0.9, interactive: false }).addTo(g),
        guide: L.polyline([], { color: "#1a73ff", weight: 7, interactive: false }).addTo(g),
        steps: L.polyline([], { color: "#ff8a1f", weight: 4, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(g),
        gaps: L.polyline([], { color: "#ff8a1f", weight: 3, dashArray: "10 8", opacity: 0.9, interactive: false }).addTo(g),
        feet: L.layerGroup().addTo(g), bike: null };
    }
    status.hidden = false; find.hidden = false; if (btn) { btn.classList.add("on"); btn.title = "Walk on. Tap twice to end"; }
    draw(); paintStatus(); map.fire("walkchange", { on: true });
  };
  const start = () => {
    if (map.cnxUnlockSound) map.cnxUnlockSound();
    if (map.cnxLocate) map.cnxLocate.on();
    const here = map.cnxLocate && map.cnxLocate.where && map.cnxLocate.where();
    W = { start: Date.now(), bike: here ? [+here.lat.toFixed(6), +here.lng.toFixed(6)] : null, pts: [], maxAway: 0 };
    guiding = false; lastM = W.bike ? 0 : null; store(); show();
    warn.hidden = false; clearTimeout(warn._t); warn._t = setTimeout(() => { warn.hidden = true; }, 5000);
  };
  function end() {
    if (guiding) setTimeout(() => loud(false), 1500);  // let the arrival beep finish first
    W = null; guiding = false; lastM = null; store(); clearTimeout(buzzT); buzzT = null;
    if (layers) { layers.g.remove(); layers = null; }
    map.cnxWalking = false; document.body.classList.remove("walking", "walkguide");
    status.hidden = true; find.hidden = true; warn.hidden = true;
    if (btn) { btn.classList.remove("on"); btn.title = "Walk: exploring on foot. Pins your bike"; }
    map.fire("walkchange", { on: false });
  }
  find.onclick = () => {
    if (!W) return;
    if (map.cnxUnlockSound) map.cnxUnlockSound();
    guiding = !guiding; loud(guiding);
    if (!guiding) { clearTimeout(buzzT); buzzT = null; layers.guide.setLatLngs([]); layers.guideEdge.setLatLngs([]); }
    const here = map.cnxLocate && map.cnxLocate.where && map.cnxLocate.where();
    if (here) { update(here); if (guiding) map.fitBounds(L.latLngBounds([here, ll(W.bike)]).pad(0.3), { animate: true }); }
    paintStatus();
  };
  const ctl = L.control({ position: "bottomleft" });
  ctl.onAdd = () => {
    const box = L.DomUtil.create("div", "leaflet-bar walkbtn");
    box.innerHTML = `<a href="#" role="button" title="Walk: exploring on foot. Pins your bike" aria-label="Walk: exploring on foot. Pins your bike">🚶</a>`;
    L.DomEvent.disableClickPropagation(box);
    btn = box.querySelector("a");
    btn.addEventListener("click", e => {
      e.preventDefault();
      if (!W) return start();
      if (Date.now() - endAsk < 3000) { end(); if (typeof cnxToast === "function") cnxToast("🚶 Walk ended", 2500); return; }
      endAsk = Date.now(); if (typeof cnxToast === "function") cnxToast("Tap 🚶 again to end Walk", 3000);
    });
    return box;
  };
  ctl.addTo(map);
  const left = load();  // a refresh or coming back to the site: still walking, steps and bike kept
  if (left) { W = left; show(); setTimeout(() => { if (map.cnxLocate) map.cnxLocate.on(); }, 350); }
  map.cnxWalk = { isOn: () => !!W, end, _state: () => W, _guide: () => guiding };
}
