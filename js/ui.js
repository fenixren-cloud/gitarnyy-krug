// ui.js — общие помощники интерфейса: цвета ступеней, подписи нот, переключатели, тосты, делегирование кликов.
import { settings } from './state.js';
import { noteName, ruName, degreeFamily, spellPc } from './music.js';

// Единая цветовая система: 1 — оранжевый, терция — фиолетовый, квинта — голубой, септима — красный,
// характерная нота лада — лаймовый. Остальные ступени — светло-серые.
export const COLORS = {
  root: '#f5a524', third: '#9d8cff', fifth: '#38bdf8', seventh: '#f43f5e', other: '#d3d9e6', char: '#a3e635',
  long: '#e05bbf', short: '#2dd4bf', sharp: '#38bdf8', flat: '#e05bbf', dark: '#0b0e14',
};
export const QUALITY_COLOR = {
  power: '#e8ecf3', maj: COLORS.root, min: COLORS.third, sus: '#2dd4bf', dim: COLORS.seventh, aug: COLORS.fifth,
  maj7: COLORS.root, dom7: COLORS.seventh, m7: COLORS.third, m7b5: '#fb7185', dim7: '#e05bbf', mmaj7: COLORS.third, maj7s5: COLORS.fifth,
};
export const famColor = fam => COLORS[fam] || COLORS.other;
export const degColor = (deg, isChar = false) => (isChar ? COLORS.char : famColor(degreeFamily(deg)));
export const nm = n => noteName(n, settings.german);
export const ru = (n, long = false) => ruName(n, long);
export const pcName = (pc, flat = false) => nm(spellPc(pc, flat));
// Подпись на грифе: нота или ступень (глобальный переключатель)
export const lbl = (spelled, deg) => (settings.labels === 'degrees' && deg ? deg : nm(spelled));
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function seg(name, opts, val, cls = '') {
  return `<div class="seg ${cls}" data-seg="${name}">${opts.map(([v, t]) =>
    `<button type="button" data-v="${v}" class="${String(v) === String(val) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
}
export function chips(name, opts, val, cls = '') {
  return `<div class="chips ${cls}" data-seg="${name}">${opts.map(([v, t, c]) =>
    `<button type="button" data-v="${v}" class="chip ${c || ''} ${String(v) === String(val) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
}
// 12 нот для выбора тоники
export function noteChips(name, val, flatSet = [3, 10]) {
  return chips(name, Array.from({ length: 12 }, (_, pc) => [pc, pcName(pc, flatSet.includes(pc))]), val, 'notes12');
}
export const pill = (text, color = COLORS.root) => `<span class="pill" style="--c:${color}">${text}</span>`;
export function info(html, color = COLORS.root) { return `<div class="info" style="--c:${color}">${html}</div>`; }

// Один обработчик кликов на корень страницы: data-act="имя" и переключатели data-seg
export function bind(root, { act = {}, seg: segs = {} } = {}) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act], [data-seg] [data-v]');
    if (!b || !root.contains(b)) return;
    if (b.dataset.act) { const f = act[b.dataset.act]; if (f) f(b, e); return; }
    const sg = b.closest('[data-seg]');
    const f = segs[sg.dataset.seg];
    if (f) {
      sg.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x === b));
      f(b.dataset.v, b, e);
    }
  });
}
let toastTimer = null;
export function toast(msg, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
// Копирование текста (только из обработчика клика); запасной вариант — выделенное поле
export async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast('Скопировано'); return true; } catch (e) {
    if (fallbackEl) { fallbackEl.value = text; fallbackEl.hidden = false; fallbackEl.focus(); fallbackEl.select(); }
    toast('Буфер обмена недоступен: выдели текст в поле и скопируй вручную');
    return false;
  }
}
// Местные дата и время «ГГГГ-ММ-ДД ЧЧ:ММ» (toISOString дал бы UTC: в Австрии на час раньше, после полуночи — вчера)
export function localStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fmt = (n, d = 0) => Number(n).toFixed(d).replace('.', ',');
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
