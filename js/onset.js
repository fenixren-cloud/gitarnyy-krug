// onset.js — определение атак (ударов) в звуке с микрофона: тест ритма ударами по заглушённым струнам.
// Чистая логика без DOM и звука, тестируется в Node (tests/onset.test.mjs).
//
// Как работает: сигнал пропускается через полосу 70–1200 Гц (удар по струнам там, а высокий клик метронома —
// 5 кГц — отрезается на −50 дБ), считается энергия коротких окон по 4 мс. Удар — резкий скачок энергии
// (в 4+ раза выше среднего за последние 40 мс) и не раньше чем через 90 мс после прошлого удара.
// Момент удара уточняется до отсчёта: первый отсчёт, где сигнал достигает 35 % пика.

// createOnsetDetector ДОЛЖНА быть самодостаточной: её текст вставляется в AudioWorklet.
export function createOnsetDetector({ sampleRate, hopSec = 0.004, ratio = 4, minRms = 0.006, refractory = 0.09, lowHz = 70, highHz = 1200, history = 10 } = {}) {
  const hop = Math.max(16, Math.round(sampleRate * hopSec));
  // ФВЧ 1-го порядка
  const aHP = Math.exp((-2 * Math.PI * lowHz) / sampleRate);
  // ФНЧ: два одинаковых биквада (RBJ, Q = 0,707) — спад 24 дБ на октаву
  const w = (2 * Math.PI * highHz) / sampleRate, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.7071), a0 = 1 + al;
  const b0 = (1 - cs) / 2 / a0, b1 = (1 - cs) / a0, b2 = b0, a1 = (-2 * cs) / a0, a2 = (1 - al) / a0;
  const bq = [[0, 0, 0, 0], [0, 0, 0, 0]]; // x1, x2, y1, y2 для двух звеньев
  let xp = 0, hp = 0;
  let cur = new Float32Array(hop), prev = new Float32Array(hop), n = 0, frame0 = 0, prevFrame0 = -1;
  const E = [];
  let last = -Infinity;
  function filt(x) {
    hp = aHP * (hp + x - xp); xp = x;
    let v = hp;
    for (const s of bq) {
      const y = b0 * v + b1 * s[0] + b2 * s[1] - a1 * s[2] - a2 * s[3];
      s[1] = s[0]; s[0] = v; s[3] = s[2]; s[2] = y; v = y;
    }
    return v;
  }
  // samples — очередной кусок сигнала, frame — номер его первого отсчёта (сквозной).
  // Возвращает номера отсчётов, где начались удары (может быть пусто).
  function push(samples, frame) {
    const out = [];
    for (let i = 0; i < samples.length; i++) {
      if (n === 0) frame0 = frame + i;
      cur[n++] = filt(samples[i]);
      if (n < hop) continue;
      let e = 0, pk = 0;
      for (let k = 0; k < hop; k++) { const v = cur[k]; e += v * v; const a = v < 0 ? -v : v; if (a > pk) pk = a; }
      e /= hop;
      let mean = 0;
      for (const x of E) mean += x;
      mean = E.length ? mean / E.length : e;
      if (E.length >= 3 && Math.sqrt(e) >= minRms && e > ratio * mean && frame0 - last >= refractory * sampleRate) {
        // уточнение: первый отсчёт (в прошлом или текущем окне), где сигнал достиг 35 % пика
        const thr = 0.35 * pk;
        let at = -1;
        if (prevFrame0 >= 0) for (let k = 0; k < hop; k++) { const v = prev[k]; if ((v < 0 ? -v : v) >= thr) { at = prevFrame0 + k; break; } }
        if (at < 0) for (let k = 0; k < hop; k++) { const v = cur[k]; if ((v < 0 ? -v : v) >= thr) { at = frame0 + k; break; } }
        if (at < 0) at = frame0;
        if (at - last >= refractory * sampleRate) { out.push(at); last = at; }
      }
      E.push(e); if (E.length > history) E.shift();
      const t = prev; prev = cur; cur = t; prevFrame0 = frame0; n = 0;
    }
    return out;
  }
  return { push, hop };
}
