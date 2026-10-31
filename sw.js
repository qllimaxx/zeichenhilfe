/*
  Zeichenhilfe – Service Worker (offline nutzbar)
  Autor: Benjamin Dormoros
  Die Versionsnummer kommt aus index.html (APP_VERSION) über die Adresse: ./sw.js?v=0.3
  Neue Version in index.html  ->  neue sw.js-Adresse  ->  Browser installiert diesen Worker neu,
  legt einen neuen Cache an und löscht beim Aktivieren alle alten Caches dieser App.
  Zwischengespeichert werden NUR die App-Dateien unten. Keine Fotos, keine Kamera-Daten.
*/
'use strict';
const VERSION = new URL(self.location.href).searchParams.get('v') || 'ohne-version';
const PREFIX = 'zeichenhilfe-';
const CACHE = PREFIX + VERSION;
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];
// Absolute Adressen der App-Dateien (für den Abgleich in fetch)
const APP_URLS = new Set(APP_FILES.map(f => new URL(f, self.registration.scope).href));
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // "reload" umgeht den HTTP-Cache des Browsers, damit wirklich die aktuelle Fassung gespeichert wird
    await cache.addAll(APP_FILES.map(f => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  url.search = ''; url.hash = '';
  const isPage = req.mode === 'navigate' || url.href === INDEX_URL;

  if (isPage){
    // Seite: zuerst Netz (ohne veralteten HTTP-Cache), sonst gespeicherte Fassung
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-cache' });
        if (fresh && fresh.ok && fresh.type === 'basic'){
          const cache = await caches.open(CACHE);
          await cache.put(INDEX_URL, fresh.clone());
        }
        return fresh;
      } catch(e){
        const cache = await caches.open(CACHE);
        return (await cache.match(INDEX_URL)) || (await cache.match(new URL('./', self.registration.scope).href)) ||
               new Response('Offline und keine gespeicherte Fassung vorhanden.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  if (APP_URLS.has(url.href)){
    // Manifest und Symbole: aus dem Speicher, sonst Netz
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(url.href)) || fetch(req);
    })());
  }
  // Alles andere (z. B. Fotos als blob:, Kamera) läuft am Service Worker vorbei und wird nicht gespeichert.
});
