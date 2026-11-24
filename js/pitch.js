// pitch.js — определение высоты звука (тюнер, «играй — приложение слушает»). Чистая логика без DOM и звука,
// тестируется в Node (tests/pitch.test.mjs).
//
// Алгоритм YIN (de Cheveigné & Kawahara, 2002): ищем период сигнала — сдвиг, при котором сигнал сильнее всего
// похож сам на себя. Для гитары это надёжнее БПФ: низкие струны богаты обертонами, и самый громкий пик спектра
// часто вовсе не основной тон.

// createDetector ДОЛЖНА быть самодостаточной (без внешних переменных): её текст через toString()
// вставляется в AudioWorklet, который работает в отдельном потоке и не видит модулей приложения.
export function createDetector({ sampleRate, minFreq = 60, maxFreq = 1400, threshold = 0.12, minRms = 0.003 } = {}) {
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.ceil(sampleRate / minFreq);
  const W = Math.ceil(tauMax * 1.6); // окно сравнения: больше самого длинного периода
  const need = W + tauMax + 2;       // столько последних отсчётов нужно для одного измерения
  const d = new Float32Array(tauMax + 2);
  function detect(buf) {
    const off = buf.length - need;
    if (off < 0) return { freq: null, clarity: 0, rms: 0 };
    let e = 0;
    for (let i = 0; i < need; i++) { const x = buf[off + i]; e += x * x; }
    const rms = Math.sqrt(e / need);
    if (rms < minRms) return { freq: null, clarity: 0, rms };
    // разностная функция d(τ) = Σ (x[i] − x[i+τ])²
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const x = buf[off + i] - buf[off + i + tau]; s += x * x; }
      d[tau] = s;
    }
    // нормированная накопленным средним: убирает «ложный ноль» при τ = 0
    d[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; d[tau] = run > 0 ? (d[tau] * tau) / run : 1; }
    // первый провал ниже порога — это основной период (кратные периоды тоже проваливаются, но позже)
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < threshold) { while (t + 1 <= tauMax && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) {
      // нет чёткого провала: берём глобальный минимум, но только если он достаточно глубокий
      let b = tauMin;
      for (let t = tauMin; t <= tauMax; t++) if (d[t] < d[b]) b = t;
      if (d[b] > 0.3) return { freq: null, clarity: 1 - d[b], rms };
      tau = b;
    }
    if (tau <= tauMin || tau >= tauMax) return { freq: null, clarity: 1 - d[tau], rms }; // упёрлись в край диапазона
    // параболическое уточнение между отсчётами: точность до долей цента
    const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a + c - 2 * b;
    const shift = den > 0 ? (0.5 * (a - c)) / den : 0;
    return { freq: sampleRate / (tau + shift), clarity: 1 - b, rms };
  }
  return { detect, need, tauMin, tauMax, W };
}

// ---------- ноты, центы, струны ----------
export const freqToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);
export const midiToFreqA4 = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);

// Разбор одного измерения для тюнера.
// tuning — MIDI открытых струн (индекс 0 = 6-я), lock — индекс струны или null (автовыбор).
// Возвращает ближайшую ноту (midi), отклонение от неё в центах, струну-цель и отклонение от неё.
export function analyzeReading(freq, { a4 = 440, tuning = [40, 45, 50, 55, 59, 64], lock = null, inTuneCents = 5 } = {}) {
  if (!freq || !(freq > 0)) return null;
  const m = freqToMidi(freq, a4);
  const note = Math.round(m);
  const cents = (m - note) * 100;
  let string = lock;
  if (string == null) {
    let best = 0;
    for (let s = 1; s < tuning.length; s++) if (Math.abs(m - tuning[s]) < Math.abs(m - tuning[best])) best = s;
    string = Math.abs(m - tuning[best]) <= 3.5 ? best : null; // дальше трёх с половиной полутонов — это не «почти эта струна»
  }
  const target = string == null ? null : tuning[string];
  const stringCents = target == null ? null : (m - target) * 100;
  const onTarget = target != null && note === target;
  return {
    freq, midi: m, note, cents, string, target, stringCents, onTarget,
    inTune: onTarget && Math.abs(cents) <= inTuneCents,
  };
}

// Сглаживание показаний: медиана последних N в пределах одной ноты; новая нота — начинаем заново.
export function createSmoother(n = 5) {
  let hist = [];
  return {
    push(midi) {
      if (midi == null) return null;
      if (hist.length && Math.abs(midi - median(hist)) > 0.5) hist = [];
      hist.push(midi);
      if (hist.length > n) hist.shift();
      return median(hist);
    },
    reset() { hist = []; },
    get size() { return hist.length; },
  };
}
export function median(a) {
  const s = [...a].sort((x, y) => x - y), k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

// Понижение частоты дискретизации вдвое (среднее пар отсчётов) — вчетверо меньше вычислений, гитаре хватает.
export function decimate2(input, out = new Float32Array(input.length >> 1)) {
  for (let i = 0, j = 0; j < out.length; i += 2, j++) out[j] = 0.5 * (input[i] + input[i + 1]);
  return out;
}
