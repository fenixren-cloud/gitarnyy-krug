// backup.js — резервная копия всех данных (настройки, риффы, рекорды, история теста ритма, план, квизы)
// одним JSON-файлом: перенос телефон ↔ ноутбук и защита от потери. Чистая логика без DOM и хранилища,
// тестируется в Node (tests/backup.test.mjs).

export const BACKUP_APP = 'gitarnyy-krug';
export const BACKUP_FORMAT = 1;
export const UNDO_KEY = '__undo'; // «как было до восстановления» — в копии не сохраняется
const KEY_RE = /^[A-Za-z0-9_.-]{1,48}$/;

export function makeBackup(data, now = new Date()) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) if (k !== UNDO_KEY && KEY_RE.test(k) && v !== undefined) out[k] = v;
  return { app: BACKUP_APP, format: BACKUP_FORMAT, created: now.toISOString(), data: out };
}

const pad = n => String(n).padStart(2, '0');
export const backupFileName = (now = new Date()) => `gitarnyy-krug-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;

// Разбор файла: { ok: true, backup, summary } или { ok: false, error } — ошибка понятными словами
export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return { ok: false, error: 'Это не файл резервной копии: внутри не JSON.' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'Это не файл резервной копии.' };
  if (obj.app !== BACKUP_APP) return { ok: false, error: 'Это файл не от «Гитарного круга».' };
  if (!Number.isInteger(obj.format) || obj.format < 1) return { ok: false, error: 'Файл повреждён: нет версии формата.' };
  if (obj.format > BACKUP_FORMAT) return { ok: false, error: 'Копия сделана более новой версией приложения — сначала обнови приложение.' };
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) return { ok: false, error: 'Файл повреждён: нет данных.' };
  const bad = Object.keys(obj.data).filter(k => !KEY_RE.test(k) || k === UNDO_KEY);
  if (bad.length) return { ok: false, error: 'Файл повреждён: непонятные записи.' };
  const created = typeof obj.created === 'string' && !Number.isNaN(Date.parse(obj.created)) ? obj.created : null;
  const backup = { app: BACKUP_APP, format: obj.format, created, data: obj.data };
  return { ok: true, backup, summary: summarize(obj.data) };
}

export function summarize(data) {
  const d = data || {};
  const arr = v => (Array.isArray(v) ? v : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    riffs: arr(d.riffs).length,
    records: Object.values(obj(d.records)).filter(r => r && r.best).length,
    rhythmTests: arr(d.rhythmHist).length,
    planDays: Object.values(obj(d.plan)).filter(Boolean).length,
    entries: Object.keys(d).length,
  };
}

const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
export function describeSummary(s) {
  return [
    `${s.riffs} ${plural(s.riffs, 'рифф', 'риффа', 'риффов')}`,
    `${s.records} ${plural(s.records, 'рекорд', 'рекорда', 'рекордов')} упражнений`,
    `${s.rhythmTests} ${plural(s.rhythmTests, 'тест', 'теста', 'тестов')} ритма`,
    `${s.planDays} ${plural(s.planDays, 'день', 'дня', 'дней')} плана`,
  ].join(' · ');
}
