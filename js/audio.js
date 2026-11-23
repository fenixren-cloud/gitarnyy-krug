// audio.js — звук: записанные сэмплы электрогитары и баса, синтез барабанов и метронома,
// перегруз (WaveShaper + кабинет), компрессор на выходе, бурдон.
import { settings, onSettings, emit } from './state.js';
import { midiToFreq } from './music.js';

// Сэмплы гитары через 3 полутона (E2…C6). Cs2 не используем: в нём доминирует 3-я гармоника,
// на слух высота «уезжает». D2 и D♯2 получаем из E2 сдвигом playbackRate.
const GUITAR_FILES = { 40: 'E2', 42: 'Fs2', 45: 'A2', 48: 'C3', 51: 'Ds3', 54: 'Fs3', 57: 'A3', 60: 'C4', 63: 'Ds4', 66: 'Fs4', 69: 'A4', 72: 'C5', 75: 'Ds5', 78: 'Fs5', 81: 'A5', 84: 'C6' };
const BASS_FILES = { 25: 'Cs1', 28: 'E1', 31: 'G1', 34: 'As1', 37: 'Cs2', 40: 'E2', 43: 'G2', 46: 'As2', 49: 'Cs3' };

let ctx = null, N = null;
const GS = {}, BS = {};
let status = 'loading';
export const hooks = { beforeUserPlay: null };

// Есть ли в браузере Web Audio. Если нет (редкие встроенные браузеры, тестовая сборка WebKit),
// приложение работает без звука, а не падает.
export const supported = () => !!(window.AudioContext || window.webkitAudioContext);
export const getStatus = () => status;
function setStatus(s) { status = s; emit('audio-status', s); }
export const hasCtx = () => !!ctx;
export const now = () => (ctx ? ctx.currentTime : performance.now() / 1000);
export const latency = () => (ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0);
export const audibleNow = () => (ctx ? ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) : performance.now() / 1000);
export const context = () => ctx;

// ---------- Загрузка сэмплов (до первого касания декодируем в OfflineAudioContext) ----------
function b64ToBuf(b64) {
  const bin = atob(b64), n = bin.length, u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
async function fetchRaw(path) {
  const emb = globalThis.__SAMPLES && globalThis.__SAMPLES[path];
  if (emb) return b64ToBuf(emb);
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ': ' + r.status);
  return r.arrayBuffer();
}
function decode(ac, buf) {
  return new Promise((res, rej) => {
    const p = ac.decodeAudioData(buf, res, rej);
    if (p && p.then) p.then(res, rej);
  });
}
// Обрезка тишины в начале: ищем атаку (3% от пика) минус 2 мс
function analyse(buffer) {
  const d = buffer.getChannelData(0), sr = buffer.sampleRate;
  let peak = 0;
  for (let i = 0, n = Math.min(d.length, sr); i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const thr = peak * 0.03;
  let on = 0;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thr) { on = i; break; }
  return { buffer, offset: Math.max(0, on / sr - 0.002), norm: peak > 0 ? 0.7 / peak : 1 };
}
export async function loadSamples() {
  if (!supported()) { setStatus('unsupported'); return; }
  try {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oac = new OAC(1, 44100, 44100);
    const job = async (dir, map, store) => Promise.all(Object.entries(map).map(async ([m, name]) => {
      const raw = await fetchRaw(`samples/${dir}/${name}.mp3`);
      store[m] = analyse(await decode(oac, raw));
    }));
    await job('guitar', GUITAR_FILES, GS);
    setStatus('ready');
    job('bass', BASS_FILES, BS).catch(e => console.warn('bass samples:', e.message));
  } catch (e) {
    console.warn('guitar samples:', e && e.message);
    setStatus('error');
  }
}

// ---------- Граф ----------
function makeCurve(k) {
  const n = 2048, c = new Float32Array(n), norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i * 2) / (n - 1) - 1; c[i] = Math.tanh(k * (x + 0.08 * x * x)) / norm; }
  return c;
}
function biquad(type, f, q = 0.7, gain = 0) {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b;
}
function chain(...ns) { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[ns.length - 1]; }

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
  const g = v => { const x = ctx.createGain(); x.gain.value = v; return x; };
  N = {};
  N.master = g(settings.volume);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8; comp.knee.value = 4; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.12;
  N.master.connect(comp); comp.connect(ctx.destination);
  // гитара: чистый канал и перегруз параллельно, переключаются громкостью
  N.guitarIn = g(1); N.guitarOut = g(1); N.guitarOut.connect(N.master);
  N.clean = g(settings.tone === 'clean' ? 1 : 0);
  chain(N.guitarIn, N.clean, N.guitarOut);
  N.dist = g(settings.tone === 'dist' ? 1 : 0);
  N.distIn = g(1); // вход перегруза без глобального переключателя (подложка: пауэр-аккорды всегда через перегруз)
  chain(N.guitarIn, N.dist, N.distIn);
  const shaper = ctx.createWaveShaper(); shaper.curve = makeCurve(9); shaper.oversample = '4x';
  chain(N.distIn, g(5), biquad('highpass', 90), biquad('peaking', 850, 0.8, 6), shaper,
    biquad('peaking', 110, 0.9, 3), biquad('peaking', 600, 1, -5), biquad('peaking', 2400, 1.2, 4),
    biquad('lowpass', 5200, 0.9), biquad('lowpass', 8000, 0.7), g(0.2), N.guitarOut);
  N.guitarDist = N.distIn; N.guitarClean = N.guitarOut;
  N.bass = g(1); chain(N.bass, biquad('lowpass', 2600, 0.7), N.master);
  N.drums = g(1); N.drums.connect(N.master);
  N.click = g(1); N.click.connect(N.master);
  N.drone = g(1); N.drone.connect(N.master);
}
onSettings((k, v) => {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (k === 'tone') { N.clean.gain.setTargetAtTime(v === 'clean' ? 1 : 0, t, 0.02); N.dist.gain.setTargetAtTime(v === 'dist' ? 1 : 0, t, 0.02); }
  if (k === 'volume') N.master.gain.setTargetAtTime(v, t, 0.03);
});

// Вызывается в обработчике первого касания/клавиши: создаём контекст и «будим» звук (iOS)
export function ensure() {
  if (!ctx && !supported()) return null;
  if (!ctx) {
    build();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* iOS 17+ */ }
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { }
  }
  if (ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
  return ctx;
}
export const bus = name => (ctx ? N[name] : null);
export function trackGain(target, value = 1) { if (!ctx) return null; const x = ctx.createGain(); x.gain.value = value; x.connect(N[target]); return x; }
export function setGain(node, v) { if (node && ctx) node.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }

// ---------- Гитара ----------
const voices = [];
const nearest = (map, midi) => {
  let best = null, bd = 1e9;
  for (const k in map) { const d = Math.abs(midi - k); if (d < bd || (d === bd && +k < best)) { bd = d; best = +k; } }
  return best;
};
function killVoice(v, time) {
  if (v.dead) return;
  v.dead = true;
  const t = Math.max(time, ctx.currentTime);
  if (v.start > t + 0.001) { try { v.src.stop(); } catch (e) { } return; }
  v.mute.gain.setTargetAtTime(0, t, 0.012);
  try { v.src.stop(t + 0.12); } catch (e) { }
}
// Заглушить голоса (как ладонью): по фильтру, в момент time
export function muteGuitar(time = null, filter = () => true) {
  if (!ctx) return;
  const t = time == null ? ctx.currentTime : time;
  voices.slice().forEach(v => { if (!v.dead && filter(v)) killVoice(v, t); });
}
function pluckBuffer(midi) {
  const sr = ctx.sampleRate, f = midiToFreq(midi), n = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * 2);
  const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), r = new Float32Array(n);
  for (let i = 0; i < n; i++) r[i] = Math.random() * 2 - 1;
  for (let i = 0, k = 0; i < len; i++) { const a = r[k], nx = r[(k + 1) % n]; d[i] = a * 0.5; r[k] = 0.996 * 0.5 * (a + nx); k = (k + 1) % n; }
  return { buffer: b, offset: 0, norm: 1, base: midi };
}
const plucks = {};
// Одна нота гитары. o: { dur, string, tag: 'user'|'seq'|'rhythm', vel, pm (palm mute), dest }
export function guitarNote(midi, time, o = {}) {
  if (!ctx) return null;
  const { dur = null, string = null, tag = 'user', vel = 1, pm = false, dest = null } = o;
  if (string != null) muteGuitar(time, v => v.string === string && v.tag === tag && v.start <= time + 1e-4);
  let smp, rate;
  const key = nearest(GS, midi);
  if (key != null) { smp = GS[key]; rate = Math.pow(2, (midi - key) / 12); }
  else { smp = plucks[midi] || (plucks[midi] = pluckBuffer(midi)); rate = 1; }
  const src = ctx.createBufferSource();
  src.buffer = smp.buffer; src.playbackRate.value = rate;
  const env = ctx.createGain(), mute = ctx.createGain();
  let head = src;
  if (pm) { const lp = biquad('lowpass', 1000, 0.9); src.connect(lp); head = lp; }
  head.connect(env); env.connect(mute); mute.connect(dest || N.guitarIn);
  const gain = vel * smp.norm * (pm ? 0.85 : 1);
  env.gain.setValueAtTime(gain, time);
  let end = time + (smp.buffer.duration - smp.offset) / rate;
  if (dur != null) {
    const rel = pm ? 0.025 : 0.05;
    env.gain.setValueAtTime(gain, time + dur);
    env.gain.setTargetAtTime(0, time + dur, rel);
    end = Math.min(end, time + dur + rel * 7);
  }
  src.start(time, smp.offset);
  try { src.stop(end + 0.02); } catch (e) { }
  const v = { src, mute, start: time, end, string, tag, midi };
  voices.push(v);
  src.onended = () => { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); try { mute.disconnect(); } catch (e) { } };
  if (voices.length > 80) killVoice(voices.find(x => !x.dead) || voices[0], ctx.currentTime);
  return v;
}
// Аккорд «ударом» медиатора: notes = [{midi, string}] снизу вверх; dir 'down' | 'up'
export function strum(notes, time, o = {}) {
  const { gap = 0.02, dir = 'down', vel = 0.8, tag = 'user', dur = null, pm = false, dest = null } = o;
  const list = dir === 'up' ? [...notes].reverse() : notes;
  list.forEach((n, i) => guitarNote(n.midi, time + i * gap, { string: n.string, tag, vel: vel * (1 - i * 0.03), dur: dur != null ? dur - i * gap : null, pm, dest }));
}
// Нажатие пользователя: новый звук глушит предыдущий и отменяет запланированные последовательности
export function userPlay(notes, o = {}) {
  if (!ensure()) return;
  if (hooks.beforeUserPlay) hooks.beforeUserPlay();
  const t = ctx.currentTime + 0.01;
  muteGuitar(t, v => v.tag !== 'rhythm');
  const list = notes.map(n => (typeof n === 'number' ? { midi: n, string: null } : n));
  if (list.length === 1) guitarNote(list[0].midi, t, { string: list[0].string, tag: 'user', vel: o.vel || 0.95, dur: o.dur ?? null });
  else if (o.arp) list.forEach((n, i) => guitarNote(n.midi, t + i * o.arp, { tag: 'user', vel: 0.8 }));
  else strum(list, t, { tag: 'user', gap: o.gap ?? 0.02, dir: o.dir || 'down', vel: o.vel || 0.85 });
}
export function stopSeqVoices() { muteGuitar(null, v => v.tag === 'seq'); }
// Когда стихнет вся гитара приложения (время AudioContext). Пока она звучит, микрофон «играй — слушает»
// не принимает ответы — иначе приложение услышало бы само себя из динамика.
export function quietAt() {
  let t = 0;
  for (const v of voices) if (!v.dead && v.end > t) t = v.end;
  return t;
}

// ---------- Бас ----------
const bassVoices = [];
export function bassNote(midi, time, { dur = 0.45, vel = 1, dest = null } = {}) {
  if (!ctx) return;
  bassVoices.splice(0).forEach(v => killVoice(v, time));
  const key = nearest(BS, midi);
  const out = dest || N.bass;
  const env = ctx.createGain(), mute = ctx.createGain();
  env.connect(mute); mute.connect(out);
  let src, peak;
  if (key != null) {
    const smp = BS[key];
    src = ctx.createBufferSource(); src.buffer = smp.buffer; src.playbackRate.value = Math.pow(2, (midi - key) / 12);
    src.connect(env);
    peak = vel * smp.norm * 1.1;
    env.gain.setValueAtTime(peak, time);
    src.start(time, smp.offset);
  } else {
    src = ctx.createOscillator(); src.type = 'triangle'; src.frequency.value = midiToFreq(midi);
    const lp = biquad('lowpass', 700, 1); src.connect(lp); lp.connect(env);
    peak = vel * 0.6;
    env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(peak, time + 0.008);
    src.start(time);
  }
  env.gain.setValueAtTime(peak, time + dur);
  env.gain.setTargetAtTime(0, time + dur, 0.04);
  try { src.stop(time + dur + 0.35); } catch (e) { }
  const v = { src, mute, start: time, end: time + dur + 0.3 };
  bassVoices.push(v);
  src.onended = () => { try { mute.disconnect(); } catch (e) { } };
}
export function muteBass(time = null) { if (ctx) bassVoices.splice(0).forEach(v => killVoice(v, time == null ? ctx.currentTime : time)); }

// ---------- Барабаны (синтез) ----------
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
}
function envGain(time, peak, decay, dest, attack = 0.001) {
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, time);
  gn.gain.exponentialRampToValueAtTime(peak, time + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  gn.connect(dest);
  return gn;
}
export const drums = {
  kick(t, v = 1, dest) {
    if (!ctx) return; dest = dest || N.drums;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    o.connect(envGain(t, 0.95 * v, 0.42, dest)); o.start(t); o.stop(t + 0.5);
    const n = noise(); const hp = biquad('highpass', 1800); n.connect(hp); hp.connect(envGain(t, 0.22 * v, 0.012, dest)); n.start(t); n.stop(t + 0.03);
  },
  snare(t, v = 1, dest) {
    if (!ctx) return; dest = dest || N.drums;
    const n = noise(); const bp = biquad('bandpass', 2200, 0.6); n.connect(bp); bp.connect(envGain(t, 0.55 * v, 0.17, dest)); n.start(t); n.stop(t + 0.25);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.08);
    o.connect(envGain(t, 0.4 * v, 0.1, dest)); o.start(t); o.stop(t + 0.15);
  },
  hat(t, v = 1, open = false, dest) {
    if (!ctx) return; dest = dest || N.drums;
    const n = noise(); const hp = biquad('highpass', 7000); const bp = biquad('bandpass', 10000, 0.8);
    n.connect(hp); hp.connect(bp); bp.connect(envGain(t, 0.32 * v, open ? 0.28 : 0.045, dest)); n.start(t); n.stop(t + (open ? 0.35 : 0.08));
  },
  crash(t, v = 1, dest) {
    if (!ctx) return; dest = dest || N.drums;
    const n = noise(); const hp = biquad('highpass', 4200); n.connect(hp); hp.connect(envGain(t, 0.3 * v, 1.3, dest, 0.002)); n.start(t); n.stop(t + 1.4);
  },
};

// ---------- Метроном ----------
// level: 3 сильная, 2 средняя, 1 слабая, 0.5 деление доли
// hi — очень высокий клик (5 кГц) для теста ритма гитарой: детектор ударов слушает только до 1,2 кГц
const CLICK_F = { click: [2000, 1500, 1150, 900], wood: [1250, 1000, 850, 760], beep: [1760, 1320, 990, 880], hi: [5600, 5000, 5000, 5000] };
export function click(t, level, sound = 'click', vol = 1, dest) {
  if (!ctx || level <= 0) return;
  dest = dest || N.click;
  const li = level >= 3 ? 0 : level >= 2 ? 1 : level >= 1 ? 2 : 3;
  const amp = [1, 0.75, 0.55, 0.32][li] * vol;
  if (sound === 'drums') {
    if (li === 0) { drums.kick(t, amp, dest); drums.hat(t, amp * 0.6, false, dest); }
    else if (li === 1) drums.snare(t, amp, dest);
    else drums.hat(t, amp * 1.2, false, dest);
    return;
  }
  const f = (CLICK_F[sound] || CLICK_F.click)[li];
  const o = ctx.createOscillator();
  if (sound === 'hi') {
    o.type = 'sine'; o.frequency.value = f;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(amp * 0.5, t + 0.002);
    gn.gain.setTargetAtTime(0, t + 0.012, 0.012);
    o.connect(gn); gn.connect(dest); o.start(t); o.stop(t + 0.08);
  } else if (sound === 'beep') {
    o.type = 'sine'; o.frequency.value = f;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(amp * 0.6, t + 0.004);
    gn.gain.setValueAtTime(amp * 0.6, t + 0.05); gn.gain.linearRampToValueAtTime(0, t + 0.07);
    o.connect(gn); gn.connect(dest); o.start(t); o.stop(t + 0.08);
  } else if (sound === 'wood') {
    o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.7;
    o.connect(envGain(t, amp * 0.9, 0.06, dest)); o2.connect(envGain(t, amp * 0.25, 0.025, dest));
    o.start(t); o.stop(t + 0.1); o2.start(t); o2.stop(t + 0.05);
  } else {
    o.type = 'square'; o.frequency.value = f;
    const hp = biquad('highpass', 500); o.connect(hp); hp.connect(envGain(t, amp * 0.5, 0.03, dest)); o.start(t); o.stop(t + 0.05);
  }
}
export function bell(t) {
  if (!ctx) return;
  [880, 1320, 1760].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(envGain(t + i * 0.12, 0.35, 1.4, N.click, 0.004)); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 1.5); });
}

// ---------- Бурдон: тянется тоника в басу ----------
let drone = null;
export const droneOn = () => !!drone;
export function startDrone(midi) {
  if (!ensure()) return;
  stopDrone();
  const t = ctx.currentTime, f = midiToFreq(midi);
  const out = ctx.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.3, t + 0.5); out.connect(N.drone);
  const lp = biquad('lowpass', 520, 1.2); lp.connect(out);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18; const lg = ctx.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(lp.frequency);
  const mk = (type, freq, gain, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; const gg = ctx.createGain(); gg.gain.value = gain; o.connect(gg); gg.connect(lp); o.start(t); return o; };
  const oscs = [mk('sine', f, 0.7), mk('sawtooth', f, 0.18, -6), mk('sawtooth', f, 0.18, 6), mk('triangle', f * 2, 0.12), lfo];
  lfo.start(t);
  drone = { out, oscs, midi };
  emit('drone', true);
}
export function stopDrone() {
  if (!drone || !ctx) return;
  const t = ctx.currentTime, d = drone;
  drone = null;
  d.out.gain.cancelScheduledValues(t); d.out.gain.setValueAtTime(d.out.gain.value, t); d.out.gain.linearRampToValueAtTime(0, t + 0.35);
  d.oscs.forEach(o => { try { o.stop(t + 0.4); } catch (e) { } });
  emit('drone', false);
}

// ---------- Всё стоп ----------
export function silenceAll() {
  if (!ctx) return;
  muteGuitar(); muteBass(); stopDrone();
}
// Время удара из события указателя в часах AudioContext (что слышно сейчас)
export function eventToCtxTime(ev) {
  if (!ctx) return 0;
  const stamp = ev && ev.timeStamp ? ev.timeStamp : performance.now();
  if (ctx.getOutputTimestamp) {
    const o = ctx.getOutputTimestamp();
    if (o && o.performanceTime > 0 && o.contextTime > 0) return o.contextTime + (stamp - o.performanceTime) / 1000;
  }
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - (performance.now() - stamp) / 1000;
}
