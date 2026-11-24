// storage.js — localStorage с try/catch. Если хранилище недоступно (песочница, file://, приватный режим),
// данные живут в памяти до перезагрузки, а приложение работает как обычно.
const PREFIX = 'gk3.';
const mem = new Map();
let ok = false;
try {
  const k = PREFIX + '__probe';
  window.localStorage.setItem(k, '1');
  window.localStorage.removeItem(k);
  ok = true;
} catch (e) { ok = false; }

export const storageAvailable = () => ok;

export function load(key, def) {
  try {
    if (ok) {
      const v = window.localStorage.getItem(PREFIX + key);
      if (v != null) return JSON.parse(v);
    } else if (mem.has(key)) {
      return JSON.parse(mem.get(key));
    }
  } catch (e) { /* повреждённые данные — берём значение по умолчанию */ }
  return def;
}

export function save(key, val) {
  const s = JSON.stringify(val);
  try {
    if (ok) { window.localStorage.setItem(PREFIX + key, s); return; }
  } catch (e) { /* переполнено или запрещено */ }
  mem.set(key, s);
}

export function remove(key) {
  try { if (ok) window.localStorage.removeItem(PREFIX + key); } catch (e) { /* запрещено */ }
  mem.delete(key);
}

// Все ключи приложения (без префикса)
function keys() {
  const out = new Set(mem.keys());
  try {
    if (ok) for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out.add(k.slice(PREFIX.length));
    }
  } catch (e) { /* запрещено */ }
  return [...out];
}

// Все данные приложения одним объектом — для резервной копии
export function exportAll(skip = []) {
  const out = {};
  for (const k of keys()) if (!skip.includes(k) && !k.startsWith('__probe')) { const v = load(k, undefined); if (v !== undefined) out[k] = v; }
  return out;
}

// Заменить все данные приложения (восстановление из копии). Ключи из keep не трогаем.
export function replaceAll(data, keep = []) {
  for (const k of keys()) if (!keep.includes(k)) remove(k);
  for (const [k, v] of Object.entries(data || {})) save(k, v);
}
