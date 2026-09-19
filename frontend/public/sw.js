/*
 * Service worker do FluxPay.
 *
 * Regras, nessa ordem:
 *  - NUNCA intercepta /v1/*, /dashboard-api/*, /admin-api/*, /health nem nada
 *    que nao seja GET: dinheiro e sessao nao podem sair de cache.
 *  - Navegacao (HTML): rede primeiro, com /offline.html como ultimo recurso.
 *    Nada de cachear paginas do painel — elas dependem da sessao e do ambiente.
 *  - Estaticos do proprio site (/_next/static, /icons, manifest): cache
 *    primeiro, porque tem hash no nome ou mudam junto com o deploy.
 */
const VERSION = "fluxpay-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/manifest.webmanifest"];

const NEVER_CACHE = ["/v1/", "/dashboard-api/", "/admin-api/", "/health", "/auth/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then((cached) => cached || Response.error())
      )
    );
    return;
  }

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/og-image.png";

  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
