// player.js — связка транспорта со звуком: единственный экземпляр часов, таймер планировщика,
// визуальный цикл, Wake Lock, общий «стоп» и проигрывание последовательностей для вкладок теории.
import { createTransport, startTicker, sequenceSource, PPQ } from './transport.js';
import * as audio from './audio.js';
import { emit } from './state.js';

export const transport = createTransport({ now: audio.now, isHidden: () => document.hidden });
export { PPQ };

let stopTicker = null;
let lock = null;
async function wake(on) {
  try {
    if (on && !lock && navigator.wakeLock && !document.hidden) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) { const l = lock; lock = null; await l.release(); }
  } catch (e) { lock = null; }
}
transport.onChange(T => {
  if (T.running && !stopTicker) stopTicker = startTicker(() => T.pump());
  if (!T.running && stopTicker) { stopTicker(); stopTicker = null; }
  wake(T.running && T.kind === 'rhythm');
  mediaSession(T);
  emit('transport', T);
});

// Media Session: что играет (метроном, подложка, рифф) и темп видны на экране блокировки и в шторке,
// оттуда же можно остановить. Показывает ли их Android для звука Web Audio — проверяется руками на телефоне.
let msTitle = '';
function mediaSession(T) {
  const ms = navigator.mediaSession;
  if (!ms) return;
  try {
    if (T.running && T.kind === 'rhythm') {
      const title = `${T.name ? T.name[0].toUpperCase() + T.name.slice(1) : 'Игра'} · ${T.bpm} BPM`;
      if (title !== msTitle && typeof MediaMetadata === 'function') {
        msTitle = title;
        const art = location.protocol === 'file:' ? [] : [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
        ms.metadata = new MediaMetadata({ title, artist: 'Гитарный круг', artwork: art });
      }
      ms.playbackState = 'playing';
    } else {
      msTitle = '';
      ms.playbackState = 'none';
      ms.metadata = null;
    }
  } catch (e) { /* не поддерживается */ }
}
try {
  if (navigator.mediaSession) for (const a of ['pause', 'stop']) navigator.mediaSession.setActionHandler(a, () => stopAll());
} catch (e) { /* действие не поддерживается */ }
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && transport.running) { transport.pump(); wake(transport.kind === 'rhythm'); }
});
(function loop() {
  try { transport.flushVisual(audio.audibleNow()); } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
})();

// Нажатие на ноту отменяет запланированную последовательность (но не метроном/подложку)
let seqGen = 0;
audio.hooks.beforeUserPlay = () => { seqGen++; if (transport.running && transport.kind === 'seq') transport.stop(); };

// Если уже играет метроном/подложка, последовательность не останавливает их, а встаёт в их сетку:
// начинается с ближайшей доли и идёт в их темпе («всё синхронно»).
const rhythmRunning = () => transport.running && transport.kind === 'rhythm';
function scheduleSynced(events, totalTicks, onDone) {
  const gen = ++seqGen;
  const T = transport, now = audio.now() + 0.03;
  let tick = Math.max(T.nextTick, T.anchorTick);
  while (T.timeOf(tick) < now) tick++;
  tick = Math.ceil(tick / T.ppq) * T.ppq;
  const spt = T.spt(), t0 = T.timeOf(tick);
  const vis = { visual: (t, fn) => T.visual(t, () => { if (gen === seqGen) fn(); }), bpm: T.bpm };
  events.forEach(e => e.fn(t0 + e.tick * spt, vis));
  T.visual(t0 + totalTicks * spt, () => { if (gen === seqGen && onDone) onDone(); });
}

export function stopAll() { transport.stop(); audio.silenceAll(); }

// Вкладка закрывается: её последовательности (гаммы, аккорды, интервалы) больше некому подсвечивать —
// гасим их, чтобы подсветка не обращалась к уже удалённой странице. Метроном, подложка и рифф
// (kind 'rhythm') продолжают играть.
export function cancelSequences() {
  seqGen++;
  if (transport.running && transport.kind === 'seq') transport.stop();
  audio.stopSeqVoices();
}

// Последовательность нот: notes = [{ midi, s, f }], шаг в тиках (6 = восьмые), onStep(i) — подсветка
export function playNotes(name, notes, { bpm = 96, step = 6, dur = null, onStep, onEnd, countIn = 0 } = {}) {
  audio.ensure();
  audio.muteGuitar(null, v => v.tag !== 'rhythm');
  const events = notes.map((n, i) => ({
    tick: i * step,
    fn: (time, T) => {
      if (n.midi != null) audio.guitarNote(n.midi, time, { string: n.s ?? null, tag: 'seq', vel: n.vel || 0.95, dur: n.dur ?? dur, pm: !!n.pm });
      if (n.chord) audio.strum(n.chord, time, { tag: 'seq', gap: n.gap ?? 0.02, vel: n.vel || 0.8, dur: n.dur ?? null, pm: !!n.pm });
      if (onStep) T.visual(time, () => onStep(i, n));
    },
  }));
  const finish = () => { if (onStep) onStep(-1); if (onEnd) onEnd(); };
  if (rhythmRunning()) { scheduleSynced(events, (notes.length + 1) * step, finish); return; }
  const src = sequenceSource(name, events, { tailTicks: step * 2, onEnd: finish });
  if (countIn) { src.countIn = countIn; src.onCountIn = (i, t) => audio.click(t, i === 0 ? 3 : 1, 'click'); }
  transport.start(src, { bpm });
}
// Последовательность аккордов: chords = [{ notes: [{midi, string}], beats }]
export function playChords(name, chords, { bpm = 90, onStep, onEnd, arp = false } = {}) {
  audio.ensure();
  audio.muteGuitar(null, v => v.tag !== 'rhythm');
  const events = [];
  let tick = 0;
  chords.forEach((c, i) => {
    events.push({
      tick,
      fn: (time, T) => {
        audio.muteGuitar(time, v => v.tag === 'seq');
        if (arp) c.notes.forEach((n, k) => audio.guitarNote(n.midi, time + k * (60 / T.bpm / 2), { tag: 'seq', vel: 0.85 }));
        else audio.strum(c.notes, time, { tag: 'seq', vel: 0.85 });
        if (onStep) T.visual(time, () => onStep(i, c));
      },
    });
    tick += (c.beats || 2) * PPQ;
  });
  const finish = () => { if (onStep) onStep(-1); if (onEnd) onEnd(); };
  if (rhythmRunning()) { scheduleSynced(events, tick, finish); return; }
  const src = sequenceSource(name, events, { tailTicks: (chords[chords.length - 1]?.beats || 2) * PPQ, onEnd: finish });
  transport.start(src, { bpm });
}
