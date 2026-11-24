// pwa.js — приложение на телефоне: офлайн-режим (service worker), установка на главный экран,
// плашка «Доступна новая версия → Обновить», защита сохранённых данных от автоочистки браузера.
// В офлайн-файле (file://) service worker не регистрируется: там всё и так внутри одного файла.
import { emit } from './state.js';
import { toast } from './ui.js';

export const pwa = {
  file: false,         // открыт офлайн-файл guitar-app.html
  supported: false,    // service worker доступен (https или localhost)
  offlineReady: false, // все файлы в кэше — можно без интернета
  version: null,       // версия кэша (хэш файлов)
  updateReady: false,  // скачана новая версия, ждёт нажатия «Обновить»
  canInstall: false,   // Chrome прислал предложение установки
  installed: false,    // открыто как установленное приложение
  persisted: null,     // данные защищены от автоочистки
  ios: false,
};
let reg = null, deferred = null, reloading = false;
const changed = () => emit('pwa', pwa);

export function initPwa() {
  try {
    pwa.file = location.protocol === 'file:';
    pwa.installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    pwa.ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch (e) { /* старый браузер */ }
  // Android: Chrome сам показывает предложение установки; событие сохраняем и для своей кнопки в настройках
  window.addEventListener('beforeinstallprompt', e => { deferred = e; pwa.canInstall = true; changed(); });
  window.addEventListener('appinstalled', () => { deferred = null; pwa.canInstall = false; pwa.installed = true; changed(); toast('Приложение установлено — ищи значок на главном экране'); });

  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (pwa.file || !secure || !('serviceWorker' in navigator)) return;
  pwa.supported = true;
  const sw = navigator.serviceWorker;
  sw.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
  sw.register('sw.js', { updateViaCache: 'none' }).then(r => {
    reg = r;
    if (r.waiting && sw.controller) showUpdate();
    const track = w => {
      if (!w) return;
      // Обновление это или первая установка — решаем сейчас, а не в момент события: на медленном телефоне
      // первая установка успевает взять страницу под управление раньше, чем придёт «installed»,
      // и без этого при первом же открытии появлялась ложная плашка «Доступна новая версия».
      const isUpdate = !!sw.controller;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && isUpdate) showUpdate();
        if (w.state === 'activated' && !pwa.offlineReady) { pwa.offlineReady = true; askVersion(); changed(); }
      });
    };
    track(r.installing); // первая установка могла начаться до подписки на updatefound
    r.addEventListener('updatefound', () => track(r.installing));
    if (r.active) { pwa.offlineReady = true; askVersion(); }
    changed();
    // вернулся в приложение — проверим, нет ли новой версии
    document.addEventListener('visibilitychange', () => { if (!document.hidden) r.update().catch(() => { }); });
  }).catch(e => console.warn('service worker:', e && e.message));
  protectData();
}

function askVersion() {
  const w = (reg && reg.active) || navigator.serviceWorker.controller;
  if (!w) return;
  const ch = new MessageChannel();
  ch.port1.onmessage = e => { pwa.version = e.data; changed(); };
  w.postMessage('version', [ch.port2]);
}

// Просим браузер не стирать настройки, рекорды и риффы при нехватке места.
// Chrome соглашается молча, если приложение установлено или им часто пользуются.
async function protectData() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    pwa.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    changed();
  } catch (e) { /* не поддерживается */ }
}

// ---------- новая версия ----------
function showUpdate() {
  pwa.updateReady = true;
  changed();
  let el = document.getElementById('update');
  if (!el) { el = document.createElement('div'); el.id = 'update'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = '<span>Доступна новая версия</span><button type="button" class="btn sm" id="update-go">Обновить</button>'
    + '<button type="button" class="iconbtn" id="update-x" aria-label="Позже">✕</button>';
  el.querySelector('#update-go').addEventListener('click', applyUpdate);
  el.querySelector('#update-x').addEventListener('click', () => el.remove());
}
export function applyUpdate() {
  if (!reg || !reg.waiting) { location.reload(); return; }
  reloading = true;
  reg.waiting.postMessage('skipWaiting'); // новый service worker включится → controllerchange → перезагрузка
}

// ---------- установка ----------
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; pwa.canInstall = false;
  try {
    e.prompt();
    const choice = await e.userChoice;
    changed();
    return choice && choice.outcome === 'accepted';
  } catch (err) {
    changed();
    toast('Не получилось: открой меню Chrome ⋮ → «Установить приложение»');
    return false;
  }
}

// Строка «Приложение» в настройках ⚙
export function pwaSettingsHTML() {
  if (pwa.file) {
    return row('Это офлайн-файл: работает без интернета и без установки, но сам не обновляется. Установить на телефон можно с сайта приложения.');
  }
  let install;
  if (pwa.installed) install = 'Установлено на этом устройстве ✓';
  else if (pwa.canInstall) install = '<button type="button" class="btn sm" data-act="install">📲 Установить на главный экран</button>';
  else if (pwa.ios) install = 'iPhone: Safari → «Поделиться» → «На экран „Домой“».';
  else install = 'Установить: меню Chrome ⋮ → «Установить приложение» (или «Добавить на главный экран»).';
  // Все три строки есть сразу (с «проверяю…»), чтобы панель не прыгала, когда статус приходит позже
  const off = !pwa.supported ? 'Офлайн-режим доступен, когда приложение открыто с сайта (https).'
    : pwa.offlineReady ? `Работает без интернета ✓ · версия ${pwa.version || '…'}`
      : 'Готовлю офлайн-режим: скачиваю файлы (~2,4 МБ)…';
  const pers = pwa.persisted == null ? 'Защита данных от автоочистки: проверяю…'
    : pwa.persisted ? 'Настройки, рекорды и риффы защищены от автоочистки браузера ✓'
      : 'Браузер может стереть данные при нехватке места. После установки на главный экран Chrome обычно их защищает.';
  return row(`<div>${install}</div><div class="note">${off}</div><div class="note">${pers}</div>`);
}
const row = html => `<div class="setrow" id="pwa-row" style="grid-column:1/-1"><b>Приложение</b><div style="flex:1;min-width:200px">${html}</div></div>`;
