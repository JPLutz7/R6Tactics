/* R6 Stack — service worker (offline + installable PWA).
   Shell (the app HTML + icons) is precached; HTML is network-first so updates
   land; same-origin map images are cached-first as you view them, so a map you
   open once works offline after. Cross-origin (peek videos) is left untouched.
   Bump CACHE to force a refresh of the precached shell. */
const CACHE = "r6stack-v2";
const SHELL = [
  "./", "./index.html", "./manifest.json",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png",
  "./assets/icons/icon-180.png", "./assets/icons/maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // peek videos etc. — let the network handle it

  const isDoc = req.mode === "navigate" || req.destination === "document" ||
                url.pathname.endsWith("/") || url.pathname.endsWith("index.html");

  if (isDoc) {
    // network-first → newest app, fall back to cached shell offline
    e.respondWith(
      fetch(req)
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); return r; })
        .catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  // assets (images / icons / manifest): cache-first, then network (and cache it)
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r && r.ok && r.type === "basic") { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => hit))
  );
});
