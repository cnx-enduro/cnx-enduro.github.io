// ▶ Navigate, on a track page (Chu 11/19, picture first). One tap: location on, map turns with the route,
// screen stays awake, the track's map saves itself for no signal. On the map:
//  - small box top left: arrival time, progress, sun dot (green / amber < 30 min spare / red after dark);
//    tap = big box (✕ stop, ARRIVE, Dark badge, %, km to go), back to small after 8 s or another tap;
//    the Dark badge opens the sun box (dark at, you arrive, turn back by, battery). It opens by itself once
//    when the sun dot turns red.
//  - route: still to ride = thick blue with white ▶ arrows; already ridden = grey (surface colours off).
//  - stops and laterite ahead: from 2 km, distance in 100 m steps; the stop's pin pulses.
//  - off track (> 15 m for 20 s, only when the phone's own GPS is better than 15 m): red screen edge,
//    ⚠ OFF TRACK, green ← / → with metres to the track, red dots = the way you came since leaving it.
//  - (the thin green phone-direction line comes with location ON, common.js, so it is on here too)
//  - turns (Chu 11/26): from 500 m before a junction where the track turns, a box on top of the ahead list:
//    bent arrow + "200 m" counting down in 50 m steps + "Turn left"; 2 beeps + buzz at 200 m, 1 beep at the turn.
//    Turns come from tools/turns.py (track turns 35°+ where the offline map shows 3+ ways meeting), t.turns.
//  - ■ NAV asks (app.js navChoice): ↩ Ride back the way I came (t.back: the same track turned around) / ■ Stop / ✕ Cancel.
// Track up everywhere: the way ahead points up the screen.
const NAV = { OFF_M: 15, OFF_S: 20, AHEAD_KM: 2, SPEED_WINDOW_MIN: 15, SPEED_MIN_MOVING_MIN: 10, SMALL_AFTER_MS: 8000,
  TURN_SHOW_M: 500, TURN_BEEP_M: 200, TURN_NOW_M: 30, TURN_PAST_M: 25 };

// Sunset (sun 0.833° below the horizon) for a day and place, worked out on the phone (no signal needed).
function sunsetAt(day, lat, lon) {
  const R = Math.PI / 180, noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  const n = Math.ceil(noon.getTime() / 864e5 + 2440587.5 - 2451545 + 0.0008);
  const J = n - lon / 360, M = (357.5291 + 0.98560028 * J) % 360;
  const C = 1.9148 * Math.sin(M * R) + 0.02 * Math.sin(2 * M * R) + 0.0003 * Math.sin(3 * M * R);
  const lam = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545 + J + 0.0053 * Math.sin(M * R) - 0.0069 * Math.sin(2 * lam * R);
  const dec = Math.asin(Math.sin(lam * R) * Math.sin(23.4397 * R));
  const w = Math.acos((Math.sin(-0.833 * R) - Math.sin(lat * R) * Math.sin(dec)) / (Math.cos(lat * R) * Math.cos(dec)));
  return new Date((transit + w / (2 * Math.PI) - 2440587.5) * 864e5);
}

function startNavigate(o) {
  const { map, t } = o, R = Math.PI / 180, line = t.line, kmOf = o.kmOf;
  const box = map.getContainer(), loc = map.cnxLocate;
  const hhmm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const dist = m => m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.max(10, Math.round(m / 10) * 10) + " m";
  const step50 = km => km >= 1 ? (Math.round(km * 10) / 10).toFixed(1) + " km" : Math.max(50, Math.round(km * 20) * 50) + " m";
  // "Slippery" road sign: red-edged triangle, a wheel skidding on wavy lines
  const SLIP = `<svg viewBox="0 0 32 28" width="32" height="28" aria-hidden="true"><path d="M16 2 30.5 26.5h-29z" fill="#fff" stroke="#d32f2f" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle cx="16" cy="12.5" r="3.6" fill="none" stroke="#111" stroke-width="2"/><path d="M8.5 20.5c1.5-1.6 2.8 1.6 4.3 0s2.8 1.6 4.3 0 2.8 1.6 4.3 0M10 24c1.5-1.6 2.8 1.6 4.3 0s2.8 1.6 4.3 0 2.8 1.6 4.3 0" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const step100 = km => km >= 1 ? (Math.round(km * 10) / 10).toFixed(1) + " km" : Math.max(100, Math.round(km * 10) * 100) + " m";
  const brg = (a, b) => (Math.atan2(Math.sin((b[1] - a[1]) * R) * Math.cos(b[0] * R),
    Math.cos(a[0] * R) * Math.sin(b[0] * R) - Math.sin(a[0] * R) * Math.cos(b[0] * R) * Math.cos((b[1] - a[1]) * R)) / R + 360) % 360;
  const dest = (ll, h, m) => [ll[0] + m * Math.cos(h * R) / 111320, ll[1] + m * Math.sin(h * R) / (111320 * Math.cos(ll[0] * R))];
  const SUN = w => `<svg viewBox="0 0 24 16" width="${w}" height="${w * 2 / 3}" aria-hidden="true"><path d="M5 12a7 7 0 0 1 14 0z" fill="#ffb02e"/>` +
    (w > 20 ? `<path d="M12 1v2.5M3.8 4.4l1.8 1.8M20.2 4.4l-1.8 1.8M0.5 12h2M21.5 12h2" stroke="#ffb02e" stroke-width="1.8" stroke-linecap="round"/>` : "") +
    `<path d="M0 14.5h24" stroke="#fff" stroke-width="${w > 20 ? 1.6 : 2}"/></svg>`;
  const ARROW = left => `<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" style="transform:rotate(${left ? 180 : 0}deg)"><path d="M3 12h16m-7-8 8 8-8 8" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // ---- what's ahead on this track: stops and laterite as km ranges ----
  const kmAt = ll => kmOf(nearestOnLine(line, ll));
  const ahead = [
    ...t.pois.filter(p => p.kind !== "parking").map(p => ({ kind: p.kind === "water" ? "water" : "stop", name: p.name, from: p.km, to: p.kmTo ?? p.km, at: [p.lat, p.lon] })),
    ...((t.surface && t.surface.laterite) || []).map(l => {
      const a = kmAt(l[0]), b = kmAt(l[l.length - 1]);
      return { kind: "laterite", name: "Laterite", from: Math.min(a, b), to: Math.max(a, b) };
    }),
  ];

  // ---- turns ahead (junctions only) ----
  const turns = (t.turns || []).slice().sort((a, b) => a.km - b.km), turnTold = {};
  // bent arrow: a stem up, then the way you turn (by the real angle), arrow head at the end
  const TURN = (dir, deg) => {
    const a = Math.min(150, Math.max(35, deg)) * (dir === "L" ? -1 : 1) * R, ex = 16 + 11 * Math.sin(a), ey = 15 - 11 * Math.cos(a);
    const hx = h => (ex + 6 * Math.sin(a + h * R)).toFixed(1), hy = h => (ey - 6 * Math.cos(a + h * R)).toFixed(1);
    return `<svg class="turnic" viewBox="0 0 32 32" width="40" height="40" aria-hidden="true"><path d="M16 30V15L${ex.toFixed(1)} ${ey.toFixed(1)}M${hx(150)} ${hy(150)}L${ex.toFixed(1)} ${ey.toFixed(1)}L${hx(-150)} ${hy(-150)}" ` +
      `fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  const turnWord = d => d === "L" ? "Turn left" : "Turn right";

  // ---- the boxes on the map ----
  const ui = document.createElement("div");
  ui.className = "navui";
  ui.innerHTML = `
    <button type="button" class="navmini" aria-label="Arrival time. Tap for more"><b class="nm-eta">🏁 --:--</b>
      <span class="nm-row"><span class="nm-bar"><i></i></span>${SUN(16)}<i class="nm-dot"></i></span></button>
    <div class="navbig" hidden>
      <div class="nb-row"><span class="nb-eta"><small>Arrive</small><b>🏁 --:--</b></span>
        <span class="nb-sun">${SUN(26)}<span><small>Dark</small><b class="nb-dark">--:--</b></span><i class="nb-dot">✓</i></span></div>
      <div class="nb-bar"><i></i></div><div class="nb-foot"><b class="nb-pct">0%</b><span><b class="nb-left">${t.km} km</b> to go</span></div>
    </div>
    <button type="button" class="navstop" aria-label="Stop navigating" title="Stop navigating"><i></i><span>NAV</span></button>
    <button type="button" class="navmenu" aria-label="Menu" title="Menu">☰</button>
    <div class="navsun" hidden><button type="button" class="ns-x" aria-label="Close">✕</button><div class="ns-body"></div></div>
    <div class="navahead"></div>
    <div class="navoff" hidden></div>
    <div class="navglow" hidden></div>
    <p class="navtoast" hidden></p>
    <div class="navdark" hidden></div><div class="navwarn" hidden></div><p class="navmapmsg" hidden></p>`;
  box.appendChild(ui);
  L.DomEvent.disableClickPropagation(ui); L.DomEvent.disableScrollPropagation(ui);
  const q = s => ui.querySelector(s);
  const mini = q(".navmini"), big = q(".navbig"), sunBox = q(".navsun"), aheadBox = q(".navahead"), offBox = q(".navoff"), glow = q(".navglow"), toast = q(".navtoast");
  const darkMsg = q(".navdark"), darkGlow = q(".navwarn"), mapMsg = q(".navmapmsg");
  let smallT = null, toastT = null;
  const say = (text, ms = 6000) => { toast.textContent = text; toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toast.hidden = true; }, ms); };
  const setBig = on => {
    big.hidden = !on; mini.hidden = on; clearTimeout(smallT);
    if (on) smallT = setTimeout(() => { if (sunBox.hidden) setBig(false); }, NAV.SMALL_AFTER_MS);
    else sunBox.hidden = true;
  };
  // Chu 11/21: the box always starts small; tap = big, tap anywhere on it = small (also by itself after 8 s).
  // Nothing in it stops Navigate any more (its ✕ used to, and riders read ✕ as "close"): only ■ NAV stops.
  mini.onclick = () => setBig(true);
  big.onclick = () => setBig(false);
  q(".navstop").onclick = () => (o.onNavBtn ? o.onNavBtn() : stop(true));  // asks: ride back / stop / cancel (app.js)
  q(".navmenu").onclick = () => o.onMenu && o.onMenu();
  q(".ns-x").onclick = () => { sunBox.hidden = true; };
  map.on("click", closeSun);
  function closeSun() { if (!sunBox.hidden) { sunBox.hidden = true; setBig(true); } }

  // ---- route drawing: ridden grey, still to ride blue + white ▶ arrows ----
  const g = L.featureGroup().addTo(map);
  const rCase = L.polyline([], { color: "#000", weight: 8, opacity: 0.45, interactive: false }).addTo(g);
  const ridden = L.polyline([], { color: "#a7adb6", weight: 5, opacity: 1, interactive: false }).addTo(g);
  const aEdge = L.polyline(line, { color: "#fff", weight: 12, opacity: 0.9, interactive: false }).addTo(g);
  const aLine = L.polyline(line, { color: "#1a73ff", weight: 8, opacity: 1, interactive: false }).addTo(g);
  const chev = L.featureGroup().addTo(g);
  const stray = L.polyline([], { color: "#ff2d2d", weight: 4, opacity: 1, dashArray: "1 9", lineCap: "round", interactive: false }).addTo(g);
  let pin = null;
  const mpp = () => 156543.03 * Math.cos(map.getCenter().lat * R) / Math.pow(2, map.getZoom());
  let chevAt = -1;
  const drawChevrons = () => {  // white ▶ along the next 8 km, about every 70 px, drawn as tiny lines so they turn with the map
    chev.clearLayers();
    const k0 = nav.i ?? 0, every = 70 * mpp(), arm = 7 * mpp();
    let d = 0, total = 0;
    for (let k = k0 + 1; k < line.length && total < 8000; k++) {
      const s = L.latLng(line[k - 1]).distanceTo(line[k]); d += s; total += s;
      if (d < every) continue; d = 0;
      const h = brg(line[k - 1], line[k]);
      L.polyline([dest(line[k], h + 145, arm), line[k], dest(line[k], h - 145, arm)],
        { color: "#fff", weight: 2.6, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false }).addTo(chev);
    }
    chevAt = k0;
  };
  map.on("zoomend", drawChevrons);

  // ---- the ride's state ----
  const nav = { i: null, km: 0, n: null, joined: false, offSince: null, off: false, fixes: [], strayPts: [], redShown: false, last: null, acc: null, warnAt: 0 };
  if (o.restore && o.restore.track === t.id) Object.assign(nav, { i: o.restore.i ?? null, km: o.restore.km || 0, joined: !!o.restore.joined, warnAt: o.restore.warnAt || 0 });
  const saveState = () => { try { localStorage.setItem("cnx-nav", JSON.stringify({ track: t.id, back: !!t.back, i: nav.i, km: nav.km, joined: nav.joined, warnAt: nav.warnAt, at: Date.now(), paused: false })); } catch (e) {} };
  let saveT = 0;
  const notesKmh = () => {  // the track notes' pace: "70km (6 hours)" / "(5-6 hours)" (slower one) / "full day" = 8 h
    const f = o.length || "", m = f.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*hours?/i);
    const h = m ? parseFloat(m[2] || m[1]) : /full day/i.test(f) ? 8 : t.km / 12;
    return t.km / h;
  };
  const climbFrom = (km0, km1) => {  // metres up along the height profile between two km
    let up = 0; const p = t.profile || [];
    for (let i = 1; i < p.length; i++) if (p[i][0] > km0 && p[i][0] <= km1 && p[i][1] > p[i - 1][1]) up += p[i][1] - p[i - 1][1];
    return up;
  };
  const speedKmh = now => {  // moving speed of the last 15 min, stops left out; the notes' pace until 10 min of riding
    nav.fixes = nav.fixes.filter(f => now - f.t <= NAV.SPEED_WINDOW_MIN * 60000);
    let md = 0, mt = 0;
    for (let i = 1; i < nav.fixes.length; i++) {
      const a = nav.fixes[i - 1], b = nav.fixes[i], dt = (b.t - a.t) / 1000;
      if (dt <= 0 || dt > 120) continue;
      const d = a.ll.distanceTo(b.ll), v = d / dt;
      if (v >= 1 && v < 40) { md += d; mt += dt; }
    }
    return mt >= NAV.SPEED_MIN_MOVING_MIN * 60 ? Math.min(60, Math.max(4, md / mt * 3.6)) : notesKmh();
  };
  // Where on the track: the nearest point at or ahead of where we were (a loop crosses itself); the first time,
  // the nearest point anywhere (join the track at the nearest point, Chu's pick), the start on a loop's start/end.
  const locate = ll => {
    const pt = [ll.lat, ll.lng];
    if (nav.i != null) {
      const from = Math.max(0, nav.i - 30), n = nearestOnLine(line.slice(from), pt);
      n.i += from;
      if (n.dist <= 200 || nav.off) return n;
    }
    const n = nearestOnLine(line, pt);
    if (nav.i == null && t.loop && kmOf(n) > t.km * 0.9 && L.latLng(line[0]).distanceTo(ll) < 300) return { ...nearestOnLine(line.slice(0, 20), pt) };
    return n;
  };

  const update = (ll, pos) => {
    const now = pos ? fixTime(pos) : Date.now();
    nav.last = ll; nav.acc = pos ? pos.coords.accuracy : null;
    nav.fixes.push({ t: now, ll });
    const n = locate(ll), km = kmOf(n);
    const onLine = n.dist <= NAV.OFF_M;
    if (onLine) nav.joined = true;
    if (onLine || nav.i == null || km >= nav.km - 0.3) { nav.i = n.i; nav.km = km; nav.n = n; }
    // route split
    const cut = [nav.n.lat, nav.n.lon];
    rCase.setLatLngs([...line.slice(0, nav.i + 1), cut]); ridden.setLatLngs([...line.slice(0, nav.i + 1), cut]);
    aEdge.setLatLngs([cut, ...line.slice(nav.i + 1)]); aLine.setLatLngs([cut, ...line.slice(nav.i + 1)]);
    if (Math.abs(nav.i - chevAt) > 3) drawChevrons();
    // off track
    const goodGps = nav.acc == null || nav.acc <= NAV.OFF_M;
    if (onLine) { nav.offSince = null; nav.off = false; nav.strayPts = []; }
    else {
      if (!nav.strayPts.length) nav.strayPts.push([n.lat, n.lon]);
      nav.strayPts.push([ll.lat, ll.lng]);
      if (goodGps && nav.offSince == null) nav.offSince = now;
      if (nav.joined && nav.offSince != null && now - nav.offSince >= NAV.OFF_S * 1000 && !map.cnxWalking) nav.off = true;
    }
    if (map.cnxWalking) { nav.off = false; nav.offSince = null; }  // 🚶 on foot: no OFF TRACK alarm
    stray.setLatLngs(nav.off ? nav.strayPts : []);
    const lead = !nav.joined && n.dist > NAV.OFF_M;  // riding to the track: arrow, no warning
    if ((nav.off || lead) && !map.cnxWalking) {
      const a = map.latLngToContainerPoint(ll), b = map.latLngToContainerPoint([n.lat, n.lon]), left = b.x < a.x;
      offBox.innerHTML = (nav.off ? `<span class="no-lbl">⚠ OFF TRACK</span>` : "") +
        `<span class="no-go">${ARROW(left)}<span><b>${dist(n.dist)}</b><small>${nav.off ? "back to the track" : "to the track"}</small></span></span>`;
      offBox.className = "navoff right"; offBox.hidden = false;  // always right, under ☰ (Chu 11/26: it covered the menu); the arrow shows the side
    } else offBox.hidden = true;
    glow.hidden = !nav.off;
    // progress + arrival time + sun
    const pct = Math.max(0, Math.min(100, Math.round(nav.km / t.km * 100)));
    const kmLeft = Math.max(0, t.km - nav.km) + (onLine ? 0 : n.dist / 1000);
    const v = speedKmh(now);
    const doneRate = nav.km > 3 ? climbFrom(0, nav.km) / nav.km : (t.climb || 0) / t.km;
    const upLeft = climbFrom(nav.km, t.km);
    const hours = kmLeft / v + Math.max(0, upLeft - kmLeft * doneRate) / 400;
    const arrive = new Date(now + hours * 3.6e6);
    const dark = sunsetAt(new Date(now), ll.lat, ll.lng), spare = (dark - arrive) / 60000;
    const state = spare >= 30 ? "ok" : spare >= 0 ? "amber" : "red";
    const onTrack = nav.joined;  // before reaching the track: no arrival, no %, no sun advice (Chu 11/21, 14 km from home said "99%")
    q(".nm-eta").textContent = onTrack ? `🏁 ${hhmm(arrive)}` : "🏁 --:--"; q(".nb-eta b").textContent = onTrack ? `🏁 ${hhmm(arrive)}` : "🏁 --:--";
    q(".nm-bar i").style.width = q(".nb-bar i").style.width = pct + "%";
    q(".nb-pct").textContent = pct + "%"; q(".nb-left").textContent = `${kmLeft < 10 ? kmLeft.toFixed(1) : Math.round(kmLeft)} km`;
    q(".nb-dark").textContent = hhmm(dark);
    q(".nb-dot").textContent = state === "ok" ? "✓" : "!";
    ui.dataset.sun = onTrack ? state : "ok";
    if (!onTrack) { q(".nm-bar i").style.width = q(".nb-bar i").style.width = "0%"; q(".nb-pct").textContent = "–"; }
    // sun box: dark at / you arrive / turn back by (back to the start = km ridden at the same speed)
    let back = "";
    if (state === "red") {
      if (kmLeft <= nav.km) back = `<div class="ns-l big"><span>↑</span>Keep going: it's shorter than turning back</div>`;
      else {
        const by = new Date((dark.getTime() + now - nav.km / v * 3.6e6) / 2);
        back = by > now ? `<div class="ns-l big"><span>↩</span>Turn back by ${hhmm(by)}</div>` : `<div class="ns-l big"><span>↩</span>Turn back now</div>`;
      }
    }
    const bat = o.battery && o.battery.level != null && !o.battery.charging ? Math.round(o.battery.level * 100) : null;
    q(".ns-body").innerHTML = `<div class="ns-l"><span>${SUN(24)}</span>Dark at <b>${hhmm(dark)}</b></div>
      <div class="ns-l"><span>🏁</span>You arrive ≈ <b>${hhmm(arrive)}</b></div>${back}` +
      (bat != null ? `<div class="ns-tip">🔋 ${bat}%${bat < 40 ? " · plug in your power bank" : ""}</div>` : "");
    // Dark before you arrive: orange edges flash 3× + buzz/beep + a 6 s message, nothing to tap; again every 30 min
    // while still late (Chu 11/21; orange = late, red = off track). The old sun window never opens by itself.
    if (onTrack && state === "red" && now - nav.warnAt >= 30 * 60000) {
      nav.warnAt = now;
      darkMsg.innerHTML = `⚠ Dark ${hhmm(dark)} · you arrive ≈ ${hhmm(arrive)}`; darkMsg.hidden = false;
      darkGlow.hidden = false; darkGlow.classList.remove("go"); void darkGlow.offsetWidth; darkGlow.classList.add("go");
      setTimeout(() => { darkMsg.hidden = true; darkGlow.hidden = true; }, 6000);
      try { navigator.vibrate && navigator.vibrate([300, 700, 300, 700, 300]); } catch (e) {}
      if (o.beep) o.beep(3);
    }
    if (o.battery && o.battery.level != null && !o.battery.charging && o.battery.level < 0.3) {
      mini.dataset.bat = Math.round(o.battery.level * 100) + "%"; mini.classList.toggle("batlow", o.battery.level < 0.15);
    } else { delete mini.dataset.bat; mini.classList.remove("batlow"); }
    if (now - saveT > 5000) { saveT = now; saveState(); }
    // stops and laterite ahead (nearest one of each kind), from 2 km, in 100 m steps
    const next = kind => ahead.filter(a => (kind === "laterite" ? a.kind === "laterite" : a.kind !== "laterite") && a.to >= nav.km && a.from - nav.km <= NAV.AHEAD_KM)
      .sort((a, b) => a.from - b.from)[0];
    const s = next("stop"), l = next("laterite");
    const row = (a, icon, cls) => {
      const now = a.from <= nav.km;
      return `<div class="na ${cls}"><i>${icon}</i><span><b>${now ? "Here" : step100(a.from - nav.km)}</b><small>${esc(a.name)}</small></span></div>`;
    };
    // laterite: slippery sign + "Laterite 200 m", counting down every 50 m; on it: "Laterite now", how much is left
    const lat = a => `<div class="na laterite">${SLIP}<span><b>Laterite ${a.from <= nav.km ? "now" : step50(a.from - nav.km)}</b>` +
      `<small>${a.from <= nav.km ? step50(a.to - nav.km) + " of it · slippery when wet" : "slippery when wet"}</small></span></div>`;
    // the next turn: from 500 m, counting down in 50 m steps; "now" in the last 30 m; gone 25 m after it
    let turnRow = "";
    const tn = nav.joined && !nav.off && !map.cnxWalking ? turns.find(x => (x.km - nav.km) * 1000 > -NAV.TURN_PAST_M) : null;
    if (tn) {
      const m = (tn.km - nav.km) * 1000;
      if (m <= NAV.TURN_SHOW_M) {
        const then = turns.find(x => x.km > tn.km && (x.km - tn.km) * 1000 <= 150);
        const near = m <= NAV.TURN_NOW_M;
        turnRow = `<div class="na turn${near ? " now" : ""}">${TURN(tn.dir, tn.deg)}<span><b>${near ? "Now" : step50(m / 1000)}</b>` +
          `<small>${turnWord(tn.dir)}${then ? ", then " + (then.dir === "L" ? "left" : "right") : ""}</small></span></div>`;
        const told = turnTold[tn.km] || 0;
        if (m <= NAV.TURN_BEEP_M && told < 1) { turnTold[tn.km] = 1; try { navigator.vibrate && navigator.vibrate([150, 100, 150]); } catch (e) {} if (o.beep) o.beep(2, 1175, 0.15); }
        if (near && told < 2) { turnTold[tn.km] = 2; try { navigator.vibrate && navigator.vibrate(250); } catch (e) {} if (o.beep) o.beep(1, 1175, 0.3); }
      }
    }
    // ↩ riding the track backwards: a steady reminder on top of the list
    const backRow = t.back ? `<div class="na goback"><i>↩</i><span><b>Going back</b><small>to the start</small></span></div>` : "";
    aheadBox.innerHTML = backRow + turnRow + (s ? row(s, s.kind === "water" ? "≈" : "★", s.kind) : "") + (l ? lat(l) : "");
    if (s && s.at && (!pin || pin._for !== s)) {
      if (pin) pin.remove();
      pin = L.marker(s.at, { interactive: false, zIndexOffset: 900, icon: L.divIcon({ className: "", iconSize: [26, 26], html: `<div class="navpin ${s.kind}">${s.kind === "water" ? "≈" : "★"}</div>` }) }).addTo(map);
      pin._for = s;
    } else if (!s && pin) { pin.remove(); pin = null; }
  };

  const onWhere = e => { if (e.latlng) update(e.latlng, e.pos); else nav.last = null; };
  map.on("whereupdate", onWhere);

  // ---- go ----
  document.body.classList.add("navmode");
  map.cnxLead = 0.29;  // your dot 79% down the screen: more of the way ahead (Chu 11/21)
  loc.on(); loc.routeUp();
  // Offline map: saved by itself, no question (Chu 11/21). "✓ Offline map saved" for 3 s; a failure stays up
  // as "⚠ Offline map not saved" and keeps retrying every minute while there's signal.
  const mapSay = (text, ms, bad) => { mapMsg.textContent = text; mapMsg.hidden = false; mapMsg.classList.toggle("bad", !!bad); if (ms) setTimeout(() => { mapMsg.hidden = true; }, ms); };
  let mapRetry = null;
  const ensureMap = () => {
    if (!map.cnxOffline) return;
    map.cnxOffline.ensure({ id: t.id, name: t.name, file: t.file }).then(r => {
      if (r === "saved" || r === "done") { clearInterval(mapRetry); mapRetry = null; if (r === "done" || !ensureMap.told) mapSay("✓ Offline map saved", 3000); ensureMap.told = true; }
      else if (r === "nosignal" || r === "failed") { mapSay("⚠ Offline map not saved", 0, true); if (!mapRetry) mapRetry = setInterval(() => { if (navigator.onLine !== false) ensureMap(); }, 60000); }
    }).catch(() => {});
  };
  ensureMap();
  drawChevrons();
  if (o.youAt) update(o.youAt, null);

  function stop(fromButton, keep) {
    map.off("whereupdate", onWhere); map.off("zoomend", drawChevrons); map.off("click", closeSun);
    clearTimeout(smallT); clearTimeout(toastT); clearInterval(mapRetry);
    if (keep) saveState(); else try { localStorage.removeItem("cnx-nav"); } catch (e) {}
    g.remove(); if (pin) pin.remove(); ui.remove();
    document.body.classList.remove("navmode"); map.cnxLead = 0;
    if (fromButton && o.onExit) o.onExit();
  }
  // pause = leave the map view but keep the ride's state (☰ → Back to track page, another page): ▶ Back to Navigate
  return { stop: () => stop(false), end: () => stop(true), pause: () => { saveState(); stop(false, true); }, _nav: nav, _update: update };
}
