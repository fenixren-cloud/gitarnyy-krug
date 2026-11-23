// Вкладка «Пентатоника»: 5 позиций методом «линеек» (2 ноты на струну: длинная 3 лада / короткая 2 лада).
import { settings, tuning } from '../state.js';
import { mod12, PENTA, pentaPositions, keyTonic, spellPenta, pcOf, degLabel, spellWithLetter, STRING_NUM, ruName } from '../music.js';
import { createFretboard } from '../fretboard.js';
import { COLORS, nm, pcName, chips, seg, bind, pill, info, degColor } from '../ui.js';
import * as audio from '../audio.js';
import { playNotes } from '../player.js';

const S = { root: 9, kind: 'minor', pos: 0, blue: false, connect: false, bpm: 100, loop: false };
let root = null, fb = null;
const L = 'Д', K = 'К';

const tonicSp = () => keyTonic(S.root, S.kind === 'minor' ? 'aeolian' : 'ionian');
const positions = () => pentaPositions(S.root, S.kind, tuning());
function labelFor(n) {
  const P = PENTA[S.kind], sp = spellPenta(tonicSp(), S.kind)[n.degIdx];
  return settings.labels === 'degrees' ? degLabel(P.iv[n.degIdx], P.lt[n.degIdx]) : nm(sp);
}
const colorFor = n => degColor(degLabel(PENTA[S.kind].iv[n.degIdx], PENTA[S.kind].lt[n.degIdx]));
const rulerColor = len => (len === 3 ? COLORS.long : COLORS.short);

function blueNotes(lo, hi) {
  const P = PENTA[S.kind], st = P.blue, tun = tuning(), out = [];
  const bp = mod12(S.root + st);
  const sp = spellWithLetter(bp, tonicSp().l + (S.kind === 'minor' ? 4 : 2)); // ♭5 / ♭3
  for (let s = 0; s < 6; s++) for (let f = Math.max(0, lo); f <= hi; f++) if (mod12(tun[s] + f) === bp)
    out.push({ s, f, text: settings.labels === 'degrees' ? (S.kind === 'minor' ? '♭5' : '♭3') : nm(sp), color: COLORS.char, glow: true });
  return out;
}

function renderFretboard(focus = true) {
  const pos = positions();
  const markers = [], rulers = [];
  if (S.pos === 'all') {
    const seen = new Set();
    pos.forEach((p, i) => {
      p.rulers.forEach(r => rulers.push({ s: r.s, from: r.from, to: r.to, color: rulerColor(r.len), op: 0.14 }));
      p.notes.forEach(n => { const k = n.s + ':' + n.f; if (!seen.has(k)) { seen.add(k); markers.push({ s: n.s, f: n.f, text: labelFor(n), color: colorFor(n) }); } });
    });
    if (S.blue) markers.push(...blueNotes(0, 22));
    fb.render({ markers, rulers, window: null, focus: focus ? [pos[0].minFret, pos[0].maxFret] : null });
    return;
  }
  const p = pos[S.pos];
  const q = S.connect ? pos[(S.pos + 1) % 5] : null;
  p.rulers.forEach(r => rulers.push({ s: r.s, from: r.from, to: r.to, color: rulerColor(r.len) }));
  if (q) q.rulers.forEach(r => rulers.push({ s: r.s, from: r.from, to: r.to, color: rulerColor(r.len), op: 0.1 }));
  const shared = q ? new Set(q.notes.map(n => n.s + ':' + n.f)) : new Set();
  p.notes.forEach(n => markers.push({ s: n.s, f: n.f, text: labelFor(n), color: colorFor(n), mark: shared.has(n.s + ':' + n.f) ? '#ffffff' : null }));
  if (q) q.notes.forEach(n => { if (!p.notes.some(m => m.s === n.s && m.f === n.f)) markers.push({ s: n.s, f: n.f, text: labelFor(n), color: colorFor(n), kind: 'dim' }); });
  const lo = Math.min(p.minFret, q ? q.minFret : 99), hi = Math.max(p.maxFret, q ? q.maxFret : 0);
  if (S.blue) markers.push(...blueNotes(p.minFret, p.maxFret));
  fb.render({ markers, rulers, window: [p.minFret, p.maxFret], focus: focus ? [q ? lo : p.minFret, q ? hi : p.maxFret] : null });
}

function table() {
  const pos = positions();
  let h = `<div class="tablewrap"><table><thead><tr><th>Струна</th>${pos.map((p, i) => `<th style="${S.pos === i ? 'color:var(--root)' : ''}">Поз. ${i + 1}</th>`).join('')}</tr></thead><tbody>`;
  for (let s = 0; s < 6; s++) {
    h += `<tr><td><b>${STRING_NUM[s]}-я</b> <small>${pcName(mod12(tuning()[s]))}</small></td>`;
    pos.forEach((p, i) => {
      const r = p.rulers[s];
      h += `<td data-act="pos" data-p="${i}" style="cursor:pointer;${S.pos === i ? 'background:#1b2232' : ''}"><b style="color:${rulerColor(r.len)}">${r.len === 3 ? L : K}</b> <small>${r.from}–${r.to}</small></td>`;
    });
    h += '</tr>';
  }
  return h + '</tbody></table></div>';
}

function update(focus = true) {
  if (!root) return;
  const P = PENTA[S.kind], sp = tonicSp();
  const notes = spellPenta(sp, S.kind);
  const degs = P.iv.map((st, i) => degLabel(st, P.lt[i]));
  root.querySelector('#pe-notes').innerHTML = `<p><b>${nm(sp)} ${S.kind === 'minor' ? 'минорная' : 'мажорная'}:</b> ${notes.map((n, i) => `<b style="color:${degColor(degs[i])}">${nm(n)}</b><sub class="mu">${degs[i]}</sub>`).join(' ')} · шаги ${P.steps.join('-')}</p>`;
  root.querySelector('#pe-pos').innerHTML = chips('pos', [...[0, 1, 2, 3, 4].map(i => [i, `Позиция ${i + 1}`]), ['all', 'Весь гриф']], S.pos);
  const pos = positions();
  const cur = S.pos === 'all' ? null : pos[S.pos];
  root.querySelector('#pe-pat').innerHTML = cur
    ? `${pill(`позиция ${S.pos + 1}: ` + cur.rulers.map(r => (r.len === 3 ? L : K)).join(' '), COLORS.root)}<p class="note" style="margin-top:6px">Струны 6 → 1. ${S.pos === 0 && S.kind === 'minor' ? 'Длинная → 3 короткие → 2 длинные — тот самый метод линеек.' : 'Каждая струна продолжила свой цикл с места, где кончилась прошлая линейка.'}</p>`
    : pill('весь гриф: 5 позиций подряд', COLORS.root);
  root.querySelector('#pe-table').innerHTML = table();
  renderFretboard(focus);
}

function playPos() {
  const pos = positions();
  const p = pos[S.pos === 'all' ? 0 : S.pos];
  const up = [...p.notes].sort((a, b) => a.midi - b.midi);
  const seq = [...up, ...up.slice(0, -1).reverse()].map(n => ({ midi: n.midi, s: n.s, f: n.f }));
  playNotes('пентатоника', seq, {
    bpm: S.bpm, step: 6,
    onStep: i => { if (fb) fb.setCursor(i < 0 ? [] : [{ s: seq[i].s, f: seq[i].f }]); },
    onEnd: () => { if (S.loop && root) playPos(); },
  });
}

export const page = {
  id: 'penta', title: 'Пентатоника', section: 'theory',
  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="kicker">теория · метод линеек</div>
      <h1 class="title-big">Пентатоника <span>линейками</span></h1>
      <div class="pillrow">${pill('Д = 3 лада', COLORS.long)} ${pill('К = 2 лада', COLORS.short)}</div>
      <div class="card">
        <div class="row">${seg('kind', [['minor', 'Минорная'], ['major', 'Мажорная']], S.kind)}
          ${chips('quick', [[9, 'Am'], [4, 'Em'], [2, 'Dm'], [7, 'Gm'], [0, 'Cm']], null)}</div>
        ${chips('root', Array.from({ length: 12 }, (_, pc) => [pc, nm(keyTonic(pc, 'aeolian'))]), S.root, 'notes12')}
        <div id="pe-notes"></div>
        <div id="pe-pos"></div>
        <div class="pillrow" id="pe-pat"></div>
        <div class="row">
          <button class="btn" data-act="play">▶ Сыграть позицию</button>
          <label class="note"><input type="checkbox" id="pe-loop" ${S.loop ? 'checked' : ''}> по кругу</label>
          <label class="note"><input type="checkbox" id="pe-blue" ${S.blue ? 'checked' : ''}> блюзовая нота</label>
          <label class="note"><input type="checkbox" id="pe-con" ${S.connect ? 'checked' : ''}> соединение со следующей</label>
        </div>
        <div class="row"><span class="note">Темп</span><input type="range" id="pe-bpm" min="50" max="200" value="${S.bpm}" style="flex:1"><b id="pe-bpmv">${S.bpm}</b></div>
      </div>
      <div class="card tight"><div id="pe-fb"></div>
        <div class="legend"><span><i style="background:${COLORS.long}"></i>длинная линейка (3 лада)</span><span><i style="background:${COLORS.short}"></i>короткая (2 лада)</span><span><i style="background:${COLORS.root}"></i>тоника</span><span><i style="background:${COLORS.third}"></i>терция</span><span><i style="background:${COLORS.fifth}"></i>квинта</span><span><i style="background:${COLORS.seventh}"></i>♭7</span><span><i style="background:${COLORS.char}"></i>блюзовая нота</span></div>
      </div>
      <div class="card"><h3 style="margin-top:0">Таблица позиций (лады)</h3><div id="pe-table"></div>
        <p class="note">Читай любую строку слева направо: это цикл линеек одной струны. Нажми на ячейку, чтобы открыть позицию.</p></div>
      <div class="card">
        <h3 style="margin-top:0">Правила без зубрёжки</h3>
        <ol>
          <li><b>Линейка = 2 соседние ноты пентатоники на одной струне.</b> Длинная — 3 лада (малая терция), короткая — 2 лада (целый тон). Других расстояний в пентатонике нет.</li>
          <li><b>Цикл 3-2-2-3-2 — это сама пентатоника.</b> Её ноты разделены именно такими шагами: 1 →3→ ♭3 →2→ 4 →2→ 5 →3→ ♭7 →2→ 1. Каждая струна идёт по этому кругу (Д К К Д К, Д К К Д К…), просто начинает с разного места — поэтому строки таблицы похожи, но сдвинуты.</li>
          <li><b>Позиция 1 = Д К К К Д Д</b> (струны 6 → 1). Она начинается с тоники на 6-й струне. Контроль для Am: 5–8, 5–7, 5–7, 5–7, 5–8, 5–8.</li>
          <li><b>Следующая позиция:</b> на каждой струне новая линейка начинается там, где кончилась старая (это общая нота — мостик между позициями), а её длина — следующая в цикле этой струны. После длинной всегда идёт короткая.</li>
          <li><b>Переход на соседнюю струну внутри позиции:</b> следующая нота пентатоники лежит на 3 лада левее конца линейки, если шаг 2 лада, и на 2 лада левее, если шаг 3 лада (струны настроены через 5 полутонов: 5 − 2 = 3, 5 − 3 = 2).</li>
          <li><b>На струне B сдвиг на 1 лад:</b> G → B настроены через 4 полутона, а не 5. Поэтому на 2-й и 1-й струнах всё на 1 лад правее, чем подсказывает правило 5. В позиции 1: на G линейка кончается на 7-м ладу, следующая нота (ми) на B — на 5-м, а не на 4-м.</li>
          <li><b>Drop D:</b> 6-я струна на тон ниже, поэтому та же нота на ней — на 2 лада правее. Линейка 6-й струны та же по длине, просто сдвинута на +2. Бонус: в ре миноре открытая 6-я = тоника D — бери её басом под любую позицию.</li>
        </ol>
        ${info('<b>Соединение позиций.</b> Соседние позиции делят по одной ноте на каждой струне (обведены белым пунктиром, когда включено «соединение»). Чтобы перейти в следующую позицию, сыграй общую ноту и продолжай уже в новой линейке, или проскользни (слайд) по одной струне на следующую ноту.')}
        ${info('<b>Блюзовая нота</b> — ♭5 в минорной (между 4 и 5, внутри короткой линейки) и ♭3 в мажорной. Это проходящая нота: не стой на ней, а проскальзывай через неё — она даёт «грязь» и тягу блюза и рока.', COLORS.char)}
        ${info('<b>Мажорная пентатоника</b> — те же 5 нот, что у параллельной минорной (C мажорная = A минорная). Цикл тот же, просто начинается с другого места: 2-2-3-2-3. Позиция 1 мажора совпадает с позицией 2 минора.', COLORS.third)}
      </div>`;
    fb = createFretboard(el.querySelector('#pe-fb'), { onTap: (s, f, midi) => { audio.userPlay([{ midi, string: s }]); fb.setCursor([{ s, f }]); } });
    bind(el, {
      seg: {
        kind: v => { S.kind = v; update(); },
        root: v => { S.root = +v; update(); },
        quick: v => { S.root = +v; S.kind = 'minor'; el.querySelectorAll('[data-seg=kind] [data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === 'minor')); el.querySelectorAll('[data-seg=root] [data-v]').forEach(x => x.classList.toggle('on', +x.dataset.v === S.root)); update(); },
        pos: v => { S.pos = v === 'all' ? 'all' : +v; update(); },
      },
      act: { play: () => playPos(), pos: b => { S.pos = +b.dataset.p; update(); } },
    });
    el.querySelector('#pe-loop').addEventListener('change', e => { S.loop = e.target.checked; });
    el.querySelector('#pe-blue').addEventListener('change', e => { S.blue = e.target.checked; update(false); });
    el.querySelector('#pe-con').addEventListener('change', e => { S.connect = e.target.checked; update(); });
    el.querySelector('#pe-bpm').addEventListener('input', e => { S.bpm = +e.target.value; el.querySelector('#pe-bpmv').textContent = S.bpm; });
    update();
  },
  unmount() { root = null; fb = null; },
  onSettings() { update(false); },
};
