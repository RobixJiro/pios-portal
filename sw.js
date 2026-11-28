const CACHE_NAME = "pios-app-shell-v6";
const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./ogi.svg",
];

function shouldBypassRequest(request, url) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return true;
  if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) return true;
  if (
    url.pathname.endsWith("/env.js") ||
    url.pathname.endsWith("/pios-runtime-config.js")
  ) {
    return true;
  }
  if (url.searchParams.has("unlock")) return true;

  const accept = (request.headers.get("accept") || "").toLowerCase();
  if (accept.includes("text/event-stream")) return true;
  if (request.headers.has("authorization")) return true;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return true;
  }
  return false;
}

function isCacheableResponse(response) {
  if (!response || !response.ok || response.status !== 200) return false;
  if (response.type !== "basic") return false;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/event-stream")) return false;
  return true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (shouldBypassRequest(request, url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" }))
        .then((networkResponse) => {
          if (isCacheableResponse(networkResponse)) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }
          return networkResponse;
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                cached || caches.match("./index.html") || caches.match("./"),
            ),
        ),
    );
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkResponse) => {
          if (isCacheableResponse(networkResponse)) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }
          return networkResponse;
        });
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (isCacheableResponse(networkResponse)) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
