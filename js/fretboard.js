// fretboard.js — гриф в SVG: горизонтальный (струна 1 сверху, как в табе) или вертикальный
// (струны вертикально, 6-я слева, лады вниз). Зоны нажатия ≥ 40 px. Сам прокручивается к позиции.
import { isVertical, tuning } from './state.js';
import { MAX_FRET, mod12 } from './music.js';
import { COLORS, pcName } from './ui.js';

const INLAY = [3, 5, 7, 9, 15, 17, 19, 21];
const STRING_W = [2.6, 2.1, 1.8, 1.4, 1.1, 0.9];

export function createFretboard(host, { frets = MAX_FRET, onTap = null, maxH = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'fb';
  const sc = document.createElement('div');
  sc.className = 'fb-scroll';
  wrap.appendChild(sc);
  host.appendChild(wrap);
  let st = { markers: [], rulers: [], lines: [], window: null, focus: null };
  let cursor = [];
  let g = null;

  function geom() {
    const v = isVertical();
    if (!v) {
      const LBL = 20, NUT = 38, FW = 46, SS = 40, TOP = 4;
      const x0 = LBL + NUT;
      return {
        v, W: x0 + frets * FW + 12, H: TOP + 6 * SS + 22, LBL, NUT, FW, SS, TOP,
        pos: (s, f) => [f === 0 ? LBL + NUT / 2 - 3 : x0 + (f - 0.5) * FW, TOP + (5 - s) * SS + SS / 2],
        wire: f => x0 + f * FW,
        hit: (x, y) => [5 - Math.floor((y - TOP) / SS), x < x0 ? 0 : Math.floor((x - x0) / FW) + 1],
      };
    }
    const avail = Math.max(300, Math.min(560, (host.clientWidth || 360)));
    const LBL = 18, NUT = 38, FH = 44, LEFT = 24;
    const SS = Math.max(44, Math.min(70, Math.floor((avail - LEFT - 6) / 6)));
    const y0 = LBL + NUT;
    return {
      v, W: LEFT + 6 * SS + 6, H: y0 + frets * FH + 8, LBL, NUT, FH, SS, LEFT,
      pos: (s, f) => [LEFT + s * SS + SS / 2, f === 0 ? LBL + NUT / 2 - 2 : y0 + (f - 0.5) * FH],
      wire: f => y0 + f * FH,
      hit: (x, y) => [Math.floor((x - LEFT) / SS), y < y0 ? 0 : Math.floor((y - y0) / FH) + 1],
    };
  }

  function markerSVG(m) {
    const [x, y] = g.pos(m.s, m.f);
    const r = m.r || (m.small ? 11 : 15.5);
    const c = m.color || COLORS.other;
    const t = m.text == null ? '' : String(m.text);
    const fs = t.length <= 2 ? 13 : t.length === 3 ? 11 : 9.5;
    let body;
    switch (m.kind) {
      case 'ring': body = `<circle cx="${x}" cy="${y}" r="${r}" fill="#0f131c" stroke="${c}" stroke-width="2.5"/>`; break;
      case 'ghost': body = `<circle cx="${x}" cy="${y}" r="${r - 3}" fill="#171c28" stroke="#394155" stroke-width="1"/>`; break;
      case 'dim': body = `<circle cx="${x}" cy="${y}" r="${r - 1}" fill="${c}" fill-opacity=".28" stroke="${c}" stroke-opacity=".5"/>`; break;
      case 'target': body = `<circle cx="${x}" cy="${y}" r="${r + 4}" fill="none" stroke="#fff" stroke-width="2" opacity=".9"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}" filter="url(#glow)"/>`; break;
      default: body = `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"${m.glow ? ' filter="url(#glow)"' : ''}/>`;
    }
    const tc = m.kind === 'ring' ? c : m.kind === 'ghost' ? '#8d96aa' : m.kind === 'dim' ? '#e8ecf3' : COLORS.dark;
    const ring2 = m.mark ? `<circle cx="${x}" cy="${y}" r="${r + 3.5}" fill="none" stroke="${m.mark}" stroke-width="2" stroke-dasharray="3 2.5"/>` : '';
    return `<g class="mk">${body}${ring2}<text x="${x}" y="${y + fs * 0.36}" text-anchor="middle" font-size="${m.kind === 'ghost' ? fs - 2 : fs}" font-weight="700" fill="${tc}">${t}</text></g>`;
  }

  function draw() {
    g = geom();
    const tun = tuning();
    const { W, H } = g;
    let s = `<svg class="fb-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Гриф гитары">`;
    // накладка грифа
    const a = g.pos(0, 1), b = g.pos(5, frets);
    if (!g.v) {
      const yTop = g.TOP + 6, yBot = g.TOP + 6 * g.SS - 6;
      s += `<rect x="${g.wire(0)}" y="${yTop}" width="${g.wire(frets) - g.wire(0)}" height="${yBot - yTop}" rx="4" fill="#141a26"/>`;
      if (st.window) s += `<rect x="${g.wire(Math.max(0, st.window[0] - 1))}" y="${yTop - 4}" width="${g.wire(st.window[1]) - g.wire(Math.max(0, st.window[0] - 1))}" height="${yBot - yTop + 8}" rx="6" fill="#ffffff" fill-opacity=".05" stroke="#ffffff" stroke-opacity=".18" stroke-dasharray="4 4"/>`;
      INLAY.filter(f => f <= frets).forEach(f => { s += `<circle cx="${g.wire(f) - g.FW / 2}" cy="${(yTop + yBot) / 2}" r="5" fill="#263045"/>`; });
      if (frets >= 12) [2, 4].forEach(k => { s += `<circle cx="${g.wire(12) - g.FW / 2}" cy="${g.TOP + k * g.SS}" r="5" fill="#263045"/>`; });
      for (let f = 1; f <= frets; f++) s += `<line x1="${g.wire(f)}" y1="${yTop}" x2="${g.wire(f)}" y2="${yBot}" stroke="#3b4458" stroke-width="2"/>`;
      s += `<rect x="${g.wire(0) - 5}" y="${yTop - 2}" width="6" height="${yBot - yTop + 4}" rx="2" fill="#d8d2c4"/>`;
      for (let k = 1; k <= frets; k++) {
        const big = INLAY.includes(k) || k === 12;
        s += `<text x="${g.wire(k) - g.FW / 2}" y="${H - 6}" text-anchor="middle" font-size="${big ? 11 : 9}" font-weight="${big ? 700 : 400}" fill="${big ? '#aab3c5' : '#5d6679'}">${k}</text>`;
      }
    } else {
      const xL = g.LEFT + 6, xR = g.LEFT + 6 * g.SS - 6;
      s += `<rect x="${xL}" y="${g.wire(0)}" width="${xR - xL}" height="${g.wire(frets) - g.wire(0)}" rx="4" fill="#141a26"/>`;
      if (st.window) s += `<rect x="${xL - 4}" y="${g.wire(Math.max(0, st.window[0] - 1))}" width="${xR - xL + 8}" height="${g.wire(st.window[1]) - g.wire(Math.max(0, st.window[0] - 1))}" rx="6" fill="#ffffff" fill-opacity=".05" stroke="#ffffff" stroke-opacity=".18" stroke-dasharray="4 4"/>`;
      INLAY.filter(f => f <= frets).forEach(f => { s += `<circle cx="${(xL + xR) / 2}" cy="${g.wire(f) - g.FH / 2}" r="5" fill="#263045"/>`; });
      if (frets >= 12) [2, 4].forEach(k => { s += `<circle cx="${g.LEFT + k * g.SS}" cy="${g.wire(12) - g.FH / 2}" r="5" fill="#263045"/>`; });
      for (let f = 1; f <= frets; f++) s += `<line x1="${xL}" y1="${g.wire(f)}" x2="${xR}" y2="${g.wire(f)}" stroke="#3b4458" stroke-width="2"/>`;
      s += `<rect x="${xL - 2}" y="${g.wire(0) - 5}" width="${xR - xL + 4}" height="6" rx="2" fill="#d8d2c4"/>`;
      for (let k = 1; k <= frets; k++) {
        const big = INLAY.includes(k) || k === 12;
        s += `<text x="${g.LEFT - 6}" y="${g.wire(k) - g.FH / 2 + 4}" text-anchor="end" font-size="${big ? 11 : 9}" font-weight="${big ? 700 : 400}" fill="${big ? '#aab3c5' : '#5d6679'}">${k}</text>`;
      }
    }
    // струны и названия открытых струн
    for (let k = 0; k < 6; k++) {
      const [x1, y1] = g.pos(k, 0), [x2, y2] = g.pos(k, frets);
      const name = pcName(mod12(tun[k]));
      if (!g.v) {
        s += `<line x1="${g.wire(0)}" y1="${y1}" x2="${g.wire(frets)}" y2="${y2}" stroke="${k < 3 ? '#9aa3b5' : '#c3c9d4'}" stroke-width="${STRING_W[k]}"/>`;
        s += `<text x="9" y="${y1 + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${k === 0 && tun[0] === 38 ? COLORS.root : '#7c869a'}">${name}</text>`;
      } else {
        s += `<line x1="${x1}" y1="${g.wire(0)}" x2="${x2}" y2="${g.wire(frets)}" stroke="${k < 3 ? '#9aa3b5' : '#c3c9d4'}" stroke-width="${STRING_W[k]}"/>`;
        s += `<text x="${x1}" y="12" text-anchor="middle" font-size="11" font-weight="700" fill="${k === 0 && tun[0] === 38 ? COLORS.root : '#7c869a'}">${name}</text>`;
      }
    }
    // линейки (пентатоника)
    for (const r of st.rulers) {
      const [x1, y1] = g.pos(r.s, r.from), [x2, y2] = g.pos(r.s, r.to);
      const th = 26, c = r.color || COLORS.long;
      if (!g.v) s += `<rect x="${x1 - th / 2}" y="${y1 - th / 2}" width="${x2 - x1 + th}" height="${th}" rx="${th / 2}" fill="${c}" fill-opacity="${r.op || 0.22}" stroke="${c}" stroke-opacity=".7" stroke-width="1.5"/>`;
      else s += `<rect x="${x1 - th / 2}" y="${y1 - th / 2}" width="${th}" height="${y2 - y1 + th}" rx="${th / 2}" fill="${c}" fill-opacity="${r.op || 0.22}" stroke="${c}" stroke-opacity=".7" stroke-width="1.5"/>`;
    }
    // стрелки (интервалы)
    for (const l of st.lines) {
      const [x1, y1] = g.pos(l.s1, l.f1), [x2, y2] = g.pos(l.s2, l.f2);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, k1 = 17 / L, k2 = 20 / L;
      s += `<line x1="${x1 + dx * k1}" y1="${y1 + dy * k1}" x2="${x2 - dx * k2}" y2="${y2 - dy * k2}" stroke="${l.color || '#fff'}" stroke-width="2.5" stroke-dasharray="${l.dash ? '5 4' : ''}" marker-end="url(#arrow-${l.arrow || 'w'})" opacity=".9"/>`;
      if (l.text) s += `<text x="${(x1 + x2) / 2 + (g.v ? 10 : 0)}" y="${(y1 + y2) / 2 - (g.v ? 0 : 8)}" text-anchor="middle" font-size="11" font-weight="700" fill="${l.color || '#fff'}" paint-order="stroke" stroke="#0b0e14" stroke-width="3">${l.text}</text>`;
    }
    for (const m of st.markers) s += markerSVG(m);
    s += `<g class="fb-cur"></g></svg>`;
    sc.innerHTML = s;
    sc.classList.toggle('vert', g.v);
    if (maxH && g.v) sc.style.maxHeight = maxH; else sc.style.maxHeight = '';
    drawCursor();
  }

  function drawCursor() {
    const grp = sc.querySelector('.fb-cur');
    if (!grp || !g) return;
    grp.innerHTML = cursor.map(c => {
      const [x, y] = g.pos(c.s, c.f);
      return `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${c.color || '#ffffff'}" stroke-width="3.5" filter="url(#glow)"/>`;
    }).join('');
  }

  function scrollTo(lo, hi = lo, smooth = true) {
    if (!g) return;
    const mid = Math.max(0, (lo + hi) / 2);
    const px = mid <= 0 ? 0 : (g.wire(Math.floor(mid)) + g.wire(Math.ceil(mid))) / 2;
    const beh = smooth ? 'smooth' : 'auto';
    if (!g.v) sc.scrollTo({ left: Math.max(0, px - sc.clientWidth / 2), behavior: beh });
    else sc.scrollTo({ top: Math.max(0, px - sc.clientHeight / 2), behavior: beh });
  }

  sc.addEventListener('click', e => {
    if (!onTap || !g) return;
    const svg = sc.querySelector('svg');
    const r = svg.getBoundingClientRect();
    const [s, f] = g.hit(e.clientX - r.left, e.clientY - r.top);
    if (s < 0 || s > 5 || f < 0 || f > frets) return;
    onTap(s, f, tuning()[s] + f, e);
  });

  return {
    el: wrap,
    render(next = {}) { Object.assign(st, next); draw(); if (next.focus) scrollTo(next.focus[0], next.focus[1], next.smooth !== false); },
    redraw() { draw(); if (st.focus) scrollTo(st.focus[0], st.focus[1], false); },
    setCursor(list) { cursor = list || []; drawCursor(); },
    scrollTo,
    destroy() { wrap.remove(); },
  };
}
