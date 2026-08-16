/* Service worker — per-student offline shell + media caching (Yuval) */
const CACHE = "yuval-torah-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./student.js",
  "./data.js",
  "./timings.js",
  "./original_env.js",
  "./manifest.webmanifest",
  "./media/full.oga",
  "../app/app.js",
  "../app/style.css",
  "../app/fonts/TorahStamAshkenaz.ttf",
  "../app/fonts/TaameyFrankCLM-Medium.ttf",
  "../img/hero-dark.png",
  "../img/hero-light.png",
  "../icons/icon-192.png",
  "../icons/icon-512.png",
  "../icons/apple-touch-icon.png",
  "../icons/favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("yuval-")).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // App shell (navigations + HTML/JS/CSS/manifest) and UI images (not /media/):
  // NETWORK-FIRST so engine/content updates show immediately when online.
  const isUIimg = /\.(?:png|jpe?g|webp|svg|gif)$/.test(url.pathname) &&
    !url.pathname.includes("/media/");
  const isShell = req.mode === "navigate" ||
    /\.(?:html|js|css|webmanifest)$/.test(url.pathname) || isUIimg;

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

  // Everything else (audio, fonts): CACHE-FIRST for speed/offline.
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
