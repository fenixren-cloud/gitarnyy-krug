// Вкладка «Лады»: 7 ладов мажора + гармонический минор и фригийский доминантовый.
// Формула, характерная нота, настроение, жанры, родительский мажор и квинтовый круг, позиции, бурдон.
import { settings, setSetting, tuning } from '../state.js';
import { mod12, MODES, MODE_ORDER, BRIGHTNESS, modeDegrees, keyTonic, spellScale, keySignature, parentMajor, modePositions, pcOf, ruName, MAX_FRET } from '../music.js';
import { createFretboard } from '../fretboard.js';
import { COLORS, nm, chips, bind, pill, info, degColor } from '../ui.js';
import * as audio from '../audio.js';
import { playNotes } from '../player.js';

const TEXT = {
  ionian: 'Обычный мажор. Характерная нота — 7 (вводный тон): она на полутон ниже тоники и тянет «домой», поэтому мажор звучит завершённо.',
  dorian: 'Минор с большой секстой: 6 вместо ♭6. Одна поднятая нота убирает безысходность — минор становится «крутым» и грувовым. Звучит над аккордами i–IV (например, Am–D).',
  phrygian: 'Минор с малой секундой: ♭2 — нота на полутон выше тоники. Самый тёмный из ладов с чистой квинтой, поэтому на нём держатся тяжёлые риффы.',
  lydian: 'Мажор с увеличенной квартой: ♯4. Обычная кварта «приземляет» мажор, а ♯4 на полутон ниже квинты — звук парит, сказочный. Звучит над I–II (C–D).',
  mixolydian: 'Мажор с малой септимой: ♭7. Нет вводного тона — меньше тяги домой, зато рок-н-ролльная расслабленность. Классика рока — I–♭VII (A–G).',
  aeolian: 'Натуральный минор: ♭3, ♭6, ♭7. Характерная — ♭6: именно она делает минор печальным и эпичным. Основа метала и рок-баллад.',
  locrian: 'Единственный лад без чистой квинты (♭5): тоническое трезвучие уменьшённое, лад не может «успокоиться». Его используют для диссонансных риффов и коротких вставок.',
  harmonic: 'Натуральный минор с поднятой 7-й ступенью: 7 вместо ♭7. Между ♭6 и 7 — увеличенная секунда (3 лада): «восточный» скачок. Появляется мажорная доминанта V — сильная тяга в тонику.',
  phrygdom: 'Фригийский с большой терцией (3 вместо ♭3) — 5-й лад гармонического минора. Между ♭2 и 3 — увеличенная секунда: экзотика, «пустыня». Над пауэр-аккордом тоники — ориентальные метал-риффы.',
};
const S = { tonic: 4, mode: 'phrygian', pos: 0 };
let root = null, fb = null;

const tonicSp = () => keyTonic(S.tonic, S.mode);
const charSet = () => new Set(MODES[S.mode].char.map(st => mod12(S.tonic + st)));

function diffs(refId) {
  const a = MODES[S.mode].iv, b = MODES[refId].iv, da = modeDegrees(S.mode), db = modeDegrees(refId);
  const out = [];
  for (let i = 0; i < 7; i++) if (a[i] !== b[i]) out.push(`<b class="dg rc">${da[i]}</b> вместо ${db[i]}`);
  return out;
}

function renderFretboard(focus = true) {
  const tun = tuning(), M = MODES[S.mode], notes = spellScale(tonicSp(), M.iv), degs = modeDegrees(S.mode), cs = charSet();
  const mk = (s, f, extra = {}) => {
    const pc = mod12(tun[s] + f), i = M.iv.findIndex(st => mod12(S.tonic + st) === pc);
    if (i < 0) return null;
    const isChar = cs.has(pc);
    return { s, f, text: settings.labels === 'degrees' ? degs[i] : nm(notes[i]), color: degColor(degs[i], isChar), glow: i === 0 || isChar, ...extra };
  };
  const markers = [];
  if (S.pos === 'all') {
    for (let s = 0; s < 6; s++) for (let f = 0; f <= MAX_FRET; f++) { const m = mk(s, f); if (m) markers.push(m); }
    fb.render({ markers, window: null, focus: focus ? [0, 7] : null });
    return;
  }
  const p = modePositions(S.tonic, S.mode, tun)[S.pos];
  p.notes.forEach(n => { const m = mk(n.s, n.f); if (m) markers.push(m); });
  fb.render({ markers, window: [p.minFret, p.maxFret], focus: focus ? [p.minFret, p.maxFret] : null });
}

function update(focus = true) {
  if (!root) return;
  const M = MODES[S.mode], sp = tonicSp(), notes = spellScale(sp, M.iv), degs = modeDegrees(S.mode), cs = charSet();
  const sig = keySignature(sp, S.mode);
  const par = parentMajor(sp, S.mode);
  root.querySelector('#mo-modes').innerHTML = chips('mode', MODE_ORDER.map(id => [id, MODES[id].name]), S.mode);
  root.querySelector('#mo-tonic').innerHTML = chips('tonic', Array.from({ length: 12 }, (_, pc) => [pc, nm(keyTonic(pc, S.mode))]), S.tonic, 'notes12');
  root.querySelector('#mo-formula').innerHTML = `
    <div class="title-big" style="font-size:19px">${nm(sp)} <span style="color:${COLORS.char}">${M.name.toLowerCase()}</span></div>
    <div class="pillrow">${pill(M.alt, COLORS.char)}</div>
    <div class="chips" style="justify-content:center">${degs.map((d, i) => { const ch = cs.has(pcOf(notes[i])); return `<div class="chip" style="${ch ? `border-color:${COLORS.char};color:${COLORS.char}` : `color:${degColor(d)}`}">${d}<small>${nm(notes[i])}</small></div>`; }).join('')}</div>
    <p><b>Настроение:</b> ${M.mood}.<br><b>Где звучит:</b> ${M.genres}.</p>
    <p>${TEXT[S.mode]}</p>
    <p><b>Против натурального минора:</b> ${S.mode === 'aeolian' ? 'это он и есть' : diffs('aeolian').join(', ')}.${M.family === 'major' && S.mode !== 'ionian' ? ` <b>Против мажора:</b> ${diffs('ionian').join(', ')}.` : ''}</p>
    <p><b>Родство:</b> ${par ? `${nm(sp)} ${M.name.toLowerCase()} = <b>${nm(par)} мажор</b>, сыгранный от ${ruName(sp, true)} (${MODE_ORDER.indexOf(S.mode) + 1}-я ступень). Те же ноты и знаки — ${sig.sharps ? sig.sharps + '♯' : sig.flats ? sig.flats + '♭' : 'без знаков'}; на квинтовом круге это сектор тональности ${nm(par)}.`
      : S.mode === 'harmonic' ? `натуральный ${nm(sp)} минор (${sig.sharps ? sig.sharps + '♯' : sig.flats ? sig.flats + '♭' : 'без знаков'}) + поднятая 7-я ступень (знак ставится прямо в нотах, а не при ключе).`
      : `5-й лад гармонического минора ${nm(spellScale(sp, M.iv)[3])} (от его 5-й ступени). Знаки как у ${nm(sp)} фригийского + поднятая терция.`}</p>`;
  root.querySelector('#mo-ladder').innerHTML = BRIGHTNESS.map((id, i) => {
    const ch = ['самый светлый', '♯4 → 4', '7 → ♭7', '3 → ♭3', '6 → ♭6', '2 → ♭2', '5 → ♭5'][i];
    return `<button type="button" class="chip ${id === S.mode ? 'on' : ''}" data-act="ladder" data-id="${id}">${MODES[id].name}<small>${ch}</small></button>`;
  }).join('<span class="mu" style="align-self:center">→</span>');
  root.querySelector('#mo-pos').innerHTML = chips('pos', [...[0, 1, 2, 3, 4].map(i => [i, `Позиция ${i + 1}`]), ['all', 'Весь гриф']], S.pos);
  renderFretboard(focus);
}

function positionNotes() {
  const p = modePositions(S.tonic, S.mode, tuning())[S.pos === 'all' ? 0 : S.pos];
  return [...p.notes].sort((a, b) => a.midi - b.midi);
}
function playMode() {
  const up = positionNotes();
  const seq = [...up, ...up.slice(0, -1).reverse()];
  playNotes('лад', seq.map(n => ({ midi: n.midi, s: n.s, f: n.f })), { bpm: 110, step: 6, onStep: i => fb && fb.setCursor(i < 0 ? [] : [{ s: seq[i].s, f: seq[i].f, color: charSet().has(seq[i].pc) ? COLORS.char : '#fff' }]) });
}
function playLick() {
  const ns = positionNotes(), M = MODES[S.mode];
  const t = ns.find(n => n.pc === S.tonic) || ns[0];
  const near = st => { const pc = mod12(S.tonic + st); return ns.filter(n => n.pc === pc && n.midi >= t.midi).sort((a, b) => a.midi - b.midi)[0] || ns.find(n => n.pc === pc); };
  const ch = M.char[0], third = M.iv[2], fifth = M.iv[4];
  const seq = [0, ch, 0, ch, third, fifth, ch, 0].map(near).filter(Boolean);
  playNotes('характерный ход', seq.map(n => ({ midi: n.midi, s: n.s, f: n.f })), { bpm: 84, step: 6, onStep: i => fb && fb.setCursor(i < 0 ? [] : [{ s: seq[i].s, f: seq[i].f }]) });
}

export const page = {
  id: 'modes', title: 'Лады', section: 'theory',
  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="kicker">теория · лады</div>
      <h1 class="title-big">Лады = <span style="color:${COLORS.char}">окраска</span></h1>
      <div class="pillrow">${pill('одна нота меняет настроение', COLORS.char)}</div>
      <div class="card"><div id="mo-modes"></div><h3>Тоника</h3><div id="mo-tonic"></div></div>
      <div class="card" id="mo-formula"></div>
      <div class="card">
        <div class="row">
          <button class="btn" data-act="drone">🔊 Бурдон: тоника в басу</button>
          <button class="btn g" data-act="play">▶ Сыграть лад</button>
          <button class="btn g" data-act="lick">▶ Характерный ход</button>
        </div>
        <p class="note">Включи бурдон и сыграй лад: на фоне тянущейся тоники слышно, как каждая ступень «окрашивает» звук. Характерная нота (лаймовая) — главная краска лада.</p>
        <div id="mo-pos"></div>
      </div>
      <div class="card tight"><div id="mo-fb"></div>
        <div class="legend"><span><i style="background:${COLORS.root}"></i>тоника</span><span><i style="background:${COLORS.third}"></i>терция</span><span><i style="background:${COLORS.fifth}"></i>квинта</span><span><i style="background:${COLORS.seventh}"></i>септима</span><span><i style="background:${COLORS.char}"></i>характерная нота</span></div>
        <p class="note">Позиция лада = позиция пентатоники (минорной для минорных ладов, мажорной для мажорных) + недостающие ступени рядом. Учишь пентатонику — получаешь лады бесплатно.</p></div>
      <div class="card"><h3 style="margin-top:0">Лестница яркости и квинтовый круг</h3>
        <div class="chips" id="mo-ladder"></div>
        <p class="note">Каждый шаг вправо понижает одну ступень на полутон — и родительская тональность сдвигается на квинтовом круге на шаг против часовой (+1 бемоль). Например, от ми: лидийский = си мажор (5♯), ионийский = ми мажор (4♯), миксолидийский = ля (3♯), дорийский = ре (2♯), эолийский = соль (1♯), фригийский = до (0), локрийский = фа (1♭).</p></div>
      <div class="card"><h3 style="margin-top:0;color:${COLORS.seventh}">Почему фригийский — «металлический»</h3>
        <ol>
          <li><b>♭2 — полутон над тоникой.</b> Полутон — самый напряжённый шаг, а когда он стоит вплотную к тонике, каждое «ми → фа → ми» звучит как угроза, скрежет.</li>
          <li><b>Идеально ложится на гитару:</b> открытая 6-я струна — тоника, 1-й лад — ♭2. Пауэр-аккорды E5 и F5 под перегрузом — готовый трэш-рифф. В Drop D то же самое: D5 (0) и E♭5 (1-й лад одним пальцем).</li>
          <li><b>Почти всё понижено:</b> ♭2, ♭3, ♭6, ♭7 — максимум «темноты» при сохранённой чистой квинте. У локрийского темнее (♭5), но без квинты нет опоры для пауэр-аккорда.</li>
          <li><b>Фригийский доминантовый</b> поднимает терцию: ♭2 + 3 дают «восточную» увеличенную секунду — экзотика для неоклассики и ориентальных риффов.</li>
        </ol>
        <div class="row"><button class="btn r" data-act="metal">▶ Чаг 0–1 (♭2)</button>${settings.tone !== 'dist' ? '<button class="btn g" data-act="dist">Включить перегруз</button>' : ''}</div></div>`;
    fb = createFretboard(el.querySelector('#mo-fb'), { onTap: (s, f, midi) => { audio.userPlay([{ midi, string: s }]); fb.setCursor([{ s, f }]); } });
    bind(el, {
      seg: {
        mode: v => { S.mode = v; update(); if (audio.droneOn()) audio.startDrone(36 + S.tonic); },
        tonic: v => { S.tonic = +v; update(); if (audio.droneOn()) audio.startDrone(36 + S.tonic); },
        pos: v => { S.pos = v === 'all' ? 'all' : +v; update(); },
      },
      act: {
        drone: () => { if (audio.droneOn()) audio.stopDrone(); else audio.startDrone(36 + S.tonic); },
        play: () => playMode(), lick: () => playLick(),
        ladder: b => { S.mode = b.dataset.id; update(); },
        dist: b => { setSetting('tone', 'dist'); b.remove(); },
        metal: () => {
          const low = tuning()[0], fr = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1];
          playNotes('фригийский чаг', fr.map(f => ({ chord: [{ midi: low + f, string: 0 }, { midi: low + f + 7, string: 1 }], dur: f ? 0.32 : 0.12, pm: !f, gap: 0.008 })), { bpm: 140, step: 3 });
        },
      },
    });
    update();
  },
  unmount() { root = null; fb = null; },
  onSettings() { update(false); },
};
