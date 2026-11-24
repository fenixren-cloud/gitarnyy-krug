// Вкладка «Тюнер»: микрофон телефона или Scarlett Solo, стрелка ±50 центов, цели Standard E и Drop D
// (берутся из глобального строя), автоопределение струны или фиксация, эталон A4 с подстройкой.
import { load, save } from '../storage.js';
import { settings, tuning } from '../state.js';
import { TUNINGS, STRING_NUM, spellPc, mod12 } from '../music.js';
import { nm, ru, bind, toast, info, esc } from '../ui.js';
import * as audio from '../audio.js';
import { startTuner, stopTuner, tunerRunning, listInputs, micSupported } from '../tuner.js';
import { analyzeReading, createSmoother, freqToMidi, midiToFreqA4 } from '../pitch.js';

const T = Object.assign({ a4: 440, lock: null, deviceId: '' }, load('tuner', {}));
if (!(T.a4 >= 430 && T.a4 <= 450)) T.a4 = 440;
const persist = () => save('tuner', T);
const GREEN = '#3fbf7f', IN_TUNE = 5;
const ERR = {
  denied: 'Нет доступа к микрофону. Разреши его: значок слева от адреса сайта → Разрешения → Микрофон. В установленном приложении: долгое нажатие на значок → «О приложении» → Разрешения.',
  notfound: 'Не нашёл микрофон или выбранный вход. Проверь подключение (Scarlett — кабель USB) или выбери другой вход.',
  busy: 'Микрофон занят другой программой. Если это FL Studio со Scarlett через ASIO — закрой её или включи в FL Studio «Auto close device» (см. советы ниже).',
  nomic: 'Этот браузер не даёт доступ к микрофону. Открой приложение по https (с сайта) в Chrome.',
  noaudio: 'Этот браузер не поддерживает Web Audio — тюнер не сможет работать.',
};

let root = null, status = 'off', errMsg = '', devices = [];
let smoother = createSmoother(5), lastGood = 0, idleTimer = null, tuned = new Set(), streak = 0, streakString = null;

const pcText = midi => nm(spellPc(mod12(midi)));
const octave = midi => Math.floor(midi / 12) - 1;

// ---------- шкала со стрелкой ----------
const CX = 160, CY = 168, R = 138;
const ang = c => (Math.max(-50, Math.min(50, c)) / 50) * 62; // ±50 центов → ±62°
const pt = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
function gaugeSVG() {
  let s = `<svg class="tu-gauge" viewBox="0 0 320 190" role="img" aria-label="Шкала отклонения в центах">`;
  const [x1, y1] = pt(ang(-IN_TUNE), R), [x2, y2] = pt(ang(IN_TUNE), R);
  s += `<path d="M${pt(-62, R).join(' ')} A${R} ${R} 0 0 1 ${pt(62, R).join(' ')}" fill="none" stroke="#232b3c" stroke-width="14" stroke-linecap="round"/>`;
  s += `<path d="M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}" fill="none" stroke="${GREEN}" stroke-width="14"/>`;
  for (let c = -50; c <= 50; c += 5) {
    const big = c % 25 === 0, [a1, b1] = pt(ang(c), R - 12), [a2, b2] = pt(ang(c), R - (big ? 26 : 19));
    s += `<line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}" stroke="${big ? '#aab3c5' : '#4a5468'}" stroke-width="${big ? 2.4 : 1.4}"/>`;
    if (big) { const [lx, ly] = pt(ang(c), R - 40); s += `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#8d96aa">${c > 0 ? '+' + c : c === 0 ? '0' : '−' + -c}</text>`; }
  }
  s += `<text x="${pt(-56, R + 14)[0]}" y="${CY - 2}" font-size="11" fill="#5f687c" text-anchor="middle">ниже</text><text x="${pt(56, R + 14)[0]}" y="${CY - 2}" font-size="11" fill="#5f687c" text-anchor="middle">выше</text>`;
  s += `<g id="tu-needle" style="transform-origin:${CX}px ${CY}px"><line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - R + 6}" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></g>`;
  s += `<circle cx="${CX}" cy="${CY}" r="9" fill="#e8ecf3"/></svg>`;
  return s;
}

// ---------- показания ----------
function onReading(r) {
  if (!root) return;
  const lvl = root.querySelector('#tu-lvl');
  if (lvl) { const db = r.rms > 0 ? 20 * Math.log10(r.rms) : -90; lvl.style.width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) + '%'; }
  // пока звучит само приложение (эталон струны), микрофон слышит динамик: иначе тюнер «настроил» бы струну по эталону
  if (audio.quietAt() > audio.now()) {
    smoother.reset(); streak = 0;
    const h = root.querySelector('#tu-hint');
    if (h && status === 'on') { h.textContent = 'Звучит эталон — сыграй струну, когда он стихнет'; h.style.color = ''; }
    return;
  }
  if (!r.f || r.rms < 0.004) return;
  const m = smoother.push(freqToMidi(r.f, T.a4));
  if (smoother.size < 2) return; // ждём второе совпадающее измерение — без мигания на атаке
  lastGood = performance.now();
  show(analyzeReading(midiToFreqA4(m, T.a4), { a4: T.a4, tuning: tuning(), lock: T.lock, inTuneCents: IN_TUNE }));
}

function show(a) {
  const $ = id => root.querySelector(id);
  const target = a.string != null ? a.target : a.note;
  const c = a.string != null && !a.onTarget ? a.stringCents : a.cents;
  const col = a.inTune ? GREEN : Math.abs(c) <= 15 ? 'var(--root)' : 'var(--seventh)';
  const needle = $('#tu-needle');
  needle.style.transform = `rotate(${ang(c)}deg)`;
  needle.style.color = col;
  needle.parentNode.classList.add('live');
  $('#tu-note').innerHTML = `${pcText(a.note)}<sub>${octave(a.note)}</sub>`;
  $('#tu-note').style.color = a.inTune ? GREEN : 'var(--tx)';
  $('#tu-hz').textContent = `${a.freq.toFixed(1).replace('.', ',')} Гц · ${a.cents >= 0 ? '+' : '−'}${Math.abs(Math.round(a.cents))} ц`;
  let hint;
  // галочка «настроена» — только если струна держится в строе ~0,4 с подряд (на атаке нота звучит чуть выше)
  streak = a.inTune && a.string === streakString ? streak + 1 : a.inTune ? 1 : 0;
  streakString = a.string;
  if (a.string == null) hint = `Нота ${pcText(a.note)} (${ru(spellPc(mod12(a.note)), true)}) — далеко от открытых струн`;
  else if (a.inTune) { hint = `✓ ${STRING_NUM[a.string]}-я струна в строе`; if (streak >= 10) markTuned(a.string); }
  else if (a.onTarget) hint = a.cents < 0 ? '↑ звучит ниже — подтяни колок' : '↓ звучит выше — ослабь колок';
  else {
    const st = Math.round(a.stringCents / 100), n = Math.abs(st);
    const how = n === 1 ? 'полутон' : n === 2 ? 'тон' : `${n} полутона`;
    hint = `${STRING_NUM[a.string]}-я струна (${pcText(target)}): на ${how} ${st < 0 ? 'ниже — подтяни' : 'выше — ослабь'}`;
    if (st === -2 && a.string === 0 && settings.tuning === 'std') hint += '. Это Drop D? Переключи строй в шапке';
  }
  $('#tu-hint').textContent = hint;
  $('#tu-hint').style.color = col;
  root.querySelectorAll('#tu-strings [data-s]').forEach(b => b.classList.toggle('cur', +b.dataset.s === a.string));
  clearTimeout(idleTimer);
  idleTimer = setTimeout(idle, 1400);
}
function idle() {
  if (!root || performance.now() - lastGood < 1300) return;
  smoother.reset();
  const n = root.querySelector('#tu-needle');
  if (n) { n.style.transform = 'rotate(0deg)'; n.style.color = '#4a5468'; n.parentNode.classList.remove('live'); }
  const h = root.querySelector('#tu-hint');
  if (h) { h.textContent = status === 'on' ? 'Сыграй одну открытую струну и дай ей звучать' : ''; h.style.color = ''; }
  root.querySelectorAll('#tu-strings [data-s]').forEach(b => b.classList.remove('cur'));
}
function markTuned(s) {
  if (tuned.has(s)) return;
  tuned.add(s);
  const b = root.querySelector(`#tu-strings [data-s="${s}"]`);
  if (b) b.classList.add('ok');
}

// ---------- микрофон ----------
async function start() {
  if (status === 'starting') return;
  status = 'starting'; errMsg = ''; renderControls();
  try {
    const r = await startTuner({ deviceId: T.deviceId, onReading, onEnded: () => { status = 'off'; renderControls(); toast('Микрофон отключился'); } });
    if (!root) { stopTuner(); return; }
    status = 'on';
    devices = await listInputs();
    if (T.deviceId && !devices.some(d => d.id === T.deviceId)) { T.deviceId = ''; persist(); }
    if (r.mode !== 'worklet') toast('Старый браузер: тюнер работает в упрощённом режиме');
  } catch (e) {
    status = 'error';
    errMsg = ERR[e.code] || `Не удалось включить микрофон: ${e.message}`;
    if (e.code === 'notfound' && T.deviceId) { T.deviceId = ''; persist(); }
  }
  renderControls();
  idle();
}
function stop() { stopTuner(); status = 'off'; renderControls(); idle(); }

// ---------- отрисовка ----------
function stringsHTML() {
  const tun = tuning();
  const chip = (s, label) => `<button type="button" class="chip ${T.lock === s ? 'on' : ''} ${tuned.has(s) ? 'ok' : ''}" data-act="lock" data-s="${s}">${label}</button>`;
  return `<button type="button" class="chip ${T.lock == null ? 'on' : ''}" data-act="auto">Авто</button>`
    + [0, 1, 2, 3, 4, 5].map(s => chip(s, `${STRING_NUM[s]}: ${pcText(tun[s])}<small>${octave(tun[s])}</small>`)).join('');
}
function renderControls() {
  if (!root) return;
  const b = root.querySelector('#tu-go');
  b.textContent = status === 'on' ? '■ Выключить микрофон' : status === 'starting' ? '… включаю' : '🎤 Включить микрофон';
  b.classList.toggle('r', status === 'on');
  root.querySelector('#tu-err').innerHTML = status === 'error' ? info(esc(errMsg), 'var(--seventh)') : '';
  const sel = root.querySelector('#tu-dev');
  sel.innerHTML = devices.length > 1 ? `<span class="note">Вход</span><select id="tu-devsel" aria-label="Вход звука">${[{ id: '', label: 'По умолчанию' }, ...devices]
    .map(d => `<option value="${esc(d.id)}" ${d.id === T.deviceId ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select>` : '';
  root.querySelector('#tu-lvlwrap').hidden = status !== 'on';
}
function renderStrings() { const el = root && root.querySelector('#tu-strings'); if (el) el.innerHTML = stringsHTML(); }

function render() {
  const tn = TUNINGS[settings.tuning].name;
  root.innerHTML = `
    <div class="kicker">практика · тюнер</div>
    <div class="card tu-card">
      <div class="tu-top"><span class="pill" style="--c:var(--root)">${esc(tn)}</span><span class="note" id="tu-a4v">A4 = ${T.a4} Гц</span></div>
      <div class="tu-dial">${gaugeSVG()}<div class="tu-note" id="tu-note">—</div></div>
      <div class="tu-hz" id="tu-hz">&nbsp;</div>
      <div class="tu-hint" id="tu-hint">${micSupported() ? 'Нажми «Включить микрофон» и сыграй открытую струну' : ''}</div>
      <div id="tu-lvlwrap" class="tu-lvl" hidden><i id="tu-lvl"></i></div>
      <div id="tu-err"></div>
      <button class="btn bigplay" id="tu-go" data-act="go">🎤 Включить микрофон</button>
      <div class="chips tu-strings" id="tu-strings">${stringsHTML()}</div>
      <p class="note" style="text-align:center;margin:4px 0">«Авто» — тюнер сам узнаёт струну. Нажми на струну, чтобы настраивать только её и услышать эталон.</p>
      <div class="row" id="tu-dev"></div>
      <div class="row"><span class="note">Эталон A4</span><button class="btn g sm" data-act="a4" data-d="-1">−</button><b id="tu-a4">${T.a4}</b><button class="btn g sm" data-act="a4" data-d="1">+</button><span class="note">Гц · обычно 440</span></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Как настраивать</h3>
      <ol>
        <li>Включи микрофон и разреши доступ. Звук обрабатывается только на этом устройстве и никуда не отправляется.</li>
        <li>Сыграй одну открытую струну и дай ей звучать. Стрелка влево — звучит ниже: подтягивай колок. Вправо — выше: ослабь. Зелёная зона — ±${IN_TUNE} центов, на слух это идеально.</li>
        <li><b>Подходи к ноте снизу.</b> Перетянул — ослабь ниже ноты и подтяни снова: так шестерня колка держит строй и струна не «сползает».</li>
        <li>Электрогитара без усилителя звучит тихо: держи телефон в 10–20 см от струн, в тихой комнате. Играй мягко — сильный удар первую долю секунды звучит выше.</li>
        <li>После всех шести струн пройдись по ним ещё раз: натяжение одной чуть меняет остальные.</li>
      </ol>
      ${info('<b>Drop D.</b> Переключи строй в шапке и опусти 6-ю струну на тон, до D. Проверка на слух: флажолет на 12-м ладу 6-й струны звучит так же, как открытая 4-я (D). Открытые 6-я + 5-я + 4-я — это пауэр-аккорд D5.', 'var(--root)')}
    </div>
    <div class="card">
      <h3 style="margin-top:0">Ноутбук + Scarlett Solo</h3>
      <ul>
        <li>Гитара — во вход с кнопкой <b>INST</b> (включи её). После разрешения на микрофон выбери вход «Scarlett Solo» в списке выше — так тюнер слышит чистый сигнал без шума комнаты.</li>
        <li><b>Если FL Studio держит Scarlett через ASIO</b>, браузер может получить тишину или ошибку «микрофон занят». Варианты: закрыть FL Studio на время настройки; в FL Studio → Options → Audio settings включить <b>Auto close device</b> (FL отпускает Scarlett, когда переключаешься в другое окно); поставить одинаковую частоту 48 кГц в Windows (Параметры звука → Scarlett → Свойства) и в FL Studio.</li>
        <li>Или настраивайся тюнером AmpliTube 5 / Neural DSP прямо в FL Studio — они видят тот же сигнал.</li>
      </ul>
    </div>`;
  renderControls();
}

export const debugReading = r => onReading(r); // для автотестов (?debug): подставить измерение микрофона

export const page = {
  id: 'tuner', title: 'Тюнер', section: 'practice',
  mount(el) {
    root = el;
    smoother.reset();
    render();
    bind(el, {
      act: {
        go: () => (status === 'on' ? stop() : start()),
        auto: () => { T.lock = null; persist(); renderStrings(); },
        lock: b => { const s = +b.dataset.s; T.lock = T.lock === s ? null : s; persist(); renderStrings(); if (T.lock != null) audio.userPlay([{ midi: tuning()[s], string: s }], status === 'on' ? { dur: 1.5 } : {}); },
        a4: b => { T.a4 = Math.max(430, Math.min(450, T.a4 + +b.dataset.d)); persist(); el.querySelector('#tu-a4').textContent = T.a4; el.querySelector('#tu-a4v').textContent = `A4 = ${T.a4} Гц`; smoother.reset(); },
      },
    });
    el.addEventListener('change', e => { if (e.target.id === 'tu-devsel') { T.deviceId = e.target.value; persist(); if (status === 'on') start(); } });
    this._vis = () => { if (document.hidden && status === 'on') stop(); }; // ушёл с экрана — микрофон выключаем
    document.addEventListener('visibilitychange', this._vis);
  },
  unmount() {
    document.removeEventListener('visibilitychange', this._vis);
    stop();
    clearTimeout(idleTimer);
    root = null;
  },
  onSettings(k) { if (k === 'tuning' || k === 'german') { tuned = new Set(); if (root) { render(); } } },
};
