// tuner.js — микрофон (телефона или Scarlett Solo) → определение высоты → показания для страницы.
// Тяжёлая математика идёт в AudioWorklet — отдельном звуковом потоке, интерфейс не тормозит.
// Звук с микрофона обрабатывается только на устройстве и никуда не отправляется.
import * as audio from './audio.js';
import { createDetector, decimate2 } from './pitch.js';
import { createOnsetDetector } from './onset.js';

// Код процессора для AudioWorklet. Детектор вставляется текстом той же функции, что тестируется в Node,
// поэтому работает и в обычной версии, и в офлайн-файле (там нет отдельных файлов модулей).
const workletSource = () => `const createDetector = ${createDetector.toString()};
const decimate2 = ${decimate2.toString()};
const createOnsetDetector = ${createOnsetDetector.toString()};
class GkPitch extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.dec = sampleRate > 50000 ? 2 : 1; // 96 кГц → анализ на 48 кГц
    this.rate = sampleRate / this.dec;
    this.det = createDetector({ sampleRate: this.rate, minFreq: o.minFreq || 60, maxFreq: o.maxFreq || 1400 });
    this.buf = new Float32Array(this.det.need);
    this.hopIn = Math.max(128, Math.round(this.rate * (o.hop || 0.04))) * this.dec; // ~25 измерений в секунду
    this.stage = new Float32Array(this.hopIn + 8192);
    this.n = 0;
    this.on = true;
    this.port.onmessage = e => { if (e.data === 'stop') this.on = false; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && this.n + ch.length <= this.stage.length) { this.stage.set(ch, this.n); this.n += ch.length; }
    if (this.n >= this.hopIn) {
      const raw = this.stage.subarray(0, this.hopIn);
      const fresh = this.dec === 2 ? decimate2(raw) : raw;
      const B = this.buf, L = Math.min(fresh.length, B.length);
      B.copyWithin(0, L);
      B.set(fresh.subarray(fresh.length - L), B.length - L);
      this.stage.copyWithin(0, this.hopIn, this.n);
      this.n -= this.hopIn;
      const r = this.det.detect(B);
      this.port.postMessage({ f: r.freq, c: r.clarity, rms: r.rms, t: currentTime });
    }
    return this.on;
  }
}
registerProcessor('gk-pitch', GkPitch);
// Атаки (удары по струнам): время удара — по часам AudioContext с точностью до отсчёта
class GkOnset extends AudioWorkletProcessor {
  constructor() {
    super();
    this.det = createOnsetDetector({ sampleRate });
    this.on = true; this.acc = 0; this.cnt = 0; this.lvlEvery = Math.round(sampleRate * 0.05);
    this.port.onmessage = e => { if (e.data === 'stop') this.on = false; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (const f of this.det.push(ch, currentFrame)) this.port.postMessage({ kind: 'onset', t: f / sampleRate });
      for (let i = 0; i < ch.length; i++) this.acc += ch[i] * ch[i];
      this.cnt += ch.length;
      if (this.cnt >= this.lvlEvery) { this.port.postMessage({ kind: 'level', rms: Math.sqrt(this.acc / this.cnt) }); this.acc = 0; this.cnt = 0; }
    }
    return this.on;
  }
}
registerProcessor('gk-onset', GkOnset);`;

let st = null;
let listener = null;
export const debugLog = []; // для автотестов (?debug): сырые показания высоты
export const onsetLog = [];  // и моменты ударов
const workletLoaded = new WeakMap();

export class TunerError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

export const micSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
export const tunerRunning = () => !!st;

function emit(r) {
  if (debugLog.length > 4000) debugLog.splice(0, 1000);
  debugLog.push(r);
  if (listener) listener(r);
}

async function loadWorklet(ctx) {
  if (!ctx.audioWorklet || typeof AudioWorkletNode !== 'function') throw new Error('нет AudioWorklet');
  if (!workletLoaded.has(ctx)) {
    const url = URL.createObjectURL(new Blob([workletSource()], { type: 'text/javascript' }));
    workletLoaded.set(ctx, ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
  }
  return workletLoaded.get(ctx);
}

// Включить микрофон для тюнера и «играй — слушает»: onReading({ f, c, rms, t }) ~25 раз в секунду; f = null, если ноты нет.
export const startTuner = (o = {}) => startMic({ ...o, mode: 'pitch' });
// Включить микрофон для ударов: onOnset(t) — время удара по часам AudioContext; onLevel(rms) — уровень ~20 раз в секунду.
export const startOnsets = (o = {}) => startMic({ ...o, mode: 'onset' });

async function startMic({ mode = 'pitch', deviceId = '', onReading, onOnset, onLevel, onEnded } = {}) {
  stopTuner();
  if (!micSupported()) throw new TunerError('nomic');
  const ctx = audio.ensure();
  if (!ctx) throw new TunerError('noaudio');
  // без «улучшений» звонка: подавление эха и шума и автогромкость портят высоту и атаку
  const constraints = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } };
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia(constraints); } catch (e) {
    const n = e && e.name;
    throw new TunerError(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied'
      : n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'NotSupportedError' ? 'notfound'
        : n === 'NotReadableError' || n === 'AbortError' ? 'busy' : 'other', e && e.message);
  }
  listener = onReading || null;
  const src = ctx.createMediaStreamSource(stream);
  const trackSettings = (() => { try { return stream.getAudioTracks()[0].getSettings() || {}; } catch (e) { return {}; } })();
  const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination); // беззвучно: только чтобы граф обрабатывался
  const s = { stream, src, sink, node: null, timer: null, mode: 'worklet' };
  try {
    await loadWorklet(ctx);
    const node = new AudioWorkletNode(ctx, mode === 'onset' ? 'gk-onset' : 'gk-pitch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.onmessage = mode === 'onset'
      ? e => { const d = e.data; if (d.kind === 'onset') { onsetLog.push(d.t); if (onOnset) onOnset(d.t); } else if (onLevel) onLevel(d.rms); }
      : e => emit(e.data);
    src.connect(node); node.connect(sink);
    s.node = node;
  } catch (e) {
    if (mode === 'onset') { stream.getTracks().forEach(t => t.stop()); try { sink.disconnect(); } catch (er) { } throw new TunerError('noworklet'); }
    // запасной путь: AnalyserNode на основном потоке (старые браузеры)
    const an = ctx.createAnalyser();
    const det = createDetector({ sampleRate: ctx.sampleRate });
    an.fftSize = det.need > 4096 ? 8192 : 4096;
    const buf = new Float32Array(an.fftSize);
    src.connect(an); an.connect(sink);
    s.timer = setInterval(() => { an.getFloatTimeDomainData(buf); const r = det.detect(buf); emit({ f: r.freq, c: r.clarity, rms: r.rms, t: ctx.currentTime }); }, 45);
    s.mode = 'analyser';
  }
  const track = stream.getAudioTracks()[0];
  if (track) track.addEventListener('ended', () => { if (st === s) { stopTuner(); if (onEnded) onEnded(); } });
  st = s;
  // задержка входа (если браузер её сообщает) — для начальной поправки теста ритма до калибровки
  return { mode: s.mode, label: track ? track.label : '', sampleRate: ctx.sampleRate, inputLatency: +trackSettings.latency || 0, outputLatency: ctx.outputLatency || ctx.baseLatency || 0 };
}

export function stopTuner() {
  if (!st) return;
  const s = st;
  st = null;
  listener = null;
  try { if (s.node) { s.node.port.postMessage('stop'); s.node.disconnect(); } } catch (e) { }
  if (s.timer) clearInterval(s.timer);
  try { s.src.disconnect(); s.sink.disconnect(); } catch (e) { }
  s.stream.getTracks().forEach(t => t.stop()); // гасим значок микрофона
}

// Список входов (названия видны только после разрешения на микрофон)
export async function listInputs() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || 'Микрофон' }));
  } catch (e) { return []; }
}
