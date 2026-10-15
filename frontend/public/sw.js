/*
 * Service worker do FluxPay.
 * - NUNCA intercepta /v1/*, /dashboard-api/*, /admin-api/*, /health
 * - Web Push: eventos push + notificationclick
 */
const VERSION = "fluxpay-v5";
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

self.addEventListener("push", (event) => {
  let data = { title: "FluxPay", body: "Nova atualizacao", data: {} };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = {
        title: parsed.title || data.title,
        body: parsed.body || data.body,
        data: parsed.data || {},
        icon: parsed.icon || "/icons/icon-192.png",
        badge: parsed.badge || "/icons/icon-192.png",
      };
    }
  } catch (_) {
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-192.png",
      data: data.data || { url: "/dashboard/payments" },
      vibrate: [120, 40, 120],
      tag: (data.data && data.data.kind) || "fluxpay",
      renotify: true,
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard/payments";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
