// Background helper for no signal (a "service worker"). The phone runs it for this site only.
// - Page files (page, scripts, styles, track data): always fetched fresh when there's signal, with a copy kept;
//   with no signal (or no answer within 5 s) the kept copy is used, so the site opens in the hills.
// - Offline map pieces (offline/tiles/…): from the phone first; they're stored when a rider taps 💾 on a track.
// - 👥 Ride together's Firebase files from www.gstatic.com: kept after first use (cache first).
// Other sites (OSM map, Esri, visit counter, Google form) are left alone.
const SHELL = "cnx-shell-v1", TILES = "cnx-offline-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  // 👥 Ride together's Firebase code (Google's server): kept after the first use, so the ride comes back with no signal
  if (req.method === "GET" && url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.open(SHELL).then(async c => (await c.match(req)) ||
      fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })));
    return;
  }
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.includes("/offline/tiles/")) {
    e.respondWith(caches.open(TILES).then(c => c.match(req)).then(hit => hit ||
      fetch(req).catch(() => new Response("", { status: 404 }))));
    return;
  }
  if (/\.zip$/i.test(url.pathname)) return;  // big downloads: not kept
  e.respondWith(freshFirst(req, url));
});
async function freshFirst(req, url) {
  const c = await caches.open(SHELL);
  const keep = async res => {
    if (res.ok && res.type === "basic") {
      // one copy per file: drop older versions (style.css?v=… changes with every update)
      for (const k of await c.keys()) { const ku = new URL(k.url); if (ku.pathname === url.pathname && k.url !== req.url) await c.delete(k); }
      await c.put(req, res.clone());
    }
    return res;
  };
  const kept = async () => (await c.match(req, { ignoreSearch: true })) ||
    (req.mode === "navigate" ? (await c.match(new URL("./", self.registration.scope).href, { ignoreSearch: true })) : undefined);
  const net = fetch(req).then(keep);
  const first = await Promise.race([net.catch(() => "fail"), new Promise(r => setTimeout(r, 5000, "slow"))]);
  if (first instanceof Response) return first;
  const hit = await kept();
  if (hit) return hit;
  return net;  // nothing kept: wait for the network (or fail as usual)
}
