// common.js — общие помощники вкладок: аппликатуры на грифе, таб аккорда, ноты аккорда по всему грифу.
import { settings, tuning } from '../state.js';
import { mod12, CHORDS, chordDegrees, spellChord, placeShape, shapesFor, MAX_FRET, STRING_NUM } from '../music.js';
import { COLORS, QUALITY_COLOR, degColor, nm, pcName } from '../ui.js';
import { tabSVG, tabNames, tabText } from '../tab.js';

// Ступень ноты в аккорде (по полутонам от корня)
export function chordDegreeOf(pc, rootPc, type) {
  const c = CHORDS[type], i = c.iv.findIndex(st => mod12(st) === mod12(pc - rootPc));
  return i < 0 ? null : chordDegrees(type)[i];
}
const LPC = [0, 2, 4, 5, 7, 9, 11];
export const pcOfSp = n => mod12(LPC[n.l] + n.a);

// Маркеры: все ноты аккорда на грифе (бледные) + выбранная аппликатура (яркие)
export function chordMarkers(rootSp, type, frets, { all = true } = {}) {
  const tun = tuning(), rootPc = pcOfSp(rootSp);
  const spelled = spellChord(rootSp, type);
  const byPc = {}; spelled.forEach(n => { byPc[pcOfSp(n)] = n; });
  const degs = chordDegrees(type);
  const label = pc => { const i = CHORDS[type].iv.findIndex(st => mod12(rootPc + st) === pc); return settings.labels === 'degrees' ? degs[i] : nm(byPc[pc]); };
  const color = pc => degColor(chordDegreeOf(pc, rootPc, type));
  const markers = [];
  const inV = (s, f) => frets && frets[s] === f;
  if (all) for (let s = 0; s < 6; s++) for (let f = 0; f <= MAX_FRET; f++) {
    const pc = mod12(tun[s] + f);
    if (byPc[pc] && !inV(s, f)) markers.push({ s, f, text: label(pc), color: color(pc), kind: 'dim', small: false });
  }
  if (frets) frets.forEach((f, s) => {
    if (f == null) { markers.push({ s, f: 0, text: '×', kind: 'ghost' }); return; }
    const pc = mod12(tun[s] + f);
    markers.push({ s, f, text: label(pc), color: color(pc), glow: true });
  });
  return markers;
}
export function voicingNotes(frets) {
  const tun = tuning();
  return frets.map((f, s) => (f == null ? null : { midi: tun[s] + f, string: s })).filter(Boolean);
}
export function chordTabHTML(rootSp, type, frets) {
  const tun = tuning(), rootPc = pcOfSp(rootSp);
  const colors = frets.map((f, s) => (f == null ? null : degColor(chordDegreeOf(mod12(tun[s] + f), rootPc, type))));
  const names = tabNames(tun, pc => pcName(pc));
  return `<div class="tabbox">${tabSVG([{ frets, colors }], { names, colW: 34 })}</div>`;
}
export function voicingText(frets) {
  return frets.map((f, s) => `${STRING_NUM[s]}: ${f == null ? '×' : f}`).join(' · ');
}
export const qColor = type => QUALITY_COLOR[CHORDS[type].q] || COLORS.root;

// Выбор аппликатуры: индекс формы, ближе к ладу target
export function shapeList(type) { return shapesFor(type, settings.tuning); }
export function placeIdx(type, rootPc, idx, target = 5) {
  const list = shapeList(type);
  const sh = list[Math.min(idx, list.length - 1)];
  return { shape: sh, frets: placeShape(sh, rootPc, tuning(), target) };
}
export const fretRange = frets => { const u = frets.filter(f => f != null); return [Math.min(...u), Math.max(...u)]; };
export function textTab(frets) { return tabText([{ frets }], tabNames(tuning(), pc => pcName(pc))); }
