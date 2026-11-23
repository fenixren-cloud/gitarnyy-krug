// Вкладка «Круг = гриф»: 1 час = 1 полутон = 1 лад. Интервалы 0–12 на круге и на грифе.
import { tuning, settings } from '../state.js';
import { mod12, INTERVALS, intervalOnNeck, spellPc, MAX_FRET } from '../music.js';
import { chromaticSVG } from '../circle.js';
import { createFretboard } from '../fretboard.js';
import { COLORS, nm, ru, pcName, noteChips, bind, pill, info, degColor } from '../ui.js';
import * as audio from '../audio.js';
import { playNotes } from '../player.js';

const S = { root: 0, iv: 7, anim: null, star: 0, refS: 1, refF: null };
let root = null, fb = null;

const ladov = n => { const a = Math.abs(n), d = a % 10, h = a % 100; return d === 1 && h !== 11 ? 'лад' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'лада' : 'ладов'; };
const shift = n => (n === 0 ? 'тот же лад' : `${n > 0 ? '+' : '−'}${Math.abs(n)} ${ladov(n)}`);
const ivColor = iv => (iv % 12 === 0 ? COLORS.root : degColor(INTERVALS[iv].deg));
const spl = pc => spellPc(pc);

function refPos() {
  const tun = tuning();
  const s = S.refS;
  let f = S.refF;
  if (f == null || mod12(tun[s] + f) !== S.root) { f = mod12(S.root - tun[s]); if (f < 3) f += 12; }
  return { s, f };
}

function circle() {
  const col = ivColor(S.iv), tgt = mod12(S.root + S.iv);
  return chromaticSVG({
    node: pc => {
      const n = { text: nm(spl(pc)), sub: ru(spl(pc)) };
      if (S.anim === pc) return { ...n, fill: '#ffffff', glow: true, big: true };
      if (pc === S.root) return { ...n, fill: COLORS.root, glow: true };
      if (pc === tgt && S.iv % 12) return { ...n, fill: col, glow: true };
      if (S.star) return { ...n, dim: false };
      return n;
    },
    polys: S.iv % 12 && !S.star ? [{ pcs: [S.root, tgt], color: col, steps: true, closeStep: false }] : [],
    star: S.star,
    center: S.star ? { big: 'ШАГ ' + S.star, small: S.star === 7 ? 'квинтовый круг' : 'хроматика', color: '#e8ecf3' }
      : { big: '+' + S.iv, small: INTERVALS[S.iv].short + ' · ' + (S.iv === 1 ? '1 час' : S.iv + ' час' + (S.iv >= 2 && S.iv <= 4 ? 'а' : 'ов')), color: col },
  });
}

function renderFretboard(focus = true) {
  const tun = tuning(), tgt = mod12(S.root + S.iv), col = ivColor(S.iv);
  const { s, f } = refPos();
  const markers = [], lines = [];
  for (let k = 0; k < 6; k++) for (let fr = 0; fr <= MAX_FRET; fr++) {
    const pc = mod12(tun[k] + fr);
    if (pc === S.root) markers.push({ s: k, f: fr, text: settings.labels === 'degrees' ? '1' : nm(spl(pc)), color: COLORS.root, kind: 'dim' });
    else if (pc === tgt) markers.push({ s: k, f: fr, text: settings.labels === 'degrees' ? INTERVALS[S.iv].deg : nm(spl(pc)), color: col, kind: 'dim' });
  }
  const on = intervalOnNeck(S.iv);
  const add = (s2, f2, text, dash) => {
    if (s2 < 0 || s2 > 5 || f2 < 0 || f2 > MAX_FRET) return;
    lines.push({ s1: s, f1: f, s2, f2, color: col, text, dash });
    markers.push({ s: s2, f: f2, text: settings.labels === 'degrees' ? INTERVALS[S.iv].deg : nm(spl(tgt)), color: col, glow: true });
  };
  if (S.iv > 0) {
    add(s, f + on.same, shift(on.same));
    if (s < 5) add(s + 1, f + (s === 3 ? on.gb : on.next), shift(s === 3 ? on.gb : on.next), true);
  }
  markers.push({ s, f, text: settings.labels === 'degrees' ? '1' : nm(spl(S.root)), color: COLORS.root, glow: true });
  fb.render({ markers, lines, focus: focus ? [Math.max(0, f - 2), f + Math.max(2, Math.min(S.iv, 9))] : null });
}

function table() {
  return `<div class="tablewrap"><table><thead><tr><th>Пт</th><th>Интервал</th><th>Та же струна</th><th>Соседняя (+5)</th><th>G→B (+4)</th></tr></thead><tbody>${INTERVALS.map(iv => {
    const o = intervalOnNeck(iv.st);
    return `<tr data-act="iv" data-iv="${iv.st}" class="${iv.st === S.iv ? 'sel' : ''}"><td><b style="color:${ivColor(iv.st)}">${iv.st}</b></td><td><b>${iv.short}</b> ${iv.name}<br><small>${iv.feel}</small></td><td>${shift(o.same)}</td><td>${shift(o.next)}</td><td>${shift(o.gb)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function caption() {
  const iv = INTERVALS[S.iv], tgt = mod12(S.root + S.iv), col = ivColor(S.iv);
  return `${pill(`+${S.iv} = ${iv.name}`, col)}<p class="lead" style="margin-top:8px">От <b style="color:${COLORS.root}">${nm(spl(S.root))}</b> (${ru(spl(S.root), true)}) на ${S.iv} ${S.iv === 1 ? 'час' : S.iv < 5 && S.iv > 1 ? 'часа' : 'часов'} по часовой — <b style="color:${col}">${nm(spl(tgt))}</b>. ${iv.feel[0].toUpperCase() + iv.feel.slice(1)}.</p>`;
}

function update(focus = true) {
  root.querySelector('#chr-circle').innerHTML = circle();
  root.querySelector('#chr-cap').innerHTML = caption();
  root.querySelector('#chr-table').innerHTML = table();
  renderFretboard(focus);
}

function playInterval() {
  const { s, f } = refPos();
  const a = tuning()[s] + f, b = a + S.iv;
  playNotes('интервал', [{ midi: a, s, f }, { midi: b }, { chord: [{ midi: a, string: 0 }, { midi: b, string: 1 }] }], { bpm: 100, step: 12, onStep: i => { S.anim = i < 0 ? null : i === 0 ? S.root : mod12(S.root + S.iv); if (root) root.querySelector('#chr-circle').innerHTML = circle(); } });
}
function playSteps(step) {
  const { s, f } = refPos();
  const base = tuning()[s] + f;
  const notes = [];
  for (let k = 0; k <= 12; k++) {
    const iv = step === 1 ? k : (k * 7) % 12;
    notes.push({ midi: base + iv, s, f: f + iv, pc: mod12(S.root + iv) });
  }
  S.star = step === 7 ? 7 : 0;
  playNotes(step === 1 ? 'хроматика' : 'квинты', notes, {
    bpm: step === 1 ? 150 : 110, step: 6,
    onStep: i => {
      if (i < 0) S.star = 0;
      if (!root) { S.anim = null; return; }
      if (i < 0) { S.anim = null; update(false); fb.setCursor([]); return; }
      S.anim = notes[i].pc;
      root.querySelector('#chr-circle').innerHTML = circle();
      const nf = notes[i].f;
      fb.setCursor(nf <= MAX_FRET ? [{ s, f: nf }] : []);
    },
  });
  update(false);
}

export const page = {
  id: 'chromatic', title: 'Круг = гриф', section: 'theory',
  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="kicker">теория · хроматический круг</div>
      <h1 class="title-big">Круг <span>=</span> гриф</h1>
      <div class="pillrow">${pill('1 час = 1 полутон = 1 лад', '#e8ecf3')}</div>
      <div class="cols">
        <div class="card tight">
          <div id="chr-circle"></div>
          <div class="pillrow" id="chr-cap"></div>
          <div class="row" style="justify-content:center">
            <button class="btn" data-act="play">▶ Интервал</button>
            <button class="btn g" data-act="chrom">Шаг 1 час</button>
            <button class="btn g" data-act="fifths">Шаг 7 часов</button>
          </div>
        </div>
        <div class="card">
          <h3 style="margin-top:0">Корень</h3>
          ${noteChips('root', S.root, [])}
          <p class="note">Нажимай на ноты круга, чтобы выбрать вторую ноту (интервал), или на строки таблицы. На грифе: оранжевая — корень, цветная — вторая нота, стрелки показывают, где тот же интервал лежит на <b>той же струне</b> и на <b>соседней</b>. Нажми на любую ноту грифа — она прозвучит; нажатие на ноту корня переносит точку отсчёта.</p>
          <div class="row">${['На 6-й', 'На 5-й', 'На 4-й', 'На 3-й (G→B)'].map((t, i) => `<button class="chip ${S.refS === i ? 'on' : ''}" data-act="ref" data-s="${i}">${t}</button>`).join('')}</div>
        </div>
      </div>
      <div class="card tight"><div id="chr-fb"></div>
        <div class="legend"><span><i style="background:${COLORS.root}"></i>корень (1)</span><span><i style="background:${COLORS.third}"></i>терции</span><span><i style="background:${COLORS.fifth}"></i>квинты / тритон</span><span><i style="background:${COLORS.seventh}"></i>септимы</span><span><i style="background:${COLORS.other}"></i>остальные</span></div>
      </div>
      <div class="card"><h3 style="margin-top:0">Интервалы 0–12: где лежат на грифе</h3><div id="chr-table"></div>
        ${info('<b>Как читать:</b> «соседняя» — следующая, более тонкая струна. Она настроена на 5 полутонов выше, поэтому чтобы взять интервал на ней, отними 5 ладов. Исключение — переход с G (3-я) на B (2-я): там всего 4 полутона, поэтому отнимай 4. Пример: квинта (7) на той же струне — +7 ладов, на соседней — +2, через G→B — +3.')}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Факты, которые экономят зубрёжку</h3>
        <ul>
          <li><b>12 часов = 12 нот = 12 ладов.</b> После си снова до: 12-й лад — та же нота, что открытая струна, только на октаву выше. Других нот нет.</li>
          <li><b>E–F и B–C стоят вплотную</b> (1 лад): между ми и фа, си и до нет диеза — на пианино там нет чёрной клавиши. Все остальные соседние буквы — через 2 лада.</li>
          <li><b>Соседние струны: +5</b> (чистая кварта). Поэтому 5-й лад струны = следующая открытая струна. Исключение: G→B = +4 (большая терция), там 4-й лад.</li>
          <li><b>Drop D:</b> 6-я струна опущена на тон (E → D). Теперь между 6-й и 5-й струнами не кварта, а <b>квинта (7)</b> — ровно пауэр-аккорд. Поэтому пауэр-аккорд от 6-й струны берётся <b>одним пальцем</b>: прижми 6-ю, 5-ю (и 4-ю для октавы) на одном ладу. Открытые три струны = D5.</li>
        </ul>
        <div class="row"><button class="btn g" data-act="drop">▶ Drop D: D5 → F5 → G5 одним пальцем</button></div>
      </div>`;
    fb = createFretboard(el.querySelector('#chr-fb'), {
      onTap: (s, f, midi) => {
        audio.userPlay([{ midi, string: s }]);
        const pc = mod12(midi);
        if (pc === S.root) { S.refS = s; S.refF = f; } else S.iv = mod12(pc - S.root);
        update(false);
        fb.setCursor([{ s, f }]);
      },
    });
    bind(el, {
      seg: { root: v => { S.root = +v; S.refF = null; update(); audio.userPlay([tuning()[refPos().s] + refPos().f]); } },
      act: {
        pc: b => { const pc = +b.dataset.pc; S.iv = mod12(pc - S.root) || (S.iv === 0 ? 12 : 0); update(); playInterval(); },
        iv: b => { S.iv = +b.dataset.iv; update(); playInterval(); },
        play: () => playInterval(),
        chrom: () => playSteps(1),
        fifths: () => playSteps(7),
        ref: b => { S.refS = +b.dataset.s; S.refF = null; el.querySelectorAll('[data-act=ref]').forEach(x => x.classList.toggle('on', x === b)); update(); },
        drop: () => {
          const D = [38, 45, 50];
          playNotes('Drop D', [0, 3, 5, 3, 0].map(f => ({ chord: D.map((m, i) => ({ midi: m + f, string: i })) })), { bpm: 110, step: 12 });
        },
      },
    });
    update();
  },
  unmount() { root = null; fb = null; },
  onSettings() { if (root) update(false); },
};
