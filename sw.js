// sw.js — «Гитарный круг» переехал в «Лад». Этот service worker заменяет старый офлайн-кэш: ставится сразу,
// удаляет кэш старого приложения, снимает себя и перезагружает открытые окна — они попадут на страницу
// переадресации. Данные в хранилище браузера (риффы, рекорды) не трогаются: «Лад» предложит их перенести.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('gk-')) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
