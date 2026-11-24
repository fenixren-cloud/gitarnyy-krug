// state.js — глобальные настройки (строй, звук, нотация, подписи, ориентация грифа) и шина событий.
import { load, save } from './storage.js';
import { TUNINGS } from './music.js';

const DEFAULTS = { tuning: 'std', tone: 'clean', german: false, labels: 'notes', orient: 'auto', volume: 0.85 };
export const settings = Object.assign({}, DEFAULTS, load('settings', {}));
if (!TUNINGS[settings.tuning]) settings.tuning = 'std';

const subs = new Set();
export function setSetting(key, val) {
  if (settings[key] === val) return;
  settings[key] = val;
  save('settings', settings);
  subs.forEach(f => { try { f(key, val); } catch (e) { console.error(e); } });
}
export const onSettings = f => { subs.add(f); return () => subs.delete(f); };

export const tuning = () => TUNINGS[settings.tuning].midi;
export const isVertical = () => settings.orient === 'v' || (settings.orient === 'auto' && window.innerWidth < 640);

// Простая шина событий приложения
const bus = new Map();
export function on(evt, f) {
  if (!bus.has(evt)) bus.set(evt, new Set());
  bus.get(evt).add(f);
  return () => bus.get(evt).delete(f);
}
export function emit(evt, data) {
  const s = bus.get(evt);
  if (s) s.forEach(f => { try { f(data); } catch (e) { console.error(e); } });
}
