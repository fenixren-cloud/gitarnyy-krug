// Вкладка «Слух и квизы»: слуховой диктант на грифе (подбор риффов на слух), найти ноту, собрать аккорд на круге,
// кто лишний в тональности, интервал на слух (с песнями-подсказками — только названия), аккорд на слух. Серии ответов.
import { load, save } from '../storage.js';
import { settings, tuning } from '../state.js';
import { mod12, INTERVALS, CHORDS, chordPcs, chordRoot, chordSymbol, keyTonic, diatonicChords, pentaPositions, modePositions,
  spellPc, spellScale, MODES, pcOf, bestVoicing, voicingMidis, STRING_NUM, ruName } from '../music.js';
import { createFretboard } from '../fretboard.js';
import { chromaticSVG } from '../circle.js';
import { COLORS, QUALITY_COLOR, nm, pcName, chips, seg, bind, info, toast } from '../ui.js';
import * as audio from '../audio.js';
import { playNotes } from '../player.js';

const QUIZZES = [['dict', 'Диктант'], ['find', 'Найти ноту'], ['build', 'Собрать аккорд'], ['odd', 'Кто лишний'], ['iv', 'Интервал'], ['chord', 'Аккорд']];
const SONGS = { 1: '«Челюсти» — тема из фильма', 2: '«Happy Birthday» — 2-й и 3-й слог', 3: '«Smoke on the Water» (Deep Purple) — первые две ноты риффа', 4: '«When the Saints Go Marching In» — начало',
  5: '«Here Comes the Bride» — свадебный марш Вагнера', 6: '«The Simpsons» — заставка; рифф «Black Sabbath»', 7: '«Звёздные войны» — главная тема', 8: '«The Entertainer» (Скотт Джоплин) — скачок после затакта',
  9: '«My Bonnie Lies over the Ocean» — начало', 10: '«Star Trek» — оригинальная тема', 11: 'на полутон ниже октавы — «почти октава»', 12: '«Somewhere Over the Rainbow» — начало' };
const IV_LEVELS = { easy: [3, 4, 7, 12], medium: [1, 2, 3, 4, 5, 7, 9, 12], hard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
const CH_LEVELS = { easy: ['maj', 'min'], medium: ['maj', 'min', 'dim', 'aug', 'sus4', 'power'], hard: ['maj', 'min', 'maj7', 'dom7', 'm7', 'm7b5', 'dim7'] };
const CH_NAMES = { maj: 'мажор', min: 'минор', dim: 'уменьш.', aug: 'увелич.', sus4: 'sus4', power: 'пауэр', maj7: 'maj7', dom7: '7', m7: 'm7', m7b5: 'm7♭5', dim7: 'dim7' };

const Q = Object.assign({ quiz: 'dict', dLevel: 'penta', dCount: 3, dRoot: 9, dPos: 0, dRef: 'first', ivLevel: 'easy', ivDir: 'up', chLevel: 'easy' }, load('ear', {}));
const best = load('earBest', {});
const streak = {};
const persist = () => save('ear', Q);
let root = null, fb = null, task = null;
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

function score(ok) {
  const k = Q.quiz;
  streak[k] = ok ? (streak[k] || 0) + 1 : 0;
  if ((streak[k] || 0) > (best[k] || 0)) { best[k] = streak[k]; save('earBest', best); }
  const el = root && root.querySelector('#ea-streak');
  if (el) el.innerHTML = streakHTML();
}
const streakHTML = () => `Серия: <span class="streak">${streak[Q.quiz] || 0}</span> · рекорд ${best[Q.quiz] || 0}`;

// ---------- диктант ----------
function dictWindow() {
  const tun = tuning();
  if (Q.dLevel === 'penta') return pentaPositions(Q.dRoot, 'minor', tun)[Q.dPos].notes;
  if (Q.dLevel === 'scale') return modePositions(Q.dRoot, 'aeolian', tun)[Q.dPos].notes;
  const p = pentaPositions(Q.dRoot, 'minor', tun)[Q.dPos], out = [];
  for (let s = 0; s < 6; s++) for (let f = Math.max(0, p.minFret - 1); f <= p.maxFret + 1; f++) out.push({ s, f, midi: tun[s] + f, pc: mod12(tun[s] + f) });
  return out;
}
function newDict() {
  const win = dictWindow();
  const pitches = [...new Set(win.map(n => n.midi))].sort((a, b) => a - b);
  const tonics = pitches.filter(m => mod12(m) === Q.dRoot);
  let cur = Q.dRef === 'tonic' && tonics.length ? pick(tonics) : pick(pitches);
  const mel = [cur];
  while (mel.length < Q.dCount) {
    const near = pitches.filter(m => m !== cur && Math.abs(m - cur) <= 5);
    cur = pick(near.length ? near : pitches);
    mel.push(cur);
  }
  task = { kind: 'dict', mel, idx: Q.dRef === 'first' ? 1 : 0, marks: mel.map((_, i) => (Q.dRef === 'first' && i === 0 ? 'ok' : '')), errors: 0, tonic: tonics[0] ?? pitches[0], shown: false, win };
}
function playDict(slow = false) {
  if (!task) return;
  const notes = task.mel.map(m => ({ midi: m }));
  if (Q.dRef === 'tonic') notes.unshift({ midi: task.tonic, vel: 0.7 }, { midi: null });
  playNotes('диктант', notes, { bpm: slow ? 50 : 84, step: 12 });
}
function dictTap(s, f, midi) {
  if (!task || task.kind !== 'dict' || task.idx >= task.mel.length) return;
  const ok = midi === task.mel[task.idx];
  task.marks[task.idx] = ok ? 'ok' : 'bad';
  if (ok) task.idx++; else task.errors++;
  if (task.idx >= task.mel.length) { score(task.errors === 0); toast(task.errors ? `Готово, ошибок: ${task.errors}` : 'Чисто! Без ошибок'); }
  renderTask();
  fb.setCursor([{ s, f, color: ok ? '#3fbf7f' : COLORS.seventh }]);
}

// ---------- остальные задания ----------
function newTask() {
  const tun = tuning();
  switch (Q.quiz) {
    case 'dict': newDict(); break;
    case 'find': { const s = rnd(6); const pc = rnd(12); task = { kind: 'find', s, pc, done: false }; break; }
    case 'build': { const type = pick(['maj', 'min', 'maj', 'min', 'dim', 'aug', 'sus4']); const pc = rnd(12); task = { kind: 'build', pc, type, sel: new Set(), done: false }; break; }
    case 'odd': {
      const minor = Math.random() < 0.5, mode = minor ? 'aeolian' : 'ionian', tonic = keyTonic(rnd(12), mode);
      const dia = diatonicChords(tonic, mode).filter(c => c.type !== 'dim');
      const good = []; while (good.length < 3) { const c = pick(dia); if (!good.includes(c)) good.push(c); }
      const scalePcs = new Set(spellScale(tonic, MODES[mode].iv).map(pcOf));
      let bad;
      do { const t = pick(['maj', 'min']); const r = rnd(12); bad = { rootPc: r, type: t, root: chordRoot(r, t) }; } while (chordPcs(bad.rootPc, bad.type).every(p => scalePcs.has(p)));
      const opts = [...good, bad].sort(() => Math.random() - 0.5);
      task = { kind: 'odd', tonic, mode, opts, bad, done: false, scalePcs };
      break;
    }
    case 'iv': {
      const st = pick(IV_LEVELS[Q.ivLevel]), dir = Q.ivDir === 'mix' ? pick(['up', 'down', 'harm']) : Q.ivDir;
      const low = 45 + rnd(12);
      task = { kind: 'iv', st, dir, a: dir === 'down' ? low + st : low, b: dir === 'down' ? low : low + st, done: false, wrong: new Set() };
      break;
    }
    case 'chord': {
      const type = pick(CH_LEVELS[Q.chLevel]), pc = rnd(12);
      const v = bestVoicing(type, pc, settings.tuning, 5);
      task = { kind: 'chord', type, pc, frets: v.frets, done: false, wrong: new Set() };
      break;
    }
  }
  renderTask();
  autoplay();
}
function autoplay() {
  if (!task) return;
  if (task.kind === 'dict') playDict();
  if (task.kind === 'iv') playIv();
  if (task.kind === 'chord') playChordTask();
}
function playIv() {
  const t = task;
  if (t.dir === 'harm') audio.userPlay([{ midi: t.a, string: 1 }, { midi: t.b, string: 3 }], { gap: 0.004 });
  else playNotes('интервал', [{ midi: t.a }, { midi: t.b }], { bpm: 80, step: 12 });
}
function playChordTask(arp = false) {
  const notes = task.frets.map((f, s) => (f == null ? null : { midi: tuning()[s] + f, string: s })).filter(Boolean);
  if (arp) playNotes('аккорд', notes.map(n => ({ midi: n.midi })), { bpm: 140, step: 6 }); else audio.userPlay(notes);
}

// ---------- отрисовка ----------
function renderTask() {
  if (!root) return;
  const box = root.querySelector('#ea-task');
  const t = task;
  const tun = tuning();
  let h = '';
  if (!t) { box.innerHTML = ''; return; }
  if (t.kind === 'dict') {
    h = `<div class="qbox"><div class="dots">${t.mel.map((_, i) => `<span class="${t.marks[i]} ${i === t.idx ? 'cur' : ''}">${t.marks[i] === 'ok' || t.shown ? nm(spellPc(t.mel[i])) : i + 1}</span>`).join('')}</div>
      <p class="note">${Q.dRef === 'first' ? 'Первая нота дана (отмечена на грифе). ' : 'Сначала звучит тоника — от неё и считай. '}Найди остальные по порядку на грифе внутри выделенной позиции (подходит та же высота на любой струне).</p>
      <div class="row" style="justify-content:center"><button class="btn" data-act="replay">↻ Ещё раз</button><button class="btn g" data-act="slow">Медленно</button><button class="btn g" data-act="show">Ответ</button><button class="btn g" data-act="next">Новый</button></div></div>`;
    const markers = [];
    const win = t.win;
    const lo = Math.min(...win.map(n => n.f)), hi = Math.max(...win.map(n => n.f));
    if (Q.dLevel !== 'chrom') win.forEach(n => markers.push({ s: n.s, f: n.f, text: '', kind: 'ghost', r: 12 }));
    const show = (m, color, kind) => { const n = win.find(x => x.midi === m) || { s: 0, f: m - tun[0] }; markers.push({ s: n.s, f: n.f, text: nm(spellPc(m)), color, kind }); };
    if (Q.dRef === 'first') show(t.mel[0], COLORS.root);
    if (t.shown) t.mel.forEach((m, i) => show(m, i ? COLORS.fifth : COLORS.root));
    fb.render({ markers, window: [lo, hi], focus: [lo, hi] });
  } else if (t.kind === 'find') {
    h = `<div class="qbox"><div class="qbig">${nm(spellPc(t.pc))} <small class="mu" style="font-size:15px">(${ruName(spellPc(t.pc), true)})</small></div><p>на <b>${STRING_NUM[t.s]}-й струне</b> (${pcName(mod12(tun[t.s]))}), лады 0–12</p>
      <div class="row" style="justify-content:center"><button class="btn g" data-act="next">Другая</button></div></div>`;
    fb.render({ markers: [], focus: [0, 12], window: [0, 12] });
  } else if (t.kind === 'build') {
    const pcs = [...t.sel];
    h = `<div class="qbox"><div class="qbig">${chordSymbol(chordRoot(t.pc, t.type), t.type, settings.german)}</div><p class="note">Отметь на круге все ноты аккорда и нажми «Проверить». Подсказка: ${{ maj: '4 + 3', min: '3 + 4', dim: '3 + 3', aug: '4 + 4', sus4: '5 + 2' }[t.type]} от корня.</p>
      ${chromaticSVG({ act: 'bpc', node: pc => ({ text: nm(spellPc(pc)), sub: ruName(spellPc(pc)), fill: t.sel.has(pc) ? (t.done ? (chordPcs(t.pc, t.type).includes(pc) ? '#3fbf7f' : COLORS.seventh) : COLORS.root) : null, glow: t.sel.has(pc) }), polys: pcs.length > 1 ? [{ pcs: pcs.sort((a, b) => mod12(a - t.pc) - mod12(b - t.pc)), color: COLORS.root, steps: true }] : [] })}
      <div class="row" style="justify-content:center"><button class="btn" data-act="check">Проверить</button><button class="btn g" data-act="next">Другой</button></div></div>`;
  } else if (t.kind === 'odd') {
    h = `<div class="qbox"><p>Тональность: <b>${nm(t.tonic)} ${t.mode === 'aeolian' ? 'минор' : 'мажор'}</b>. Какой аккорд лишний?</p>
      <div class="answers">${t.opts.map((c, i) => `<button class="chip ${t.done ? (c === t.bad ? 'ok' : '') : ''}" data-act="oddpick" data-i="${i}">${chordSymbol(c.root, c.type, settings.german)}</button>`).join('')}</div>
      ${t.done ? info(`Лишний — <b>${chordSymbol(t.bad.root, t.bad.type, settings.german)}</b>: в нём ${chordPcs(t.bad.rootPc, t.bad.type).filter(p => !t.scalePcs.has(p)).map(p => nm(spellPc(p))).join(', ')} — этой ноты нет в гамме ${nm(t.tonic)} (${spellScale(t.tonic, MODES[t.mode].iv).map(nm).join(' ')}).`) : ''}
      <div class="row" style="justify-content:center"><button class="btn g" data-act="next">Дальше</button></div></div>`;
  } else if (t.kind === 'iv') {
    h = `<div class="qbox"><p>Какой интервал? <small class="mu">${t.dir === 'up' ? 'вверх' : t.dir === 'down' ? 'вниз' : 'одновременно'}</small></p>
      <div class="answers">${IV_LEVELS[Q.ivLevel].map(st => `<button class="chip ${t.done && st === t.st ? 'ok' : t.wrong.has(st) ? 'bad' : ''}" data-act="ivpick" data-st="${st}">${INTERVALS[st].short}<small>${st} пт</small></button>`).join('')}</div>
      ${t.done ? info(`<b>${INTERVALS[t.st].short} — ${INTERVALS[t.st].name}.</b> ${INTERVALS[t.st].feel}. Подсказка: ${SONGS[t.st]}.`, COLORS.fifth) : ''}
      <div class="row" style="justify-content:center"><button class="btn" data-act="replay">↻ Ещё раз</button><button class="btn g" data-act="next">Дальше</button></div></div>`;
  } else if (t.kind === 'chord') {
    h = `<div class="qbox"><p>Какой аккорд?</p>
      <div class="answers">${CH_LEVELS[Q.chLevel].map(ty => `<button class="chip ${t.done && ty === t.type ? 'ok' : t.wrong.has(ty) ? 'bad' : ''}" data-act="chpick" data-ty="${ty}">${CH_NAMES[ty]}</button>`).join('')}</div>
      ${t.done ? info(`<b>${chordSymbol(chordRoot(t.pc, t.type), t.type, settings.german)}</b> — ${CHORDS[t.type].name.toLowerCase()}.`, QUALITY_COLOR[CHORDS[t.type].q]) : ''}
      <div class="row" style="justify-content:center"><button class="btn" data-act="replay">↻ Удар</button><button class="btn g" data-act="arp">Арпеджио</button><button class="btn g" data-act="next">Дальше</button></div></div>`;
    if (t.done) fb.render({ markers: t.frets.map((f, s) => (f == null ? null : { s, f, text: nm(spellPc(tun[s] + f)), color: COLORS.root })).filter(Boolean), focus: [Math.min(...t.frets.filter(f => f != null)), Math.max(...t.frets.filter(f => f != null))] });
  }
  box.innerHTML = h;
}
function settingsHTML() {
  if (Q.quiz === 'dict') return `<div class="row"><span class="note">Уровень</span>${seg('dLevel', [['penta', 'Пентатоника'], ['scale', 'Гамма'], ['chrom', 'Хроматика']], Q.dLevel)}</div>
    <div class="row"><span class="note">Нот</span>${seg('dCount', [[2, '2'], [3, '3'], [4, '4'], [5, '5']], Q.dCount)}<span class="note">Ориентир</span>${seg('dRef', [['first', 'первая нота'], ['tonic', 'тоника']], Q.dRef)}</div>
    <div class="row"><span class="note">Тоника</span>${chips('dRoot', [[9, 'Am'], [4, 'Em'], [2, 'Dm'], [7, 'Gm']], Q.dRoot)}<span class="note">Позиция</span>${seg('dPos', [0, 1, 2, 3, 4].map(i => [i, String(i + 1)]), Q.dPos)}</div>
    ${info('Зачем: так подбирают риффы на слух. Слушай не «какая нота», а <b>куда и насколько</b> сдвинулась мелодия: вверх/вниз, на 1–2 лада или прыжок. Начни с 2 нот внутри пентатоники.', COLORS.fifth)}`;
  if (Q.quiz === 'iv') return `<div class="row"><span class="note">Уровень</span>${seg('ivLevel', [['easy', 'лёгкий'], ['medium', 'средний'], ['hard', 'все']], Q.ivLevel)}</div><div class="row"><span class="note">Как</span>${seg('ivDir', [['up', 'вверх'], ['down', 'вниз'], ['harm', 'вместе'], ['mix', 'вперемешку']], Q.ivDir)}</div>`;
  if (Q.quiz === 'chord') return `<div class="row"><span class="note">Уровень</span>${seg('chLevel', [['easy', 'мажор/минор'], ['medium', '+ dim, aug, sus4, пауэр'], ['hard', 'септаккорды']], Q.chLevel)}</div>`;
  if (Q.quiz === 'find') return `<p class="note">Коснись нужной ноты на указанной струне. Помни: соседние струны +5, на 12-м ладу всё повторяется.</p>`;
  return '';
}
function render() {
  if (!root) return;
  root.innerHTML = `
    <div class="kicker">практика · слух и квизы</div>
    ${chips('quiz', QUIZZES, Q.quiz)}
    <div class="card"><div class="row sp"><b>${QUIZZES.find(q => q[0] === Q.quiz)[1]}</b><span id="ea-streak">${streakHTML()}</span></div>${settingsHTML()}</div>
    <div class="card" id="ea-task"></div>
    <div class="card tight" id="ea-fbcard" ${Q.quiz === 'build' || Q.quiz === 'odd' || Q.quiz === 'iv' ? 'hidden' : ''}><div id="ea-fb"></div></div>`;
  fb = createFretboard(root.querySelector('#ea-fb'), { onTap: onFretTap });
  newTask();
}
function onFretTap(s, f, midi) {
  audio.userPlay([{ midi, string: s }]);
  if (!task) return;
  if (task.kind === 'dict') { dictTap(s, f, midi); return; }
  if (task.kind === 'find' && !task.done) {
    const ok = s === task.s && mod12(midi) === task.pc;
    fb.setCursor([{ s, f, color: ok ? '#3fbf7f' : COLORS.seventh }]);
    if (ok) { score(true); toast('Верно!'); setTimeout(() => { if (root && Q.quiz === 'find') newTask(); }, 700); }
    else { score(false); const right = mod12(task.pc - tuning()[task.s]); fb.render({ markers: [{ s: task.s, f: right, text: nm(spellPc(task.pc)), color: COLORS.root }, { s: task.s, f: right + 12, text: nm(spellPc(task.pc)), color: COLORS.root, kind: 'dim' }], focus: [0, 12] }); toast(`Не то: это ${nm(spellPc(midi))}`); }
  }
}

export const page = {
  id: 'ear', title: 'Слух и квизы', section: 'practice',
  mount(el) {
    root = el;
    render();
    bind(el, {
      seg: {
        quiz: v => { Q.quiz = v; persist(); render(); },
        dLevel: v => { Q.dLevel = v; persist(); newTask(); }, dCount: v => { Q.dCount = +v; persist(); newTask(); },
        dRef: v => { Q.dRef = v; persist(); newTask(); }, dRoot: v => { Q.dRoot = +v; persist(); newTask(); }, dPos: v => { Q.dPos = +v; persist(); newTask(); },
        ivLevel: v => { Q.ivLevel = v; persist(); newTask(); }, ivDir: v => { Q.ivDir = v; persist(); newTask(); },
        chLevel: v => { Q.chLevel = v; persist(); newTask(); },
      },
      act: {
        next: () => newTask(),
        replay: () => { if (task.kind === 'dict') playDict(); else if (task.kind === 'iv') playIv(); else playChordTask(); },
        slow: () => playDict(true),
        arp: () => playChordTask(true),
        show: () => { task.shown = true; task.errors++; renderTask(); },
        bpc: b => { const pc = +b.dataset.pc; if (task.done) return; task.sel.has(pc) ? task.sel.delete(pc) : task.sel.add(pc); audio.userPlay([48 + pc]); renderTask(); },
        check: () => {
          const want = new Set(chordPcs(task.pc, task.type)), sel = task.sel;
          const ok = want.size === sel.size && [...want].every(p => sel.has(p));
          task.done = true; score(ok);
          toast(ok ? 'Верно!' : `Нужно: ${[...want].map(p => nm(spellPc(p))).join(' ')}`);
          const v = bestVoicing(task.type, task.pc, settings.tuning, 5); if (v) audio.userPlay(voicingMidis(v.frets, tuning()));
          renderTask();
        },
        oddpick: b => { if (task.done) return; const c = task.opts[+b.dataset.i]; task.done = true; score(c === task.bad); toast(c === task.bad ? 'Верно!' : 'Нет'); renderTask(); },
        ivpick: b => { if (task.done) return; const st = +b.dataset.st; if (st === task.st) { task.done = true; score(task.wrong.size === 0); } else { task.wrong.add(st); score(false); } renderTask(); },
        chpick: b => { if (task.done) return; const ty = b.dataset.ty; if (ty === task.type) { task.done = true; score(task.wrong.size === 0); } else { task.wrong.add(ty); score(false); } renderTask(); },
      },
    });
  },
  unmount() { root = null; fb = null; },
  onSettings(k) { if (k === 'tuning') newTask(); else renderTask(); },
};
