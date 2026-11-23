// main.js — каркас приложения: разделы и вкладки, глобальные переключатели, общий «стоп», пробел, маршрутизация по #хэшу.
import { settings, setSetting, onSettings, on } from './state.js';
import * as audio from './audio.js';
import { transport, stopAll, cancelSequences } from './player.js';
import { storageAvailable, load, save } from './storage.js';
import { seg, bind, toast, pcName } from './ui.js';
import { TUNINGS } from './music.js';
import { initPwa, pwaSettingsHTML, promptInstall } from './pwa.js';
import { backupSettingsHTML, backupActs } from './backupui.js';
import { page as chromatic } from './pages/chromatic.js';
import { page as chords } from './pages/chords.js';
import { page as fifths } from './pages/fifths.js';
import { page as penta } from './pages/penta.js';
import { page as modes } from './pages/modes.js';
import { page as sevenths } from './pages/sevenths.js';
import { page as tuner } from './pages/tuner.js';
import { page as metronome, toggleMetronome } from './pages/metronome.js';
import { debugLog as tunerLog } from './tuner.js';
import { page as backing } from './pages/backing.js';
import { page as riffs } from './pages/riffs.js';
import { page as rhythm } from './pages/rhythm.js';
import { page as ear, debugListen as earListen, debugTask as earTask } from './pages/ear.js';
import { page as plan } from './pages/plan.js';

const PAGES = [chromatic, chords, fifths, penta, modes, sevenths, tuner, metronome, backing, riffs, rhythm, ear, plan];
const SECTIONS = [['theory', 'Теория'], ['practice', 'Практика']];
let current = null;
const $ = id => document.getElementById(id);

// ---------- звук: создаём контекст в первом жесте пользователя ----------
['pointerdown', 'touchend', 'click', 'keydown'].forEach(evt =>
  document.addEventListener(evt, () => { try { audio.ensure(); } catch (e) { console.warn(e); } }, { capture: true, passive: true }));
audio.loadSamples();
on('audio-status', renderSnd);
function renderSnd() {
  const s = audio.getStatus();
  $('snd').textContent = s === 'loading' ? '⏳ звук…' : s === 'error' ? '⚠ синтез' : s === 'unsupported' ? '🔇 без звука' : '';
  $('snd').title = s === 'error' ? 'Сэмплы гитары не загрузились, играет синтез' : s === 'unsupported' ? 'Этот браузер не поддерживает Web Audio — теория и квизы работают, звука нет' : '';
}

// ---------- навигация ----------
function renderNav() {
  const sec = current.section;
  $('sections').innerHTML = seg('section', SECTIONS, sec, 'wide');
  $('tabs').innerHTML = PAGES.filter(p => p.section === sec)
    .map(p => `<button type="button" data-id="${p.id}" class="${p === current ? 'on' : ''}">${p.title}</button>`).join('');
  const on = $('tabs').querySelector('.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function go(id) {
  const p = PAGES.find(x => x.id === id) || PAGES[0];
  if (current === p) return;
  if (current) { try { cancelSequences(); } catch (e) { console.error(e); } }
  if (current && current.unmount) { try { current.unmount(); } catch (e) { console.error(e); } }
  current = p;
  save('tab', p.id);
  const root = $('page');
  root.innerHTML = '';
  const host = document.createElement('div');
  host.className = 'pg pg-' + p.id;
  root.appendChild(host);
  try { p.mount(host); } catch (e) { console.error(e); host.innerHTML = `<div class="card warn">Ошибка вкладки: ${e.message}</div>`; }
  renderNav();
  try { if (location.hash !== '#' + p.id) location.hash = p.id; } catch (e) { /* песочница */ }
  window.scrollTo(0, 0);
}
$('sections').addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const first = PAGES.find(p => p.section === b.dataset.v);
  const last = load('tab-' + b.dataset.v, null);
  go(last && PAGES.some(p => p.id === last && p.section === b.dataset.v) ? last : first.id);
});
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) { go(b.dataset.id); save('tab-' + current.section, current.id); }
});
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && PAGES.some(p => p.id === id)) go(id); });

// ---------- глобальные переключатели ----------
const QUICK = [
  ['tuning', () => TUNINGS[settings.tuning].name, () => (settings.tuning === 'std' ? 'dropd' : 'std')],
  ['tone', () => (settings.tone === 'clean' ? 'Чистый' : 'Перегруз'), () => (settings.tone === 'clean' ? 'dist' : 'clean')],
  ['german', () => (settings.german ? '… A H' : '… A B'), () => !settings.german],
  ['labels', () => (settings.labels === 'notes' ? 'Ноты' : 'Ступени'), () => (settings.labels === 'notes' ? 'degrees' : 'notes')],
  ['orient', () => ({ auto: 'Гриф: авто', h: 'Гриф ↔', v: 'Гриф ↕' }[settings.orient]), () => ({ auto: 'h', h: 'v', v: 'auto' }[settings.orient])],
];
function renderStatus() {
  $('statusline').innerHTML = QUICK.map(([k, label]) => `<button type="button" data-q="${k}">${label()}</button>`).join('');
}
$('statusline').addEventListener('click', e => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  const q = QUICK.find(x => x[0] === b.dataset.q);
  setSetting(q[0], q[2]());
});
function renderSettings() {
  const tun = TUNINGS[settings.tuning].midi;
  $('settings').innerHTML = `<div class="setgrid">
    <div class="setrow"><b>Строй</b>${seg('tuning', [['std', 'Standard E'], ['dropd', 'Drop D']], settings.tuning)}</div>
    <div class="setrow"><b>Звук</b>${seg('tone', [['clean', 'Чистый'], ['dist', 'Перегруз']], settings.tone)}</div>
    <div class="setrow"><b>Нотация</b>${seg('german', [['0', '… A B (си = B)'], ['1', '… A H (си = H)']], settings.german ? '1' : '0')}</div>
    <div class="setrow"><b>Подписи</b>${seg('labels', [['notes', 'Ноты'], ['degrees', 'Ступени']], settings.labels)}</div>
    <div class="setrow"><b>Гриф</b>${seg('orient', [['auto', 'Авто'], ['h', 'Горизонт.'], ['v', 'Вертик.']], settings.orient)}</div>
    <div class="setrow"><b>Громкость</b><input type="range" id="vol" min="0" max="1" step="0.01" value="${settings.volume}" style="flex:1;min-width:140px" aria-label="Громкость"></div>
    <div class="setrow" style="grid-column:1/-1"><b>Эталон струн</b>${tun.map((m, i) => `<button type="button" class="chip" data-act="ref" data-m="${m}">${6 - i}: ${pcName(m % 12)}</button>`).join('')}</div>
    ${pwaSettingsHTML()}
    ${backupSettingsHTML()}
    <div class="note" style="grid-column:1/-1">
      <b>Настройка гитары:</b> тюнер с микрофоном — вкладка «Практика → Тюнер». Кнопки «Эталон струн» дают ноты
      открытых струн, чтобы проверить строй на слух.<br>
      <b>Нет звука на телефоне?</b> Прибавь громкость медиа (не звонка); на iPhone ещё выключи беззвучный режим переключателем на корпусе.<br>
      ${storageAvailable() ? 'Настройки, рекорды и риффы сохраняются на этом устройстве.' : '<span class="warn">Хранилище браузера недоступно: настройки и риффы живут до перезагрузки страницы.</span>'}
    </div>
    <div class="note" style="grid-column:1/-1">Звук гитары и баса — сэмплы проекта tonejs-instruments (Nicholaus Brosowsky, Makefully Studios),
      лицензия <a href="https://creativecommons.org/licenses/by/3.0/deed.ru" target="_blank" rel="noopener">CC BY 3.0</a>; сэмплы баса укорочены.
      Шрифты Unbounded и Inter — SIL OFL 1.1.</div></div>`;
}
bind($('settings'), {
  seg: {
    tuning: v => setSetting('tuning', v), tone: v => setSetting('tone', v), german: v => setSetting('german', v === '1'),
    labels: v => setSetting('labels', v), orient: v => setSetting('orient', v),
  },
  act: { ref: b => audio.userPlay([+b.dataset.m]), install: () => promptInstall(), ...backupActs(() => renderSettings()) },
});
// статус приложения меняется сам (кэш готов, пришло предложение установки) — обновляем только его строку,
// чтобы остальные настройки не перерисовывались под пальцем
on('pwa', () => { const r = $('pwa-row'); if (r && !$('settings').hidden) r.outerHTML = pwaSettingsHTML(); });
$('settings').addEventListener('input', e => { if (e.target.id === 'vol') setSetting('volume', +e.target.value); });
$('gear').addEventListener('click', () => {
  const s = $('settings');
  s.hidden = !s.hidden;
  $('gear').setAttribute('aria-expanded', String(!s.hidden));
  if (!s.hidden) renderSettings();
});
onSettings(k => {
  renderStatus();
  if (!$('settings').hidden && k !== 'volume') renderSettings();
  if (k === 'tuning') toast(settings.tuning === 'dropd' ? 'Drop D: 6-я струна опущена до ре' : 'Standard E');
  if (current && current.onSettings && k !== 'volume') { try { current.onSettings(k); } catch (e) { console.error(e); } }
});
let lastVert = window.innerWidth < 640;
window.addEventListener('resize', () => {
  const v = window.innerWidth < 640;
  if (v !== lastVert && settings.orient === 'auto') { lastVert = v; if (current && current.onSettings) current.onSettings('orient'); }
  lastVert = v;
});

// ---------- общий «стоп» ----------
function renderStop() {
  const running = transport.running || audio.droneOn();
  $('stopAll').hidden = !running;
  $('stopName').textContent = transport.running ? (transport.name || 'стоп') : audio.droneOn() ? 'бурдон' : 'стоп';
}
on('transport', renderStop);
on('drone', renderStop);
$('stopAll').addEventListener('click', () => { stopAll(); renderStop(); });

// ---------- пробел: старт/стоп (на тесте ритма — удар) ----------
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' && e.key !== ' ') return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (e.repeat) { e.preventDefault(); return; }
  e.preventDefault();
  if (t && t.tagName === 'BUTTON') t.blur();
  audio.ensure();
  if (current && current.onSpace && current.onSpace(e)) return;
  if (transport.running) stopAll(); else toggleMetronome();
});

// отладка автотестов: только при ?debug в адресе (в артефакте не используется)
try { if (/[?&]debug\b/.test(location.search)) window.__gk = { audio, transport, settings, setSetting, tunerLog, earListen, earTask }; } catch (e) { }
renderStatus();
renderSnd();
renderStop();
initPwa();
const start = (location.hash || '').slice(1);
go(PAGES.some(p => p.id === start) ? start : load('tab', 'chromatic'));
