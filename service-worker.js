/* v1.0.0 */
const CACHE_NAME = "pwa-cache-v1";
const APP_SHELL = [
  "/",                // si ton serveur renvoie l'index sur /
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// (facultatif) page offline dédiée pour les navigations
const OFFLINE_FALLBACK_PAGE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([...APP_SHELL, OFFLINE_FALLBACK_PAGE].filter(Boolean));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Supprime les anciens caches
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Stratégies:
 * - Navigations (HTML): network-first avec repli offline
 * - Static assets (CSS/JS/icônes): cache-first avec mise à jour en arrière-plan
 * - Autres requêtes: network-first simple
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 1) Navigations (documents HTML)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Optionnel: met en cache la version fraîche
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          // Offline fallback
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(req);
          return cached || cache.match(OFFLINE_FALLBACK_PAGE);
        }
      })()
    );
    return;
  }

  // 2) Static assets: cache-first + revalidation en arrière-plan
  if (["style", "script", "image", "font"].includes(req.destination)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            // Ne mets en cache que si OK
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);

        // Renvoie le cache si dispo, sinon le réseau
        return cached || (await networkPromise) || new Response(null, { status: 504 });
      })()
    );
    return;
  }

  // 3) Par défaut: network-first basique
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        return cached || new Response(null, { status: 504 });
      }
    })()
  );
});

// Permettre une mise à jour immédiate via postMessage({type:"SKIP_WAITING"})
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
