// sw.js — офлайн-режим. При установке кладёт все файлы приложения (код, шрифты, сэмплы ~2,6 МБ) в кэш,
// дальше отдаёт их из кэша — приложение работает без интернета. Список файлов и версия — в sw-manifest.js
// (его собирает build/precache.mjs). Новая версия не включается сама: страница показывает
// «Доступна новая версия → Обновить», и обновление происходит по нажатию.
importScripts('sw-manifest.js'); // self.__PRECACHE = { version, files }

const { version: VERSION, files: FILES } = self.__PRECACHE;
const CACHE = 'gk-' + VERSION;

self.addEventListener('install', event => {
  // cache: 'reload' — мимо HTTP-кэша браузера, чтобы в новую версию не попали старые файлы
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('gk-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'version' && event.ports[0]) event.ports[0].postMessage(VERSION);
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // любая страница приложения (в том числе с ?debug и #вкладкой) — это index.html
    event.respondWith(caches.match('index.html', { cacheName: CACHE }).then(r => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then(r => r || fetch(req)));
});
