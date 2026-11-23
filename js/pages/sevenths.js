// Вкладка «Септаккорды»: четырёхугольники на круге (трезвучие + ещё нота через одну), аппликатуры,
// сравнение с трезвучием на слух, диатонические септаккорды, блюз и ii–V–I.
import { settings, tuning } from '../state.js';
import { mod12, CHORDS, chordPcs, chordRoot, chordSymbol, chordRuName, spellChord, spellPc, keyTonic, diatonicChords, bestVoicing, voicingAvg } from '../music.js';
import { chromaticSVG } from '../circle.js';
import { createFretboard } from '../fretboard.js';
import { COLORS, nm, ru, chips, bind, pill, info, degColor } from '../ui.js';
import * as audio from '../audio.js';
import { playNotes, playChords } from '../player.js';
import { chordMarkers, voicingNotes, chordTabHTML, qColor, shapeList, placeIdx, fretRange, chordDegreeOf, pcOfSp, voicingText } from './common.js';

const TYPES = [['maj7', 'maj7'], ['dom7', '7'], ['m7', 'm7'], ['m7b5', 'm7♭5'], ['dim7', 'dim7']];
const TRIAD = { maj7: 'maj', dom7: 'maj', m7: 'min', m7b5: 'dim', dim7: 'dim' };
const ABOUT = {
  maj7: { mood: 'дорого', cap: 'мажор + б.7 = «дорого»', what: 'Мажорное трезвучие + большая септима (11 полутонов). Септима стоит в 1 часе от корня — лёгкое трение.', sound: 'Мечтательно, «дорого», по-джазовому. Внутри — мажор (1-3-5) и минор (3-5-7): светло и грустно одновременно.' },
  dom7: { mood: 'напряжение', cap: 'сдвинь 7 на полутон = напряжение', what: 'Мажорное трезвучие + малая септима (10). Между 3 и ♭7 — тритон.', sound: 'Напряжение и блюз. Это V7 — аккорд, который сильнее всех тянет «домой» в тонику. В блюзе на нём строится вся форма.' },
  m7: { mood: 'мягкий минор', cap: 'минор + м.7 = мягкий минор', what: 'Минорное трезвучие + малая септима (10).', sound: 'Мягкий, бархатный минор без резкости: фанк, соул, лоу-фай. ii7 в ii–V–I.' },
  m7b5: { mood: 'тёмный', cap: 'уменьшённый + м.7', what: 'Уменьшённое трезвучие + малая септима: 3 + 3 + 4. Его зовут «полууменьшённым» (ø).', sound: 'Тёмный и неустойчивый. Это vii в мажоре и ii в миноре — в минорном ii–V–i он открывает каденцию.' },
  dim7: { mood: 'драма', cap: '3 + 3 + 3 + 3 = квадрат', what: 'Три малые терции подряд — на круге идеальный квадрат. Сдвинь на 3 лада — получишь те же ноты.', sound: 'Драма, «киношный» ужас, неоклассика. Всего 3 разных уменьшённых септаккорда.' },
};
const S = { root: 0, type: 'maj7', shape: 0, triad: true };
let root = null, fb = null;
const rootSp = () => chordRoot(S.root, S.type);

function circle() {
  const pcs = chordPcs(S.root, S.type), col = qColor(S.type), sp = rootSp();
  const byPc = {}; spellChord(sp, S.type).forEach(n => { byPc[pcOfSp(n)] = n; });
  const polys = [];
  if (S.triad) polys.push({ pcs: chordPcs(S.root, TRIAD[S.type]), color: qColor(TRIAD[S.type]), fill: 0.05, dash: true, op: 0.6, width: 1.6 });
  polys.push({ pcs, color: col, steps: true });
  return chromaticSVG({
    node: pc => {
      const s2 = byPc[pc];
      if (s2) return { text: nm(s2), sub: ru(s2), fill: degColor(chordDegreeOf(pc, S.root, S.type)), glow: true };
      return { text: nm(spellPc(pc)), sub: ru(spellPc(pc)) };
    },
    polys,
    center: { big: chordSymbol(sp, S.type, settings.german), small: ABOUT[S.type].mood, color: col, w: 140 },
  });
}

function update(focus = true) {
  if (!root) return;
  const { frets } = placeIdx(S.type, S.root, S.shape, 5);
  const sp = rootSp(), a = ABOUT[S.type], col = qColor(S.type);
  root.querySelector('#se-circle').innerHTML = circle();
  root.querySelector('#se-cap').innerHTML = pill(a.cap, col);
  root.querySelector('#se-types').innerHTML = chips('type', TYPES, S.type);
  root.querySelector('#se-roots').innerHTML = chips('root', Array.from({ length: 12 }, (_, pc) => [pc, nm(chordRoot(pc, S.type))]), S.root, 'notes12');
  root.querySelector('#se-shapes').innerHTML = chips('shape', shapeList(S.type).map((s, i) => [i, s.name]), Math.min(S.shape, shapeList(S.type).length - 1));
  root.querySelector('#se-tab').innerHTML = chordTabHTML(sp, S.type, frets) + `<p class="note">${voicingText(frets)} · ноты: ${spellChord(sp, S.type).map(n => `<b style="color:${degColor(chordDegreeOf(pcOfSp(n), S.root, S.type))}">${nm(n)}</b>`).join(' ')}</p>`;
  root.querySelector('#se-about').innerHTML = `<h3 style="margin-top:0;color:${col}">${CHORDS[S.type].name}</h3><p><b>Что это.</b> ${a.what}</p><p><b>Как звучит.</b> ${a.sound}</p>
    ${info('<b>Как строится:</b> бери ноты «через одну» по гамме: 1-3-5 — трезвучие, ещё через одну — 7-я нота, септима. На круге треугольник превращается в четырёхугольник: +1 нота = глубже.', col)}`;
  const kt = keyTonic(S.root, 'ionian');
  const dia = diatonicChords(kt, 'ionian', true);
  root.querySelector('#se-dia').innerHTML = `<p class="note">Тональность ${nm(kt)} мажор (по корню выше):</p><div class="chips">${dia.map(c => `<button type="button" class="chip ${c.type === 'dom7' || c.type === 'm7b5' ? 'r' : c.type === 'm7' ? 'p' : ''}" data-act="dia" data-d="${c.degree}">${chordSymbol(c.root, c.type, settings.german)}<small>${c.roman}</small></button>`).join('')}</div>`;
  fb.render({ markers: chordMarkers(sp, S.type, frets), focus: focus ? fretRange(frets) : null });
}
function playV(type, pc, target = 5, at) {
  const v = bestVoicing(type, pc, settings.tuning, target);
  return v ? voicingNotes(v.frets) : [];
}
function seqChords(name, list, beats = 2, bpm = 96) {
  let avg = 5;
  const chords = list.map(([pc, type]) => { const v = bestVoicing(type, pc, settings.tuning, avg); avg = voicingAvg(v.frets); return { notes: voicingNotes(v.frets), beats, frets: v.frets, pc, type }; });
  const keep = { root: S.root, type: S.type };
  playChords(name, chords, { bpm, onStep: i => { if (!root) return; if (i < 0) { S.root = keep.root; S.type = keep.type; update(false); return; } const c = chords[i]; S.root = c.pc; S.type = c.type; S.shape = 0; update(false); fb.render({ markers: chordMarkers(chordRoot(c.pc, c.type), c.type, c.frets), focus: fretRange(c.frets) }); } });
}

export const page = {
  id: 'sevenths', title: 'Септаккорды', section: 'theory',
  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="kicker">теория · септаккорды</div>
      <h1 class="title-big"><span style="color:${COLORS.seventh}">Септ</span>аккорды</h1>
      <div class="pillrow">${pill('+1 нота = глубже', COLORS.root)} ${pill('7-я нота = септима', COLORS.seventh)}</div>
      <div id="se-types"></div>
      <div class="cols">
        <div class="card tight">
          <div id="se-circle"></div><div class="pillrow" id="se-cap"></div>
          <div class="row" style="justify-content:center">
            <button class="btn" data-act="play">▶ Септаккорд</button>
            <button class="btn g" data-act="cmp">Трезвучие → септ</button>
            <button class="btn g" data-act="arp">Арпеджио</button>
          </div>
          <label class="note" style="display:block;text-align:center"><input type="checkbox" id="se-tr" ${S.triad ? 'checked' : ''}> показать трезвучие внутри (пунктир)</label>
        </div>
        <div class="card"><h3 style="margin-top:0">Корень</h3><div id="se-roots"></div><h3>Аппликатура</h3><div id="se-shapes"></div><div id="se-tab"></div></div>
      </div>
      <div class="card tight"><div id="se-fb"></div>
        <div class="legend"><span><i style="background:${COLORS.root}"></i>1</span><span><i style="background:${COLORS.third}"></i>терция</span><span><i style="background:${COLORS.fifth}"></i>квинта</span><span><i style="background:${COLORS.seventh}"></i>септима</span></div></div>
      <div class="card" id="se-about"></div>
      <div class="card"><h3 style="margin-top:0">Септаккорды тональности: +1 нота к каждому</h3><div id="se-dia"></div>
        <p class="note">Imaj7 и IVmaj7 — «дорогие», ii7 iii7 vi7 — мягкие минорные, V7 — единственный доминантсепт (тянет домой), viiø7 — тёмный.</p></div>
      <div class="card"><h3 style="margin-top:0">Блюз и ii–V–I</h3>
        <p><b>Блюз</b> играют на трёх доминантсептах: I7, IV7 и V7 — все «неправильные» с точки зрения тональности (в мажоре септаккорд только на V), и именно это даёт блюзовую грязь. 12 тактов: I7 I7 I7 I7 · IV7 IV7 I7 I7 · V7 IV7 I7 V7.</p>
        <p><b>ii–V–I</b> — главный ход джаза и соула: ii7 → V7 → Imaj7. На квинтовом круге каждый аккорд на шаг против часовой: Dm7 → G7 → Cmaj7. Напряжение копится и разрешается «домой».</p>
        <div class="row"><button class="btn r" data-act="blues">▶ Блюз (12 тактов, коротко)</button><button class="btn" data-act="twofive">▶ ii–V–I</button></div></div>`;
    fb = createFretboard(el.querySelector('#se-fb'), { onTap: (s, f, midi) => { audio.userPlay([{ midi, string: s }]); fb.setCursor([{ s, f }]); } });
    bind(el, {
      seg: {
        type: v => { S.type = v; S.shape = 0; update(); audio.userPlay(voicingNotes(placeIdx(S.type, S.root, 0, 5).frets)); },
        root: v => { S.root = +v; update(); audio.userPlay(voicingNotes(placeIdx(S.type, S.root, S.shape, 5).frets)); },
        shape: v => { S.shape = +v; update(); audio.userPlay(voicingNotes(placeIdx(S.type, S.root, S.shape, 5).frets)); },
      },
      act: {
        play: () => audio.userPlay(voicingNotes(placeIdx(S.type, S.root, S.shape, 5).frets)),
        arp: () => { const fr = placeIdx(S.type, S.root, S.shape, 5).frets, ns = voicingNotes(fr); playNotes('арпеджио', ns.map(n => ({ midi: n.midi, s: n.string })), { bpm: 120, step: 6, onStep: i => fb && fb.setCursor(i < 0 ? [] : [{ s: ns[i].string, f: fr[ns[i].string] }]) }); },
        cmp: () => {
          const t = placeIdx(TRIAD[S.type], S.root, 0, 5).frets, s7 = placeIdx(S.type, S.root, S.shape, 5).frets;
          playNotes('трезвучие и септаккорд', [{ chord: voicingNotes(t) }, { chord: voicingNotes(s7) }, { chord: voicingNotes(t) }, { chord: voicingNotes(s7) }], { bpm: 76, step: 24 });
        },
        dia: b => { const kt = keyTonic(S.root, 'ionian'); const c = diatonicChords(kt, 'ionian', true)[+b.dataset.d]; audio.userPlay(playV(c.type, c.rootPc)); },
        blues: () => { const r = S.root; seqChords('блюз', [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7].map(st => [mod12(r + st), 'dom7']), 2, 120); },
        twofive: () => { const r = S.root; seqChords('ii–V–I', [[mod12(r + 2), 'm7'], [mod12(r + 7), 'dom7'], [r, 'maj7']], 4, 84); },
      },
    });
    el.querySelector('#se-tr').addEventListener('change', e => { S.triad = e.target.checked; update(false); });
    update();
  },
  unmount() { root = null; fb = null; },
  onSettings() { update(false); },
};
