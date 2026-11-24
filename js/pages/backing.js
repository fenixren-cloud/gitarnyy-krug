// Вкладка «Подложка»: барабаны + бас + гитара по последовательности аккордов в тональности.
// На грифе — пентатоника или лад тональности, ноты текущего аккорда выделены как «целевые».
import { load, save } from '../storage.js';
import { settings, tuning } from '../state.js';
import { mod12, FIFTHS, keyTonic, diatonicChords, progressionChords, PROGRESSIONS, chordSymbol, chordPcs, bestVoicing, voicingAvg,
  PENTA, MODES, spellPenta, spellScale, degLabel, pcOf, MAX_FRET, ruName } from '../music.js';
import { createFretboard } from '../fretboard.js';
import { COLORS, nm, chips, seg, bind, pill, info, degColor, toast } from '../ui.js';
import * as audio from '../audio.js';
import { transport, PPQ } from '../player.js';
import { clampBpm } from '../transport.js';

const GROOVES = [['rock', 'Рок'], ['halftime', 'Халфтайм'], ['metal', 'Метал'], ['shuffle', 'Шаффл'], ['ballad', 'Баллада']];
const DEF = { tonic: 9, minor: true, prog: 'epic', barsPer: 1, useCustom: false, custom: [{ d: 0, bars: 2 }, { d: 5, bars: 2 }], groove: 'rock', bpm: 100,
  countIn: true, loop: true, gtr: 'power', view: 'penta', vol: { drums: 0.85, bass: 0.9, guitar: 0.75 }, mute: { drums: false, bass: false, guitar: false } };
const B = Object.assign(JSON.parse(JSON.stringify(DEF)), load('backing', {}));
const persist = () => save('backing', B);
let root = null, fb = null, tg = null, cur = -1;

const key = () => { const mode = B.minor ? 'aeolian' : 'ionian'; return { mode, tonic: keyTonic(B.tonic, mode) }; };
function chordList() {
  const { mode, tonic } = key();
  if (B.useCustom) {
    const dia = diatonicChords(tonic, mode);
    return B.custom.map(c => ({ ...dia[c.d], bars: c.bars }));
  }
  const p = PROGRESSIONS[B.minor ? 'minor' : 'major'].find(x => x.id === B.prog) || PROGRESSIONS[B.minor ? 'minor' : 'major'][0];
  return progressionChords(tonic, mode, p).map(c => ({ ...c, bars: p.degs.length > 8 ? 1 : B.barsPer }));
}
const bassMidi = pc => 25 + mod12(pc - 1); // C♯1 … C2
function powerNotes(c) {
  const tun = tuning(), fifth = ['dim', 'm7b5'].includes(c.type) ? 6 : 7;
  let s = 0, f = mod12(c.rootPc - tun[0]);
  if (settings.tuning !== 'dropd' && f > 7) { s = 1; f = mod12(c.rootPc - tun[1]); }
  const base = tun[s] + f;
  return [{ midi: base, string: s }, { midi: base + fifth, string: s + 1 }, { midi: base + 12, string: s + 2 }];
}

function makeSource(chords) {
  const totalBars = chords.reduce((a, c) => a + c.bars, 0);
  const at = []; chords.forEach((c, i) => { for (let k = 0; k < c.bars; k++) at.push(i); });
  let avg = 5;
  const voic = chords.map(c => { const v = bestVoicing(c.type, c.rootPc, settings.tuning, avg) || bestVoicing('maj', c.rootPc, settings.tuning, avg); avg = voicingAvg(v.frets); return v.frets.map((f, s) => (f == null ? null : { midi: tuning()[s] + f, string: s })).filter(Boolean); });
  const pw = chords.map(powerNotes);
  let ended = false;
  return {
    name: 'подложка', kind: 'rhythm', countIn: B.countIn ? 4 : 0,
    onCountIn(i, t) { audio.drums.hat(t, 0.9, false, tg.drums); transport.visual(t, () => showCount(4 - i)); },
    start() { },
    tick(tick, time, T) {
      const bt = 4 * PPQ, bar = Math.floor(tick / bt), inBar = tick % bt, beat = Math.floor(inBar / PPQ), sub = inBar % PPQ;
      if (!B.loop && bar >= totalBars) {
        if (!ended) { ended = true; audio.drums.crash(time, 0.8, tg.drums); audio.muteGuitar(time + 0.9, v => v.tag === 'rhythm'); T.visual(time + 1, () => { if (T.source && T.source.name === 'подложка') T.stop(); }); }
        return;
      }
      const lb = bar % totalBars, ci = at[lb], c = chords[ci];
      const first = lb === 0 || at[lb - 1] !== ci;
      if (inBar === 0) { if (tick === 0) T.visual(time, () => showCount(0)); T.visual(time, () => showChord(ci)); }
      const spb = 60 / T.bpm;
      groove(B.groove, { beat, sub, bar: lb, first, time, c, spb, pw: pw[ci], cl: voic[ci] });
    },
    stop() { audio.muteGuitar(null, v => v.tag === 'rhythm'); audio.muteBass(); showChord(-1); showCount(0); renderPlay(); },
  };
}

function groove(g, { beat, sub, first, time, c, spb, pw, cl }) {
  const D = audio.drums, dr = tg.drums;
  const K = (v = 1) => D.kick(time, v, dr), S = (v = 1) => D.snare(time, v, dr), H = (v = 0.5, o = false) => D.hat(time, v, o, dr);
  const bass = (st = 0, len = 0.5, v = 1) => audio.bassNote(bassMidi(c.rootPc) + st, time, { dur: len * spb, vel: v, dest: tg.bass });
  const power = B.gtr === 'power';
  const gdest = power ? tg.gDist : tg.gClean;
  const hit = (notes, len, o = {}) => audio.strum(notes, time, { gap: o.gap ?? (power ? 0.006 : 0.016), vel: o.vel ?? 0.8, dur: len * spb, pm: !!o.pm, tag: 'rhythm', dest: gdest, dir: o.dir || 'down' });
  const third = ['min', 'dim', 'm7', 'm7b5'].includes(c.type) ? 3 : 4;
  if (first && beat === 0 && sub === 0) D.crash(time, 0.55, dr);
  switch (g) {
    case 'rock':
      if (sub === 0 || sub === 6) H(sub ? 0.35 : 0.5);
      if (sub === 0 && (beat === 0 || beat === 2)) K(); if (sub === 6 && beat === 2) K(0.7); if (sub === 0 && (beat === 1 || beat === 3)) S(0.9);
      if (sub === 0 || sub === 6) bass(0, 0.45, sub ? 0.8 : 1);
      if (power) { if (sub === 0 && beat === 0) hit(pw, 0.9, { vel: 0.9 }); else if (sub === 0 || sub === 6) hit(pw.slice(0, 2), 0.3, { pm: true, vel: 0.75 }); }
      else { if (sub === 0) hit(cl, 0.9, { vel: beat === 0 ? 0.85 : 0.7 }); if (sub === 6 && (beat === 1 || beat === 3)) hit(cl.slice(-4), 0.4, { vel: 0.45, dir: 'up' }); }
      break;
    case 'halftime':
      if (sub === 0 || sub === 6) H(sub ? 0.3 : 0.45);
      if (sub === 0 && beat === 0) K(); if (sub === 6 && beat === 1) K(0.7); if (sub === 0 && beat === 2) S(1);
      if (sub === 0 && beat === 0) bass(0, 1.4); if (sub === 6 && beat === 1) bass(0, 0.4, 0.8); if (sub === 0 && beat === 2) bass(0, 1.8);
      if (sub === 0 && (beat === 0 || beat === 2)) hit(power ? pw : cl, 1.95, { vel: beat ? 0.7 : 0.9 });
      break;
    case 'metal':
      if (sub % 3 === 0) K(0.7); if (sub === 0) { H(0.45, true); if (beat % 2) S(1); }
      if (sub === 0 || sub === 6) bass(0, 0.4, 0.9);
      if (power) { if (sub === 0 && beat === 0) hit(pw, 0.7, { vel: 0.95 }); else if (sub % 3 === 0) hit(pw.slice(0, 2), 0.2, { pm: true, vel: 0.7 }); }
      else if (sub === 0 || sub === 6) hit(cl, 0.4, { vel: 0.65 });
      break;
    case 'shuffle': {
      if (sub === 0 || sub === 8) H(sub ? 0.32 : 0.5);
      if (sub === 0 && (beat === 0 || beat === 2)) K(); if (sub === 8 && beat === 3) K(0.6); if (sub === 0 && beat % 2) S(0.9);
      const walk = [0, third, 7, 9][beat];
      if (sub === 0 || sub === 8) bass(walk, sub ? 0.3 : 0.6, sub ? 0.75 : 1);
      if (power && (sub === 0 || sub === 8)) {
        const r = pw[0], boog = beat % 2 ? 9 : 7;
        audio.strum([r, { midi: r.midi + boog, string: r.string + 1 }], time, { gap: 0.006, vel: sub ? 0.6 : 0.8, dur: (sub ? 0.3 : 0.6) * spb, pm: true, tag: 'rhythm', dest: gdest });
      } else if (!power && sub === 0 && beat % 2) hit(cl, 0.25, { vel: 0.75 });
      break;
    }
    case 'ballad': default:
      if (sub === 0 || sub === 6) H(sub ? 0.2 : 0.3);
      if (sub === 0 && beat === 0) K(0.9); if (sub === 6 && beat === 2) K(0.6); if (sub === 0 && (beat === 1 || beat === 3)) S(0.55);
      if (sub === 0 && beat === 0) bass(0, 1.9); if (sub === 0 && beat === 2) bass(7, 1.9, 0.85);
      if (power) { if (sub === 0 && (beat === 0 || beat === 2)) hit(pw, 1.95, { vel: beat ? 0.6 : 0.8 }); }
      else if (sub === 0 || sub === 6) {
        const order = [0, 2, 3, 4, 5, 4, 3, 2], k = order[(beat * 2 + (sub ? 1 : 0)) % 8], n = cl[Math.min(k, cl.length - 1)];
        audio.guitarNote(n.midi, time, { string: n.string, tag: 'rhythm', vel: k === 0 ? 0.8 : 0.6, dest: gdest, dur: spb * 2 });
      }
  }
}

// ---------- отображение ----------
function showCount(n) { if (!root) return; const c = root.querySelector('#bk-count'); if (c) c.textContent = n > 0 ? n : ''; }
function showChord(i) {
  cur = i;
  if (!root) return;
  root.querySelectorAll('.pc').forEach((x, k) => x.classList.toggle('now', k === i));
  renderFretboard(false);
}
function renderFretboard(focus = true) {
  if (!fb) return;
  const tun = tuning(), { mode, tonic } = key(), chords = chordList();
  let notes, degs;
  if (B.view === 'penta') { const kind = B.minor ? 'minor' : 'major', P = PENTA[kind]; notes = spellPenta(tonic, kind); degs = P.iv.map((st, i) => degLabel(st, P.lt[i])); }
  else { const iv = MODES[mode].iv; notes = spellScale(tonic, iv); degs = iv.map((st, i) => degLabel(st, i)); }
  const target = cur >= 0 && chords[cur] ? new Set(chordPcs(chords[cur].rootPc, chords[cur].type)) : null;
  const markers = [];
  for (let s = 0; s < 6; s++) for (let f = 0; f <= MAX_FRET; f++) {
    const p = mod12(tun[s] + f), i = notes.findIndex(n => pcOf(n) === p);
    if (i >= 0) {
      const text = settings.labels === 'degrees' ? degs[i] : nm(notes[i]);
      markers.push(target ? (target.has(p) ? { s, f, text, color: degColor(degs[i]), kind: 'target' } : { s, f, text, color: degColor(degs[i]), kind: 'dim' }) : { s, f, text, color: degColor(degs[i]), kind: i ? 'dim' : undefined });
    } else if (target && target.has(p)) markers.push({ s, f, text: '•', color: '#ffffff', kind: 'ring', small: true });
  }
  let lo = mod12(B.tonic - tun[0]); if (lo < 2) lo += 12; lo = Math.min(lo, 14);
  fb.render({ markers, window: [lo - 1, lo + 4], focus: focus ? [lo - 1, lo + 4] : null });
}
function renderPlay() {
  if (!root) return;
  const r = transport.running && transport.name === 'подложка';
  const b = root.querySelector('#bk-play');
  if (b) { b.textContent = r ? '■ Стоп' : '▶ Играть'; b.classList.toggle('r', r); }
}
function progHTML() {
  const chords = chordList(), { mode, tonic } = key();
  const dia = diatonicChords(tonic, mode);
  let h = `<div class="prog">${chords.map((c, i) => `<div class="pc ${i === cur ? 'now' : ''}" ${B.useCustom ? `data-act="cbars" data-i="${i}"` : ''}>${chordSymbol(c.root, c.type, settings.german)}<small>${c.roman} · ${c.bars} т.</small>${B.useCustom ? `<button class="x" data-act="crm" data-i="${i}" aria-label="Убрать">×</button>` : ''}</div>`).join('')}</div>`;
  if (B.useCustom) h += `<p class="note">Нажми на аккорд, чтобы сменить длину (1 → 2 → 4 такта). Добавить (до 8):</p><div class="chips">${dia.map(c => `<button class="chip" data-act="cadd" data-d="${c.degree}">${chordSymbol(c.root, c.type, settings.german)}<small>${c.roman}</small></button>`).join('')}</div>`;
  return h;
}

function render() {
  if (!root) return;
  const { tonic } = key();
  const progs = PROGRESSIONS[B.minor ? 'minor' : 'major'];
  root.innerHTML = `
    <div class="kicker">практика · подложка для импровизации</div>
    <div class="card">
      <div class="row">${seg('minor', [['0', 'Мажор'], ['1', 'Минор']], B.minor ? '1' : '0')}<b>${nm(tonic)}${B.minor ? 'm' : ''}</b> <small class="mu">${ruName(tonic, true)} ${B.minor ? 'минор' : 'мажор'}</small></div>
      ${chips('tonic', Array.from({ length: 12 }, (_, pc) => [pc, nm(keyTonic(pc, B.minor ? 'aeolian' : 'ionian'))]), B.tonic, 'notes12')}
      <h3>Последовательность</h3>
      ${chips('prog', [...progs.map(p => [p.id, p.name]), ['custom', 'Своя']], B.useCustom ? 'custom' : B.prog)}
      ${B.useCustom ? '' : `<div class="row"><span class="note">Тактов на аккорд</span>${seg('barsPer', [[1, '1'], [2, '2'], [4, '4']], B.barsPer)}</div>`}
      <div id="bk-prog">${progHTML()}</div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Грув и темп</h3>
      ${chips('groove', GROOVES, B.groove)}
      <div class="row"><button class="btn g sm" data-act="bpm" data-d="-5">−5</button><b style="font:800 26px var(--disp);color:var(--root)" id="bk-bpm">${B.bpm}</b><button class="btn g sm" data-act="bpm" data-d="5">+5</button><span class="note">BPM</span>
        <label class="note"><input type="checkbox" id="bk-ci" ${B.countIn ? 'checked' : ''}> отсчёт</label><label class="note"><input type="checkbox" id="bk-loop" ${B.loop ? 'checked' : ''}> по кругу</label></div>
      <input type="range" id="bk-range" min="50" max="220" value="${B.bpm}">
      <div class="countin" id="bk-count"></div>
      <button class="btn bigplay" id="bk-play" data-act="play">▶ Играть</button>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Дорожки</h3>
      <div class="mix">
        ${[['drums', 'Барабаны'], ['bass', 'Бас'], ['guitar', 'Гитара']].map(([k, t]) => `<b>${t}</b><input type="range" min="0" max="1" step="0.01" value="${B.vol[k]}" data-vol="${k}"><button class="chip ${B.mute[k] ? 'bad' : ''}" data-act="mute" data-k="${k}">${B.mute[k] ? 'выкл' : 'вкл'}</button>`).join('')}
      </div>
      <div class="row"><span class="note">Гитара:</span>${seg('gtr', [['power', 'Пауэр через перегруз'], ['clean', 'Чистые аккорды']], B.gtr)}</div>
      <p class="note">Выключи гитару и играй аккорды сам — или оставь и импровизируй сверху. Бас — записанные сэмплы бас-гитары, барабаны синтезированы.</p>
    </div>
    <div class="card tight">
      <div class="row">${seg('view', [['penta', 'Пентатоника'], ['mode', B.minor ? 'Натуральный минор' : 'Мажор']], B.view)}<span class="note">белые кольца — ноты текущего аккорда</span></div>
      <div id="bk-fb"></div>
      ${info('<b>Целевые ноты.</b> Импровизируя, заканчивай фразы на нотах текущего аккорда (белое кольцо) — так мелодия «попадает» в гармонию. Между ними свободно гуляй по гамме.')}
    </div>`;
  fb = createFretboard(root.querySelector('#bk-fb'), { onTap: (s, f, midi) => { audio.userPlay([{ midi, string: s }]); fb.setCursor([{ s, f }]); } });
  renderFretboard();
  renderPlay();
}
function setupGains() {
  if (tg) return;
  tg = { drums: audio.trackGain('drums'), bass: audio.trackGain('bass'), gDist: audio.trackGain('guitarDist'), gClean: audio.trackGain('guitarClean') };
  applyMix();
}
function applyMix() {
  if (!tg) return;
  const v = k => (B.mute[k] ? 0 : B.vol[k]);
  audio.setGain(tg.drums, v('drums')); audio.setGain(tg.bass, v('bass'));
  audio.setGain(tg.gDist, v('guitar') * 0.9); audio.setGain(tg.gClean, v('guitar'));
}
function start() {
  audio.ensure(); setupGains();
  const chords = chordList();
  if (!chords.length) {
    // убрали последний аккорд, пока подложка играла, — она не должна доигрывать удалённое
    if (transport.running && transport.name === 'подложка') transport.stop();
    toast('Добавь хотя бы один аккорд'); renderPlay(); return;
  }
  transport.start(makeSource(chords), { bpm: B.bpm });
  renderPlay();
}
const restartIfRunning = () => { if (transport.running && transport.name === 'подложка') start(); };

export const page = {
  id: 'backing', title: 'Подложка', section: 'practice',
  mount(el) {
    root = el;
    render();
    bind(el, {
      seg: {
        minor: v => { B.minor = v === '1'; B.prog = PROGRESSIONS[B.minor ? 'minor' : 'major'][0].id; persist(); render(); restartIfRunning(); },
        tonic: v => { B.tonic = +v; persist(); render(); restartIfRunning(); },
        prog: v => { if (v === 'custom') B.useCustom = true; else { B.useCustom = false; B.prog = v; } persist(); render(); restartIfRunning(); },
        barsPer: v => { B.barsPer = +v; persist(); render(); restartIfRunning(); },
        groove: v => { B.groove = v; persist(); },
        gtr: v => { B.gtr = v; persist(); },
        view: v => { B.view = v; persist(); renderFretboard(false); },
      },
      act: {
        play: () => { if (transport.running && transport.name === 'подложка') transport.stop(); else start(); renderPlay(); },
        bpm: b => { B.bpm = clampBpm(B.bpm + +b.dataset.d); persist(); el.querySelector('#bk-bpm').textContent = B.bpm; el.querySelector('#bk-range').value = B.bpm; if (transport.name === 'подложка') transport.setBpm(B.bpm); },
        mute: b => { const k = b.dataset.k; B.mute[k] = !B.mute[k]; persist(); b.classList.toggle('bad', B.mute[k]); b.textContent = B.mute[k] ? 'выкл' : 'вкл'; applyMix(); },
        cadd: b => { if (B.custom.length >= 8) { toast('Максимум 8 аккордов'); return; } B.custom.push({ d: +b.dataset.d, bars: 1 }); persist(); el.querySelector('#bk-prog').innerHTML = progHTML(); restartIfRunning(); },
        crm: (b, e) => { e.stopPropagation(); B.custom.splice(+b.dataset.i, 1); persist(); el.querySelector('#bk-prog').innerHTML = progHTML(); restartIfRunning(); },
        cbars: b => { const c = B.custom[+b.dataset.i]; c.bars = { 1: 2, 2: 4, 4: 1 }[c.bars] || 1; persist(); el.querySelector('#bk-prog').innerHTML = progHTML(); restartIfRunning(); },
      },
    });
    el.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'bk-range') { B.bpm = +t.value; el.querySelector('#bk-bpm').textContent = B.bpm; if (transport.name === 'подложка') transport.setBpm(B.bpm); persist(); }
      if (t.dataset.vol) { B.vol[t.dataset.vol] = +t.value; persist(); applyMix(); }
    });
    el.addEventListener('change', e => {
      if (e.target.id === 'bk-ci') { B.countIn = e.target.checked; persist(); }
      if (e.target.id === 'bk-loop') { B.loop = e.target.checked; persist(); }
    });
  },
  unmount() { root = null; fb = null; },
  onSettings(k) { if (k === 'tuning' || k === 'german' || k === 'labels' || k === 'orient') render(); },
  onSpace() { if (transport.running && transport.name === 'подложка') transport.stop(); else start(); renderPlay(); return true; },
};
