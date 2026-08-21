"use strict";

const CACHE = "layout-2-remaster-v3";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.json",
  "data/layouts.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "vendor/jspdf.umd.min.js"
];

async function catalogAssets() {
  try {
    const response = await fetch("data/layouts.json", { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    const assets = [];
    for (const station of data.stations || []) {
      for (const variant of station.variants || []) {
        if (variant.image) assets.push(variant.image);
        if (variant.thumb) assets.push(variant.thumb);
      }
      for (const technical of station.technical || []) {
        if (technical.image) assets.push(technical.image);
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
    const assets = await catalogAssets();
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

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
