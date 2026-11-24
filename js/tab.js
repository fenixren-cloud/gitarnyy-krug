// tab.js — табулатура: SVG для аппликатур и позиций, текстовый таб для копирования и разбор вставленного таба.
// Строки таба сверху вниз: 1-я струна (e) … 6-я (E/D). Внутри данных индекс 0 = 6-я струна.
import { COLORS } from './ui.js';

export const tabNames = (tuningMidi, pcName) => tuningMidi.map((m, i) => (i === 5 ? pcName(m % 12).toLowerCase() : pcName(m % 12)));

// cols: [{ frets: [6] (null = пусто), colors?: [6], top?: 'PM' | '>' }]
export function tabSVG(cols, { names, colW = 26, lineH = 17, cursor = -1, label = true } = {}) {
  const L = label ? 18 : 6, W = L + cols.length * colW + 10, top = 14, H = top + lineH * 5 + 12;
  let s = `<svg class="tab-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let r = 0; r < 6; r++) {
    const y = top + r * lineH, si = 5 - r;
    s += `<line x1="${L}" y1="${y}" x2="${W - 4}" y2="${y}" stroke="#3a4357" stroke-width="1"/>`;
    if (label) s += `<text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#7c869a">${names ? names[si] : ''}</text>`;
  }
  s += `<line x1="${L}" y1="${top}" x2="${L}" y2="${top + lineH * 5}" stroke="#596278" stroke-width="2"/><line x1="${W - 4}" y1="${top}" x2="${W - 4}" y2="${top + lineH * 5}" stroke="#596278" stroke-width="2"/>`;
  cols.forEach((c, i) => {
    const x = L + 8 + i * colW + colW / 2 - 4;
    if (i === cursor) s += `<rect x="${x - colW / 2 + 2}" y="${top - 10}" width="${colW - 4}" height="${lineH * 5 + 20}" rx="6" fill="#ffffff" fill-opacity=".09"/>`;
    if (c.top) s += `<text x="${x}" y="${top - 5}" text-anchor="middle" font-size="9" font-weight="800" fill="#e8ecf3">${c.top}</text>`;
    c.frets.forEach((f, si) => {
      if (f == null) return;
      const y = top + (5 - si) * lineH, t = String(f), w = t.length > 1 ? 18 : 12;
      const col = (c.colors && c.colors[si]) || '#e8ecf3';
      s += `<rect x="${x - w / 2}" y="${y - 7.5}" width="${w}" height="15" rx="4" fill="#0f131c"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="12.5" font-weight="800" fill="${col}">${t}</text>`;
    });
  });
  return s + '</svg>';
}

// Текстовый таб из колонок (для аппликатур и позиций)
export function tabText(cols, names) {
  const lines = [];
  for (let r = 0; r < 6; r++) {
    const si = 5 - r;
    let line = (names[si] + ' ').slice(0, 2).replace(' ', '') + '|-';
    for (const c of cols) { const f = c.frets[si]; const t = f == null ? '' : String(f); line += (t + '---').slice(0, 3); }
    lines.push(line + '|');
  }
  return lines.join('\n');
}

// ---------- Риффы: сетка шестнадцатых ----------
// riff = { name, tuning, bpm, bars, notes: [{ c, s, f, len }], pm: [c], acc: [c] }; f может быть 'x' (глушёная нота)
export function riffToText(riff, names) {
  const cols = riff.bars * 16;
  const cell = t => (t + '---').slice(0, 3);
  const pm = new Set(riff.pm || []), acc = new Set(riff.acc || []);
  let meta = 'M |';
  for (let c = 0; c < cols; c++) { meta += cell((pm.has(c) ? 'P' : '') + (acc.has(c) ? '>' : '')).replace(/-/g, ' '); if (c % 16 === 15) meta += '|'; }
  const out = [`// ${riff.name} · ${riff.tuning === 'dropd' ? 'Drop D' : 'Standard E'} · ${riff.bpm} BPM · 4/4 · 1 ячейка = 1/16`, meta];
  for (let r = 0; r < 6; r++) {
    const si = 5 - r;
    let line = (names[si] + '  ').slice(0, 2) + '|';
    for (let c = 0; c < cols; c++) {
      const n = riff.notes.find(x => x.c === c && x.s === si);
      line += n ? cell(String(n.f)) : '---';
      if (c % 16 === 15) line += '|';
    }
    out.push(line);
  }
  return out.join('\n');
}

// Разбор вставленного текстового таба: 6 строк «x|…», ширина ячейки определяется по шагу между нотами
export function parseTab(text) {
  const raw = String(text || '').split(/\r?\n/);
  const strLines = raw.filter(l => /^\s*[A-Ga-gHh][#b♯♭]?\s*\|/.test(l));
  if (strLines.length < 6) return null;
  const six = strLines.slice(0, 6);
  const metaLine = raw.find(l => /^\s*M\s*\|/.test(l)) || '';
  const body = six.map(l => l.replace(/^\s*[A-Ga-gHh][#b♯♭]?\s*\|/, ''));
  const metaBody = metaLine.replace(/^\s*M\s*\|/, '');
  const events = [];
  body.forEach((line, r) => {
    const si = 5 - r;
    let pos = 0;
    const clean = line.replace(/\|/g, '');
    while (pos < clean.length) {
      const m = clean.slice(pos).match(/^(\d{1,2}|x)/i);
      if (m) { events.push({ pos, s: si, f: m[1].toLowerCase() === 'x' ? 'x' : Math.min(24, parseInt(m[1], 10)) }); pos += m[1].length; } else pos++;
    }
  });
  if (!events.length) return null;
  const ps = [...new Set(events.map(e => e.pos))].sort((a, b) => a - b);
  const gaps = {};
  for (let i = 1; i < ps.length; i++) { const d = ps[i] - ps[i - 1]; if (d > 0) gaps[d] = (gaps[d] || 0) + 1; }
  const own = /1 ячейка = 1\/16/.test(text);
  let unit = own ? 3 : Number(Object.entries(gaps).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 1);
  if (!own && unit < 2) unit = 2;
  const notes = events.map(e => ({ c: Math.round(e.pos / unit), s: e.s, f: e.f, len: 1 }));
  const maxC = Math.max(...notes.map(n => n.c));
  const bars = Math.min(4, Math.max(1, Math.ceil((maxC + 1) / 16)));
  const kept = notes.filter(n => n.c < bars * 16);
  const pm = [], acc = [];
  if (metaBody) {
    const mb = metaBody.replace(/\|/g, '');
    for (let c = 0; c < bars * 16; c++) { const cellT = mb.slice(c * unit, c * unit + unit); if (/P/.test(cellT)) pm.push(c); if (/>/.test(cellT)) acc.push(c); }
  }
  // длительность: до следующей ноты на той же струне (не больше 8), у PM — 1
  kept.forEach(n => {
    const next = kept.filter(x => x.s === n.s && x.c > n.c).map(x => x.c);
    const gap = next.length ? Math.min(...next) - n.c : bars * 16 - n.c;
    n.len = pm.includes(n.c) || n.f === 'x' ? 1 : Math.max(1, Math.min(8, gap));
  });
  const tm = text.match(/(\d{2,3})\s*BPM/i);
  return { notes: kept, pm, acc, bars, bpm: tm ? +tm[1] : null, tuning: /drop\s*d/i.test(text) || /^\s*D\s*\|/m.test(six[5] || '') ? 'dropd' : null };
}

export const degreeTabColors = (frets, colorOf) => frets.map((f, s) => (f == null ? null : colorOf(s, f) || COLORS.other));
