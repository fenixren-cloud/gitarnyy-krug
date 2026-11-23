// Вкладка «Риффы и табы»: редактор табулатуры (сетка шестнадцатых, 1–4 такта), проигрывание с барабанами,
// замедление, повтор, бегущий курсор, несколько сохранённых риффов, копирование/вставка текстом.
import { load, save } from '../storage.js';
import { settings, setSetting, tuning } from '../state.js';
import { mod12, MAX_FRET, spellPc } from '../music.js';
import { createFretboard } from '../fretboard.js';
import { COLORS, nm, pcName, chips, seg, bind, toast, copyText, esc } from '../ui.js';
import { riffToText, parseTab, tabNames } from '../tab.js';
import { downloadFile, shareFile, canShare, pickFile, safeName } from '../files.js';
import * as audio from '../audio.js';
import { transport, PPQ } from '../player.js';
import { clampBpm } from '../transport.js';

const N = (c, s, f, len = 1) => ({ c, s, f, len });
// Заготовки — только собственные, придуманные риффы
const PRESETS = [
  { id: 'p-dropd', name: 'Drop D: тяжёлый чаг', tuning: 'dropd', bpm: 100, bars: 2,
    notes: [...[0, 1, 2, 3].map(c => N(c, 0, 0)), N(4, 0, 3, 2), N(4, 1, 3, 2), N(6, 0, 0), N(7, 0, 0), N(8, 0, 5, 3), N(8, 1, 5, 3), N(11, 0, 0), N(12, 0, 3, 2), N(12, 1, 3, 2), N(14, 0, 1, 2), N(14, 1, 1, 2),
      ...[16, 17, 18, 19].map(c => N(c, 0, 0)), N(20, 0, 3, 2), N(20, 1, 3, 2), N(22, 0, 0), N(23, 0, 0), N(24, 0, 6, 2), N(24, 1, 6, 2), N(26, 0, 5, 2), N(26, 1, 5, 2), N(28, 0, 3, 2), N(28, 1, 3, 2), N(30, 0, 0), N(31, 0, 0)],
    pm: [0, 1, 2, 3, 6, 7, 11, 16, 17, 18, 19, 22, 23, 30, 31], acc: [4, 8, 20, 24] },
  { id: 'p-gallop', name: 'Галоп на E', tuning: 'std', bpm: 130, bars: 2,
    notes: [...[0, 4, 8].flatMap(b => [N(b, 0, 0, 2), N(b + 2, 0, 0), N(b + 3, 0, 0)]), N(12, 0, 3, 2), N(12, 1, 5, 2), N(14, 0, 3), N(14, 1, 5), N(15, 0, 3), N(15, 1, 5),
      ...[16, 20].flatMap(b => [N(b, 0, 0, 2), N(b + 2, 0, 0), N(b + 3, 0, 0)]), N(24, 0, 5, 2), N(24, 1, 7, 2), N(26, 0, 5), N(26, 1, 7), N(27, 0, 5), N(27, 1, 7), N(28, 0, 6, 4), N(28, 1, 8, 4)],
    pm: [0, 2, 3, 4, 6, 7, 8, 10, 11, 16, 18, 19, 20, 22, 23], acc: [0, 12, 24, 28] },
  { id: 'p-em', name: 'Palm mute + пентатоника Em', tuning: 'std', bpm: 110, bars: 2,
    notes: [N(0, 0, 0, 2), N(2, 0, 0, 2), N(4, 0, 3, 2), N(6, 0, 0), N(7, 0, 0), N(8, 1, 0, 2), N(10, 1, 2, 2), N(12, 0, 3), N(13, 0, 0), N(14, 1, 2, 2),
      N(16, 0, 0, 2), N(18, 0, 0, 2), N(20, 0, 5, 2), N(22, 0, 3, 2), N(24, 0, 0, 8), N(24, 1, 2, 8), N(24, 2, 2, 8)],
    pm: [0, 2, 6, 7, 13, 16, 18], acc: [4, 24] },
  { id: 'p-boogie', name: 'Буги в A (прямые восьмые)', tuning: 'std', bpm: 120, bars: 2,
    notes: [0, 2, 4, 6, 8, 10, 12, 14].flatMap((c, i) => [N(c, 1, 0, 2), N(c, 2, [2, 2, 4, 4][i % 4], 2)]).concat(
      [16, 18, 20, 22, 24, 26, 28, 30].flatMap((c, i) => [N(c, 2, 0, 2), N(c, 3, [2, 2, 4, 4][i % 4], 2)])),
    pm: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], acc: [0, 16] },
];
const blank = () => ({ id: 'r' + Date.now().toString(36), name: 'Мой рифф', tuning: settings.tuning, bpm: 100, bars: 1, notes: [], pm: [], acc: [] });
const clone = o => JSON.parse(JSON.stringify(o));

let saved = load('riffs', []);
const ST = { riff: clone(load('riffDraft', null) || blank()), sel: { c: 0, s: 0 }, dur: 2, speed: 100, loop: true, drums: 'rock', countIn: false, playCol: -1, confirmDel: false, pasteOpen: false };
let root = null, fb = null, keyHandler = null;
const R = () => ST.riff;
const persistDraft = () => save('riffDraft', ST.riff);
const cols = () => R().bars * 16;
const noteAt = (c, s) => R().notes.find(n => n.c === c && n.s === s);
const covering = (c, s) => R().notes.find(n => n.s === s && n.c < c && n.c + n.len > c);

function setNote(c, s, f) {
  const r = R();
  r.notes = r.notes.filter(n => !(n.s === s && n.c === c));
  // укоротить предыдущую ноту на этой струне, если она «наезжает»
  r.notes.forEach(n => { if (n.s === s && n.c < c && n.c + n.len > c) n.len = c - n.c; });
  const next = r.notes.filter(n => n.s === s && n.c > c).map(n => n.c);
  const len = Math.max(1, Math.min(ST.dur, (next.length ? Math.min(...next) : cols()) - c));
  r.notes.push({ c, s, f, len });
  persistDraft();
}
function advance(step = ST.dur) { ST.sel.c = Math.min(cols() - 1, ST.sel.c + step); }

// ---------- проигрывание ----------
function makeSource() {
  const r = clone(R()), total = r.bars * 16, pm = new Set(r.pm), acc = new Set(r.acc), tun = tuning();
  return {
    name: 'рифф', kind: 'rhythm', countIn: ST.countIn ? 4 : 0,
    onCountIn(i, t) { audio.click(t, i ? 2 : 3, 'wood'); },
    tick(tick, time, T) {
      if (tick % 3) return;
      const step = tick / 3, col = step % total;
      if (!ST.loop && step >= total) { if (step === total) T.visual(time, () => { if (T.source && T.source.name === 'рифф') T.stop(); }); return; }
      const s16 = 60 / T.bpm / 4;
      const beat = Math.floor(col / 4), inBeat = col % 4;
      if (ST.drums === 'rock') {
        if (inBeat % 2 === 0) audio.drums.hat(time, inBeat ? 0.3 : 0.45);
        if (inBeat === 0 && beat % 2 === 0) audio.drums.kick(time, 0.9);
        if (inBeat === 0 && beat % 2 === 1) audio.drums.snare(time, 0.8);
      } else if (ST.drums === 'click' && inBeat === 0) audio.click(time, beat % 4 === 0 ? 3 : 1, 'click');
      const here = r.notes.filter(n => n.c === col);
      here.forEach(n => {
        if (n.f === 'x') audio.guitarNote(tun[n.s] + 5, time, { string: n.s, tag: 'rhythm', vel: 0.45, dur: 0.03, pm: true });
        else audio.guitarNote(tun[n.s] + n.f, time, { string: n.s, tag: 'rhythm', vel: acc.has(col) ? 1 : 0.78, pm: pm.has(col), dur: (pm.has(col) ? Math.min(n.len, 1) * 0.9 : n.len) * s16 });
      });
      T.visual(time, () => showPlay(col, here));
    },
    stop() { audio.muteGuitar(null, v => v.tag === 'rhythm'); showPlay(-1, []); renderControls(); },
  };
}
function play() {
  audio.ensure();
  if (transport.running && transport.name === 'рифф') { transport.stop(); return; }
  if (!R().notes.length) { toast('Рифф пустой: поставь ноты касанием грифа или цифрами'); return; }
  transport.start(makeSource(), { bpm: Math.max(30, Math.round(R().bpm * ST.speed / 100)) });
  renderControls();
}
function showPlay(col, notes) {
  ST.playCol = col;
  if (!root) return;
  root.querySelectorAll('.tcell.playc').forEach(x => x.classList.remove('playc'));
  if (col >= 0) {
    root.querySelectorAll(`.tcell[data-c="${col}"]`).forEach(x => x.classList.add('playc'));
    const cell = root.querySelector(`.tcell[data-c="${col}"]`);
    const box = root.querySelector('.tabed');
    if (cell && box) { const x = cell.offsetLeft; if (x < box.scrollLeft + 30 || x > box.scrollLeft + box.clientWidth - 60) box.scrollLeft = x - 40; }
  }
  if (fb) fb.setCursor(notes.filter(n => n.f !== 'x').map(n => ({ s: n.s, f: n.f, color: COLORS.fifth })));
}

// ---------- отрисовка ----------
function gridHTML() {
  const r = R(), C = cols(), names = tabNames(tuning(), pc => pcName(pc));
  const pm = new Set(r.pm), acc = new Set(r.acc);
  let h = '<div class="tg">';
  h += `<div><div class="tlab tmeta"></div>${[5, 4, 3, 2, 1, 0].map(s => `<div class="tlab">${names[s]}</div>`).join('')}</div>`;
  for (let c = 0; c < C; c++) {
    const cls = `${c % 4 === 0 ? ' beatc' : ''}${c % 16 === 0 ? ' barl' : ''}${ST.playCol === c ? ' playc' : ''}`;
    h += `<div><button type="button" class="tcell tmeta${cls}" data-act="col" data-c="${c}">${pm.has(c) ? 'PM' : ''}${acc.has(c) ? '>' : ''}</button>`;
    for (const s of [5, 4, 3, 2, 1, 0]) {
      const n = noteAt(c, s), sus = !n && covering(c, s);
      const sel = ST.sel.c === c && ST.sel.s === s;
      h += `<button type="button" class="tcell${cls}${sus ? ' sus' : ''}${sel ? ' sel' : ''}" data-act="cell" data-c="${c}" data-s="${s}">${n ? `<span style="color:${n.f === 'x' ? '#8d96aa' : '#fff'}">${n.f}</span>` : ''}</button>`;
    }
    h += '</div>';
  }
  return h + '</div>';
}
function renderGrid() {
  if (!root) return;
  const box = root.querySelector('.tabed'), sl = box ? box.scrollLeft : 0;
  root.querySelector('#rf-grid').innerHTML = gridHTML();
  const b2 = root.querySelector('.tabed'); if (b2) b2.scrollLeft = sl;
  renderFret();
}
function renderFret() {
  if (!fb) return;
  const r = R(), tun = tuning(), markers = [], seen = new Set();
  r.notes.forEach(n => {
    if (n.f === 'x' || n.f > MAX_FRET) return;
    const k = n.s + ':' + n.f;
    const inSel = n.c === ST.sel.c;
    if (seen.has(k) && !inSel) return;
    seen.add(k);
    markers.push({ s: n.s, f: n.f, text: nm(spellPc(mod12(tun[n.s] + n.f))), color: inSel ? COLORS.root : COLORS.other, kind: inSel ? undefined : 'dim', glow: inSel });
  });
  markers.push({ s: ST.sel.s, f: 0, text: '', kind: 'ring', color: COLORS.fifth, r: 9 });
  const used = r.notes.filter(n => n.f !== 'x').map(n => n.f);
  fb.render({ markers, focus: used.length ? [Math.min(...used), Math.max(...used)] : [0, 5], smooth: false });
}
function renderControls() {
  if (!root) return;
  const r = transport.running && transport.name === 'рифф';
  const b = root.querySelector('#rf-play');
  if (b) { b.textContent = r ? '■ Стоп' : '▶ Играть'; b.classList.toggle('r', r); }
}
function listHTML() {
  return `<div class="chips">${saved.map(x => `<button type="button" class="chip ${x.id === R().id ? 'on' : ''}" data-act="open" data-id="${x.id}">${esc(x.name)}<small>${x.tuning === 'dropd' ? 'Drop D' : 'Standard'} · ${x.bars} т.</small></button>`).join('') || '<span class="note">Пока нет сохранённых риффов.</span>'}</div>`;
}
function render() {
  if (!root) return;
  const r = R();
  root.innerHTML = `
    <div class="kicker">практика · риффы и табы</div>
    <div class="card">
      <div class="row"><input type="text" id="rf-name" value="${esc(r.name)}" maxlength="40" style="flex:1;min-width:150px" aria-label="Название риффа">
        <span class="note">${r.tuning === 'dropd' ? 'Drop D' : 'Standard E'}</span></div>
      <div class="row"><span class="note">Тактов</span>${seg('bars', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], r.bars)}
        <span style="display:inline-flex;align-items:center;gap:8px"><span class="note">Темп</span><button class="btn g sm" data-act="bpm" data-d="-5">−</button><b id="rf-bpm">${r.bpm}</b><button class="btn g sm" data-act="bpm" data-d="5">+</button></span></div>
      <div class="tabed" id="rf-grid"></div>
      <div class="row"><span class="note">Длительность</span>${seg('dur', [[1, '1/16'], [2, '1/8'], [3, '1/8·'], [4, '1/4'], [8, '1/2']], ST.dur)}</div>
      <div class="pad" id="rf-pad">${Array.from({ length: 25 }, (_, i) => `<button type="button" class="btn g sm" data-act="num" data-f="${i}">${i}</button>`).join('')}<button type="button" class="btn g sm" data-act="num" data-f="x">x</button></div>
      <div class="row">
        <button class="btn g sm" data-act="mv" data-d="-1">←</button><button class="btn g sm" data-act="mv" data-d="1">→</button>
        <button class="btn g sm" data-act="rest">Пауза</button><button class="btn g sm" data-act="del">Удалить</button>
        <button class="btn g sm" data-act="pm">PM</button><button class="btn g sm" data-act="acc">Акцент &gt;</button><button class="btn g sm" data-act="clear">Очистить</button>
      </div>
      <p class="note">Выбери клетку (струна + шестнадцатая), затем коснись грифа или нажми номер лада: нота встанет на место, курсор сдвинется на выбранную длительность. «Пауза» — пропустить. PM и акцент ставятся на всю колонку (касание верхней строки тоже их переключает). На компьютере работают цифры, ←/→, ↑/↓ и Delete.</p>
    </div>
    <div class="card">
      <div class="row"><button class="btn bigplay" id="rf-play" data-act="play" style="flex:1">▶ Играть</button></div>
      <div class="row"><span class="note">Скорость</span>${seg('speed', [[50, '50%'], [60, '60%'], [75, '75%'], [90, '90%'], [100, '100%']], ST.speed)}</div>
      <div class="row"><span class="note">Барабаны</span>${seg('drums', [['rock', 'рок'], ['click', 'клик'], ['none', 'нет']], ST.drums)}
        <label class="note"><input type="checkbox" id="rf-loop" ${ST.loop ? 'checked' : ''}> повтор</label><label class="note"><input type="checkbox" id="rf-ci" ${ST.countIn ? 'checked' : ''}> отсчёт</label></div>
    </div>
    <div class="card tight"><div id="rf-fb"></div><p class="note">Касание грифа ставит ноту в выбранную клетку. Оранжевые — ноты выбранной колонки, серые — остальные ноты риффа, голубое кольцо — играет сейчас.</p></div>
    <div class="card">
      <h3 style="margin-top:0">Мои риффы</h3><div id="rf-list">${listHTML()}</div>
      <div class="row"><button class="btn sm" data-act="save">Сохранить</button><button class="btn g sm" data-act="saveas">Как новый</button><button class="btn g sm" data-act="new">Новый</button>
        <button class="btn g sm ${ST.confirmDel ? 'r' : ''}" data-act="remove">${ST.confirmDel ? 'Точно удалить?' : 'Удалить'}</button></div>
      <h3>Заготовки (собственные риффы)</h3>
      <div class="chips">${PRESETS.map(p => `<button type="button" class="chip" data-act="preset" data-id="${p.id}">${p.name}<small>${p.tuning === 'dropd' ? 'Drop D' : 'Standard'} · ${p.bpm} BPM</small></button>`).join('')}</div>
      <h3>Таб файлом</h3>
      <div class="row"><button class="btn sm" data-act="dl">⬇ Скачать .txt</button>${canShare() ? '<button class="btn g sm" data-act="share">📤 Поделиться</button>' : ''}<button class="btn g sm" data-act="openfile">📂 Открыть файл…</button></div>
      <div class="row"><button class="btn g sm" data-act="copy">Копировать текст</button><button class="btn g sm" data-act="paste">Вставить текст…</button></div>
      <textarea id="rf-text" hidden readonly aria-label="Текст таба"></textarea>
      <div id="rf-pastebox" ${ST.pasteOpen ? '' : 'hidden'}><textarea id="rf-in" placeholder="Вставь сюда 6 строк таба вида e|--0--3--|"></textarea><div class="row"><button class="btn sm" data-act="import">Загрузить в редактор</button></div></div>
      <p class="note">Таб — обычный текстовый файл: открывается в заметках, уходит в мессенджер или на Google Диск и загружается обратно. Название, строй, темп, PM и акценты сохраняются. Подходят и другие текстовые табы вида e|--0--3--| (приёмы вроде h, p, b пропускаются).</p>
    </div>`;
  fb = createFretboard(root.querySelector('#rf-fb'), {
    onTap: (s, f, midi) => {
      audio.userPlay([{ midi, string: s }]);
      ST.sel.s = s; setNote(ST.sel.c, s, f); advance(); renderGrid();
    },
  });
  renderGrid();
  renderControls();
}
const tabFileText = () => riffToText(R(), tabNames(tuning(), pc => pcName(pc))) + '\n';
// Таб из текста (вставка или файл) → в редактор. Название берём из первой строки нашего формата «// Название · …»
function importText(text, fallbackName) {
  const res = parseTab(text);
  if (!res) { toast('Не нашёл 6 строк таба вида e|--0--3--|'); return; }
  const m = String(text).match(/^\s*\/\/\s*(.+?)\s+·/m);
  const r = blank(); r.notes = res.notes; r.pm = res.pm; r.acc = res.acc; r.bars = res.bars; r.bpm = res.bpm || 100;
  r.tuning = res.tuning || settings.tuning; r.name = (m ? m[1] : fallbackName || 'Рифф').slice(0, 40);
  ST.pasteOpen = false; loadRiff(r); toast(`Загружено: ${res.notes.length} нот`);
}
function loadRiff(r) {
  ST.riff = clone(r); ST.sel = { c: 0, s: 0 }; ST.confirmDel = false;
  if (r.tuning && r.tuning !== settings.tuning) { setSetting('tuning', r.tuning); toast(`Строй переключён на ${r.tuning === 'dropd' ? 'Drop D' : 'Standard'} для этого риффа`); }
  persistDraft(); render();
}

export const page = {
  id: 'riffs', title: 'Риффы и табы', section: 'practice',
  mount(el) {
    root = el;
    render();
    bind(el, {
      seg: {
        bars: v => { R().bars = +v; R().notes = R().notes.filter(n => n.c < cols()); R().notes.forEach(n => { n.len = Math.min(n.len, cols() - n.c); }); R().pm = R().pm.filter(c => c < cols()); R().acc = R().acc.filter(c => c < cols()); ST.sel.c = Math.min(ST.sel.c, cols() - 1); persistDraft(); renderGrid(); },
        dur: v => { ST.dur = +v; },
        speed: v => { ST.speed = +v; if (transport.name === 'рифф') transport.setBpm(R().bpm * ST.speed / 100); },
        drums: v => { ST.drums = v; },
      },
      act: {
        cell: b => {
          ST.sel = { c: +b.dataset.c, s: +b.dataset.s };
          const n = noteAt(ST.sel.c, ST.sel.s);
          if (n && n.f !== 'x') audio.userPlay([{ midi: tuning()[n.s] + n.f, string: n.s }]);
          renderGrid();
        },
        col: b => { const c = +b.dataset.c, r = R(); ST.sel.c = c; if (r.pm.includes(c)) { r.pm = r.pm.filter(x => x !== c); if (!r.acc.includes(c)) r.acc.push(c); } else if (r.acc.includes(c)) r.acc = r.acc.filter(x => x !== c); else r.pm.push(c); persistDraft(); renderGrid(); },
        num: b => { const f = b.dataset.f === 'x' ? 'x' : +b.dataset.f; setNote(ST.sel.c, ST.sel.s, f); if (f !== 'x') audio.userPlay([{ midi: tuning()[ST.sel.s] + f, string: ST.sel.s }]); advance(); renderGrid(); },
        mv: b => { ST.sel.c = Math.max(0, Math.min(cols() - 1, ST.sel.c + +b.dataset.d)); renderGrid(); },
        rest: () => { advance(); renderGrid(); },
        del: () => { const r = R(); const n = noteAt(ST.sel.c, ST.sel.s); r.notes = n ? r.notes.filter(x => x !== n) : r.notes.filter(x => x.c !== ST.sel.c); persistDraft(); renderGrid(); },
        pm: () => { const r = R(), c = ST.sel.c; r.pm = r.pm.includes(c) ? r.pm.filter(x => x !== c) : [...r.pm, c]; persistDraft(); renderGrid(); },
        acc: () => { const r = R(), c = ST.sel.c; r.acc = r.acc.includes(c) ? r.acc.filter(x => x !== c) : [...r.acc, c]; persistDraft(); renderGrid(); },
        clear: () => { R().notes = []; R().pm = []; R().acc = []; ST.sel.c = 0; persistDraft(); renderGrid(); },
        bpm: b => { R().bpm = clampBpm(R().bpm + +b.dataset.d); el.querySelector('#rf-bpm').textContent = R().bpm; persistDraft(); if (transport.name === 'рифф') transport.setBpm(R().bpm * ST.speed / 100); },
        play: () => play(),
        save: () => { const r = R(); r.tuning = settings.tuning; const i = saved.findIndex(x => x.id === r.id); if (i >= 0) saved[i] = clone(r); else saved.push(clone(r)); save('riffs', saved); el.querySelector('#rf-list').innerHTML = listHTML(); toast('Рифф сохранён'); },
        saveas: () => { const r = clone(R()); r.id = 'r' + Date.now().toString(36); r.name = r.name + ' (копия)'; r.tuning = settings.tuning; saved.push(r); save('riffs', saved); ST.riff = clone(r); persistDraft(); render(); toast('Сохранён как новый'); },
        new: () => { loadRiff(blank()); },
        remove: () => {
          if (!ST.confirmDel) { ST.confirmDel = true; render(); return; }
          saved = saved.filter(x => x.id !== R().id); save('riffs', saved); ST.confirmDel = false; ST.riff = blank(); persistDraft(); render(); toast('Удалено');
        },
        open: b => { const r = saved.find(x => x.id === b.dataset.id); if (r) loadRiff(r); },
        preset: b => { const p = PRESETS.find(x => x.id === b.dataset.id); const r = clone(p); r.id = 'r' + Date.now().toString(36); loadRiff(r); },
        copy: () => copyText(tabFileText(), el.querySelector('#rf-text')),
        dl: () => { downloadFile(safeName(R().name) + '.txt', tabFileText()); toast('Таб сохранён в «Загрузки»'); },
        share: async () => { const r = await shareFile(safeName(R().name) + '.txt', tabFileText(), { title: R().name }); if (r === 'downloaded') toast('Таб сохранён в «Загрузки»'); },
        openfile: async () => {
          const f = await pickFile('.txt,text/plain');
          if (!f) return;
          if (f.error) { toast(f.error); return; }
          importText(f.text, f.name.replace(/\.txt$/i, ''));
        },
        paste: () => { ST.pasteOpen = !ST.pasteOpen; el.querySelector('#rf-pastebox').hidden = !ST.pasteOpen; },
        import: () => importText(el.querySelector('#rf-in').value, 'Вставленный рифф'),
      },
    });
    el.addEventListener('input', e => { if (e.target.id === 'rf-name') { R().name = e.target.value || 'Без названия'; persistDraft(); } });
    el.addEventListener('change', e => { if (e.target.id === 'rf-loop') ST.loop = e.target.checked; if (e.target.id === 'rf-ci') ST.countIn = e.target.checked; });
    keyHandler = e => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (/^\d$/.test(e.key)) {
        const prev = noteAt(ST.sel.c, ST.sel.s);
        let f = +e.key;
        if (ST.lastKey && performance.now() - ST.lastKey.t < 700 && ST.lastKey.c === ST.sel.c - ST.dur && prev == null) {
          const two = ST.lastKey.f * 10 + f;
          if (two <= 24) { ST.sel.c = ST.lastKey.c; f = two; }
        }
        setNote(ST.sel.c, ST.sel.s, f); ST.lastKey = { t: performance.now(), c: ST.sel.c, f }; advance(); renderGrid(); e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { ST.sel.c = Math.max(0, Math.min(cols() - 1, ST.sel.c + (e.key === 'ArrowRight' ? 1 : -1))); renderGrid(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { ST.sel.s = Math.max(0, Math.min(5, ST.sel.s + (e.key === 'ArrowUp' ? 1 : -1))); renderGrid(); e.preventDefault(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { R().notes = R().notes.filter(n => !(n.c === ST.sel.c && n.s === ST.sel.s)); persistDraft(); renderGrid(); e.preventDefault(); }
    };
    document.addEventListener('keydown', keyHandler);
  },
  unmount() { document.removeEventListener('keydown', keyHandler); root = null; fb = null; },
  onSettings(k) { if (k === 'tuning') { R().tuning = settings.tuning; persistDraft(); } render(); },
  onSpace() { play(); return true; },
};
