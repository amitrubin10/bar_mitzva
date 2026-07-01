/* Service worker — offline app shell + media caching */
const CACHE = "ori-bar-mitzva-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./timings.js",
  "./app.js",
  "./manifest.webmanifest",
  "./share.png",
  "./share2.png",
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
  // cache-first, fall back to network, then cache the response
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // only cache same-origin successful responses
        try {
          const url = new URL(req.url);
          if (url.origin === self.location.origin && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
        } catch (_) {}
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
