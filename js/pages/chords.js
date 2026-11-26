// Вкладка «Аккорды»: аккорд = фигура на круге (треугольник поворачивается), реальные аппликатуры и таб.
import { settings, tuning } from '../state.js';
import { mod12, CHORDS, chordPcs, chordRoot, chordSymbol, chordRuName, spellChord, spellPc } from '../music.js';
import { chromaticSVG } from '../circle.js';
import { createFretboard } from '../fretboard.js';
import { COLORS, nm, ru, chips, bind, pill, info, degColor } from '../ui.js';
import * as audio from '../audio.js';
import { playNotes } from '../player.js';
import { chordMarkers, voicingNotes, chordTabHTML, qColor, shapeList, placeIdx, fretRange, chordDegreeOf, pcOfSp, voicingText } from './common.js';

const TYPES = [['power', 'Пауэр'], ['maj', 'Мажор'], ['min', 'Минор'], ['sus4', 'Sus4'], ['dim', 'Уменьш.'], ['aug', 'Увелич.']];
const ABOUT = {
  power: { cap: '+7 = пауэр-аккорд', what: 'Корень + квинта (часто + октава). Терции нет вообще.', why: 'Без терции аккорд ни мажорный, ни минорный. Под перегрузом это главное: терция в дисторшне даёт грязные призвуки, а квинта звучит плотно и чисто.', how: 'От 6-й струны: корень и +2 лада на 5-й. В Drop D — один палец поперёк 6-й и 5-й (и 4-й) струн на одном ладу. Лишние струны глуши подушечкой указательного.', sound: 'Мощно и нейтрально — основа рок- и метал-риффов.', fig: 'На круге это не треугольник, а отрезок длиной 7 часов.' },
  maj: { cap: '4 + 3 = мажор', what: 'Корень + большая терция (4 полутона) + ещё малая терция (3). На круге — треугольник со сторонами 4, 3 и 5.', why: 'Большая терция внизу даёт светлый, устойчивый звук.', how: 'E-форма — баррэ от 6-й струны; A-форма — баррэ от 5-й, в баррэ корень всегда самая низкая нота. Короткие формы «3 стр.» — то же трезвучие на трёх струнах без повторов, в басу может быть и терция, и квинта.', sound: 'Светло, радостно, «дома».', fig: 'Треугольник одинаковый для всех 12 мажоров: он просто поворачивается. Нажми «Повернуть».' },
  min: { cap: '3 + 4 = минор', what: 'Корень + малая терция (3) + большая (4). Зеркало мажора: средняя нота на 1 час ниже.', why: 'Малая терция внизу делает звук темнее.', how: 'Em-форма от 6-й и Am-форма от 5-й. От мажора отличается одним ладом на одной струне — найди его на грифе. Короткие формы «3 стр.» — три ноты без повторов; от мажорной формы на тех же струнах отличается одной терцией — на 1 лад ниже.', sound: 'Грустно, серьёзно, драматично.', fig: 'Пунктиром показан мажор с тем же корнем — сравни фигуры: это отражение.' },
  sus4: { cap: '5 + 2 = sus4', what: 'Терцию заменили квартой: корень + 4 + 5.', why: 'Без терции нет «мажорности/минорности», а кварта тянется вниз, к терции — аккорд «подвешен» и хочет разрешиться.', how: 'Как мажорная форма, но один палец на лад выше (на 3-й струне в E-форме, на 2-й — в A-форме).', sound: 'Ожидание, напряжение без мрака. В роке чередуют sus4 → мажор.', fig: 'Фигура 5 + 2 + 5: узкий «клин».' },
  dim: { cap: '3 + 3 = уменьшённый', what: 'Две малые терции подряд. Между крайними нотами — тритон (6 полутонов).', why: 'Тритон — самый неустойчивый интервал, поэтому аккорд тревожный и сам просится разрешиться.', how: 'Четырёхструнные формы от 6-й или 5-й струны (остальные струны не играют).', sound: 'Тревожно, «киношное» напряжение. Это VII ступень мажора.', fig: 'Треугольник 3 + 3 + 6: одна сторона — ровно полкруга.' },
  aug: { cap: '4 + 4 = увеличенный', what: 'Две большие терции подряд — и ещё 4 до корня.', why: 'Фигура делит круг на 3 равные части: у неё нет «верха и низа», поэтому звук будто висит в воздухе.', how: 'Четырёхструнные формы. Всего 4 разных увеличенных аккорда: C+ = E+ = G♯+ по нотам.', sound: 'Странно, сказочно, «повис».', fig: 'Равносторонний треугольник 4 + 4 + 4.' },
};
const S = { root: 0, type: 'maj', shape: 0, mirror: true, all: true };
let root = null, fb = null;

const rootSp = () => chordRoot(S.root, S.type);
const voicing = () => placeIdx(S.type, S.root, S.shape, 5);

function circle() {
  const pcs = chordPcs(S.root, S.type), col = qColor(S.type), sp = rootSp();
  const spelled = spellChord(sp, S.type);
  const byPc = {}; spelled.forEach(n => { byPc[pcOfSp(n)] = n; });
  const polys = [];
  if (S.mirror && (S.type === 'maj' || S.type === 'min')) {
    const other = S.type === 'maj' ? 'min' : 'maj';
    polys.push({ pcs: chordPcs(S.root, other), color: qColor(other), fill: 0.04, dash: true, op: 0.55, width: 1.6 });
  }
  polys.push({ pcs, color: col, steps: true, closeStep: S.type !== 'power' });
  return chromaticSVG({
    node: pc => {
      const sp2 = byPc[pc];
      if (sp2) { const d = chordDegreeOf(pc, S.root, S.type); return { text: nm(sp2), sub: ru(sp2), fill: degColor(d), glow: true }; }
      return { text: nmPc(pc), sub: ruPc(pc) };
    },
    polys,
    center: { big: chordSymbol(sp, S.type, settings.german), small: chordRuName(sp, S.type), color: col, w: 132 },
  });
}
// Кнопки аппликатур: полные формы одной строкой, трезвучия — группами по струнам с короткими подписями
function shapesHTML() {
  const list = shapeList(S.type), cur = Math.min(S.shape, list.length - 1);
  const full = list.map((s, i) => [i, s]).filter(([, s]) => !s.small);
  const sets = [...new Set(list.filter(s => s.small).map(s => s.set))];
  let html = chips('shape', full.map(([i, s]) => [i, s.name]), cur);
  for (const set of sets) {
    const items = list.map((s, i) => [i, s]).filter(([, s]) => s.set === set);
    html += `<div class="note" style="margin-top:8px">Трезвучие на 3 струнах: ${set}</div>`
      + chips('shape', items.map(([i, s]) => [i, s.name.split(' · ')[1]]), cur);
  }
  return html;
}
// Пояснение к короткой форме: трезвучие и обращения
const TRI_HOW = [
  'Корень внизу — «основной вид»: снизу вверх 1 → терция → квинта.',
  'Терция внизу — «первое обращение»: корень ушёл наверх, на октаву выше.',
  'Квинта внизу — «второе обращение»: наверх ушли и корень, и терция.',
];
function triadText(shape) {
  return `<b>Трезвучие на 3 струнах (${shape.set}).</b> Это и есть весь аккорд: три разные ноты, без повторов. В баррэ звучат те же три ноты, просто часть из них удвоена в других октавах. ${TRI_HOW[shape.inv]} `
    + 'Три формы на одних и тех же струнах идут по грифу друг за другом — выучи их как цепочку и играй один аккорд в трёх местах. '
    + 'С перегрузом трезвучие на тонких струнах звучит чище баррэ — его играют поверх пауэр-аккорда или риффа на басовых струнах. Остальные струны глуши.';
}
const nmPc = pc => nm(spellPc(pc));
const ruPc = pc => ru(spellPc(pc));

function update(focus = true) {
  if (!root) return;
  const { shape, frets } = voicing();
  const sp = rootSp(), a = ABOUT[S.type], col = qColor(S.type);
  root.querySelector('#ch-title').innerHTML = `Аккорд <span style="color:${col}">= фигура</span>`;
  root.querySelector('#ch-circle').innerHTML = circle();
  root.querySelector('#ch-cap').innerHTML = pill(a.cap, col);
  root.querySelector('#ch-roots').innerHTML = chips('root', Array.from({ length: 12 }, (_, pc) => [pc, nm(chordRoot(pc, S.type))]), S.root, 'notes12');
  root.querySelector('#ch-shapes').innerHTML = shapesHTML();
  root.querySelector('#ch-tab').innerHTML = chordTabHTML(sp, S.type, frets) + `<p class="note">${voicingText(frets)} · ноты: ${spellChord(sp, S.type).map(n => `<b style="color:${degColor(chordDegreeOf(pcOfSp(n), S.root, S.type))}">${nm(n)}</b>`).join(' ')}</p>`;
  root.querySelector('#ch-about').innerHTML = `
    <h3 style="margin-top:0;color:${col}">${CHORDS[S.type].name}: ${chordSymbol(sp, S.type, settings.german)}</h3>
    <p><b>Что это.</b> ${a.what}</p><p><b>Почему так звучит.</b> ${a.why}</p><p><b>Как сыграть.</b> ${a.how}</p><p><b>Как звучит.</b> ${a.sound}</p>
    ${info(a.fig, col)}
    ${shape.small ? info(triadText(shape), col) : ''}
    ${settings.tuning === 'dropd' ? info('<b>Drop D:</b> формы от 6-й струны свои — 6-я опущена на тон, поэтому она играет на 2 лада правее остальных. E-форма мажора превращается в «6-5-4 на одном ладу + верх на лад/два левее», а пауэр-аккорд — в один палец.', COLORS.root) : ''}`;
  fb.render({ markers: chordMarkers(sp, S.type, frets, { all: S.all }), focus: focus ? fretRange(frets) : null });
}
function play(arp = false) {
  const { frets } = voicing();
  const notes = voicingNotes(frets);
  if (arp) playNotes('арпеджио', notes.map(n => ({ midi: n.midi, s: n.string })), { bpm: 120, step: 6, onStep: i => fb && fb.setCursor(i < 0 ? [] : [{ s: notes[i].string, f: frets[notes[i].string] }]) });
  else audio.userPlay(notes);
}

export const page = {
  id: 'chords', title: 'Аккорды', section: 'theory',
  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="kicker">теория · хроматический круг</div>
      <h1 class="title-big" id="ch-title"></h1>
      ${chips('type', TYPES, S.type)}
      <div class="cols">
        <div class="card tight">
          <div id="ch-circle"></div>
          <div class="pillrow" id="ch-cap"></div>
          <div class="row" style="justify-content:center">
            <button class="btn" data-act="play">▶ Удар</button>
            <button class="btn g" data-act="arp">Арпеджио</button>
            <button class="btn g" data-act="rot">↻ Повернуть</button>
            <button class="btn g" data-act="cmp">Мажор ⇄ минор</button>
          </div>
        </div>
        <div class="card">
          <h3 style="margin-top:0">Корень</h3><div id="ch-roots"></div>
          <h3>Аппликатура</h3><div id="ch-shapes"></div>
          <div id="ch-tab"></div>
          <div class="row"><label class="note"><input type="checkbox" id="ch-all" ${S.all ? 'checked' : ''}> все ноты аккорда на грифе</label>
          <label class="note"><input type="checkbox" id="ch-mir" ${S.mirror ? 'checked' : ''}> зеркало мажор/минор на круге</label></div>
        </div>
      </div>
      <div class="card tight"><div id="ch-fb"></div>
        <div class="legend"><span><i style="background:${COLORS.root}"></i>1 — корень</span><span><i style="background:${COLORS.third}"></i>терция</span><span><i style="background:${COLORS.fifth}"></i>квинта</span><span><i style="background:${COLORS.other}"></i>кварта (sus4)</span><span>× — струна не играет</span></div>
      </div>
      <div class="card" id="ch-about"></div>
      <div class="card"><h3 style="margin-top:0">Аккорд на круге и на грифе</h3>
        <p>На круге из 12 нот (вкладка «Круг = гриф») аккорд — это треугольник. На гитаре круг «развёрнут» вдоль каждой струны: шаг на 1 час = шаг на 1 лад. Поэтому одна и та же фигура аккорда — это одна и та же аппликатура, просто сдвинутая по грифу: <b>сдвинул баррэ на 2 лада = повернул треугольник на 2 часа</b>.</p>
        <p>Мажор и минор отличаются только средней нотой (терцией): 4 полутона от корня — мажор, 3 — минор. На грифе это один лад.</p></div>`;
    fb = createFretboard(el.querySelector('#ch-fb'), {
      onTap: (s, f, midi) => { audio.userPlay([{ midi, string: s }]); fb.setCursor([{ s, f }]); },
    });
    bind(el, {
      seg: {
        type: v => { S.type = v; S.shape = 0; update(); play(); },
        root: v => { S.root = +v; update(); play(); },
        shape: v => { S.shape = +v; update(); play(); },
      },
      act: {
        play: () => play(), arp: () => play(true),
        rot: () => { S.root = mod12(S.root + 1); update(); play(); },
        cmp: () => {
          const a = S.type === 'min' ? 'min' : 'maj', b = a === 'maj' ? 'min' : 'maj';
          const v1 = placeIdx(a, S.root, 0, 5).frets, v2 = placeIdx(b, S.root, 0, 5).frets;
          S.type = a; update();
          playNotes('мажор и минор', [{ chord: voicingNotes(v1) }, { chord: voicingNotes(v2) }, { chord: voicingNotes(v1) }, { chord: voicingNotes(v2) }],
            { bpm: 80, step: 24, onStep: i => { if (i < 0 || !root) return; S.type = i % 2 ? b : a; update(false); } });
        },
      },
    });
    el.querySelector('#ch-all').addEventListener('change', e => { S.all = e.target.checked; update(false); });
    el.querySelector('#ch-mir').addEventListener('change', e => { S.mirror = e.target.checked; update(false); });
    update();
  },
  unmount() { root = null; fb = null; },
  onSettings() { update(false); },
};
