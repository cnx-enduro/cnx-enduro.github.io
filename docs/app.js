(async function () {
  const $ = id => document.getElementById(id);
  let data;
  try {
    data = await loadData();
  } catch (e) {
    $("list").innerHTML = `<li class="muted">Couldn't load the tracks. Please reload the page.</li>`;
    return;
  }
  const { site, tracks } = data;

  $("title").textContent = site.title;
  $("restricted").textContent = site.restricted;
  if (site.noRide) $("noRide").querySelector("span").textContent = site.noRide; else $("noRide").hidden = true;
  // Main notice as a headline plus one row per point (icon, bold first line, small grey rest), so it can be
  // scanned at a glance (site.json "notice"). Without it the older plain paragraphs show.
  if (site.notice) {
    const n = site.notice, icon = r => r.icon === "park" ? `<i class="sw"></i>` : esc(r.icon || "");
    $("noticeRows").innerHTML = `<p class="nhead">${esc(n.title)}</p>` + (n.sub ? `<p class="nsub">${esc(n.sub)}</p>` : "") +
      n.rows.map(r => `<div class="nrow${r.red ? " red" : ""}"><span class="nic" aria-hidden="true">${icon(r)}</span><span><b>${esc(r.bold)}</b>${r.text ? `<span>${esc(r.text)}</span>` : ""}</span></div>`).join("");
    $("noticeRows").hidden = false;
    document.querySelector(".notice").classList.add("rowsmode");
  }
  for (const k of ["shareNotice", "riskNotice"]) if (site[k]) { $(k).textContent = site[k]; $(k).hidden = false; }
  $("contribute").textContent = site.contribute;
  // One scannable row: icon, bold short line, small grey rest (same look as the notice box).
  // r.app + r.c: the app's name in its own colour (WhatsApp green, Google Maps blue, Messenger purple) with a matching dot.
  const iconRow = r => r.head ? `<div class="nhead">${esc(r.head)}</div>` : `<div class="nrow"><span class="nic" aria-hidden="true">${r.c ? `<i class="adot" style="background:${esc(r.c)}"></i>` : esc(r.icon)}</span>` +
    `<span><b>${r.app ? `<span class="app" style="color:${esc(r.c)}">${esc(r.app)}</span> · ` : ""}${esc(r.bold)}</b>${r.text ? `<span>${esc(r.text)}</span>` : ""}</span></div>`;
  // Guide tiles: a tile opens its text under the tiles and closes the others; tap again to close.
  document.querySelectorAll("#guides button").forEach(b => b.addEventListener("click", () => {
    const d = $(b.dataset.open), open = !d.open;
    document.querySelectorAll("#guides button").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-expanded", "false"); $(x.dataset.open).open = false; });
    d.open = open; b.classList.toggle("on", open); b.setAttribute("aria-expanded", String(open));
  }));
  // Navigate tip (site.json navTip): how the site's own ▶ Navigate works.
  if (site.navTip && $("navTip")) {
    const g = $("navTip");
    g.querySelector("summary").textContent = site.navTip.title;
    g.querySelector("div").innerHTML = `<div class="brows">${site.navTip.rows.map(iconRow).join("")}</div>`;
    g.hidden = false;
  }
  // Tip for groups: share live location in an app the riders already have (site.json groupTip).
  if (site.groupTip && $("groupTip")) {
    const g = $("groupTip");
    g.querySelector("summary").textContent = site.groupTip.title;
    const more = site.groupTip.more;  // other apps tucked behind a small "Other apps" button (Chu 11/25: Ride together is the one option shown)
    g.querySelector("div").innerHTML = site.groupTip.rows ? `<div class="brows">${site.groupTip.rows.map(iconRow).join("")}</div>` +
      (more ? `<button type="button" class="morebtn" aria-expanded="false">${esc(more.label)} ›</button><div class="brows moreapps" hidden>${more.rows.map(iconRow).join("")}</div>` : "") :
      `<ul>${site.groupTip.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` + (site.groupTip.note ? `<p class="muted">${esc(site.groupTip.note)}</p>` : "");
    const mb = g.querySelector(".morebtn");
    if (mb) mb.onclick = () => { const box = g.querySelector(".moreapps"), show = box.hidden; box.hidden = !show; mb.setAttribute("aria-expanded", String(show)); mb.textContent = `${more.label} ${show ? "⌄" : "›"}`; };
    g.hidden = false;
  }
  // "How to share GPX responsibly": a rider's own post, word for word, with its photo (site.json shareGuide).
  if (site.shareGuide && $("shareGuide")) {
    const sg = site.shareGuide, g = $("shareGuide"), ps = a => (a || []).map(x => `<p>${esc(x)}</p>`).join("");
    g.querySelector("summary").textContent = sg.title;
    const full = (sg.byline ? `<p class="muted small">${esc(sg.byline)}</p>` : "") + ps(sg.intro) +
      (sg.rules ? `<ol>${sg.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ol>` : "") + ps(sg.outro) +
      (sg.photo ? `<img src="${esc(sg.photo)}" alt="${esc(sg.photoAlt || "")}" loading="lazy">` : "");
    // Short version first (icon rows); the rider's own post, word for word, folds out under it.
    g.querySelector("div").innerHTML = sg.summary ? `<p class="bhead">${esc(sg.summary.head)}</p><div class="brows">${sg.summary.rows.map(iconRow).join("")}</div>` +
      `<details class="fullpost"><summary>${esc(sg.summary.more)}</summary>${full}</details>` : full;
    g.hidden = false;
  }
  // Footer on every page: who looks after the site and where comments go. The address is put together here,
  // not written in the page, so it's a little harder for spam robots to pick up.
  if (site.footer) {
    const [user, domain] = (site.contact || "").split("@");
    const mail = domain ? `<a href="mailto:${esc(user)}&#64;${esc(domain)}">${esc(user)}&#64;${esc(domain)}</a>` : "";
    $("siteFoot").innerHTML = esc(site.footer).replace("{email}", mail) + (site.footNote ? `<br>${esc(site.footNote)}` : "");
    $("siteFoot").hidden = false;
  }

  // Visitor count (GoatCounter, free account "cnx-enduro", owner Chu; stats at https://cnx-enduro.goatcounter.com).
  // Counting happens only on the real site, never on test copies or test robots. The list and every track page
  // are counted separately, so the stats show which tracks riders open. No cookies, nothing personal.
  const liveSite = location.hostname === "cnx-enduro.github.io" && !navigator.webdriver;
  if (liveSite) {
    const page = () => location.pathname + location.hash;
    window.goatcounter = { no_onload: true };
    const s = document.createElement("script");
    s.async = true; s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = "https://cnx-enduro.goatcounter.com/count";
    s.onload = () => {
      try { window.goatcounter.count({ path: page() }); } catch (e) {}
      window.addEventListener("hashchange", () => { try { window.goatcounter.count({ path: page() }); } catch (e) {} });
    };
    document.head.appendChild(s);
  }
  // The total at the very end of the footer, kept quiet: tiny grey text that appears only once the total reaches 100
  // (Chu 11/24: no tiny numbers). GoatCounter refreshes the total every few hours. If it's slow or down, nothing shows.
  if (site.footer) (async () => {
    const stop = new AbortController(); setTimeout(() => stop.abort(), 20000);
    try {
      const r = await fetch("https://cnx-enduro.goatcounter.com/counter/TOTAL.json", { signal: stop.signal });
      const v = Number(String((await r.json()).count).replace(/\D/g, ""));
      if (v >= 100) {
        const el = document.createElement("span");
        el.className = "visits"; el.textContent = `${v.toLocaleString("en-US")} visit${v === 1 ? "" : "s"}`;
        $("siteFoot").append(document.createElement("br"), el);
      }
    } catch (e) {}
  })();

  // "QR code" in the header: a code for the page that's open (the list or one track), so a rider looking at
  // the site on a computer, or on a friend's phone, can scan it and open the same page on their own phone.
  // The QR maker is only downloaded the first time someone taps the button.
  let qrLib = null;
  const loadQr = () => qrLib || (qrLib = new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = "vendor/qrcode.js"; s.onload = ok; s.onerror = () => { qrLib = null; s.remove(); fail(); };
    document.head.appendChild(s);
  }));
  // Top bar (Chu 11/25: everything on top, no Menu): pages open directly; tips open under the notice area in the panel.
  // Tap the same link again to close it.
  const gm = $("guideMenu");
  document.querySelectorAll("#topLinks [data-tip]").forEach(l => l.addEventListener("click", e => {
    e.preventDefault();
    const tip = l.dataset.tip, onTrack = location.hash && location.hash !== "#";
    const wasOpen = !onTrack && gm.open && (tip === "safety" ? gm.classList.contains("safety") : $(tip) && $(tip).open);
    document.querySelectorAll("#topLinks a").forEach(x => x.classList.remove("on"));
    document.querySelectorAll("#guides button").forEach(b => { b.classList.remove("on"); $(b.dataset.open).open = false; });
    if (wasOpen) { gm.open = false; gm.classList.remove("safety"); return; }
    if (onTrack) location.hash = "";
    setTimeout(() => {
      gm.open = true; gm.classList.toggle("safety", tip === "safety"); l.classList.add("on");
      if (rf) rf.setAttribute("aria-expanded", "false");
      if (tip !== "safety") $(tip).open = true;
      // phones: the map sticks to the top, so stop just under it, not behind it
      const mw = document.querySelector(".mapwrap"), stick = mw && getComputedStyle(mw).position === "sticky" ? mw.getBoundingClientRect().height : 0;
      window.scrollTo({ top: gm.getBoundingClientRect().top + window.scrollY - stick - 8, behavior: "instant" });
    }, onTrack ? 450 : 0);
  }));
  // "Read before you ride" (Chu 11/25, where the red no-ride line was): opens the safety notice + the gear/supplies text.
  const rf = $("readFirst");
  if (rf) rf.onclick = () => {
    const open = !(gm.open && gm.classList.contains("safety"));
    document.querySelectorAll("#topLinks a").forEach(x => x.classList.remove("on"));
    document.querySelectorAll("#guides button").forEach(b => { b.classList.remove("on"); $(b.dataset.open).open = false; });
    gm.open = open; gm.classList.toggle("safety", open); if ($("rules")) $("rules").open = open;
    rf.setAttribute("aria-expanded", String(open));
  };
  gm.addEventListener("toggle", () => { if (!gm.open || !gm.classList.contains("safety")) rf && rf.setAttribute("aria-expanded", "false"); });
  // "Share" on each track page (Chu 11/25: the top-bar button is gone): a code for the page that's open.
  const showQr = async (home) => {
    // Always the public address (a test copy on a computer would otherwise give a link phones can't open).
    const url = (site.siteUrl || location.origin + location.pathname) + (home === true ? "" : location.hash);
    try {
      await loadQr();
      const q = qrcode(0, "M"); q.addData(url); q.make();
      $("qrImg").innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      $("qrImg").hidden = false;
      $("qrUrl").textContent = url.replace(/^https?:\/\//, "");
      // On a track page the code opens that track: say which one above the code.
      const tr = home === true ? "CNX Enduro tracks: all tracks" : current ? `${current.id} ${current.name}` : "";
      $("qrTrackName").textContent = tr; $("qrTrackName").hidden = !tr;
    } catch (e) {
      $("qrImg").hidden = true;
      $("qrUrl").textContent = "Couldn't load the QR code. Check your internet and try again.";
    }
    shareUrl = url;
    $("qrTitle").textContent = home === true ? "Share this website" : current ? "Share this track" : "Share this page";
    $("qrCopy").textContent = "Copy link";
    $("qrSend").hidden = !navigator.share;
    $("qrBox").showModal();
  };
  // Share box (Chu 11/25): one Share button = QR code (in person) + Copy link + the phone's own share menu (LINE, WhatsApp…).
  let shareUrl = "";
  $("qrCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(shareUrl); $("qrCopy").textContent = "Copied ✓"; }
    catch (e) { $("qrCopy").textContent = "Couldn't copy"; }
  };
  $("qrSend").onclick = async () => {
    const name = $("qrTrackName").hidden ? "" : $("qrTrackName").textContent;
    try { await navigator.share({ title: name || document.title, text: name ? `Track ${name}` : "", url: shareUrl }); } catch (e) {}
  };
  document.addEventListener("click", e => { if (!e.target.closest) return; if (e.target.closest("#qrBtn")) showQr(); else if (e.target.closest("#siteShare")) { e.preventDefault(); showQr(true); } });
  $("qrClose").onclick = () => $("qrBox").close();
  $("qrBox").addEventListener("click", e => {  // a tap outside the box closes it (a tap on its own edge doesn't)
    const b = $("qrBox").getBoundingClientRect();
    if (e.target === $("qrBox") && (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)) $("qrBox").close();
  });

  // Sections come from site.json; each track's Category line in NOTES.txt picks one. The first section is
  // the main page (#); every other section is its own page (#adventure) with its own map, list and rules.
  const sections = site.sections;
  const main = sections[0];
  const sectionOf = id => sections.find(s => s.id === id) || main;
  const sectionHash = id => (id === main.id ? "" : id);
  let section = null;

  // Top-right section menu: buttons on a computer, a dropdown on a phone. Only shown once a second section has tracks.
  const navSecs = sections.filter(s => s === main || tracks.some(t => t.category === s.id));
  if (navSecs.length > 1) {
    $("secNav").hidden = false;
    $("secTabs").innerHTML = navSecs.map(s => `<a href="#${sectionHash(s.id)}" data-sec="${s.id}">${esc(s.title)}</a>`).join("");
    $("secPick").innerHTML = navSecs.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join("");
    $("secPick").addEventListener("change", e => go(sectionHash(e.target.value)));
  }

  const rulesHtml = blocks => blocks.map(b => {
    if (b.type === "ul") return `<ul>${b.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    if (b.type === "scale") return `<div class="scale">${b.items.map(([n, t]) => `${dots(n)}<span>${esc(t)}</span>`).join("")}</div>`;
    return `<p>${esc(b.text)}</p>`;
  }).join("");

  // "Before you ride", scannable (site.json beforeRide): icon rows like the notice box, then the L0–L4 levels
  // as coloured badges (same colours as the /difficulty page), then the wet rule.
  const beforeRideHtml = b => {
    const row = iconRow;
    return `<div class="brows">${b.gear.map(row).join("")}</div>`;
  };
  // Difficulty levels box, right above the track list (main section only): L0–L4 badges → /difficulty, then the wet rule.
  // One "Difficulty levels" button that opens the list (Chu 11/25); the closed button still shows the 5 level colours.
  const levelsHtml = b => `<details class="lvfold"><summary><span class="lvf-t">${esc(b.levelsTitle)}</span><span class="lvf-dots">${b.levels.map(l => `<i style="background:${esc(l.c)};color:${esc(l.t)}">${esc(l.l)}</i>`).join("")}</span></summary><a class="lvlist" href="difficulty/">` +
    b.levels.map(l => `<span class="lv"><span class="lvb" style="background:${esc(l.c)};color:${esc(l.t)}">${esc(l.l)}</span><b>${esc(l.name)}</b><span>${esc(l.text)}</span></span>`).join("") +
    `<span class="lvmore">${esc(b.levelsLink)}</span></a><div class="brows lvwet">${iconRow(b.wet)}</div></details>`;

  // ---------- map ----------
  // Blue-dot label on a track page: how far along this track the rider is (or how far off it).
  // Compass "route up": the open track's direction at the rider's spot (within 200 m of it), in degrees from north,
  // aimed at the track about 80 m ahead so the map doesn't jump at every zigzag.
  // Riding the track backwards (km going down since the last fix) aims back along the track instead.
  const routeBearing = (ll, before) => {
    if (!current) return null;
    const line = current.line, n = nearestOnLine(line, [ll.lat, ll.lng]);
    if (n.dist > 200 || line.length < 2) return null;
    let back = false;
    if (before) {
      const k = kmAlong(current), m = nearestOnLine(line, [before.lat, before.lng]);
      back = m.dist <= 200 && k(n) < k(m);
    }
    const from = L.latLng(n.lat, n.lon);
    let to = null, d = 0, prevPt = from;
    for (let i = back ? n.i : n.i + 1; back ? i >= 0 : i < line.length; i += back ? -1 : 1) {
      const p = L.latLng(line[i][0], line[i][1]);
      d += prevPt.distanceTo(p); prevPt = p; to = p;
      if (d >= 80) break;
    }
    if (!to || from.distanceTo(to) < 5) return null;
    const y = Math.sin((to.lng - from.lng) * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180);
    const x = Math.cos(from.lat * Math.PI / 180) * Math.sin(to.lat * Math.PI / 180) - Math.sin(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * Math.cos((to.lng - from.lng) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  const map = baseMap("map", { satelliteKey: site.satelliteKey, routeBearing, record: true,
    offlineTrack: () => current && { id: current.id, name: current.name, file: current.file }, whereText: ll => {
    if (!current) return "";
    const n = nearestOnLine(current.line, [ll.lat, ll.lng]);
    const km = kmAlong(current)(n).toFixed(1);
    return n.dist <= 200 ? `${km} km` : `${n.dist >= 1000 ? (n.dist / 1000).toFixed(1) + " km" : Math.round(n.dist) + " m"} off track`;
  } });
  // Offline: a small background helper (sw.js) keeps a copy of the page so it opens with no signal.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (/[?&]cnxtest\b/.test(location.search)) window.__cnx = { map };  // only for the automatic device tests
  addNoRideZones(map, { key: true });
  const layers = {};
  const all = L.featureGroup().addTo(map);
  // Track colour = its difficulty level (site.json colorBy "level"; brighter "map" shade of the level colour so the
  // line shows over green forest), else one colour per track. The start dot carries the track number so tracks
  // of the same colour can still be told apart.
  const levelOf = t => { const l = (site.trackLevels || {})[t.id]; return l && ((site.beforeRide || {}).levels || []).find(x => x.l === l); };
  tracks.forEach((t, i) => {
    const lv = site.colorBy === "level" && levelOf(t);
    t.color = (lv && (lv.map || lv.c)) || colorFor(i);
    // Paper test (?beta): L1 in black ink, L2 in blue, with a light paper edge instead of the dark one
    const paper = document.documentElement.classList.contains("paper");
    if (paper && lv) t.color = { L1: "#16140f", L2: "#1446c8" }[lv.l] || t.color;
    const casing = L.polyline(t.line, paper ? { color: "#fbf8f1", weight: 8, opacity: 0.9, interactive: false } : { color: "#000", weight: 7, opacity: 0.55, interactive: false });
    const line = L.polyline(t.line, { color: t.color, weight: 4, opacity: 0.95 });
    const start = L.marker(t.start, { icon: L.divIcon({ className: "tstart", iconSize: [24, 24], iconAnchor: [12, 12],
      html: `<span style="background:${t.color}">${Number(t.id)}</span>` }) });
    line.bindTooltip(`${t.id} · ${esc(t.name)}`, { sticky: true });
    start.bindTooltip(`Start · ${esc(t.name)}`);
    const g = L.featureGroup([casing, line, start]).addTo(all);
    g.on("click", () => go(t.id));
    g.on("mouseover", () => highlight(t.id, true));
    g.on("mouseout", () => highlight(t.id, false));
    layers[t.id] = { g, line, casing, start };
  });
  const boundsOf = sec => L.latLngBounds(tracks.filter(t => t.category === sec).flatMap(t => t.line));
  // A map fitted while its box still has no size zooms all the way in; wait for layout first.
  let fitTimer = null;
  const fitTo = (bounds, pad) => {
    clearTimeout(fitTimer);
    map.invalidateSize();
    const size = map.getSize();
    if (size.x < 100 || size.y < 100) { fitTimer = setTimeout(() => fitTo(bounds, pad), 100); return; }
    // no animation: a fit requested while the previous zoom is still animating gets dropped
    map.stop();
    map.fitBounds(bounds, { padding: [pad, pad], animate: false });
  };
  const fitAll = () => fitTo(boundsOf(section), 24);

  // Phones, track page: the map and height chart open tall, filling the screen down to the track's name.
  // Scrolling down to read shrinks them back to the normal size; scrolling back to the very top makes them tall again.
  const phone = window.matchMedia("(max-width: 820px)");
  const wrap = document.querySelector(".mapwrap");
  const setTall = on => {
    if (wrap.classList.contains("tall") === on) return;
    wrap.classList.toggle("tall", on);
    clearTimeout(setTall.t);
    setTall.t = setTimeout(() => map.invalidateSize(), 260);  // after the 0.2 s size change
  };
  const tallGap = () => {  // the header plus the lines down to the track's name stay on screen
    const h2 = document.querySelector("#detail .detail-head h2");
    if (!h2) return;
    const gap = document.querySelector(".top").offsetHeight + (h2.getBoundingClientRect().bottom - wrap.getBoundingClientRect().bottom) + 12;
    wrap.style.setProperty("--tallgap", Math.round(gap) + "px");
  };
  window.addEventListener("scroll", () => {
    if (!current || !phone.matches) return;
    if (window.scrollY > 30) setTall(false);
    else if (window.scrollY <= 0) setTall(true);
  }, { passive: true });

  function highlight(id, on) {
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) card.classList.toggle("hl", on);
    const l = layers[id];
    if (l && !current) l.line.setStyle({ weight: on ? 7 : 4 });
    if (l && on && !current) l.g.bringToFront();  // on a track page this would cover the surface colours
  }

  // ---------- list ----------
  const stat = (label, val) => val == null ? "" : `<span>${label} <b>${val}</b></span>`;
  const latest = t => t.history[t.history.length - 1];
  const verLine = t => {
    const h = latest(t);
    return h ? `v${h.version} · ${fmtDate(h.date)}` : "";
  };
  const field = (t, key) => (t.fields.find(f => f[0].toLowerCase() === key) || [])[1];
  const hours = t => (field(t, "length") || "").match(/\(([^)]*)\)/)?.[1];

  // Main list: paved vs off-road at a glance (Pavel); the full breakdown and wet conditions are on the track page.
  // Off-road = single + double + the bits not on the map (usually trails).
  // Warning chips: the smoke-season closure gets the same 🔥 as its row in the notice box at the top.
  const flagText = f => (/smoke season/i.test(f.text) ? "🔥 " : "") + esc(f.text);
  const surfaceChip = t => {
    if (!t.surface) return "";
    // concrete lanes (two strips) are neither paved nor off-road: shown on their own when a track has them (Jul)
    const paved = t.surface.shares.paved, lanes = t.surface.shares.lanes || 0;
    return `<span class="chip">Paved ${paved}%${lanes ? ` · Concrete lanes ${lanes}%` : ""} · Off-road ${100 - paved - lanes}%</span>`;
  };
  // Difficulty as Jul's L0–L4 level (site.json trackLevels, colours from beforeRide.levels) instead of the old 1–5 dots.
  // The badge links to that level on the /difficulty page. A track without a level keeps the dots.
  // (cards are buttons, so there the badge is plain; on the track page it's a link)
  const level = (t, link) => {
    const l = (site.trackLevels || {})[t.id], d = l && ((site.beforeRide || {}).levels || []).find(x => x.l === l);
    if (!d) return "";
    const st = `class="lvtag" style="background:${esc(d.c)};color:${esc(d.t)}"`;
    return link ? `<a ${st} href="difficulty/#${l.toLowerCase()}" title="${esc(l + " " + d.name)}: see the difficulty page">${esc(l)} ${esc(d.name)} →</a>` : `<span ${st}>${esc(l)} ${esc(d.name)}</span>`;
  };
  const card = t => `
    <li><button class="card" data-id="${t.id}">
      <span class="swatch" style="background:${t.color}"></span>
      <span>
        <h3><span class="num">${t.id}</span>${esc(t.name)}</h3>
        <span class="stats">
          <span>${level(t) || dots(t.difficulty)}</span>
          ${stat("", t.km + " km")}
          ${hours(t) ? stat("", esc(hours(t))) : ""}
          ${stat("↑ ≈", t.climb != null ? t.climb + " m" : null)}
          ${stat("", t.loop ? "Loop" : "One way")}
        </span>
        <span class="chips">${surfaceChip(t)}${t.flags.filter(f => f.kind === "legal" || f.kind === "card").map(f => `<span class="chip ${f.level}">${flagText(f)}</span>`).join("")}</span>
        <span class="ver" style="display:block">${verLine(t)}</span>
      </span>
    </button></li>`;
  // Switch the page to one section: header, menu, intro, rules, list, updates and which tracks are on the map.
  function setSection(id) {
    if (section === id) return;
    section = id;
    const sec = sectionOf(id);
    const isMain = id === main.id;
    document.title = isMain ? site.title : `${sec.title} · ${site.title}`;
    // "Beginner-friendly" shows as the green L1 badge (Chu 11/25); the badge links to the L1 photos
    const sub = sec.subtitle || "";
    if (/^Beginner-friendly /.test(sub)) $("subtitle").innerHTML = `<a class="l1tag" href="difficulty/#l1">L1</a> ${esc(sub.replace(/^Beginner-friendly /, ""))}`;
    else $("subtitle").textContent = sub;
    $("intro").textContent = sec.intro;
    $("rulesSummary").textContent = sec.rulesSummary;
    $("rulesBody").innerHTML = isMain && site.beforeRide ? beforeRideHtml(site.beforeRide) : rulesHtml(data.rules[id] || []);
    $("toMain").hidden = isMain;
    $("secPick").value = id;
    document.querySelectorAll("#secTabs a").forEach(a => {
      const on = a.dataset.sec === id;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("listHead").textContent = isMain ? "Tracks" : sec.title;
    if (site.beforeRide && site.beforeRide.levels) { $("levelsBox").innerHTML = isMain ? levelsHtml(site.beforeRide) : ""; $("levelsBox").hidden = !isMain; }

    const others = sections.filter(s => s.id !== id && s.id !== main.id && tracks.some(t => t.category === s.id));
    $("list").innerHTML = tracks.filter(t => t.category === id).map(card).join("") +
      (isMain ? others.map(s => `
        <li><a class="card seclink" href="#${s.id}">
          <span class="swatch"></span>
          <span><h3>${esc(s.title)} →</h3><span class="stats">${esc(s.teaser || s.intro)}
            · ${(n => `${n} track${n === 1 ? "" : "s"}`)(tracks.filter(t => t.category === s.id).length)}</span></span>
        </a></li>`).join("") : "");
    document.querySelectorAll(".card[data-id]").forEach(c => {
      c.addEventListener("click", () => go(c.dataset.id));
      c.addEventListener("mouseenter", () => highlight(c.dataset.id, true));
      c.addEventListener("mouseleave", () => highlight(c.dataset.id, false));
    });

    const changes = data.changes.filter(c => !c.track || tracks.find(t => t.id === c.track)?.category === id);
    // "Recent updates" stays folded: one line until someone taps it, then the whole list.
    $("changesHead").hidden = !changes.length;
    $("changes").innerHTML = changes.slice(0, 40).map(c => `
      <li><time>${fmtDate(c.date)}</time>
      <span>${c.track ? `<a href="#${c.track}">${esc(c.what)}</a>` : `<b>${esc(c.what)}</b>`}
      — ${esc(c.note)}</span></li>`).join("");

    for (const t of tracks) {
      if (t.category === id) all.addLayer(layers[t.id].g);
      else all.removeLayer(layers[t.id].g);
    }
  }

  // ---------- detail ----------
  let current = null;
  let hoverMarker = null;
  // Location ON: a blue dot on the height chart at the rider's km, when they're within 200 m of the open track.
  let youAt = null, youMark = () => {};  // youMark(km or null) is set by drawProfile
  const updateYou = () => {
    if (!current || !youAt) return youMark(null);
    const n = nearestOnLine(current.line, [youAt.lat, youAt.lng]);
    youMark(n.dist <= 200 ? kmAlong(current)(n) : null);
  };
  map.on("whereupdate", e => { youAt = e.latlng; updateYou(); });
  // Track page: the open track drawn in surface colours (from OpenStreetMap, see surfaces.py).
  const SURFACES = [
    ["single", "Single track", "#e5397a"],
    ["double", "Double track / dirt", "#ff9800"],
    ["lanes", "Concrete lanes (two strips)", "#33d6ff"],
    ["paved", "Paved", "#f4f4f4"],
    ["unknown", "Not on the map", "#8a8f98"],
  ];
  const LATERITE = "#7a1408";
  const surfaceColor = Object.fromEntries(SURFACES.map(([k, , c]) => [k, c]));
  const surfaceLabel = Object.fromEntries(SURFACES.map(([k, label]) => [k, label]));
  // Point on the track → km along it (the display line is simplified, so scale to the GPX's real length).
  const kmAlong = t => {
    const cum = [0];
    for (let i = 1; i < t.line.length; i++) cum.push(cum[i - 1] + L.latLng(t.line[i - 1]).distanceTo(t.line[i]));
    const kmScale = t.km / (cum[cum.length - 1] / 1000 || 1);
    return n => ((cum[n.i] + n.f * (cum[n.i + 1] - cum[n.i])) / 1000) * kmScale;
  };
  // Track page hover: what the ground is like under the cursor, instead of the track's name. It listens on the
  // coloured pieces themselves (full detail), not the simplified track line, which drifts a few pixels off them.
  let surfaceTip = null;
  const surfaceHover = (t, pieces) => {
    const kmOf = kmAlong(t), line = layers[t.id].line;
    line.unbindTooltip();
    pieces.bindTooltip("", { sticky: true });
    pieces.on("mousemove", e => {
      const pt = [e.latlng.lat, e.latlng.lng];
      let best = { dist: Infinity, cls: "unknown" };
      for (const p of t.surface.pieces) {
        const n = nearestOnLine(p.line, pt);
        if (n.dist < best.dist) best = { dist: n.dist, cls: p.cls };
      }
      const laterite = (t.surface.laterite || []).some(l => nearestOnLine(l, pt).dist <= best.dist + 10);
      const km = kmOf(nearestOnLine(t.line, pt));
      const labels = t.labels.filter(l => km >= l.from && km <= l.to).map(l => `<br><b>${esc(l.text)}</b>`).join("");
      pieces.setTooltipContent(`km ${km.toFixed(1)} · ${surfaceLabel[best.cls]}` +
        (laterite ? `<br>Laterite, slippery when wet` : "") + labels);
    });
    surfaceTip = () => { line.bindTooltip(`${t.id} · ${esc(t.name)}`, { sticky: true }); surfaceTip = null; };
  };
  let surfaceLayer = null;
  // Points of interest saved in the GPX (parking, viewpoints, temples): pins on the track page only.
  let poiLayer = null;
  const POI_GLYPH = { parking: "P", water: "≈" };
  const poiIcon = p => L.divIcon({ className: `poi ${p.kind}`, html: POI_GLYPH[p.kind] || "★", iconSize: [22, 22] });
  const clearSurface = () => {
    if (poiLayer) { poiLayer.remove(); poiLayer = null; }
    if (surfaceLayer) { surfaceLayer.remove(); surfaceLayer = null; }
    if (surfaceTip) surfaceTip();
  };
  const surfaceKey = t => {
    const sh = t.surface.shares;
    const used = SURFACES.filter(([k]) => sh[k] > 0);
    return `<h2 class="section">Surface</h2>
      <div class="surfbar" aria-hidden="true">${used.map(([k, , c]) => `<span style="flex:${sh[k]};background:${c}"></span>`).join("")}</div>
      <ul class="surfkey">${used.map(([k, label, c]) => `<li><i style="background:${c}"></i>${label} <b>${sh[k]}%</b></li>`).join("")}</ul>
      ${t.surface.lateriteShare ? `<p class="laterite"><i></i>Laterite (pig skin), slippery when wet <b>${t.surface.lateriteShare}%</b><br>
        <span class="muted small">Marked only where the map knows it. Other parts may be laterite too.</span></p>` : ""}
      <p class="muted small">From OpenStreetMap, so it can be out of date. The notes above are the riders' own word.</p>`;
  };

  function go(id) { location.hash = id ? "#" + id : ""; }

  // ▶ Navigate (nav.js): the map fills the phone screen, surface colours off, the route drawn blue / grey.
  // ■ NAV stops it. Leaving it any other way (☰ → Back to track page, another page, a refresh, Android Back) only
  // pauses it: its state stays in the phone ("cnx-nav") and the blue "▶ Back to Navigate" bar brings it back.
  let nav = null;
  const navState = () => { try { const v = JSON.parse(localStorage.getItem("cnx-nav") || "null"); return v && Date.now() - v.at < 12 * 3600e3 ? v : null; } catch (e) { return null; } };
  const markPaused = () => { const v = navState(); if (v) try { localStorage.setItem("cnx-nav", JSON.stringify({ ...v, paused: true })); } catch (e) {} };
  const pauseNav = () => { if (nav) { nav.pause(); nav = null; markPaused(); } wrap.style.height = ""; backBar(); };
  let beepCtx = null;
  const unlockSound = () => { try { beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)(); beepCtx.resume(); } catch (e) {} };
  const beep = (n = 1, hz = 880, len = 0.25, wave = "sine", vol = 0.3) => { try { if (!beepCtx) return; for (let k = 0; k < n; k++) { const o = beepCtx.createOscillator(), v = beepCtx.createGain();
    o.type = wave; o.frequency.value = hz; v.gain.value = vol; o.connect(v); v.connect(beepCtx.destination); o.start(beepCtx.currentTime + k * 0.5); o.stop(beepCtx.currentTime + k * 0.5 + len); } } catch (e) {} };
  map.cnxBeep = beep; map.cnxUnlockSound = unlockSound;
  function startNav(t, restore) {
    if (nav) return;
    unlockSound();
    const o = { map, t, kmOf: kmAlong(t), length: field(t, "length"), youAt, restore, beep, onMenu: openMenu,
      onExit: () => { nav = null; wrap.style.height = ""; showTrack(t); backBar(); } };
    if (navigator.getBattery) navigator.getBattery().then(b => { o.battery = b; }).catch(() => {});
    if (phone.matches) { window.scrollTo({ top: 0 }); wrap.style.height = "100svh"; }
    if (surfaceLayer) map.removeLayer(surfaceLayer);
    layers[t.id].line.setStyle({ opacity: 0 }); layers[t.id].casing.setStyle({ opacity: 0 });
    if (hoverMarker) { hoverMarker.remove(); hoverMarker = null; }
    map.setView(youAt || t.start, 16, { animate: false });
    nav = startNavigate(o);  // straight from the tap: the iPhone compass question needs it
    setTimeout(() => map.invalidateSize(), 260);
    if (/[?&]cnxtest\b/.test(location.search)) window.__cnx.nav = nav;
    backBar(); armBack();
  }
  function resumeNav() {
    const v = navState(), t = v && tracks.find(x => x.id === v.track);
    if (!t) { backBar(); return; }
    if (!current || current.id !== t.id) { pendingResume = v; go(t.id); return; }
    startNav(t, v);
  }
  let pendingResume = null;

  // Blue "▶ Back to Navigate" bar on every page while a Navigate is paused (Chu 11/21).
  const bar = document.createElement("button");
  bar.type = "button"; bar.className = "navbackbar"; bar.hidden = true;
  bar.onclick = () => resumeNav();
  document.body.appendChild(bar);
  function backBar() {
    const v = navState(), t = v && v.paused && !nav && tracks.find(x => x.id === v.track);
    bar.hidden = !t; document.body.classList.toggle("hasbackbar", !!t);
    if (t) bar.innerHTML = `▶ Back to Navigate <small>${esc(t.id)} · ${esc(t.name)}</small>`;
  }

  // ☰ Menu in Navigate (Chu 11/21, in his order). Navigate keeps running behind every row.
  const menu = document.createElement("div");
  menu.className = "ridesheet navmenusheet"; menu.hidden = true;
  menu.innerHTML = `<div class="rs-dim"></div><div class="rs-box"></div>`;
  document.body.appendChild(menu);
  const mbox = menu.querySelector(".rs-box");
  const closeMenu = () => { menu.hidden = true; mbox.innerHTML = ""; };
  menu.querySelector(".rs-dim").onclick = closeMenu;
  const here = () => (map.cnxLocate && map.cnxLocate.where && map.cnxLocate.where()) || youAt;
  const camIn = document.createElement("input");
  camIn.type = "file"; camIn.accept = "image/*"; camIn.setAttribute("capture", "environment"); camIn.hidden = true;
  document.body.appendChild(camIn);
  const gpxIn = document.createElement("input");
  gpxIn.type = "file"; gpxIn.accept = ".gpx,application/gpx+xml"; gpxIn.hidden = true;
  document.body.appendChild(gpxIn);
  const shareFile = async (blob, name) => {
    const file = new File([blob], name, { type: "application/gpx+xml" });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e.name === "AbortError") return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  function openMenu() {
    const t = current;
    mbox.innerHTML = `<button class="rs-x" type="button" aria-label="Close">✕</button><h2>☰ Menu</h2>
      <button class="mrow" data-m="page" type="button"><i>⬅</i><span>Back to track page<small>Navigate keeps running</small></span></button>
      <button class="mrow" data-m="cam" type="button"><i>📷</i><span>Camera</span></button>
      <button class="mrow" data-m="gpx" type="button"><i>📤</i><span>Share GPX</span></button>
      <button class="mrow" data-m="loc" type="button"><i>📍</i><span>Send my location</span></button>
      <div class="mrow"><i>💬</i><span>Apps</span><span class="mapps"><a href="whatsapp://send" style="background:#25d366">WA</a><a href="fb-messenger://" style="background:#0084ff">M</a><a href="line://" style="background:#06c755">LINE</a></span></div>
      <a class="mrow" href="tel:1669"><i>📞</i><span>1669 <small class="inl">emergency</small></span></a>
      <p class="rs-small">Navigate keeps running. Come back here when done.</p>`;
    menu.hidden = false;
    mbox.querySelector(".rs-x").onclick = closeMenu;
    mbox.querySelector("[data-m=page]").onclick = () => { closeMenu(); const tt = current; pauseNav(); if (tt) showTrack(tt); backBar(); };
    mbox.querySelector("[data-m=cam]").onclick = () => { closeMenu(); camIn.value = ""; camIn.click(); };
    mbox.querySelector("[data-m=loc]").onclick = async () => {
      closeMenu(); const ll = here();
      if (!ll) return cnxToast("Waiting for GPS…", 3000);
      const url = `https://www.google.com/maps?q=${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}`;
      try { if (navigator.share) return await navigator.share({ title: "My location", text: "📍 I'm here:", url }); } catch (e) { if (e.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(`📍 I'm here: ${url}`); cnxToast("Location copied. Paste it in the chat.", 4000); } catch (e) { cnxToast(url, 8000); }
    };
    mbox.querySelector("[data-m=gpx]").onclick = () => {
      const rec = map.cnxRecord && map.cnxRecord.gpx();
      mbox.innerHTML = `<button class="rs-x" type="button" aria-label="Close">✕</button><h2>📤 Share GPX</h2>
        <button class="rs-b s mchoice" data-g="rec" type="button" ${rec ? "" : "disabled"}><i>⏺</i><span>My ride so far<small>${rec ? "recording keeps going" : "nothing recorded yet: tap ⏺ on the map"}</small></span></button>
        ${t ? `<button class="rs-b s mchoice" data-g="trk" type="button"><i>🛤</i><span>This track (${esc(t.id)})<small>for a friend to load</small></span></button>` : ""}
        <button class="rs-b s mchoice" data-g="file" type="button"><i>📂</i><span>From my phone<small>pick any GPX file</small></span></button>
        <p class="rs-small">Then: WhatsApp · Messenger · LINE · AirDrop · Files</p>`;
      mbox.querySelector(".rs-x").onclick = closeMenu;
      const r = mbox.querySelector("[data-g=rec]"); if (r && rec) r.onclick = () => { closeMenu(); shareFile(new Blob([rec.text], { type: "application/gpx+xml" }), rec.file); };
      const k = mbox.querySelector("[data-g=trk]"); if (k) k.onclick = async () => {
        closeMenu();
        try { const b = await (await fetch(`gpx/${encodeURIComponent(t.file)}`)).blob(); shareFile(b, t.file); } catch (e) { cnxToast("Couldn't open the track file", 4000); }
      };
      mbox.querySelector("[data-g=file]").onclick = () => { closeMenu(); gpxIn.value = ""; gpxIn.click(); };
    };
  }
  gpxIn.onchange = () => { const f = gpxIn.files && gpxIn.files[0]; if (f) shareFile(f, f.name); };
  // 📷 Camera: the photo goes straight into this track's report, the spot marked where you're standing.
  camIn.onchange = () => {
    const f = camIn.files && camIn.files[0], t = current; if (!f || !t) return;
    pauseNav(); showTrack(t);
    setTimeout(() => {
      const box = $("sendbox"); if (!box) return;
      box.open = true;
      const ph = $("sendForm").querySelector("input[name=photo]");
      try { const dt = new DataTransfer(); dt.items.add(f); ph.files = dt.files; } catch (e) {}
      setTimeout(() => { if ($("spotGps")) $("spotGps").click(); box.scrollIntoView({ behavior: "smooth", block: "start" }); }, 350);
    }, 300);
  };

  // Android Back (Chu 11/21: one tap and the whole ride was gone): while Navigate or 🚶 Walk runs, a spare step in
  // the history takes the first Back and the page stays; leaving the site asks "Leave site?" (Android Chrome);
  // and if someone leaves anyway, coming back brings Navigate, Walk, the ride and the recording back.
  const busy = () => !!nav || !!map.cnxWalking;
  function armBack() {
    if (!busy() || document.body.classList.contains("rainlocked")) return;
    if (history.state && history.state.cnxTrap) return;
    try { history.pushState({ cnxTrap: 1 }, ""); } catch (e) {}
  }
  document.addEventListener("click", armBack, true);
  map.on("walkchange", armBack);
  window.addEventListener("popstate", e => {
    if (document.body.classList.contains("rainlocked")) return;  // the lock has its own Back
    if (e.state && (e.state.cnxTrap || e.state.cnxLock)) return;
    if (!busy() || location.hash.slice(1) !== (current ? current.id : location.hash.slice(1))) return;
    try { history.pushState({ cnxTrap: 1 }, ""); } catch (er) {}
    cnxToast(nav ? "To stop, tap ■ NAV" : "To end Walk, tap 🚶", 3000);
  });
  window.addEventListener("beforeunload", e => {
    const rec = map.cnxRecord && map.cnxRecord.isOn();
    if (busy() || rec || (ride && ride.inRide())) { e.preventDefault(); e.returnValue = ""; }
  });

  function showOverview(id) {
    current = null;
    $("map").classList.remove("ontrack");  // park banner back on the overview map
    document.body.classList.remove("trackpage");  // site title and QR button back (phones hide them on a track page)
    setTall(false);
    map.fire("whererefresh");
    const changed = section !== id;
    setSection(id);
    if (changed && window.innerWidth <= 820) window.scrollTo({ top: 0 });
    $("detail").hidden = true;
    $("overview").hidden = false;
    $("profile").hidden = true;
    if (hoverMarker) { hoverMarker.remove(); hoverMarker = null; }
    clearSurface();
    for (const l of Object.values(layers)) {
      l.line.setStyle({ opacity: 0.95, weight: 4 });
      l.casing.setStyle({ opacity: 0.55 });
      l.start.setOpacity(1); l.start.setZIndexOffset(0);
    }
    fitAll();
  }

  function showTrack(t) {
    current = t;
    $("map").classList.add("ontrack");  // one track open: hide the park banner (the red stripes stay)
    document.body.classList.add("trackpage");  // phones: no site title bar on a track page, more room for the map
    map.fire("whererefresh");
    if (hoverMarker) { hoverMarker.remove(); hoverMarker = null; }  // left over from the previous track's profile
    setSection(t.category);
    for (const [id, l] of Object.entries(layers)) {
      const on = id === t.id;
      l.line.setStyle({ opacity: on ? 1 : 0.25, weight: on ? 5 : 3 });
      l.casing.setStyle({ opacity: on ? 0.7 : 0 });
      l.start.setOpacity(on ? 1 : 0.3); l.start.setZIndexOffset(on ? 1000 : 0);
    }
    layers[t.id].g.bringToFront();
    clearSurface();
    if (t.surface) {
      layers[t.id].line.setStyle({ opacity: 0 });
      const casings = L.featureGroup(t.surface.pieces.map(p =>
        L.polyline(p.line, { color: "#000", weight: 8, opacity: 0.75, interactive: false })));
      const pieces = L.featureGroup(t.surface.pieces.map(p =>
        L.polyline(p.line, { color: surfaceColor[p.cls], weight: 5, opacity: 1, dashArray: p.cls === "unknown" ? "6 6" : null })));
      const laterite = L.featureGroup((t.surface.laterite || []).map(line =>  // laterite: dashes over the surface colour
        L.polyline(line, { color: LATERITE, weight: 5, opacity: 1, interactive: false, dashArray: "4 8", lineCap: "butt" })));
      surfaceLayer = L.featureGroup([casings, pieces, laterite]).addTo(map);
      // a nested group doesn't keep its drawing order, so stack them explicitly: outline, colour, laterite, start
      pieces.bringToFront();
      laterite.bringToFront();
      surfaceHover(t, pieces);
    }
    if (t.pois.length) {
      poiLayer = L.featureGroup(t.pois.map(p => L.marker([p.lat, p.lon], { icon: poiIcon(p), zIndexOffset: 500 })
        .bindTooltip(`${esc(p.name)} · km ${p.km}${p.kmTo != null ? "–" + p.kmTo : ""}`, { direction: "top", offset: [0, -10] }))).addTo(map);
      // a label opened from the Stops list stays up until its own pin is left; close it when another pin is hovered
      poiLayer.on("mouseover", e => poiLayer.eachLayer(l => { if (l !== e.layer) l.closeTooltip(); }));
    }

    const h = latest(t);
    const legalIdx = t.fields.findIndex(f => f[0].toLowerCase() === "legal");
    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${t.start[0]},${t.start[1]}`;
    $("detail").innerHTML = `
      <button class="back" id="back">← All ${t.category === main.id ? "" : esc(sectionOf(t.category).title) + " "}tracks</button>
      <div class="detail-head">
        <div class="muted small">${t.category !== sections[0].id ? esc(sectionOf(t.category).title) + " · " : ""}Track ${t.id} · ${level(t, true) || `${dots(t.difficulty)} ${t.difficulty ? t.difficulty + "/5" : ""}`}</div>
        <h2>${esc(t.name)}</h2>
        <div class="chips">${t.flags.filter(f => f.kind !== "card").map(f => `<span class="chip ${f.level}">${flagText(f)}</span>`).join("")}</div>
      </div>
      <div class="actions">
        ${CNX_BETA ? `<button class="btn navgo" id="navGo" type="button">▶ Navigate</button><button class="btn ridego" id="rideGo" type="button">👥 Ride together</button>` : ""}
        <a class="btn primary" href="gpx/${encodeURIComponent(t.file)}" download>Download GPX</a>
        <a class="btn" href="${gmaps}" target="_blank" rel="noopener">Directions to start</a>
        <button class="btn" id="qrBtn" type="button">Share</button>
      </div>
      ${site.shareNotice ? `<p class="share small">${esc(site.shareNotice)}</p>` : ""}
      <div class="facts">
        <div class="fact"><span>Distance</span><b>${t.km} km</b></div>
        <div class="fact"><span>Climbing (est.)</span><b>${t.climb != null ? "≈" + t.climb + " m" : "—"}</b></div>
        <div class="fact"><span>Highest</span><b>${t.maxEle != null ? t.maxEle + " m" : "—"}</b></div>
        <div class="fact"><span>Route</span><b>${t.loop ? "Loop" : "One way"}</b></div>
      </div>
      ${t.pois.length ? `<h2 class="section">Stops</h2><ul class="pois">${t.pois.map((p, i) => `
        <li><button class="poirow" data-i="${i}"><i class="poi ${p.kind}">${POI_GLYPH[p.kind] || "★"}</i>${esc(p.name)} <span class="muted">km ${p.km}${p.kmTo != null ? "–" + p.kmTo : ""}</span></button></li>`).join("")}</ul>` : ""}
      <dl class="desc">${t.fields.map((f, i) => `<dt>${esc(f[0])}</dt><dd class="${i === legalIdx ? "legal" : ""}">${esc(f[1])}</dd>`).join("")}</dl>
      ${t.surface ? surfaceKey(t) : ""}
      <h2 class="section">Version history</h2>
      <ul class="history">${[...t.history].reverse().map(v => `
        <li><b>v${v.version}</b> · ${fmtDate(v.date)} · ${esc(v.by)}<br><span class="muted">${esc(v.note)}</span></li>`).join("")}</ul>
      <p class="muted small">Current file: ${esc(t.file)}${h ? ` (v${h.version})` : ""}.
        Notes last changed ${t.notesUpdated ? fmtDate(t.notesUpdated.date) : "—"}.</p>
      ${site.submitUrl ? `<details class="sendbox" id="sendbox">
        <summary>Found a change on this track? Send it to us</summary>
        <form id="sendForm">
          <p class="muted small">New "no off-road" sign, now paved, blocked trail? Mark the spot or send your ride recording.
            We check it and update the track. Nothing goes on the site until we do.</p>
          <div class="spotpick">
            <div class="spotrow"><span>Where is it? <span class="muted">Tap the track on the map</span></span>
              <button type="button" class="btn small" id="spotGps">Use my location</button></div>
            <div id="spotMap"></div>
            <p id="spotInfo" class="small muted">No spot marked yet.</p>
          </div>
          <label>What changed
            <select name="kind">
              <option>New "no off-road" sign</option>
              <option>Now paved</option>
              <option>Trail blocked or closed</option>
              <option>Better line or reroute</option>
              <option>Track is fine, just confirming</option>
              <option>Other</option>
            </select></label>
          <label>Note <span class="muted">(what you saw)</span><textarea name="note" rows="3" maxlength="4000"></textarea></label>
          <label>Your name<input name="name" required maxlength="80" autocomplete="name"></label>
          <label>Contact, so we can ask questions <span class="muted">(optional: email or LINE)</span><input name="contact" maxlength="120"></label>
          <label>Your GPX recording <span class="muted">(optional if you marked the spot)</span><input type="file" name="gpx" accept=".gpx,application/gpx+xml"></label>
          <label>Photo <span class="muted">(optional, e.g. the sign)</span><input type="file" name="photo" accept="image/*"></label>
          <input name="website" tabindex="-1" autocomplete="off" class="trap" aria-hidden="true">
          <button class="btn primary" type="submit">Send to us</button>
          <p id="sendStatus" class="small" role="status"></p>
        </form>
      </details>` : `<p class="muted small">${esc(site.contribute)}</p>`}`;
    $("overview").hidden = true;
    $("detail").hidden = false;
    $("back").onclick = () => go(sectionHash(t.category));
    if ($("navGo")) $("navGo").onclick = () => startNav(t);
    if ($("rideGo")) $("rideGo").onclick = () => ride && ride.open();
    if ($("sendForm")) setupSendForm(t);
    document.querySelectorAll(".poirow").forEach(b => b.onclick = () => {  // a stop in the list → show it on the map
      const m = poiLayer.getLayers()[+b.dataset.i];
      poiLayer.eachLayer(l => l.closeTooltip());  // one label at a time, not a pile of every stop clicked
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 14));
      m.openTooltip();
      if (window.innerWidth <= 820) window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.querySelector(".panel").scrollTop = 0;
    if (window.innerWidth <= 820) window.scrollTo({ top: 0 });

    drawProfile(t);
    if (phone.matches) {  // straight to tall with no slide, so the fit below uses the tall size
      tallGap();
      wrap.style.transition = "none";
      wrap.classList.add("tall");
      void wrap.offsetHeight;  // apply the new height now
      wrap.style.transition = "";
    }
    fitTo(L.latLngBounds(t.line), 30);
  }

  // ---------- rider updates → emailed to Pavel by the Google Apps Script in apps-script/ ----------

  const readDataUrl = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });

  // Phone photos are several MB; shrink to 1600 px JPEG before sending.
  async function shrinkPhoto(file) {
    try {
      const img = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return { name: file.name.replace(/\.\w+$/, "") + ".jpg", type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.82) };
    } catch {
      return { name: file.name, type: file.type, data: await readDataUrl(file) };
    }
  }

  // Spot picker: a small map of the track inside the form. A tap (or the phone's GPS) is snapped to
  // the nearest point on the track, so the report says "km 12.4" rather than loose coordinates.
  function setupSendForm(t) {
    const form = $("sendForm");
    let spot = null, spotMap = null, pin = null;
    const kmOf = kmAlong(t);

    function setSpot(latlng) {
      const n = nearestOnLine(t.line, [latlng.lat, latlng.lng]);
      const km = kmOf(n);
      spot = { lat: +n.lat.toFixed(6), lon: +n.lon.toFixed(6), km: +km.toFixed(1), off: Math.round(n.dist) };
      if (!pin) pin = L.marker([n.lat, n.lon]).addTo(spotMap);
      else pin.setLatLng([n.lat, n.lon]);
      $("spotInfo").className = "small";
      $("spotInfo").innerHTML = `📍 <b>km ${spot.km}</b>` + (spot.off > 150 ? ` <span class="muted">(nearest point on the track, ${spot.off} m away)</span>` : "");
    }

    $("sendbox").addEventListener("toggle", () => {
      if (!$("sendbox").open) return;
      if (spotMap) { spotMap.invalidateSize(); return; }
      spotMap = baseMap("spotMap", { layersControl: false, locate: false });
      addNoRideZones(spotMap);
      L.polyline(t.line, { color: "#000", weight: 7, opacity: 0.5 }).addTo(spotMap);
      L.polyline(t.line, { color: t.color, weight: 4 }).addTo(spotMap);
      spotMap.fitBounds(L.latLngBounds(t.line), { padding: [16, 16] });
      spotMap.on("click", e => setSpot(e.latlng));
    });
    $("spotGps").onclick = () => {
      const known = map.cnxLocate && map.cnxLocate.where && map.cnxLocate.where();  // location already on (Navigate): use it, instantly
      if (known) { setSpot(known); spotMap.setView(known, 15); return; }
      if (!navigator.geolocation) { $("spotInfo").textContent = "This phone can't share its location here."; return; }
      $("spotInfo").textContent = "Finding you…";
      navigator.geolocation.getCurrentPosition(
        p => { const ll = L.latLng(p.coords.latitude, p.coords.longitude); setSpot(ll); spotMap.setView(ll, 15); },
        () => { $("spotInfo").textContent = spot ? `Couldn't get your location. Still marked: km ${spot.km}.` : "Couldn't get your location. Tap the map instead."; },
        { enableHighAccuracy: true, timeout: 15000 });
    };
    form.onsubmit = ev => { ev.preventDefault(); sendUpdate(t, form, spot, () => { spot = null; if (pin) { pin.remove(); pin = null; } $("spotInfo").className = "small muted"; $("spotInfo").textContent = "No spot marked yet."; }); };
  }

  // 📤 Reports keep until there's signal (Chu 11/21: one got lost in the hills). Every report is kept in the phone
  // first (IndexedDB "cnx-outbox"), then sent. No answer within 3 s (or no signal at all): "📤 Saved on your phone",
  // the form clears, and it sends by itself when signal comes back (📤 badge on the map until then). Each report
  // carries its own number (rid) so a late double send can be spotted.
  async function sendUpdate(t, form, spot, onSent) {
    const status = $("sendStatus");
    const btn = form.querySelector("button[type=submit]");
    const f = new FormData(form);
    const gpx = f.get("gpx"), photo = f.get("photo");
    const hasGpx = gpx && gpx.size;
    status.style.color = "var(--warn)";
    if (!spot && !hasGpx) { status.textContent = "Please mark the spot on the map or add your GPX recording."; return; }
    if (hasGpx && gpx.size > 10 * 1024 * 1024) { status.textContent = "That GPX is over 10 MB. Please trim it or send a shorter recording."; return; }
    btn.disabled = true;
    status.style.color = "";
    status.textContent = "Sending…";
    let payload;
    try {
      payload = {
        rid: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(),
        track: `${t.id} ${t.name}`, trackId: t.id,
        name: f.get("name"), contact: f.get("contact"), kind: f.get("kind"), note: f.get("note"),
        website: f.get("website"),
        spot,
        gpx: hasGpx ? { name: gpx.name, type: "application/gpx+xml", data: await readDataUrl(gpx) } : null,
        photo: photo && photo.size ? await shrinkPhoto(photo) : null,
      };
    } catch (e) { btn.disabled = false; status.style.color = "var(--warn)"; status.textContent = "Couldn't read the photo or GPX. Try another file."; return; }
    const kept = await outbox.put(payload).then(() => true).catch(() => false);
    const done = (msg, color) => {
      form.reset(); onSent(); btn.disabled = false;
      status.style.color = color; status.textContent = msg;
      const v = navState(); if (v && v.paused && !nav) setTimeout(resumeNav, 2000);  // reporting from Navigate: back riding
    };
    if (navigator.onLine === false && kept) { done("📤 Saved on your phone. It sends by itself when there's signal.", "var(--ok)"); savedNote(); outboxBadge(); return; }
    const sending = postReport(payload).then(async () => { await outbox.del(payload.rid).catch(() => {}); return "sent"; }, () => "fail");
    const first = await Promise.race([sending, new Promise(r => setTimeout(r, 3000, "slow"))]);
    if (first === "sent") { done("Sent. Thank you! We'll take a look.", "var(--ok)"); outboxBadge(); return; }
    if (!kept) {  // this phone can't keep it: the old way, say it failed
      const r = first === "slow" ? await sending : first;
      if (r === "sent") return done("Sent. Thank you! We'll take a look.", "var(--ok)");
      btn.disabled = false; status.style.color = "var(--warn)"; status.textContent = "Couldn't send. Please try again where there's signal.";
      return;
    }
    done("📤 Saved on your phone. It sends by itself when there's signal.", "var(--ok)"); savedNote(); outboxBadge();
    sending.then(r => { if (r === "sent") { cnxToast("✓ Report sent", 3000); outboxBadge(); } });
  }
  const savedNote = () => cnxToast("📤 Saved on your phone<small>No signal. It sends by itself when there's signal.</small>", 4000);
  async function postReport(payload) {
    // text/plain keeps this a "simple" request, so the browser skips the CORS preflight Apps Script can't answer
    const r = await fetch(site.submitUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    // a sign-in or error page from Google comes back as HTML
    const out = await r.json().catch(() => ({ ok: false, error: "the server didn't answer properly" }));
    if (!out.ok) throw new Error(out.error || "Failed");
  }
  const outbox = (() => {
    const db = () => new Promise((ok, bad) => { const r = indexedDB.open("cnx-outbox", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("r", { keyPath: "rid" }); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
    const run = async (mode, fn) => { const d = await db(); return new Promise((ok, bad) => {
      const tx = d.transaction("r", mode), req = fn(tx.objectStore("r")); tx.oncomplete = () => ok(req && req.result); tx.onerror = () => bad(tx.error); }); };
    return { put: p => run("readwrite", st => st.put(p)), del: id => run("readwrite", st => st.delete(id)), all: () => run("readonly", st => st.getAll()) };
  })();
  const badge = document.createElement("div");
  badge.className = "outboxbadge"; badge.hidden = true; badge.title = "Reports waiting for signal";
  document.querySelector("#map").appendChild(badge);
  async function outboxBadge() {
    const n = (await outbox.all().catch(() => [])).length;
    badge.hidden = !n; badge.textContent = `📤 ${n}`;
  }
  let flushing = false;
  async function outboxFlush() {
    outboxBadge();
    if (flushing || navigator.onLine === false || !site.submitUrl) return;
    flushing = true;
    try {
      for (const p of await outbox.all().catch(() => [])) {
        if (Date.now() - parseInt(p.rid.slice(0, -5), 36) < 4000) { setTimeout(outboxFlush, 4500); continue; }  // the form is still sending this one: look again soon
        try { await postReport(p); await outbox.del(p.rid); cnxToast("✓ Report sent", 3000); } catch (e) { break; }
      }
    } finally { flushing = false; outboxBadge(); }
  }
  window.addEventListener("online", outboxFlush);
  setInterval(outboxFlush, 30000);


  function drawProfile(t) {
    const box = $("profile");
    box.hidden = false;
    const p = t.profile;
    youMark = () => {};
    if (!p.length) {
      box.innerHTML = `<div class="none">No elevation data in this GPX file.</div>`;
      return;
    }
    const W = 1000, H = 128, padT = 8, padB = 18, GUT = 52;  // GUT: px gutter left of the chart for the height scale
    const maxKm = p[p.length - 1][0];
    let lo = Math.min(...p.map(q => q[1])), hi = Math.max(...p.map(q => q[1]));
    // round the scale to a step that gives 2-4 labelled heights
    const yStep = [20, 50, 100, 200, 250, 500, 1000].find(s => (hi - lo) / s <= 4) || 1000;
    lo = Math.floor(lo / yStep) * yStep;
    hi = Math.max(Math.ceil(hi / yStep) * yStep, lo + yStep);
    const yTicks = [];
    for (let v = lo; v <= hi; v += yStep) yTicks.push(v);
    const x = km => (km / maxKm) * W;
    const y = e => padT + (1 - (e - lo) / (hi - lo)) * (H - padT - padB);
    const pts = p.map(q => `${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join(" ");
    const ticks = [];
    const step = maxKm > 80 ? 20 : maxKm > 30 ? 10 : 5;
    for (let k = step; k < maxKm; k += step) ticks.push(k);
    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Elevation profile">
        ${yTicks.map(v => `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join("")}
        <polygon points="0,${H - padB} ${pts} ${W},${H - padB}" fill="${t.color}" fill-opacity="0.22"/>
        <polyline points="${pts}" fill="none" stroke="${t.color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
        ${ticks.map(k => `<line x1="${x(k)}" x2="${x(k)}" y1="${H - padB}" y2="${H - padB + 4}" stroke="var(--muted)" vector-effect="non-scaling-stroke"/>`).join("")}
        <line id="cursor" y1="0" y2="${H - padB}" stroke="var(--text)" stroke-width="1" vector-effect="non-scaling-stroke" visibility="hidden"/>
      </svg>
      ${ticks.map(k => `<span class="axis" style="bottom:0;left:calc(${GUT}px + (100% - ${GUT}px) * ${k / maxKm});transform:translateX(-50%)">${k} km</span>`).join("")}
      ${yTicks.map(v => `<span class="axis" style="right:calc(100% - ${GUT - 6}px);top:${(y(v) / H) * 100}%;transform:translateY(-50%)">${v} m</span>`).join("")}
      <div class="tip" hidden></div><div class="pyou" hidden title="You are here"></div>`;
    const svg = box.querySelector("svg"), cur = box.querySelector("#cursor"), tip = box.querySelector(".tip");
    const move = ev => {
      const r = svg.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const km = fx * maxKm;
      let q = p[0];
      for (const s of p) { if (s[0] > km) break; q = s; }
      cur.setAttribute("x1", x(q[0])); cur.setAttribute("x2", x(q[0]));
      cur.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.textContent = `km ${q[0].toFixed(1)} · ${q[1]} m`;
      tip.style.left = GUT + Math.min(r.width - 120, Math.max(4, fx * r.width - 50)) + "px";
      if (!hoverMarker) hoverMarker = L.circleMarker([q[2], q[3]], { radius: 7, color: "#fff", weight: 2, fillColor: t.color, fillOpacity: 1 }).addTo(map);
      else hoverMarker.setLatLng([q[2], q[3]]);
    };
    const leave = () => {
      cur.setAttribute("visibility", "hidden");
      tip.hidden = true;
      if (hoverMarker) { hoverMarker.remove(); hoverMarker = null; }
    };
    const you = box.querySelector(".pyou");
    youMark = km => {
      if (km == null) { you.hidden = true; return; }
      let q = p[0];
      for (const s of p) { if (s[0] > km) break; q = s; }
      const r = svg.getBoundingClientRect(), b = box.getBoundingClientRect();
      you.style.left = (r.left - b.left + (q[0] / maxKm) * r.width) + "px";
      you.style.top = (r.top - b.top + (y(q[1]) / H) * r.height) + "px";
      you.hidden = false;
    };
    updateYou();
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", leave);
  }

  // 👥 Ride together (ride.js): needs the track page's map, Navigate and the km-along helper.
  const kmCache = {};
  const ride = CNX_BETA && window.CNX_FIREBASE && typeof setupRide === "function" ? setupRide({
    map, current: () => current, navOn: () => !!nav, startNav: () => { if (current) startNav(current); }, beep, unlockSound,
    kmAt: (t, ll) => (kmCache[t.id] || (kmCache[t.id] = kmAlong(t)))(nearestOnLine(t.line, ll)),
    loadQr, siteUrl: () => site.siteUrl || location.origin + location.pathname,
  }) : null;
  if (/[?&]cnxtest\b/.test(location.search)) window.__cnx = Object.assign(window.__cnx || {}, { ride });

  function route() {
    pauseNav();
    const id = location.hash.slice(1);
    const t = tracks.find(t => t.id === id);
    if (t) showTrack(t);
    // an unknown or empty section (old #adventure links) falls back to the main page
    else showOverview(tracks.some(t => t.category === id) ? id : main.id);
    if (t && pendingResume && pendingResume.track === t.id) { const v = pendingResume; pendingResume = null; setTimeout(() => startNav(t, v), 50); }
    backBar();
  }
  window.addEventListener("hashchange", route);
  route();
  // A refresh, a reload by the phone, or coming back after leaving the site: straight back into Navigate.
  { const v = navState(); if (v && !v.paused && !nav) resumeNav(); else backBar(); }
  outboxFlush();

})();
