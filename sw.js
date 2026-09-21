"use strict";

const CACHE = "layout-2-remastered-v14";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "dm-validation.js",
  "manifest.json",
  "data/layouts.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "assets/ui/Damos_Seguimiento.webp",
  "assets/ui/Un_placer_haber_Ayudado.webp",
  "vendor/jspdf.umd.min.js"
];

async function priorityCatalogAssets() {
  try {
    const response = await fetch("data/layouts.json", { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    const assets = [];
    const limit = Math.max(0, Number(data.performance?.precachePerStation) || 0);
    for (const station of data.stations || []) {
      for (const variant of (station.variants || []).slice(0, limit)) {
        if (variant.image) assets.push(variant.image);
      }
    }
    return [...new Set(assets)];
  } catch {
    return [];
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const assets = await priorityCatalogAssets();
    await Promise.allSettled(assets.map(asset => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return (await cache.match("index.html")) || Response.error();
    return Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request, { cache: "no-cache" }).then(async response => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  event.waitUntil(refresh);
  return cached || (await refresh) || Response.error();
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isLargeVisual = event.request.destination === "image" || url.pathname.includes("/assets/layouts/");
  event.respondWith(isLargeVisual
    ? staleWhileRevalidate(event.request, event)
    : networkFirst(event.request));
});
