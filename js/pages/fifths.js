// Вкладка «Квинты»: квинтовый круг. Тональность = 6 соседних аккордов, знаки при ключе, диатонические аккорды,
// последовательности, V→I «домой», гамма/пентатоника тональности на грифе, параллельные тональности.
import { settings, tuning } from '../state.js';
import { mod12, FIFTHS, MODES, PENTA, spellScale, spellPenta, keySignature, diatonicChords, progressionChords, PROGRESSIONS,
  chordSymbol, chordPcs, bestVoicing, voicingAvg, pcOf, MAX_FRET, degLabel, ruName } from '../music.js';
import { fifthsSVG } from '../circle.js';
import { createFretboard } from '../fretboard.js';
import { COLORS, QUALITY_COLOR, nm, ru, chips, seg, bind, pill, info, degColor } from '../ui.js';
import * as audio from '../audio.js';
import { playChords } from '../player.js';
import { voicingNotes } from './common.js';

const S = { k: 0, minor: false, view: 'scale', sel: null, prog: null, arrow: null, tritone: false, playing: -1 };
let root = null, fb = null;

const key = () => {
  const K = FIFTHS[S.k], tonic = S.minor ? K.min : K.maj, mode = S.minor ? 'aeolian' : 'ionian';
  return { K, tonic, mode, pc: pcOf(tonic) };
};
const QCLS = { maj: '', min: 'p', dim: 'r', dom7: 'r', m7: 'p' };
// где диатонический аккорд лежит на круге
function placeOnCircle(deg) {
  const k = S.k, m = S.minor;
  const map = m ? [[k, 1], null, [k, 0], [k - 1, 1], [k + 1, 1], [k - 1, 0], [k + 1, 0]] : [[k, 0], [k - 1, 1], [k + 1, 1], [k - 1, 0], [k + 1, 0], [k, 1], null];
  const p = map[deg];
  return p ? { k: mod12(p[0]), minor: !!p[1] } : null;
}
function voiceFor(c, prevAvg = 5) {
  const v = bestVoicing(c.type, c.rootPc, settings.tuning, prevAvg);
  return v ? v.frets : null;
}

function circle() {
  const { K, tonic } = key();
  const hl = [];
  if (S.sel != null) { const p = placeOnCircle(S.sel); if (p) hl.push(p); }
  return fifthsSVG({
    keys: FIFTHS, sel: S.k, minor: S.minor,
    labelMaj: X => nm(X.maj), labelMin: X => nm(X.min) + 'm',
    romans: S.minor ? { maj: ['VI', 'III', 'VII'], min: ['iv', 'i', 'v'] } : { maj: ['IV', 'I', 'V'], min: ['ii', 'vi', 'iii'] },
    arrows: S.arrow ? [S.arrow] : [], tritone: S.tritone, hl,
    center: { big: nm(tonic) + (S.minor ? 'm' : ''), small: ruName(tonic, true) + (S.minor ? ' минор' : ' мажор'), color: S.minor ? COLORS.third : COLORS.root },
  });
}

function scaleData() {
  const { tonic, mode, pc } = key();
  if (S.view === 'penta') {
    const kind = S.minor ? 'minor' : 'major', P = PENTA[kind];
    return { notes: spellPenta(tonic, kind), iv: P.iv, degs: P.iv.map((st, i) => degLabel(st, P.lt[i])), pc };
  }
  const iv = MODES[mode].iv;
  return { notes: spellScale(tonic, iv), iv, degs: iv.map((st, i) => degLabel(st, i)), pc };
}

function renderFretboard(focus = true) {
  const tun = tuning();
  const { notes, degs, pc } = scaleData();
  const dia = diatonicChords(key().tonic, key().mode);
  const chordSet = S.sel != null ? new Set(chordPcs(dia[S.sel].rootPc, S.prog && S.progChord ? S.progChord.type : dia[S.sel].type)) : null;
  const markers = [];
  for (let s = 0; s < 6; s++) for (let f = 0; f <= MAX_FRET; f++) {
    const p = mod12(tun[s] + f);
    const i = notes.findIndex(n => pcOf(n) === p);
    if (i < 0) continue;
    const text = settings.labels === 'degrees' ? degs[i] : nm(notes[i]);
    const color = degColor(degs[i]);
    if (chordSet) markers.push(chordSet.has(p) ? { s, f, text, color, kind: 'target' } : { s, f, text, color, kind: 'dim' });
    else markers.push({ s, f, text, color, kind: i === 0 ? undefined : 'dim', glow: i === 0 });
  }
  let lo = mod12(pc - tun[0]);
  if (lo > 9) lo -= 12;
  if (lo < 0) lo += 12;
  fb.render({ markers, window: [Math.max(0, lo), lo + 4], focus: focus ? [Math.max(0, lo), lo + 4] : null });
}

function update(focus = true) {
  if (!root) return;
  const { K, tonic, mode, pc } = key();
  const sig = keySignature(tonic, mode);
  const dia = diatonicChords(tonic, mode);
  root.querySelector('#fi-circle').innerHTML = circle();
  const sigTxt = sig.sharps ? `${sig.sharps} ♯: ${sig.list.map(nm).join(' ')}` : sig.flats ? `${sig.flats} ♭: ${sig.list.map(nm).join(' ')}` : 'без знаков — только белые клавиши';
  root.querySelector('#fi-sig').innerHTML = pill(sigTxt, sig.sharps ? COLORS.sharp : sig.flats ? COLORS.flat : '#e8ecf3');
  const { notes, degs } = scaleData();
  root.querySelector('#fi-notes').innerHTML = `<p><b>${S.view === 'penta' ? 'Пентатоника' : 'Гамма'}:</b> ${notes.map((n, i) => `<b style="color:${degColor(degs[i])}">${nm(n)}</b><sub class="mu">${degs[i]}</sub>`).join(' ')}</p>`;
  root.querySelector('#fi-dia').innerHTML = `<div class="chips">${dia.map(c => `<button type="button" class="chip ${QCLS[c.type] || ''} ${S.sel === c.degree ? 'on' : ''}" data-act="chord" data-d="${c.degree}">${chordSymbol(c.root, c.type, settings.german)}<small>${c.roman}</small></button>`).join('')}</div>`;
  const progs = PROGRESSIONS[S.minor ? 'minor' : 'major'];
  root.querySelector('#fi-progs').innerHTML = `<div class="chips">${progs.map(p => `<button type="button" class="chip ${S.prog === p.id ? 'on' : ''}" data-act="prog" data-id="${p.id}">${p.name}<small>${progressionChords(tonic, mode, p).slice(0, 4).map(c => chordSymbol(c.root, c.type, settings.german)).join(' ')}${p.degs.length > 4 ? ' …' : ''}</small></button>`).join('')}</div>`;
  const rel = S.minor ? `${nm(K.maj)} мажор` : `${nm(K.min)}m (${ruName(K.min, true)} минор)`;
  // одноимённая: из минора в мажор — на 3 шага по часовой (+3 ♯), из мажора в минор — на 3 шага против (+3 ♭)
  const parSig = keySignature(S.minor ? FIFTHS[mod12(S.k + 3)].maj : FIFTHS[mod12(S.k - 3)].min, S.minor ? 'ionian' : 'aeolian');
  root.querySelector('#fi-rel').innerHTML = `
    <p><b>Параллельная тональность:</b> ${rel} — те же 7 нот и те же знаки, другая тоника. Минорная тоника на 3 полутона ниже мажорной (это VI ступень мажора). На круге она стоит прямо под мажором.</p>
    <p><b>Одноимённая:</b> ${nm(tonic)} ${S.minor ? 'мажор' : 'минор'} — та же тоника, но ${S.minor ? 'на 3 знака «светлее» (+3 ♯ или −3 ♭)' : 'на 3 знака «темнее» (+3 ♭ или −3 ♯)'}: ${parSig.sharps ? parSig.sharps + '♯' : parSig.flats ? parSig.flats + '♭' : 'без знаков'}. В роке и метале их часто смешивают (например, ♭VI и ♭VII в мажоре).</p>`;
  renderFretboard(focus);
}

function playKeyChord(c, label) {
  const fr = voiceFor(c, 5);
  if (fr) audio.userPlay(voicingNotes(fr));
}
function runProg(list, name, opts = {}) {
  let avg = 5;
  const chords = list.map(c => { const fr = voiceFor(c, avg); avg = voicingAvg(fr); return { notes: voicingNotes(fr), beats: opts.beats || 2, c }; });
  playChords(name, chords, {
    bpm: opts.bpm || 92,
    onStep: i => {
      if (!root) return;
      if (i < 0) { S.sel = null; S.progChord = null; if (opts.end) opts.end(); update(false); return; }
      const c = chords[i].c;
      S.sel = c.degree != null ? c.degree : null; S.progChord = c;
      update(false);
      root.querySelectorAll('#fi-dia .chip').forEach(b => b.classList.toggle('cur', +b.dataset.d === S.sel));
    },
  });
}

export const page = {
  id: 'fifths', title: 'Квинты', section: 'theory',
  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="kicker">теория · квинтовый круг</div>
      <h1 class="title-big">Квинтовый <span>круг</span></h1>
      <div class="pillrow">${pill('шаг 7 полутонов = квинта', '#e8ecf3')}</div>
      <div class="cols">
        <div class="card tight">
          <div id="fi-circle"></div>
          <div class="pillrow" id="fi-sig"></div>
          <p class="note" style="text-align:center">Нажми на тональность: снаружи мажорные, внутри параллельные минорные. Подсвечен сектор: тональность + 2 соседа = 6 аккордов.</p>
        </div>
        <div class="card">
          <div class="row">${seg('mode', [['0', 'Мажор'], ['1', 'Минор']], S.minor ? '1' : '0')}${seg('view', [['scale', 'Гамма'], ['penta', 'Пентатоника']], S.view)}</div>
          <div id="fi-notes"></div>
          <h3>7 аккордов тональности</h3><div id="fi-dia"></div>
          <p class="note">I, IV, V — мажорные, ii, iii, vi — минорные, vii° — уменьшённый (в миноре: i, iv, v минорные; III, VI, VII мажорные; ii° уменьшённый). Нажми — прозвучит, а на грифе подсветятся его ноты внутри гаммы.</p>
          <h3>Последовательности</h3><div id="fi-progs"></div>
          <div class="row"><button class="btn" data-act="home">V → I = домой</button><button class="btn g" data-act="near">К соседу = плавно</button><button class="btn g" data-act="far">Через полкруга = резко</button></div>
          <div id="fi-cmp"></div>
        </div>
      </div>
      <div class="card tight"><div id="fi-fb"></div>
        <div class="legend"><span><i style="background:${COLORS.root}"></i>тоника</span><span><i style="background:${COLORS.third}"></i>терция</span><span><i style="background:${COLORS.fifth}"></i>квинта</span><span><i style="background:${COLORS.seventh}"></i>септима</span><span>белое кольцо — ноты выбранного аккорда</span></div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Зубрить не нужно: как читать круг</h3>
        <ul>
          <li><b>Каждая точка = тональность.</b> Соседи отличаются ровно одной нотой: <b>6 из 7 нот совпадают</b>, поэтому переход к соседу звучит плавно.</li>
          <li><b>По часовой: +1 диез.</b> Новый диез — это 7-я ступень новой тональности (в соль мажоре появляется фа♯). <b>Против часовой: +1 бемоль</b> — новый бемоль это 4-я ступень (в фа мажоре — си♭).</li>
          <li><b>Тональность + 2 соседа = 6 аккордов на целую песню:</b> три мажорных снаружи (IV I V) и три минорных внутри (ii vi iii). Остаётся седьмой, уменьшённый — он редкий.</li>
          <li><b>Через полкруга = резко:</b> напротив стоит тональность через тритон — у них общих всего 2 ноты.</li>
          <li><b>V → I = «домой».</b> Аккорд на шаг по часовой (доминанта) тянет в тонику. Так заканчивают куплет, припев и песню. С септимой (V7) тяга ещё сильнее.</li>
        </ul>
      </div>
      <div class="card" id="fi-rel"></div>`;
    fb = createFretboard(el.querySelector('#fi-fb'), { onTap: (s, f, midi) => { audio.userPlay([{ midi, string: s }]); fb.setCursor([{ s, f }]); } });
    bind(el, {
      seg: {
        mode: v => { S.minor = v === '1'; S.sel = null; S.prog = null; update(); },
        view: v => { S.view = v; update(false); },
      },
      act: {
        key: b => { S.k = +b.dataset.k; S.minor = b.dataset.minor === '1'; S.sel = null; S.arrow = null; S.tritone = false; el.querySelectorAll('[data-seg=mode] [data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === (S.minor ? '1' : '0'))); update(); const { tonic, mode } = key(); playKeyChord(diatonicChords(tonic, mode)[0]); },
        chord: b => { const d = +b.dataset.d; S.sel = S.sel === d ? null : d; S.progChord = null; update(false); const { tonic, mode } = key(); playKeyChord(diatonicChords(tonic, mode)[d]); },
        prog: b => { const { tonic, mode } = key(); const p = PROGRESSIONS[S.minor ? 'minor' : 'major'].find(x => x.id === b.dataset.id); S.prog = p.id; update(false); runProg(progressionChords(tonic, mode, p), p.name, { beats: p.degs.length > 8 ? 2 : 4, bpm: 100, end: () => { S.prog = null; } }); },
        home: () => {
          const { tonic, mode } = key(); const dia = diatonicChords(tonic, mode);
          const V = { ...dia[4], type: 'dom7', degree: 4 }, I = dia[0];
          S.arrow = { from: mod12(S.k + 1), to: S.k, color: COLORS.root }; S.tritone = false;
          runProg([I, V, I], 'V→I', { beats: 4, bpm: 84, end: () => { S.arrow = null; } });
        },
        near: () => {
          const { tonic, mode } = key(); const dia = diatonicChords(tonic, mode);
          const nk = FIFTHS[mod12(S.k + 1)], nt = S.minor ? nk.min : nk.maj;
          const other = diatonicChords(nt, mode)[0];
          S.arrow = { from: S.k, to: mod12(S.k + 1), color: COLORS.root }; S.tritone = false;
          compare(mod12(S.k + 1));
          runProg([dia[0], { ...other, degree: null }, dia[0]], 'к соседу', { beats: 4, bpm: 84, end: () => { S.arrow = null; } });
        },
        far: () => {
          const { tonic, mode } = key(); const dia = diatonicChords(tonic, mode);
          const fk = FIFTHS[mod12(S.k + 6)], ft = S.minor ? fk.min : fk.maj;
          const other = diatonicChords(ft, mode)[0];
          S.tritone = true; S.arrow = null;
          compare(mod12(S.k + 6));
          runProg([dia[0], { ...other, degree: null }, dia[0]], 'через полкруга', { beats: 4, bpm: 84, end: () => { S.tritone = false; } });
        },
      },
    });
    function compare(k2) {
      const { tonic, mode } = key();
      const a = spellScale(tonic, MODES[mode].iv), K2 = FIFTHS[k2], t2 = S.minor ? K2.min : K2.maj;
      const b = spellScale(t2, MODES[mode].iv);
      const pa = new Set(a.map(pcOf)), common = b.filter(n => pa.has(pcOf(n)));
      el.querySelector('#fi-cmp').innerHTML = info(`<b>${nm(tonic)} и ${nm(t2)}:</b> общих нот ${common.length} из 7 (${common.map(nm).join(' ')}).${common.length === 6 ? ' Отличается одна: ' + a.filter(n => !b.some(x => pcOf(x) === pcOf(n))).map(nm).join('') + ' → ' + b.filter(n => !pa.has(pcOf(n))).map(nm).join('') + '.' : ' Поэтому переход звучит резко.'}`, common.length === 6 ? COLORS.root : COLORS.seventh);
    }
    update();
  },
  unmount() { root = null; fb = null; },
  onSettings() { update(false); },
};
