/* Service worker — offline app shell + media caching */
const CACHE = "ori-bar-mitzva-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./timings.js",
  "./original_env.js",
  "./app.js",
  "./manifest.webmanifest",
  "./share3.png",
  "./media/full.oga",
  "./media/first2.oga",
  "./media/text.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // App shell (navigations + HTML/JS/CSS/manifest): NETWORK-FIRST so updates
  // show immediately when online; fall back to cache when offline.
  const isShell = req.mode === "navigate" ||
    /\.(?:html|js|css|webmanifest)$/.test(url.pathname);

  if (sameOrigin && isShell) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req).then((hit) => hit || caches.match("./index.html"))
      )
    );
    return;
  }

  // Everything else (audio, images, icons): CACHE-FIRST for speed/offline.
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        try {
          if (sameOrigin && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
        } catch (_) {}
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
