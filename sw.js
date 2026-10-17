/* Service worker : application disponible hors ligne.
   Stratégie « réseau d'abord » pour la page (toujours la version fraîche quand le réseau
   répond), « cache d'abord » pour les bibliothèques versionnées. Aucune donnée du
   livre ne passe par ce cache : seules les ressources de l'application. */
const VERSION = "2026-10-17.1644";
const CACHE = "budget-foyer-" + VERSION;
const ESSENTIELS = ["./", "index.html", "manifest.webmanifest", "icone-192.png", "icone-512.png", "vendor/msal-browser.min.js", "vendor/qrcode.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENTIELS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(k => k.startsWith("budget-foyer-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // OneDrive, Microsoft : jamais mis en cache
  if (url.pathname.includes("/vendor/")){
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(rep => { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); return rep; })));
    return;
  }
  e.respondWith(fetch(e.request).then(rep => { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); return rep; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
