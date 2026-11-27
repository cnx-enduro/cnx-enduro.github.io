// 👥 Ride together (Chu 11/22; public 11/21 evening): riders on one track share their spot with a 4-digit group code.
// - Track page: purple "👥 Ride together" under ▶ Navigate → Start a ride (leader 🚩, gets the code + QR + link)
//   or Join a ride (type the code; the leader's link / QR skips that). Joining starts ▶ Navigate, so the screen
//   stays on (a website can't send from a locked phone). No mount? 🔒 rain lock, then the pocket.
// - Map: everyone as a coloured dot + name; 🚩 leader, 🧹 last rider (sweeper). Grey dashed = not updating
//   for 2 min (no signal, or the phone locked), frozen at the last spot.
// - Top row in Navigate: arrival · ■ Stop · 👥 6 (👥 🧹 / 👥 🙈 when only the last rider / nobody is shown).
//   Tap it → the group list: km ahead / behind along the track, tap a name = map jumps there,
//   👥 All · 🧹 Last rider · 🙈 Hide, 🆘 (hold 2 s), Leave ride (leader: End ride for everyone).
// - Leader only: orange "⏸ Wait" when the last rider is more than 2 km behind.
// - 😕 I lost you guys (one tap in the list, Chu's words): orange banner + Go + short buzz on every other phone;
//   ✓ Found you (or 10 min) clears it.
// - 🆘: red banner + Go (Google Maps) + buzz/beep on every phone; with no signal it's kept and sent when
//   signal comes back ("⏳ Waiting for signal…").
// - End: the leader's End ride wipes the whole group; every group switches off by itself after 8 h.
// Server: Firebase Realtime Database (free plan, project cnx-enduro-ride), rules in firebase/database.rules.json.
// Firebase is only downloaded when someone taps Ride together; sw.js keeps a copy so it opens with no signal.
// No signal (Chu 11/21, Android in the hills): the ride is kept in the phone, a refresh or reopening the site puts
// you straight back in with no internet, 👥 turns grey with 📵, and it all reconnects by itself.
// Leader status (🥪 Break · ⏸ Waiting · 🪚 Forest cleaning: a hard section, everyone digging and cutting bamboo; Chu 11/22) shows in purple on everyone's map. 🚶 Walk shows on your dot.
const RIDE = { SEND_MS: 10000, STALE_MS: 120000, SPREAD_M: 2000, SPREAD_OK_M: 1500, HOURS: 8, FB: "13.2.0" };
const RIDE_COLORS = ["#f5a524", "#22c55e", "#ec4899", "#06b6d4", "#ef4444", "#a855f7", "#eab308", "#14b8a6", "#f97316", "#84cc16"];

function setupRide(h) {  // h: { map, current(), startNav(), navOn(), kmAt(t, [lat, lng]), loadQr(), siteUrl }
  const $ = id => document.getElementById(id);
  let fb = null, me = null, g = null;  // g = the group we're in: { code, track, leader, ends }
  let riders = {}, marks = {}, mode = "all", last = null, lastSent = 0, sendT = null, online = false, sosMine = false;  // online: until the server says so
  let waitShown = false, sosSeen = {}, unsub = [], audio = null, waitMine = false, offAt = Date.now(), status = null;
  const ridersCache = { get: () => { try { return JSON.parse(localStorage.getItem("cnx-ride-riders") || "{}"); } catch (e) { return {}; } },
    set: v => { try { localStorage.setItem("cnx-ride-riders", JSON.stringify(v)); } catch (e) {} } };
  const store = { get: () => { try { return JSON.parse(localStorage.getItem("cnx-ride") || "null"); } catch (e) { return null; } },
    set: v => { try { v ? localStorage.setItem("cnx-ride", JSON.stringify(v)) : localStorage.removeItem("cnx-ride"); } catch (e) {} } };
  const myName = { get: () => { try { return localStorage.getItem("cnx-ride-name") || ""; } catch (e) { return ""; } },
    set: v => { try { localStorage.setItem("cnx-ride-name", v); } catch (e) {} } };
  const colorOf = uid => RIDE_COLORS[[...uid].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % RIDE_COLORS.length];
  const km = m => m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m / 10) * 10 + " m";
  const mins = ms => Math.max(1, Math.round(ms / 60000)) + " min";

  // ---- Firebase, loaded on first use ----
  async function connect() {
    if (fb) return fb;
    const base = `https://www.gstatic.com/firebasejs/${RIDE.FB}/`;
    const [A, U, D] = await Promise.all(["firebase-app.js", "firebase-auth.js", "firebase-database.js"].map(f => import(base + f)));
    const app = A.initializeApp(window.CNX_FIREBASE);
    const auth = U.getAuth(app);
    // the phone remembers who it is: with no signal we carry on as the same rider (signing in needs signal)
    try { await Promise.race([auth.authStateReady(), new Promise(r => setTimeout(r, 4000))]); } catch (e) {}
    const cred = auth.currentUser ? { user: auth.currentUser } : await U.signInAnonymously(auth);
    const db = D.getDatabase(app);
    D.onValue(D.ref(db, ".info/connected"), s => {
      online = !!s.val(); if (!online) offAt = Date.now();
      paint(); paintSos(); setTimeout(paint, 5200);
    });
    fb = { D, db, uid: cred.user.uid, r: p => D.ref(db, p) };
    me = fb.uid;
    return fb;
  }

  // ---- the sheet (bottom box) ----
  const sheet = document.createElement("div");
  sheet.className = "ridesheet"; sheet.hidden = true;
  sheet.innerHTML = `<div class="rs-dim"></div><div class="rs-box"></div>`;
  document.body.appendChild(sheet);
  const box = sheet.querySelector(".rs-box");
  sheet.querySelector(".rs-dim").onclick = () => close();
  const open = html => { box.innerHTML = `<button class="rs-x" type="button" aria-label="Close">✕</button>` + html; sheet.hidden = false;
    box.querySelector(".rs-x").onclick = close; };
  const close = () => { sheet.hidden = true; box.innerHTML = ""; };
  const nameField = () => `<label class="rs-l">Your name on the map</label>
    <input class="rs-name" maxlength="16" autocomplete="nickname" placeholder="e.g. Ben" value="${esc(myName.get())}">`;
  const tip = `<p class="rs-tip">No phone mount? Tap 👥 at the top → 👖 Pocket screen, then put the phone in your pocket. Bring a power bank: the screen stays on.</p>`;
  const say = (msg, bad) => { const p = box.querySelector(".rs-msg"); if (p) { p.textContent = msg; p.classList.toggle("bad", !!bad); } };
  const readName = () => {
    const v = (box.querySelector(".rs-name").value || "").trim().slice(0, 16);
    if (!v) { say("Type your name first.", true); box.querySelector(".rs-name").focus(); return null; }
    myName.set(v); return v;
  };
  const unlockSound = () => {  // a tap now lets the 🆘 beep play later
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) {}
  };

  function openChoose() {
    if (g) return openList();
    open(`<h2>👥 Ride together</h2>${nameField()}
      <button class="rs-b p" data-go="start" type="button">🚩 Start a ride</button>
      <button class="rs-b s" data-go="join" type="button">🔢 Join a ride</button>
      <p class="rs-msg"></p><p class="rs-small">Only people with the code see you. Off by itself after the ride.</p>`);
    box.querySelector("[data-go=start]").onclick = () => { const n = readName(); if (n) start(n); };
    box.querySelector("[data-go=join]").onclick = () => { const n = readName(); if (n) openJoin(n); };
  }

  function openJoin(name, code = "") {
    open(`<h2>🔢 Join a ride</h2>
      <input class="rs-code" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="····" value="${esc(code)}" aria-label="Ride code">
      <button class="rs-b p" data-go="join" type="button">✓ Join</button><p class="rs-msg"></p>${tip}`);
    const inp = box.querySelector(".rs-code");
    inp.oninput = () => { inp.value = inp.value.replace(/\D/g, "").slice(0, 4); };
    box.querySelector("[data-go=join]").onclick = () => join(inp.value, name);
    if (!code) setTimeout(() => inp.focus(), 50);
  }

  // Opened from the leader's link (…?ride=4827#04): one box, name + Join.
  function openJoinFromLink(code) {
    open(`<h2>👥 Join ride ${esc(code)}?</h2>${nameField()}
      <button class="rs-b p" data-go="join" type="button">✓ Join</button><p class="rs-msg"></p>${tip}`);
    box.querySelector("[data-go=join]").onclick = () => { const n = readName(); if (n) join(code, n); };
  }

  // ---- start / join / leave ----
  async function start(name) {
    const t = h.current(); if (!t) return;
    unlockSound(); say("Starting…");
    try {
      await connect();
      const ends = Date.now() + RIDE.HOURS * 3600e3 - 600e3;  // 10 min under the rules' 8 h cap (phone clocks drift)
      let code = null;
      for (let i = 0; i < 8 && !code; i++) {  // a free code: a live group's code is refused by the server rules
        const c = String(Math.floor(1000 + Math.random() * 9000));
        try { await fb.D.set(fb.r("groups/" + c), { meta: { leader: me, track: t.id, ends, created: fb.D.serverTimestamp() } }); code = c; } catch (e) {}
      }
      if (!code) throw new Error("no code");
      await enter({ code, track: t.id, leader: me, ends }, name, "lead");
      showCode();
      saveMap(t);
    } catch (e) { say("Couldn't start. Check your signal and try again.", true); }
  }

  async function join(code, name) {
    if (!/^\d{4}$/.test(code)) return say("The code has 4 numbers.", true);
    unlockSound(); say("Joining…");
    try {
      await connect();
      const s = await fb.D.get(fb.r(`groups/${code}/meta`)).catch(() => null);
      const m = s && s.val();
      if (!m || m.ends < Date.now()) return say("No ride with this code today. Check the numbers with your leader.", true);
      await enter({ code, track: m.track, leader: m.leader, ends: m.ends }, name, m.leader === me ? "lead" : "");
      close();
      if (h.current()?.id !== m.track) { location.hash = "#" + m.track; await new Promise(r => setTimeout(r, 400)); }
      if (!h.navOn()) h.startNav();
    } catch (e) { say("Couldn't join. Check your signal and try again.", true); }
  }

  async function enter(grp, name, role, again) {
    g = grp; store.set({ ...grp, name, role });
    const D = fb.D, base = `groups/${g.code}`;
    // back in after a reload: keep the last spot the group saw until the GPS is back (never "nowhere")
    const mine = { n: name, ...(again ? {} : { lat: 0, lng: 0 }), t: D.serverTimestamp(), ...(role ? { role } : {}), ...(h.map.cnxWalking ? { walk: true } : {}) };
    if (last) Object.assign(mine, { lat: last.lat, lng: last.lng });
    riders = ridersCache.get();  // where everyone was last seen, until the server answers (no signal after a refresh)
    D.update(fb.r(`${base}/riders/${me}`), mine).catch(() => {});  // sent when there's signal; never wait for it
    unsub.push(D.onValue(fb.r(`${base}/riders`), s => {
      const v = s.val() || {};
      riders = online ? v : { ...riders, ...v };  // offline the phone only knows its own spot: keep the others' last spot
      ridersCache.set(riders); paint();
    }, () => ended("Ride ended")));
    unsub.push(D.onValue(fb.r(`${base}/meta`), s => {
      if (!s.exists()) return ended("Ride ended");
      const before = status && status.s;
      status = (s.val() || {}).status || null; paintStatus();
      if (status && status.s && status.s !== before && g && g.leader !== me && h.say && { lunch: 1, wait: 1, forest: 1 }[status.s]) h.say("st_" + status.s);  // 🗣 leader's status
    }, () => ended("Ride ended")));
    sendT = setInterval(() => send(true), RIDE.SEND_MS);
    h.map.on("whereupdate", onWhere);
    document.body.classList.add("inride");
    chip.hidden = false; paint();
  }

  const onWhere = e => { if (e.latlng) { last = e.latlng; send(false); } };
  function send(tick) {
    if (!g || !fb || !last) return;
    const now = Date.now();
    if (!tick && now - lastSent < RIDE.SEND_MS) return;
    lastSent = now;
    fb.D.update(fb.r(`groups/${g.code}/riders/${me}`), { lat: +last.lat.toFixed(6), lng: +last.lng.toFixed(6), t: fb.D.serverTimestamp() }).catch(() => {});
  }

  function stopLocal() {
    unsub.forEach(u => { try { u(); } catch (e) {} }); unsub = [];
    clearInterval(sendT); h.map.off("whereupdate", onWhere);
    Object.values(marks).forEach(m => m.remove()); marks = {}; riders = {}; g = null; sosMine = false; waitShown = false;
    store.set(null); ridersCache.set({}); document.body.classList.remove("inride"); status = null;
    chip.hidden = true; banner.hidden = true; wait.hidden = true; stat.hidden = true;
  }
  function ended(msg) {
    if (!g) return;
    stopLocal(); close();
    toast(`🏁 ${msg}`, "Locations deleted. Nobody sees you now.");
  }
  async function leave() {
    if (!g) return;
    const code = g.code, lead = g.leader === me;
    try {
      if (lead) await fb.D.remove(fb.r("groups/" + code));  // wipes everyone's spot
      else await fb.D.remove(fb.r(`groups/${code}/riders/${me}`));
    } catch (e) {}
    stopLocal(); close();
    toast(lead ? "🏁 Ride ended" : "👋 You left the ride", "Locations deleted. Nobody sees you now.");
  }

  // ---- after Start: the code to share ----
  function showCode() {
    const url = `${h.siteUrl()}?ride=${g.code}#${g.track}`;
    open(`<h2>🚩 Your ride code</h2><div class="rs-big">${[...g.code].map(d => `<span>${d}</span>`).join("")}</div>
      <div class="rs-qr"></div>
      <button class="rs-b p" data-go="share" type="button">📤 Send to the group chat</button>
      <button class="rs-b s" data-go="ride" type="button">▶ Start riding</button>
      <p class="rs-small">Say it, show the QR, or send the link. Works today only.</p>`);
    h.loadQr().then(() => { const q = qrcode(0, "M"); q.addData(url); q.make(); box.querySelector(".rs-qr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }).catch(() => {});
    box.querySelector("[data-go=share]").onclick = async () => {
      const text = `👥 Ride together: code ${g.code}. Tap to join:`;
      try { if (navigator.share) return await navigator.share({ title: "Ride together", text, url }); } catch (e) { if (e.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(`${text} ${url}`); say("Link copied. Paste it in the group chat."); } catch (e) { say(url); }
    };
    box.querySelector("[data-go=ride]").onclick = () => { close(); if (!h.navOn()) h.startNav(); };
  }

  // ---- the group list ----
  const along = r => { const t = h.current(); return t && r.lat ? h.kmAt(t, [r.lat, r.lng]) * 1000 : null; };
  const isStale = r => !r.t || Date.now() - r.t > RIDE.STALE_MS;
  const lastRider = fresh => {  // the sweeper, else whoever is furthest back along the track (fresh: only phones still sending)
    const list = Object.entries(riders).filter(([, r]) => r.lat && !(fresh && isStale(r)));
    const sw = list.find(([, r]) => r.role === "sweep");
    if (sw) return sw[0];
    let best = null, bm = Infinity;
    for (const [id, r] of list) { const m = along(r); if (m != null && m < bm) { bm = m; best = id; } }
    return best;
  };
  function openList() {
    if (!g) return openChoose();
    const meM = along(riders[me] || {}) ?? null, lead = g.leader === me, tr = h.current();
    const rows = Object.entries(riders).filter(([id]) => id !== me).map(([id, r]) => ({ id, r, m: along(r) })).sort((a, b) => (b.m ?? -1) - (a.m ?? -1));
    const meRow = `<div class="rs-row me"><i style="background:#2f7cf6">📍</i><span class="n">Me ${lead ? "🚩" : ""}${(riders[me] || {}).role === "sweep" ? "🧹" : ""}${sosMine ? "🆘" : ""}</span>` +
      `<span class="d">${meM != null ? "km " + (meM / 1000).toFixed(1) : ""}<small>${meM != null && tr ? "of " + tr.km : ""}</small></span></div>`;
    const STAT = [["lunch", "🥪", "Break"], ["wait", "⏸", "Waiting"], ["forest", "🪚", "Forest cleaning"]];
    const row = ({ id, r, m }) => {
      const you = id === me, st = !you && isStale(r), d = m != null && meM != null ? m - meM : null;
      const badge = (r.role === "lead" ? "🚩" : "") + (r.role === "sweep" ? "🧹" : "") + (r.sos ? "🆘" : "");
      const right = you ? "you" : d == null ? "" : `${km(Math.abs(d))}<small>${st ? "not updating · " + mins(Date.now() - r.t) : d >= 0 ? "ahead" : "behind"}</small>`;
      return `<button type="button" class="rs-row${st ? " stale" : ""}" data-id="${esc(id)}"><i style="background:${st ? "#555" : you ? "#2f7cf6" : colorOf(id)}">${esc((r.n || "?")[0].toUpperCase())}</i>
        <span class="n">${esc(you ? "You" : r.n)} ${badge}</span><span class="d">${right}</span></button>`;
    };
    const mineR = riders[me] || {};
    open(`<h2>👥 Ride ${g.code} · ${rows.length + 1} rider${rows.length ? "s" : ""}</h2><div class="rs-list">${meRow}${rows.map(row).join("")}</div>
      ${lead ? `<p class="rs-l" style="margin:10px 0 -4px">Tell the group</p><div class="rs-seg stat">${STAT.map(([k, i, t]) =>
        `<button type="button" data-stat="${k}" class="${status && status.s === k ? "on" : ""}"><b>${i}</b>${t}</button>`).join("")}</div>` : ""}
      <p class="rs-l" style="margin:10px 0 -4px">Show on my map</p><div class="rs-seg">${[["all", "👥", "Everyone"], ["last", "🧹", "Sweeper"], ["hide", "🙈", "Nobody"]].map(([k, i, t]) =>
        `<button type="button" data-mode="${k}" class="${mode === k ? "on" : ""}"><b>${i}</b>${t}</button>`).join("")}</div>
      <div class="rs-two"><button type="button" class="rs-b w sm" data-go="wait">${waitMine ? "✓ Found you" : "😕 I lost you guys"}</button>
        <button type="button" class="rs-b r sm rs-sos" data-go="sos">${sosMine ? "✓ I'm OK now" : "🆘 Hold 2 s for help"}</button></div>
      ${mineR.role === "lead" ? "" : `<button type="button" class="rs-b s sm" data-go="sweep">${mineR.role === "sweep" ? "🧹 I'm not the sweeper any more" : "🧹 I'm the sweeper"}</button>`}
      ${h.map.cnxLock ? `<button type="button" class="rs-b s" data-go="pocket">👖 Pocket screen <small>black, locked, saves battery</small></button>` : ""}
      <p class="rs-msg"></p>
      <button type="button" class="rs-b d" data-go="leave">${lead ? "End ride for everyone" : "Leave ride"}</button>
      <p class="rs-small">Code ${g.code} · <a href="#" data-go="code">show code / QR</a></p>`);
    box.querySelectorAll(".rs-row").forEach(b => b.onclick = () => {
      const r = riders[b.dataset.id]; if (r && r.lat) { close(); h.map.panTo([r.lat, r.lng]); }
    });
    box.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { mode = b.dataset.mode; paint(); openList(); });
    box.querySelectorAll("[data-stat]").forEach(b => b.onclick = () => {  // tap = everyone sees it; tap again = off
      const k = b.dataset.stat, off = status && status.s === k;
      status = off ? null : { s: k, t: Date.now() }; paintStatus();
      fb.D.set(fb.r(`groups/${g.code}/meta/status`), off ? null : { s: k, t: fb.D.serverTimestamp() }).catch(() => {});
      openList();
    });
    const sw = box.querySelector("[data-go=sweep]");
    if (sw) sw.onclick = () => { fb.D.update(fb.r(`groups/${g.code}/riders/${me}`), { role: mineR.role === "sweep" ? null : "sweep" }).then(openList).catch(() => {}); };
    holdButton(box.querySelector("[data-go=sos]"), () => setSos(!sosMine), sosMine);
    box.querySelector("[data-go=wait]").onclick = () => {  // one tap: everyone gets "😕 Name: I lost you guys"; ✓ Found you (or 10 min) clears it
      waitMine = !waitMine; close();
      fb.D.update(fb.r(`groups/${g.code}/riders/${me}`), { wait: waitMine ? fb.D.serverTimestamp() : null }).catch(() => {});
      if (waitMine) toast("😕 Sent to the group", "They see where you are. Tap 👥 → ✓ Found you when you're back.");
    };
    let sure = false;
    box.querySelector("[data-go=leave]").onclick = e => {  // two taps: the first asks
      if (!sure) { sure = true; e.target.textContent = lead ? "Tap again: end for everyone" : "Tap again to leave"; return; }
      leave();
    };
    const pk = box.querySelector("[data-go=pocket]");  // black + rain lock; hold 🔒 2 s to come back
    if (pk) pk.onclick = () => { close(); document.body.classList.add("pocket"); h.map.cnxLock.lock(); };
    box.querySelector("[data-go=code]").onclick = e => { e.preventDefault(); showCode(); };
  }
  // 🆘 needs a 2 s hold (pocket and rain safe); "I'm OK" is one tap.
  function holdButton(b, fn, quick) {
    if (quick) { b.onclick = fn; return; }
    let t = null;
    const down = e => { e.preventDefault(); b.classList.add("holding"); t = setTimeout(() => { t = null; b.classList.remove("holding"); fn(); }, 2000); };
    const up = () => { if (t) { clearTimeout(t); t = null; b.classList.remove("holding"); say("Hold it for 2 seconds."); } };
    b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up);
    b.addEventListener("contextmenu", e => e.preventDefault());
  }
  function setSos(on) {
    sosMine = on;
    fb.D.update(fb.r(`groups/${g.code}/riders/${me}`), { sos: on ? fb.D.serverTimestamp() : null, ...(last ? { lat: last.lat, lng: last.lng } : {}) }).catch(() => {});
    close(); paintSos();
    if (on) toast(online ? "🆘 Sent to the group" : "⏳ Waiting for signal…", online ? "Everyone sees where you are. Tap 👥 → ✓ I'm OK now to clear it." : "It's sent when signal comes back. Keep this page open.");
  }

  // ---- on the map ----
  const chip = document.createElement("button");
  chip.type = "button"; chip.className = "ridechip"; chip.hidden = true;
  chip.onclick = () => openList();
  h.map.getContainer().appendChild(chip);
  const wait = document.createElement("div"); wait.className = "ridewait"; wait.hidden = true;
  h.map.getContainer().appendChild(wait);
  const banner = document.createElement("div"); banner.className = "ridesos"; banner.hidden = true;
  h.map.getContainer().appendChild(banner);
  const stat = document.createElement("div"); stat.className = "ridestat"; stat.hidden = true;
  h.map.getContainer().appendChild(stat);
  [chip, wait, banner, stat].forEach(el => { L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); });
  function paintStatus() {
    if (!g || !status || !status.s) { stat.hidden = true; document.body.classList.remove("hasridestat"); return; }
    const S = { lunch: "🥪 Break", wait: "⏸ Waiting", forest: "🪚 Forest cleaning" }[status.s]; if (!S) { stat.hidden = true; return; }
    const who = (riders[g.leader] || {}).n || "Leader", ago = status.t ? Math.round((Date.now() - status.t) / 60000) : 0;
    stat.innerHTML = `🚩 ${esc(who)}: ${S}<small>${ago < 1 ? "now" : ago + " min ago"}</small>`;
    stat.hidden = false; document.body.classList.add("hasridestat");
  }
  // 💾 the track's map saved by itself when you start or join (no question; Chu 11/21)
  function saveMap(t) {
    if (!t || !h.map.cnxOffline) return;
    h.map.cnxOffline.ensure({ id: t.id, name: t.name, file: t.file }).then(r => {
      if (r === "done" || r === "saved") cnxToast("✓ Offline map saved", 3000);
      else if (r === "failed" || r === "nosignal") cnxToast("⚠ Offline map not saved", 4000);
    }).catch(() => {});
  }
  h.map.on("walkchange", e => { if (g && fb) fb.D.update(fb.r(`groups/${g.code}/riders/${me}`), { walk: e.on ? true : null }).catch(() => {}); });

  function paint() {
    if (!g) return;
    const n = Object.keys(riders).length, off = !online && Date.now() - offAt > 5000;
    chip.innerHTML = `👥 ${off ? "📵" : mode === "last" ? "🧹" : mode === "hide" ? "🙈" : n}`;
    chip.classList.toggle("off", off);
    chip.setAttribute("aria-label", `Ride ${g.code}: ${n} riders. Tap for the list`);
    const show = mode === "hide" ? [] : mode === "last" ? [lastRider()].filter(id => id && id !== me) : Object.keys(riders).filter(id => id !== me);
    for (const id of Object.keys(marks)) if (!show.includes(id) && !(riders[id] && riders[id].sos)) { marks[id].remove(); delete marks[id]; }
    const all = new Set([...show, ...Object.keys(riders).filter(id => id !== me && riders[id].sos)]);  // 🆘 shows in every mode
    for (const id of all) {
      const r = riders[id]; if (!r || !r.lat) continue;
      const st = isStale(r), tag = (r.walk ? "🚶 " : "") + (st ? `${r.n} · ${mins(Date.now() - r.t)}` : r.n);
      const html = `<div class="rd${st ? " stale" : ""}${r.sos ? " sos" : ""}"><i style="background:${colorOf(id)}">${esc((r.n || "?")[0].toUpperCase())}` +
        `${r.role === "lead" ? "<em>🚩</em>" : r.role === "sweep" ? "<em>🧹</em>" : ""}</i><b>${esc(tag)}</b></div>`;
      if (!marks[id]) marks[id] = L.marker([r.lat, r.lng], { interactive: false, zIndexOffset: 800, icon: L.divIcon({ className: "", iconSize: [90, 44], iconAnchor: [45, 12], html }) }).addTo(h.map);
      else { marks[id].setLatLng([r.lat, r.lng]); if (marks[id]._html !== html) marks[id].setIcon(L.divIcon({ className: "", iconSize: [90, 44], iconAnchor: [45, 12], html })); }
      marks[id]._html = html;
    }
    paintWait(); paintSos(); paintStatus();
  }
  function paintWait() {  // leader only: last rider too far back
    if (!g || g.leader !== me) { wait.hidden = true; return; }
    // Only phones still sending count (Chu 11/28: an Android stopped sending at km 15.9 and "Wait · last rider 34 km back"
    // stayed up all afternoon). A phone that went quiet gets a grey note instead: no orange Wait, no voice.
    const lr = lastRider(true), a = along(riders[me] || {}), b = lr && lr !== me ? along(riders[lr]) : null;
    const gap = a != null && b != null ? a - b : 0;
    const was = waitShown;
    if (gap > RIDE.SPREAD_M) waitShown = true; else if (gap < RIDE.SPREAD_OK_M) waitShown = false;
    if (waitShown && !was && h.say) h.say("behind");  // 🗣 leader hears "A rider is falling behind." (same moment as the ⏸ Wait sign)
    const quiet = Object.entries(riders).filter(([id, r]) => id !== me && r.lat && isStale(r) && a != null && along(r) != null && a - along(r) > RIDE.SPREAD_M)
      .sort((x, y) => along(x[1]) - along(y[1]))[0];
    wait.hidden = !waitShown && !quiet;
    wait.classList.toggle("quiet", !waitShown && !!quiet);
    if (waitShown) wait.textContent = `⏸ Wait · last rider ${km(gap)} back`;
    else if (quiet) { const t = new Date(quiet[1].t); wait.textContent = `📵 ${quiet[1].n || "A rider"}: no signal since ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; }
  }
  function paintSos() {
    if (!g) return;
    const help = Object.entries(riders).filter(([id, r]) => r.sos && id !== me && !sosSeen[id + r.sos]);
    if (sosMine && !online) { banner.hidden = false; banner.className = "ridesos mine"; banner.innerHTML = `<span>⏳ Waiting for signal…<small>Your 🆘 is sent when signal comes back. Keep this page open.</small></span>`; return; }
    if (!help.length) return paintLost();
    const [id, r] = help[0], a = along(riders[me] || {}), b = along(r), d = a != null && b != null ? b - a : null;
    banner.className = "ridesos"; banner.hidden = false;
    banner.innerHTML = `<span>🆘 ${esc(r.n)} needs help<small>${d == null ? "" : km(Math.abs(d)) + (d >= 0 ? " ahead of you" : " behind you")}</small></span>
      <a class="go" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}">Go ➤</a><button type="button" class="x" aria-label="Close">✕</button>`;
    banner.querySelector(".x").onclick = () => { sosSeen[id + r.sos] = 1; paintSos(); };
    if (!banner._for || banner._for !== id + r.sos) {  // new 🆘: buzz (Android) + beep
      banner._for = id + r.sos;
      try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {}
      if (h.say) h.say("sos");  // 🗣 "Emergency. A rider needs help." — no names: they can't be pre-recorded (Chu 11/27)
      try { if (audio) for (let k = 0; k < 3; k++) { const o = audio.createOscillator(), v = audio.createGain(); o.frequency.value = 880; v.gain.value = 0.3; o.connect(v); v.connect(audio.destination); o.start(audio.currentTime + k * 0.5); o.stop(audio.currentTime + k * 0.5 + 0.3); } } catch (e) {}
    }
  }
  function paintLost() {
    const now = Date.now();
    if (waitMine && riders[me] && riders[me].wait && now - riders[me].wait > 600e3) { waitMine = false; fb.D.update(fb.r(`groups/${g.code}/riders/${me}`), { wait: null }).catch(() => {}); }
    const asks = Object.entries(riders).filter(([id, r]) => r.wait && id !== me && now - r.wait < 600e3 && !sosSeen["w" + id + r.wait]);
    if (!asks.length) { banner.hidden = true; banner._for = null; return; }
    const [id, r] = asks[0], a = along(riders[me] || {}), b = along(r), d = a != null && b != null ? b - a : null;
    banner.className = "ridesos waitfor"; banner.hidden = false;
    banner.innerHTML = `<span>😕 ${esc(r.n)}: I lost you guys<small>${d == null ? "" : km(Math.abs(d)) + (d >= 0 ? " ahead of you" : " behind you")}</small></span>` +
      `<a class="go" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}">Go ➤</a><button type="button" class="x" aria-label="Close">✕</button>`;
    banner.querySelector(".x").onclick = () => { sosSeen["w" + id + r.wait] = 1; paintSos(); };
    if (banner._for !== "w" + id + r.wait) { banner._for = "w" + id + r.wait; try { navigator.vibrate && navigator.vibrate(300); } catch (e) {} if (h.say) h.say("lost"); }  // 🗣 "A rider has lost the group."
  }
  setInterval(() => { if (g) { paint(); if (Date.now() > g.ends) ended("Ride switched off after 8 hours"); } }, 30000);  // greys stale dots

  function toast(big, small) {
    const t = document.createElement("div"); t.className = "ridetoast"; t.innerHTML = `${big}<small>${small}</small>`;
    document.body.appendChild(t); setTimeout(() => t.remove(), 5000);
  }

  // ---- back in after a reload (iPhone can reload a page that was in the background) / from the leader's link ----
  async function resume() {
    const link = location.search.match(/[?&]ride=(\d{4})\b/);
    if (link) {
      history.replaceState(null, "", location.pathname + location.search.replace(/([?&])ride=\d{4}&?/, "$1").replace(/[?&]$/, "") + location.hash);
      const s = store.get();
      if (s && s.code === link[1] && s.ends > Date.now()) return rejoin(s);
      return openJoinFromLink(link[1]);
    }
    const s = store.get();
    if (s && s.ends > Date.now()) return rejoin(s);
    store.set(null);
  }
  async function rejoin(s) {
    try { await connect(); } catch (e) { setTimeout(() => rejoin(s), 15000); return; }  // first time ever with no signal: try again
    // with signal: check the ride still exists; with no signal: carry on with what the phone remembers
    const m = await Promise.race([fb.D.get(fb.r(`groups/${s.code}/meta`)).then(x => ({ v: x.val() }), () => null), new Promise(r => setTimeout(r, 4000, null))]);
    if (m && !m.v) return store.set(null);  // the server says the ride is over
    const v = (m && m.v) || s;
    await enter({ code: s.code, track: v.track, leader: v.leader, ends: v.ends }, s.name, s.role, true);
  }
  resume();

  return { open: openChoose, inRide: () => !!g, _dbg: () => ({ riders, marks: Object.keys(marks), g, me, online, mode }) };
}
