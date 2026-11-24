// Вкладка «Метроном и техника»: любой размер и акценты, деления, звуки и барабанные ритмы, тренажёр скорости,
// пропуски клика, таймер занятия, упражнения с рекордами (правило: 3 раза чисто → +4 BPM).
import { load, save } from '../storage.js';
import { tempoName } from '../music.js';
import { COLORS, chips, seg, bind, pill, info, toast, localStamp } from '../ui.js';
import * as audio from '../audio.js';
import { transport, PPQ } from '../player.js';
import { clampBpm } from '../transport.js';

const METERS = { '2/4': [3, 1], '3/4': [3, 1, 1], '4/4': [3, 1, 1, 1], '5/4': [3, 1, 1, 2, 1], '6/8': [3, 1, 1, 2, 1, 1], '7/8': [3, 1, 2, 1, 2, 1, 1], '9/8': [3, 1, 1, 2, 1, 1, 2, 1, 1], '12/8': [3, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1] };
const SUBS = { none: [0], eighths: [0, 6], triplets: [0, 4, 8], sixteenths: [0, 3, 6, 9], sextuplets: [0, 2, 4, 6, 8, 10], swing: [0, 8], gallop: [0, 6, 9], revgallop: [0, 3, 6] };
const SUB_NAMES = [['none', 'Нет'], ['eighths', '♪♪ восьмые'], ['triplets', 'триоли'], ['sixteenths', 'шестнадцатые'], ['sextuplets', 'секстоли'], ['swing', 'свинг'], ['gallop', 'галоп'], ['revgallop', 'обр. галоп']];
const SOUNDS = [['click', 'Клик'], ['wood', 'Дерево'], ['beep', 'Бип'], ['drums', 'Барабаны']];
const RHYTHMS = [['accents', 'По акцентам'], ['rock', 'Рок'], ['halftime', 'Халфтайм'], ['metal', 'Метал (дабл-бас)'], ['gallop', 'Галоп'], ['shuffle', 'Шаффл']];
export const EXERCISES = [
  { id: 'chrom', name: 'Хроматика 1-2-3-4', start: 60, sub: 'sixteenths', how: 'По пальцу на лад: 1-2-3-4 на каждой струне с 6-й на 1-ю и обратно, затем сдвиг на лад выше. Пальцы держи низко над грифом, у самых порожков.', goal: 'ровность и синхронность рук' },
  { id: 'alt', name: 'Переменный штрих', start: 70, sub: 'sixteenths', how: 'Строго вниз-вверх (⊓ V ⊓ V) на одной струне, потом по позиции пентатоники. Двигается кисть, медиатор входит в струну неглубоко.', goal: 'скорость без зажима' },
  { id: 'pm', name: 'Palm mute', start: 80, sub: 'eighths', how: 'Ребро ладони лежит на струнах у самой подставки. Чаги восьмыми на открытой 6-й, затем акцент без глушения на «раз».', goal: 'плотный, ровный чаг' },
  { id: 'gallop', name: 'Галоп', start: 70, sub: 'gallop', how: 'Восьмая + две шестнадцатых (вниз · вниз-вверх) с palm mute на 6-й струне. Акцент на первой ноте каждой группы.', goal: 'метал-ритм «тыгыдык»' },
  { id: 'power', name: 'Смена пауэр-аккордов', start: 60, sub: 'eighths', how: 'Пауэр-аккорды на 3-м, 5-м, 7-м ладу, по 4 восьмых на каждый. Переставляй руку одним движением, без «дырки» между аккордами. В Drop D — одним пальцем.', goal: 'быстрая и точная перестановка' },
  { id: 'mute', name: 'Глушение лишних струн', start: 60, sub: 'eighths', how: 'Играй пауэр-аккорд размашистым ударом по всем струнам: лишние глушат подушечка указательного (снизу) и ребро правой ладони (сверху). Звучать должны только 2–3 струны.', goal: 'чистый звук под перегрузом' },
  { id: 'bend', name: 'Бенды и вибрато', start: 60, sub: 'none', how: 'Бенд на тон на 3-й струне (7-й лад): сначала сыграй 9-й лад как эталон, потом тяни 7-й до той же высоты. Вибрато — ритмично: на четверти, затем на восьмые.', goal: 'точная высота бенда' },
  { id: 'count', name: 'Счёт и ритм', start: 70, sub: 'none', how: 'Считай вслух «раз-и-два-и» и играй одну ноту: 2 такта четвертями → 2 такта восьмыми → 2 триолями → 2 шестнадцатыми, без остановки.', goal: 'внутренний пульс' },
];

const DEF = { bpm: 100, meter: '4/4', num: 4, accents: [3, 1, 1, 1], sub: 'none', sound: 'click', rhythm: 'accents', countIn: false, vol: 0.9, flash: 'off',
  trainer: { on: false, from: 80, to: 120, step: 4, every: 4 }, gaps: { on: false, play: 2, mute: 2 }, drop: 0, timer: { on: false, min: 10 } };
const M = Object.assign(structuredCloneSafe(DEF), load('metro', {}));
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
const persist = () => save('metro', M);
let REC = load('records', {});
const RT = { beat: -1, bar: 0, startedAt: 0, taps: [], count: 0 };
let root = null;

const running = () => transport.running && transport.name === 'метроном';

function drumsFor(beat, sub, num, time, lvl) {
  const D = audio.drums, v = M.vol, out = audio.bus('click');
  const K = (x = 1) => D.kick(time, x * v, out), Sn = (x = 1) => D.snare(time, x * v, out), H = (x = 0.6, o = false) => D.hat(time, x * v, o, out);
  const even = beat % 2 === 0;
  switch (M.rhythm) {
    case 'rock': if (sub === 0 || sub === 6) H(sub ? 0.4 : 0.6); if (sub === 0) { if (even) K(); else Sn(); } if (sub === 6 && beat === 2 && num >= 4) K(0.75); break;
    case 'halftime': if (sub === 0 || sub === 6) H(sub ? 0.4 : 0.6); if (sub === 0 && beat === 0) K(); if (sub === 6 && beat === 1) K(0.7); if (sub === 0 && beat === Math.floor(num / 2)) Sn(); break;
    case 'metal': if (sub % 3 === 0) K(0.75); if (sub === 0) { H(0.5, true); if (!even) Sn(); } break;
    case 'gallop': if (sub === 0 || sub === 6 || sub === 9) K(sub ? 0.65 : 0.9); if (sub === 0) { H(0.5); if (!even) Sn(); } break;
    case 'shuffle': if (sub === 0 || sub === 8) H(sub ? 0.35 : 0.55); if (sub === 0) { if (even) K(); else Sn(); } if (sub === 8 && beat === num - 1) K(0.6); break;
    default: break;
  }
}
const DRUM_SUBS = { rock: [0, 6], halftime: [0, 6], metal: [0, 3, 6, 9], gallop: [0, 6, 9], shuffle: [0, 8] };

function makeSource() {
  let dropped = false, silent = false;
  return {
    name: 'метроном', kind: 'rhythm',
    countIn: M.countIn ? M.num : 0,
    onCountIn(i, t, n) { audio.click(t, i === 0 ? 3 : 2, 'beep', M.vol); transport.visual(t, () => showCount(n - i)); },
    start(T, t0) { RT.startedAt = t0; RT.bar = 0; if (M.trainer.on) T.setBpm(M.trainer.from); },
    tick(tick, time, T) {
      const bt = M.num * PPQ, inBar = tick % bt, beat = Math.floor(inBar / PPQ), sub = inBar % PPQ, bar = Math.floor(tick / bt);
      if (inBar === 0) {
        if (tick === 0) T.visual(time, () => showCount(0));
        if (M.timer.on && bar > 0 && time - RT.startedAt >= M.timer.min * 60) {
          audio.bell(time);
          T.visual(time, () => { if (T.source && T.source.name === 'метроном') T.stop(); toast('Время занятия вышло — отличная работа!'); });
          T.source.tick = () => { };
          return;
        }
        if (M.trainer.on && bar > 0 && bar % M.trainer.every === 0 && T.bpm < M.trainer.to) {
          T.setBpm(Math.min(M.trainer.to, T.bpm + M.trainer.step));
          const nb = T.bpm;
          T.visual(time, () => { M.bpm = nb; showBpm(); });
        }
        silent = M.gaps.on && bar % (M.gaps.play + M.gaps.mute) >= M.gaps.play;
        RT.bar = bar;
      }
      if (sub === 0) dropped = M.drop > 0 && !(bar === 0 && beat === 0) && Math.random() * 100 < M.drop;
      const lvl = M.accents[beat] ?? 1;
      const pat = SUBS[M.sub];
      const mute = silent || dropped;
      if (M.sound === 'drums' && M.rhythm !== 'accents') {
        if (!mute && DRUM_SUBS[M.rhythm].includes(sub)) drumsFor(beat, sub, M.num, time, lvl);
      } else if (sub === 0) {
        if (!mute && lvl > 0) audio.click(time, lvl, M.sound, M.vol);
      } else if (pat.includes(sub) && !mute) audio.click(time, 0.5, M.sound, M.vol);
      if (sub === 0) {
        const fl = M.flash === 'all' || (M.flash === 'one' && beat === 0);
        T.visual(time, () => showBeat(beat, mute, fl && !mute));
      }
      if (pat.includes(sub)) { const k = pat.indexOf(sub); T.visual(time, () => showSub(k)); }
    },
    stop() { RT.beat = -1; showBeat(-1); showCount(0); render(); },
  };
}

export function startMetronome() {
  audio.ensure();
  transport.start(makeSource(), { bpm: M.trainer.on ? M.trainer.from : M.bpm });
  render();
}
export function toggleMetronome() { if (running()) transport.stop(); else startMetronome(); render(); }

// ---------- отображение ----------
function showBeat(b, mute = false, flash = false) {
  RT.beat = b;
  if (!root) return;
  root.querySelectorAll('.beat').forEach((x, i) => { x.classList.toggle('now', i === b); x.style.opacity = i === b && mute ? 0.45 : ''; });
  if (flash) { const f = document.getElementById('flash'); f.style.background = b === 0 ? COLORS.root : '#ffffff'; f.style.opacity = b === 0 ? 0.28 : 0.16; setTimeout(() => { f.style.opacity = 0; }, 70); }
  const st = root.querySelector('#me-stat');
  if (st) {
    const el = transport.running ? Math.max(0, audio.now() - RT.startedAt) : 0;
    const left = M.timer.on ? Math.max(0, M.timer.min * 60 - el) : null;
    st.textContent = `такт ${RT.bar + 1}${M.gaps.on && mute ? ' · тишина — держи темп сам' : ''}${left != null ? ` · осталось ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : ''}`;
  }
}
function showSub(k) { if (!root) return; root.querySelectorAll('.subs span').forEach((x, i) => x.classList.toggle('now', i === k)); }
function showCount(n) { if (!root) return; const c = root.querySelector('#me-count'); if (c) c.textContent = n > 0 ? n : ''; }
function showBpm() {
  if (!root) return;
  root.querySelector('#me-bpm').textContent = M.bpm;
  const tn = tempoName(M.bpm);
  root.querySelector('#me-name').textContent = `${tn.name} — ${tn.ru}${M.meter.endsWith('/8') ? ' · темп считается восьмыми' : ''}`;
  root.querySelector('#me-range').value = M.bpm;
  root.querySelectorAll('[data-clean]').forEach(b => { b.textContent = `✓ Чисто на ${M.bpm}`; });
}
function setBpm(b) {
  M.bpm = clampBpm(b);
  if (running()) transport.setBpm(M.bpm);
  persist(); showBpm();
}
function beatsHTML() {
  return `<div class="beats">${M.accents.map((a, i) => `<button type="button" class="beat ${RT.beat === i ? 'now' : ''}" data-act="acc" data-i="${i}" aria-label="Доля ${i + 1}"><b>${i + 1}</b><i class="l${a}"></i></button>`).join('')}</div>
    <div class="subs">${SUBS[M.sub].map(() => '<span></span>').join('')}</div>`;
}
function exHTML() {
  return EXERCISES.map(e => {
    const r = REC[e.id] || { best: 0, target: e.start, clean: 0, history: [] };
    const hist = (r.history || []).slice(-5).map(h => `${h.d.slice(5)}: ${h.bpm}`).join(' · ');
    return `<div class="ex"><div class="row sp"><span class="t">${e.name}</span><small>рекорд ${r.best || '—'} · цель <b style="color:var(--root)">${r.target}</b> (${r.clean}/3 чисто)</small></div>
      <p class="note">${e.how} <b>Цель:</b> ${e.goal}.</p>
      <div class="row"><button class="btn sm" data-act="exstart" data-id="${e.id}">▶ Старт на ${r.target}</button><button class="btn sm g" data-act="clean" data-id="${e.id}" data-clean>✓ Чисто на ${M.bpm}</button></div>
      ${hist ? `<div class="hist">история: ${hist}</div>` : ''}</div>`;
  }).join('');
}

function render() {
  if (!root) return;
  const r = running();
  const tn = tempoName(M.bpm);
  root.innerHTML = `
    <div class="kicker">практика · метроном и техника</div>
    <div class="card">
      <div class="bpmrow">
        <button class="btn g" data-act="bpm" data-d="-5">−5</button><button class="btn g" data-act="bpm" data-d="-1">−1</button>
        <div class="bpm" id="me-bpm">${M.bpm}</div>
        <button class="btn g" data-act="bpm" data-d="1">+1</button><button class="btn g" data-act="bpm" data-d="5">+5</button>
      </div>
      <div class="bpmname" id="me-name">${tn.name} — ${tn.ru}${M.meter.endsWith('/8') ? ' · темп считается восьмыми' : ''}</div>
      <input type="range" id="me-range" min="30" max="300" value="${M.bpm}" aria-label="Темп">
      <div class="row" style="justify-content:center"><button class="btn g sm" data-act="half">×½</button><button class="btn g sm" data-act="dbl">×2</button><button class="btn c sm" data-act="tap" style="min-width:110px">Tap tempo</button></div>
      <div class="countin" id="me-count"></div>
      ${beatsHTML()}
      <p class="note" style="text-align:center;margin:2px 0" id="me-stat">${r ? '' : 'Нажми на долю, чтобы сменить акцент: сильный → средний → слабый → выкл. Пробел — старт/стоп.'}</p>
      <button class="btn bigplay ${r ? 'r' : ''}" data-act="toggle">${r ? '■ Стоп' : '▶ Старт'}</button>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Размер</h3>
      ${chips('meter', Object.keys(METERS).map(k => [k, k]), M.meter)}
      <div class="row"><button class="btn g sm" data-act="num" data-d="-1">− доля</button><b>${M.num}/${M.meter.split('/')[1]}</b><button class="btn g sm" data-act="num" data-d="1">+ доля</button>
        <span class="grow"></span><button class="chip" data-act="preset" data-p="24">клик на 2 и 4</button><button class="chip" data-act="preset" data-p="one">только раз</button><button class="chip" data-act="preset" data-p="flat">все ровно</button></div>
      <h3>Деление доли</h3>${chips('sub', SUB_NAMES, M.sub)}
      <h3>Звук</h3>${chips('sound', SOUNDS, M.sound)}
      ${M.sound === 'drums' ? `<h3>Ритм барабанов</h3>${chips('rhythm', RHYTHMS, M.rhythm)}<p class="note">«По акцентам»: сильная доля — бочка, средняя — малый, слабая — хай-хэт. Ритмы рок/метал/галоп/шаффл рассчитаны на 4/4, но идут в любом размере.</p>` : ''}
      <div class="row"><label class="note"><input type="checkbox" id="me-ci" ${M.countIn ? 'checked' : ''}> отсчёт 1 такт</label>
        <span class="note">Вспышка</span>${seg('flash', [['off', 'нет'], ['one', 'на «раз»'], ['all', 'каждая доля']], M.flash)}</div>
      <div class="row"><span class="note">Громкость</span><input type="range" id="me-vol" min="0" max="1" step="0.01" value="${M.vol}" style="flex:1"></div>
    </div>
    <div class="card">
      <details ${M.trainer.on ? 'open' : ''}><summary>Тренажёр скорости ${M.trainer.on ? pill('вкл', COLORS.root) : ''}</summary>
        <label class="note"><input type="checkbox" data-k="trainer.on" ${M.trainer.on ? 'checked' : ''}> включить: с <input type="number" data-k="trainer.from" value="${M.trainer.from}" min="30" max="300"> до <input type="number" data-k="trainer.to" value="${M.trainer.to}" min="30" max="300"> BPM,
        +<input type="number" data-k="trainer.step" value="${M.trainer.step}" min="1" max="20"> каждые <input type="number" data-k="trainer.every" value="${M.trainer.every}" min="1" max="32"> такт.</label></details>
      <details ${M.gaps.on || M.drop ? 'open' : ''}><summary>Пропуски клика</summary>
        <label class="note"><input type="checkbox" data-k="gaps.on" ${M.gaps.on ? 'checked' : ''}> <input type="number" data-k="gaps.play" value="${M.gaps.play}" min="1" max="16"> такт(а) играет, <input type="number" data-k="gaps.mute" value="${M.gaps.mute}" min="1" max="16"> молчит — держи темп сам.</label>
        <div class="row"><span class="note">Случайное выпадение долей</span>${seg('drop', [[0, '0'], [10, '10%'], [20, '20%'], [30, '30%'], [40, '40%']], M.drop)}</div></details>
      <details ${M.timer.on ? 'open' : ''}><summary>Таймер занятия</summary>
        <label class="note"><input type="checkbox" data-k="timer.on" ${M.timer.on ? 'checked' : ''}> остановить через <b id="me-tmv">${M.timer.min}</b> мин (в конце такта, со звонком)</label>
        <input type="range" data-k="timer.min" min="3" max="30" value="${M.timer.min}"></details>
    </div>
    <div class="card"><h3 style="margin-top:0">Упражнения</h3>
      ${info('<b>Правило:</b> сыграл упражнение 3 раза подряд чисто на целевом темпе → цель +4 BPM. «Чисто» = без сбоев, ровно в клик, без лишних звенящих струн. Если не выходит — откатись на 8 BPM ниже.')}
      ${exHTML()}</div>
    <div class="card">${info('<b>Перед занятием настрой гитару</b> — вкладка «Тюнер» (микрофон телефона или Scarlett). <b>Экран не гаснет</b>, пока играет метроном.', COLORS.fifth)}</div>`;
}

export const page = {
  id: 'metronome', title: 'Метроном', section: 'practice',
  mount(el) {
    root = el;
    render();
    bind(el, {
      seg: {
        meter: v => { M.meter = v; M.accents = [...METERS[v]]; M.num = M.accents.length; persist(); render(); },
        sub: v => { M.sub = v; persist(); render(); },
        sound: v => { M.sound = v; persist(); render(); audio.ensure(); audio.click(audio.now() + 0.02, 3, v === 'drums' ? 'drums' : v, M.vol); },
        rhythm: v => { M.rhythm = v; persist(); },
        flash: v => { M.flash = v; persist(); },
        drop: v => { M.drop = +v; persist(); },
      },
      act: {
        toggle: () => toggleMetronome(),
        bpm: b => setBpm(M.bpm + +b.dataset.d),
        half: () => setBpm(Math.round(M.bpm / 2)), dbl: () => setBpm(M.bpm * 2),
        tap: () => {
          const t = performance.now();
          if (RT.taps.length && t - RT.taps[RT.taps.length - 1] > 2000) RT.taps = [];
          RT.taps.push(t); RT.taps = RT.taps.slice(-5);
          if (RT.taps.length >= 2) { const d = (RT.taps[RT.taps.length - 1] - RT.taps[0]) / (RT.taps.length - 1); setBpm(60000 / d); }
          audio.click(audio.now() + 0.005, 2, 'wood', M.vol);
        },
        acc: b => { const i = +b.dataset.i; M.accents[i] = [3, 2, 1, 0][([3, 2, 1, 0].indexOf(M.accents[i]) + 1) % 4]; persist(); b.querySelector('i').className = 'l' + M.accents[i]; },
        num: b => {
          const n = Math.max(1, Math.min(16, M.num + +b.dataset.d));
          if (n > M.num) M.accents.push(1); else M.accents.length = n;
          if (!M.accents[0] && n === 1) M.accents[0] = 3;
          M.num = n; M.meter = `${n}/${M.meter.split('/')[1]}`; persist(); render();
        },
        preset: b => {
          const p = b.dataset.p;
          M.accents = M.accents.map((_, i) => (p === '24' ? (i % 2 ? 3 : 0) : p === 'one' ? (i ? 0 : 3) : 2));
          persist(); render();
        },
        exstart: b => {
          const e = EXERCISES.find(x => x.id === b.dataset.id), r = REC[e.id] || { target: e.start };
          M.bpm = r.target; M.sub = e.sub; persist();
          if (running()) transport.stop();
          startMetronome();
          toast(`${e.name}: ${r.target} BPM`);
        },
        clean: b => {
          const e = EXERCISES.find(x => x.id === b.dataset.id);
          const r = REC[e.id] || { best: 0, target: e.start, clean: 0, history: [] };
          const bpm = M.bpm, d = localStamp().slice(0, 10);
          r.best = Math.max(r.best || 0, bpm);
          r.history = [...(r.history || []), { d, bpm }].slice(-30);
          if (bpm >= r.target) {
            r.clean = (r.clean || 0) + 1;
            if (r.clean >= 3) { r.target = Math.min(300, bpm + 4); r.clean = 0; toast(`3 раза чисто! Новая цель: ${r.target} BPM`); }
            else toast(`Засчитано ${r.clean}/3 на ${bpm} BPM`);
          } else toast(`Записано: ${bpm} BPM (цель ${r.target})`);
          REC[e.id] = r; save('records', REC); render();
        },
      },
    });
    el.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'me-range') setBpm(+t.value);
      if (t.id === 'me-vol') { M.vol = +t.value; persist(); }
      if (t.dataset.k) {
        const [a, b] = t.dataset.k.split('.');
        M[a][b] = t.type === 'checkbox' ? t.checked : Math.max(+t.min || 0, Math.min(+t.max || 999, +t.value || 0));
        if (t.dataset.k === 'timer.min') el.querySelector('#me-tmv').textContent = M[a][b];
        persist();
      }
    });
    el.addEventListener('change', e => { if (e.target.id === 'me-ci') { M.countIn = e.target.checked; persist(); } if (e.target.dataset.k && e.target.type === 'checkbox') render(); });
  },
  unmount() { root = null; },
  onSpace() { toggleMetronome(); return true; },
};
