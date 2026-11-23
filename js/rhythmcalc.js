// rhythmcalc.js — расчёт теста ритма (без DOM и звука, тестируется в Node).
// Удары сопоставляются с ожидаемыми моментами жадно по наименьшему отклонению; окно — половина
// минимального интервала между ожидаемыми ударами (не больше 250 мс).

export function analyzeTaps(expected, taps, { window = null } = {}) {
  const E = [...expected].sort((a, b) => a - b), T = [...taps].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < E.length; i++) minGap = Math.min(minGap, E[i] - E[i - 1]);
  const W = window ?? Math.min(0.25, Number.isFinite(minGap) ? minGap / 2 : 0.25);
  const pairs = [];
  let lo = 0;
  T.forEach((t, j) => {
    while (lo < E.length && E[lo] < t - W) lo++;
    for (let i = lo; i < E.length && E[i] <= t + W; i++) pairs.push({ i, j, d: Math.abs(t - E[i]) });
  });
  pairs.sort((a, b) => a.d - b.d);
  const usedE = new Set(), usedT = new Set(), hits = [];
  for (const p of pairs) {
    if (usedE.has(p.i) || usedT.has(p.j)) continue;
    usedE.add(p.i); usedT.add(p.j);
    hits.push({ i: p.i, exp: E[p.i], tap: T[p.j], dev: T[p.j] - E[p.i] });
  }
  hits.sort((a, b) => a.i - b.i);
  const devs = hits.map(h => h.dev);
  const n = devs.length;
  const mean = n ? devs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n ? Math.sqrt(devs.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0;
  const meanAbs = n ? devs.reduce((a, b) => a + Math.abs(b), 0) / n : 0;
  const missed = E.length - n, extra = T.length - n;
  const msAbs = meanAbs * 1000, msSd = sd * 1000;
  const accuracy = E.length ? n / E.length : 0;
  let score = Math.round(Math.max(0, Math.min(100, 100 - Math.max(0, msAbs - 5) * 1.4 - (1 - accuracy) * 60 - extra * 2)));
  const grade = !n ? 'Нет попаданий' : accuracy < 0.6 ? 'Много пропусков — замедли темп'
    : msSd < 12 && Math.abs(mean) < 0.015 ? 'Отлично — как машина'
    : msSd < 20 ? 'Очень хорошо' : msSd < 30 ? 'Хорошо' : msSd < 45 ? 'Неплохо' : 'Тренируйся медленнее';
  return { hits, missed, extra, mean, sd, meanAbs, score, grade, window: W };
}

// Калибровка задержки: медиана отклонений ударов от кликов
export function calibrate(clicks, taps) {
  const r = analyzeTaps(clicks, taps);
  if (r.hits.length < 5) return null;
  const d = r.hits.map(h => h.dev).sort((a, b) => a - b);
  const m = d.length >> 1;
  return d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2;
}

// Ритмические фигуры на долю: q — четверть, ee — две восьмые, r — пауза, re — пауза + восьмая, er — восьмая + пауза
export const FIG = { q: [0], ee: [0, 0.5], r: [], re: [0.5], er: [0] };
export function randomFigure(rand = Math.random) {
  const opts = ['q', 'ee', 'r', 're', 'er', 'ee', 'q'];
  let f;
  do { f = Array.from({ length: 4 }, () => opts[Math.floor(rand() * opts.length)]); } while (f.filter(x => x === 'r').length > 1 || f.every(x => x === 'q'));
  return f;
}
export function figureOnsets(fig) { return fig.flatMap((k, beat) => FIG[k].map(o => beat + o)); }
