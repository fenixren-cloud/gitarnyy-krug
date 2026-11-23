// Вкладка «Тест ритма»: стучи вместе с кликом, приложение считает отклонение каждого удара (мс),
// среднее смещение, разброс, рисует график и ставит оценку. Калибровка задержки устройства (Bluetooth!).
import { load, save } from '../storage.js';
import { COLORS, seg, bind, info, toast } from '../ui.js';
import * as audio from '../audio.js';
import { transport, PPQ } from '../player.js';
import { analyzeTaps, calibrate, randomFigure, figureOnsets } from '../rhythmcalc.js';

const MODES = [['q', 'Четверти'], ['e', 'Восьмые'], ['and', 'Только «и»'], ['gaps', 'С пропусками'], ['fig', 'Фигуры']];
const R = Object.assign({ mode: 'q', bpm: 90, bars: 8, latency: 0 }, load('rhythm', {}));
let hist = load('rhythmHist', []);
const RT = { phase: 'idle', expected: [], taps: [], clicks: [], fig: randomFigure(), result: null, last: null };
let root = null;
const persist = () => save('rhythm', R);
const ms = x => Math.round(x * 1000);

function expectedFor(t0, spb) {
  const out = [];
  for (let b = 0; b < R.bars; b++) for (let k = 0; k < 4; k++) {
    const beatT = t0 + (b * 4 + k) * spb;
    if (R.mode === 'q' || R.mode === 'gaps') out.push(beatT);
    else if (R.mode === 'e') out.push(beatT, beatT + spb / 2);
    else if (R.mode === 'and') out.push(beatT + spb / 2);
  }
  if (R.mode === 'fig') { const on = figureOnsets(RT.fig); for (let b = 0; b < R.bars; b++) on.forEach(o => out.push(t0 + (b * 4 + o) * spb)); }
  return out;
}

function makeSource(kind) {
  const calib = kind === 'calib';
  const beats = calib ? 8 : R.bars * 4;
  return {
    name: calib ? 'калибровка' : 'тест ритма', kind: 'rhythm', countIn: 4,
    onCountIn(i, t) { audio.click(t, i ? 2 : 3, 'beep'); transport.visual(t, () => setMsg(`Отсчёт: ${4 - i}`)); },
    start(T, t0) {
      const spb = 60 / T.bpm;
      RT.taps = []; RT.result = null; RT.last = null;
      RT.expected = calib ? Array.from({ length: 8 }, (_, i) => t0 + i * spb) : expectedFor(t0, spb);
      RT.t0 = t0; RT.spb = spb;
    },
    tick(tick, time, T) {
      if (tick % PPQ) return;
      const beat = tick / PPQ;
      if (beat >= beats) {
        if (beat === beats) T.visual(time + 0.3, () => { if (T.source && T.source.name === (calib ? 'калибровка' : 'тест ритма')) { T.stop(); finish(kind); } });
        return;
      }
      const bar = Math.floor(beat / 4);
      const silent = !calib && R.mode === 'gaps' && bar % 2 === 1;
      if (!silent) audio.click(time, beat % 4 === 0 ? 3 : 1, calib ? 'wood' : 'click');
      T.visual(time, () => { setMsg(calib ? `Стучи в клик: ${beat + 1} / 8` : `Такт ${bar + 1} / ${R.bars}${silent ? ' · клик молчит — держи темп' : ''}`); hlBeat(beat % 4); });
    },
    stop() { if (RT.phase !== 'done') RT.phase = 'idle'; renderPad(); hlBeat(-1); },
  };
}
function begin(kind) {
  audio.ensure();
  RT.phase = kind;
  transport.start(makeSource(kind), { bpm: kind === 'calib' ? 90 : R.bpm });
  renderPad();
  if (root) root.querySelector('#rt-res').innerHTML = '';
}
function tap(ev) {
  if (!(transport.running && (transport.name === 'тест ритма' || transport.name === 'калибровка'))) return false;
  const raw = audio.eventToCtxTime(ev);
  const t = transport.name === 'калибровка' ? raw : raw - R.latency;
  RT.taps.push(t);
  // мгновенная подсказка по ближайшему ожидаемому удару
  let best = null;
  for (const e of RT.expected) if (best == null || Math.abs(t - e) < Math.abs(t - best)) best = e;
  if (best != null && root) {
    const d = ms(t - best), el = root.querySelector('#rt-live');
    el.textContent = Math.abs(d) > 250 ? 'мимо' : d === 0 ? 'точно' : d < 0 ? `${-d} мс раньше` : `${d} мс позже`;
    el.style.color = Math.abs(d) < 20 ? '#8ff0bd' : Math.abs(d) < 45 ? COLORS.root : COLORS.seventh;
  }
  const pad = root && root.querySelector('.tap');
  if (pad) { pad.classList.add('hit'); setTimeout(() => pad.classList.remove('hit'), 90); }
  return true;
}
function finish(kind) {
  if (kind === 'calib') {
    const lat = calibrate(RT.expected, RT.taps);
    RT.phase = 'idle';
    if (lat == null) { toast('Не хватило ударов для калибровки — нужно хотя бы 5 из 8'); renderPad(); return; }
    R.latency = Math.max(-0.1, Math.min(0.5, lat)); persist();
    toast(`Задержка: ${ms(R.latency)} мс — теперь она вычитается`);
    render();
    return;
  }
  const r = analyzeTaps(RT.expected, RT.taps);
  RT.result = r; RT.phase = 'done';
  hist.push({ d: new Date().toISOString().slice(0, 16).replace('T', ' '), mode: R.mode, bpm: R.bpm, mean: ms(r.mean), sd: ms(r.sd), score: r.score, miss: r.missed });
  hist = hist.slice(-20); save('rhythmHist', hist);
  renderResult();
  renderPad();
}

// ---------- отображение ----------
function setMsg(t) { if (root) { const m = root.querySelector('#rt-msg'); if (m) m.textContent = t; } }
function hlBeat(b) { if (!root) return; root.querySelectorAll('.rt-beat').forEach((x, i) => x.classList.toggle('now', i === b)); }
function figureSVG(fig) {
  const W = 330, H = 70, y0 = 44;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><line x1="6" y1="${y0}" x2="${W - 6}" y2="${y0}" stroke="#3a4357"/>`;
  const head = x => `<ellipse cx="${x}" cy="${y0}" rx="6.5" ry="4.6" transform="rotate(-20 ${x} ${y0})" fill="#e8ecf3"/>`;
  const stem = x => `<line x1="${x + 5.8}" y1="${y0 - 1}" x2="${x + 5.8}" y2="${y0 - 30}" stroke="#e8ecf3" stroke-width="1.8"/>`;
  const qrest = x => `<path d="M${x - 3} ${y0 - 22} l6 7 l-5 6 l6 7 q-7 -3 -6 4" fill="none" stroke="#e8ecf3" stroke-width="2.2" stroke-linejoin="round"/>`;
  const erest = x => `<circle cx="${x - 2}" cy="${y0 - 14}" r="2.6" fill="#e8ecf3"/><path d="M${x - 2} ${y0 - 12} q5 1 7 -4 l-6 18" fill="none" stroke="#e8ecf3" stroke-width="1.8"/>`;
  const flag = x => `<path d="M${x + 5.8} ${y0 - 30} q8 6 5 16" fill="none" stroke="#e8ecf3" stroke-width="1.8"/>`;
  fig.forEach((k, b) => {
    const x = 26 + b * 78, x2 = x + 36;
    if (k === 'q') s += head(x) + stem(x);
    if (k === 'r') s += qrest(x);
    if (k === 'ee') s += head(x) + stem(x) + head(x2) + stem(x2) + `<line x1="${x + 5}" y1="${y0 - 29}" x2="${x2 + 6.5}" y2="${y0 - 29}" stroke="#e8ecf3" stroke-width="4.5"/>`;
    if (k === 'er') s += head(x) + stem(x) + flag(x) + erest(x2);
    if (k === 're') s += erest(x) + head(x2) + stem(x2) + flag(x2);
    s += `<text x="${x}" y="${H - 4}" font-size="11" fill="#8d96aa" text-anchor="middle">${b + 1}</text><text x="${x2}" y="${H - 4}" font-size="10" fill="#5f687c" text-anchor="middle">и</text>`;
  });
  return s + '</svg>';
}
function graphSVG(r) {
  const W = 340, H = 160, pad = 26, maxMs = 80;
  const n = RT.expected.length;
  const x = i => pad + (i / Math.max(1, n - 1)) * (W - pad - 8), y = d => H / 2 - (Math.max(-maxMs, Math.min(maxMs, d)) / maxMs) * (H / 2 - 12);
  let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:520px">`;
  s += `<rect x="${pad}" y="${y(20)}" width="${W - pad - 8}" height="${y(-20) - y(20)}" fill="#1f6f4a" fill-opacity=".18"/>`;
  [-60, -40, -20, 0, 20, 40, 60].forEach(v => { s += `<line x1="${pad}" y1="${y(v)}" x2="${W - 8}" y2="${y(v)}" stroke="${v ? '#232b3c' : '#596278'}"/><text x="${pad - 4}" y="${y(v) + 3}" font-size="8" fill="#5f687c" text-anchor="end">${v > 0 ? '+' + v : v}</text>`; });
  s += `<text x="${W - 10}" y="12" font-size="9" fill="#8d96aa" text-anchor="end">позже ↑ · раньше ↓ (мс)</text>`;
  const pts = r.hits.map(h => [x(h.i), y(ms(h.dev))]);
  if (pts.length > 1) s += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#596278" stroke-width="1"/>`;
  r.hits.forEach(h => { const d = ms(h.dev); s += `<circle cx="${x(h.i)}" cy="${y(d)}" r="3.6" fill="${Math.abs(d) < 20 ? '#3fbf7f' : Math.abs(d) < 45 ? COLORS.root : COLORS.seventh}"/>`; });
  const hitI = new Set(r.hits.map(h => h.i));
  RT.expected.forEach((_, i) => { if (!hitI.has(i)) s += `<text x="${x(i)}" y="${H - 4}" font-size="10" fill="${COLORS.seventh}" text-anchor="middle">×</text>`; });
  return s + '</svg>';
}
function renderResult() {
  if (!root || !RT.result) return;
  const r = RT.result, m = ms(r.mean);
  root.querySelector('#rt-res').innerHTML = `
    <h3 style="margin-top:0">Результат: <span style="color:var(--root)">${r.grade}</span> · ${r.score}/100</h3>
    <div class="stat">
      <div><b style="color:${Math.abs(m) < 15 ? '#8ff0bd' : COLORS.root}">${m === 0 ? '0' : (m > 0 ? '+' : '−') + Math.abs(m)} мс</b><small>${m > 3 ? 'в среднем позже клика' : m < -3 ? 'в среднем раньше клика' : 'в среднем точно в клик'}</small></div>
      <div><b>±${ms(r.sd)} мс</b><small>разброс (стабильность)</small></div>
      <div><b>${r.hits.length}/${RT.expected.length}</b><small>попаданий · пропусков ${r.missed}</small></div>
      <div><b>${r.extra}</b><small>лишних ударов</small></div>
    </div>
    ${graphSVG(r)}
    <details><summary>Каждый удар</summary><div class="chips">${r.hits.map(h => { const d = ms(h.dev); return `<span class="chip ${Math.abs(d) < 20 ? 'ok' : Math.abs(d) < 45 ? '' : 'bad'}" style="min-height:30px;padding:4px 8px">${h.i + 1}: ${d > 0 ? '+' : ''}${d}</span>`; }).join('')}</div></details>
    ${info(Math.abs(m) > 15 ? `Ты стабильно ${m > 0 ? 'запаздываешь' : 'спешишь'} на ${Math.abs(m)} мс. ${m > 0 ? 'Попробуй «ставить» удар чуть раньше, слушая начало клика.' : 'Расслабься и дай клику «прийти» к тебе.'} Если играешь в Bluetooth-наушниках — сделай калибровку.` : 'Смещения почти нет. Работай над разбросом: чем он меньше, тем «плотнее» звучит ритм.')}`;
}
function renderPad() {
  if (!root) return;
  const busy = transport.running && (transport.name === 'тест ритма' || transport.name === 'калибровка');
  const b = root.querySelector('#rt-go');
  if (b) { b.textContent = busy ? '■ Стоп' : '▶ Начать тест'; b.classList.toggle('r', busy); }
  const c = root.querySelector('#rt-cal');
  if (c) c.disabled = busy;
  if (!busy) setMsg(RT.phase === 'done' ? 'Готово — результат ниже' : 'Нажми «Начать», дождись отсчёта и стучи');
}
function render() {
  if (!root) return;
  const outL = audio.context() ? ms(audio.context().outputLatency || 0) : null, baseL = audio.context() ? ms(audio.context().baseLatency || 0) : null;
  root.innerHTML = `
    <div class="kicker">практика · тест ритма</div>
    <div class="card">
      ${seg('mode', MODES, R.mode, 'wide')}
      <div class="row"><span class="note">Темп</span><button class="btn g sm" data-act="bpm" data-d="-5">−5</button><b style="font:800 22px var(--disp);color:var(--root)" id="rt-bpm">${R.bpm}</b><button class="btn g sm" data-act="bpm" data-d="5">+5</button>
        <span class="note">Тактов</span>${seg('bars', [[4, '4'], [8, '8'], [16, '16']], R.bars)}</div>
      ${R.mode === 'fig' ? `<div class="figure">${figureSVG(RT.fig)}</div><div class="row" style="justify-content:center"><button class="btn g sm" data-act="newfig">Другая фигура</button><button class="btn g sm" data-act="hearfig">▶ Послушать</button></div>` : ''}
      <p class="note">${{ q: 'Стучи на каждую долю вместе с кликом.', e: 'Клик на доли, а ты стучи восьмыми: «раз-и-два-и».', and: 'Клик на доли, а ты стучи только на «и» — между кликами. Это слабые доли, на них держится грув.', gaps: 'Такт клик звучит, такт молчит. Продолжай стучать ровно, пока клика нет.', fig: 'Простучи записанную фигуру (четверти, восьмые, паузы) в каждом такте. Клик — на доли.' }[R.mode]}</p>
      <div class="beats" style="margin:6px 0">${[1, 2, 3, 4].map(i => `<div class="beat rt-beat" style="height:34px"><b>${i}</b></div>`).join('')}</div>
      <button type="button" class="tap" id="rt-pad">СТУЧИ<br><small style="font:600 12px var(--txt);color:var(--mu)">или пробел</small></button>
      <p style="text-align:center;margin:8px 0 0"><b id="rt-live" style="font-size:18px">&nbsp;</b></p>
      <p class="note" style="text-align:center" id="rt-msg"></p>
      <button class="btn bigplay" id="rt-go" data-act="go">▶ Начать тест</button>
    </div>
    <div class="card" id="rt-res"></div>
    <div class="card">
      <h3 style="margin-top:0">Калибровка задержки</h3>
      <p>Звук доходит до ушей не мгновенно: проводные наушники ~10–30 мс, <b>Bluetooth — 150–250 мс</b>. Без калибровки тест считал бы, что ты опаздываешь. Нажми «Калибровка» и простучи 8 кликов как можно точнее — медиана твоих отклонений станет поправкой.</p>
      <div class="row"><button class="btn c" id="rt-cal" data-act="calib">Калибровка (8 ударов)</button><button class="btn g sm" data-act="reset">Сбросить</button>
        <span>Сейчас вычитается: <b style="color:var(--fifth)">${ms(R.latency)} мс</b></span></div>
      <p class="note">Время ударов сравнивается по часам AudioContext с поправкой на задержку вывода${outL != null ? ` (браузер сообщает: outputLatency ${outL} мс, baseLatency ${baseL} мс)` : ''}.</p>
    </div>
    <div class="card"><h3 style="margin-top:0">История</h3>
      ${hist.length ? `<div class="tablewrap"><table><thead><tr><th>Когда</th><th>Режим</th><th>BPM</th><th>Смещение</th><th>Разброс</th><th>Балл</th></tr></thead><tbody>${hist.slice().reverse().map(h => `<tr><td>${h.d.slice(5)}</td><td>${(MODES.find(m => m[0] === h.mode) || [0, h.mode])[1]}</td><td>${h.bpm}</td><td>${h.mean > 0 ? '+' : ''}${h.mean}</td><td>±${h.sd}</td><td><b>${h.score}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Пока пусто.</p>'}
    </div>`;
  root.querySelector('#rt-pad').addEventListener('pointerdown', e => { e.preventDefault(); audio.ensure(); tap(e); });
  renderPad();
  renderResult();
}

export const page = {
  id: 'rhythm', title: 'Тест ритма', section: 'practice',
  mount(el) {
    root = el;
    render();
    bind(el, {
      seg: {
        mode: v => { R.mode = v; persist(); render(); },
        bars: v => { R.bars = +v; persist(); },
      },
      act: {
        go: () => { if (transport.running && (transport.name === 'тест ритма' || transport.name === 'калибровка')) { transport.stop(); RT.phase = 'idle'; renderPad(); } else begin('test'); },
        calib: () => begin('calib'),
        reset: () => { R.latency = 0; persist(); render(); },
        bpm: b => { R.bpm = Math.max(40, Math.min(200, R.bpm + +b.dataset.d)); persist(); el.querySelector('#rt-bpm').textContent = R.bpm; },
        newfig: () => { RT.fig = randomFigure(); render(); },
        hearfig: () => {
          audio.ensure();
          const spb = 60 / R.bpm, t = audio.now() + 0.1;
          for (let k = 0; k < 4; k++) audio.click(t + k * spb, k ? 1 : 3, 'click');
          figureOnsets(RT.fig).forEach(o => audio.drums.snare(t + o * spb, 0.7));
        },
      },
    });
  },
  unmount() { root = null; },
  onSpace(e) { if (tap(e)) return true; begin('test'); return true; },
};
