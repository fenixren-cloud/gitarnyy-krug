// transport.js — один общий транспорт (часы) для метронома, подложки, риффов, теста ритма и проигрывания.
// Время берётся из AudioContext; события планируются с упреждением (lookahead), а не таймерами.
// Позиция = тики, PPQ = 12 тиков на долю (делится на 2, 3, 4 и 6: восьмые, триоли, шестнадцатые, секстоли).
// Время тика: anchorTime + (tick - anchorTick) * spt — без накопления ошибки; при смене темпа якорь
// переносится на следующий незапланированный тик, поэтому уже запланированное не сдвигается.

export const PPQ = 12;
export const clampBpm = b => Math.max(30, Math.min(300, Math.round(b)));

export function createTransport({ now, isHidden = () => false, lookahead = 0.1, hiddenLookahead = 1.2 } = {}) {
  const T = {
    ppq: PPQ, bpm: 120, running: false, source: null, kind: null, name: '',
    anchorTime: 0, anchorTick: 0, nextTick: 0, startTime: 0, inTick: null,
    lookahead, hiddenLookahead,
  };
  const listeners = new Set();
  let visual = [];
  const emit = () => listeners.forEach(f => { try { f(T); } catch (e) { console.error(e); } });

  T.spt = () => 60 / T.bpm / T.ppq;
  T.timeOf = tick => T.anchorTime + (tick - T.anchorTick) * T.spt();
  T.onChange = f => { listeners.add(f); return () => listeners.delete(f); };

  // source: { name, kind: 'rhythm'|'seq', tick(tick, time, T), start?(T, t0), stop?(T), countIn?: beats, onCountIn?(i, time, beats) }
  T.start = (source, { bpm, delay = 0.06 } = {}) => {
    T.stop();
    if (bpm) T.bpm = clampBpm(bpm);
    T.source = source;
    T.kind = source.kind || 'rhythm';
    T.name = source.name || '';
    T.running = true;
    const t0 = now() + delay;
    T.anchorTime = t0; T.anchorTick = 0; T.nextTick = 0; T.startTime = t0;
    T.countInTicks = (source.countIn || 0) * T.ppq;
    if (source.start) source.start(T, t0 + T.countInTicks * T.spt());
    emit();
    T.pump();
  };

  T.setBpm = bpm => {
    bpm = clampBpm(bpm);
    if (bpm === T.bpm) return;
    if (T.running) {
      // внутри обработки тика новый темп начинается с текущего тика, иначе — со следующего незапланированного
      const at = T.inTick != null ? T.inTick : T.nextTick;
      T.anchorTime = T.timeOf(at); T.anchorTick = at;
    }
    T.bpm = bpm;
    emit();
  };

  // Вызывается таймером (воркер или setInterval) каждые ~25 мс
  T.pump = () => {
    if (!T.running) return;
    const horizon = now() + (isHidden() ? T.hiddenLookahead : T.lookahead);
    let guard = 0;
    while (T.running && T.timeOf(T.nextTick) < horizon && guard++ < 20000) {
      const tick = T.nextTick;
      T.nextTick = tick + 1;
      const time = T.timeOf(tick);
      const src = T.source;
      T.inTick = tick;
      try {
        if (tick < T.countInTicks) {
          if (tick % T.ppq === 0 && src.onCountIn) src.onCountIn(tick / T.ppq, time, src.countIn);
        } else {
          src.tick(tick - T.countInTicks, time, T);
        }
      } finally { T.inTick = null; }
    }
  };

  T.stop = () => {
    if (!T.running) return;
    T.running = false;
    const s = T.source;
    T.source = null; T.kind = null; T.name = '';
    visual = [];
    if (s && s.stop) { try { s.stop(T); } catch (e) { console.error(e); } }
    emit();
  };

  // Визуальные события (подсветка доли, курсор): выполняются, когда звук реально слышен
  T.visual = (time, fn) => { visual.push({ time, fn }); };
  T.flushVisual = audibleNow => {
    if (!visual.length) return;
    const due = [], rest = [];
    for (const v of visual) (v.time <= audibleNow ? due : rest).push(v);
    visual = rest;
    due.sort((a, b) => a.time - b.time);
    // после фоновой вкладки догоняем: старые события пропускаем, последнее показываем
    const fresh = due.filter(v => audibleNow - v.time < 0.25);
    (fresh.length ? fresh : due.slice(-1)).forEach(v => { try { v.fn(v.time); } catch (e) { console.error(e); } });
  };
  T.pendingVisual = () => visual.length;
  return T;
}

// Однократная последовательность (гамма, аккорды): events = [{ tick, fn(time) }], окончание через tailTicks
export function sequenceSource(name, events, { tailTicks = PPQ, onEnd } = {}) {
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const last = sorted.length ? sorted[sorted.length - 1].tick : 0;
  let i = 0, ended = false;
  const src = {
    name, kind: 'seq',
    tick(tick, time, T) {
      while (i < sorted.length && sorted[i].tick <= tick) { sorted[i].fn(time, T); i++; }
      if (!ended && tick >= last + tailTicks) {
        ended = true;
        T.visual(time, () => { if (T.source === src) { T.stop(); if (onEnd) onEnd(); } });
      }
    },
  };
  return src;
}

// Таймер планировщика: Web Worker (не замедляется в фоне), иначе setInterval
export function startTicker(fn, ms = 25) {
  let worker = null, id = null;
  try {
    const code = `let id=null;onmessage=e=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage(0),${ms});}else{clearInterval(id);id=null;}}`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = () => fn();
    worker.onerror = () => { try { worker.terminate(); } catch (e) { } worker = null; id = setInterval(fn, ms); };
    worker.postMessage('start');
  } catch (e) {
    worker = null;
    id = setInterval(fn, ms);
  }
  return () => { if (worker) worker.terminate(); if (id) clearInterval(id); };
}
