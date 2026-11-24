// circle.js — круги: хроматический «циферблат» из 12 нот с фигурами аккордов
// (треугольники, четырёхугольники, числа полутонов на сторонах) и квинтовый круг с тональностями.
import { mod12 } from './music.js';
import { COLORS } from './ui.js';

const rad = d => (d * Math.PI) / 180;
const pt = (cx, cy, r, i, n = 12) => { const a = rad(-90 + (i * 360) / n); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const f1 = v => Math.round(v * 10) / 10;

function arcPath(cx, cy, r, i0, i1) {
  // по часовой от позиции i0 до i1 (в «часах»)
  let d = i1 - i0; if (d <= 0) d += 12;
  const [x0, y0] = pt(cx, cy, r, i0), [x1, y1] = pt(cx, cy, r, i0 + d);
  return `M${f1(x0)} ${f1(y0)} A${r} ${r} 0 ${d > 6 ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}`;
}
function pillSVG(x, y, text, color, fs = 10) {
  const w = Math.max(22, text.length * fs * 0.62 + 10);
  return `<g><rect x="${f1(x - w / 2)}" y="${f1(y - 9)}" width="${f1(w)}" height="18" rx="9" fill="#0b0e14" stroke="${color}" stroke-width="1.3"/><text x="${f1(x)}" y="${f1(y + fs * 0.36)}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="${color}">${text}</text></g>`;
}
function centerBox(cx, cy, big, small, color, w = 118) {
  if (!big) return '';
  const h = small ? 58 : 44;
  const fs = big.length > 6 ? 20 : big.length > 4 ? 24 : 30;
  return `<g><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="12" fill="#0b0e14" fill-opacity=".92" stroke="${color}" stroke-opacity=".55"/>` +
    `<text x="${cx}" y="${cy + (small ? 4 : fs * 0.36)}" text-anchor="middle" class="disp" font-size="${fs}" font-weight="800" fill="${color}">${big}</text>` +
    (small ? `<text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="8.5" font-weight="800" letter-spacing=".6" fill="${color}" opacity=".85">${small.toUpperCase()}</text>` : '') + '</g>';
}

// Хроматический круг. node(pc) → { text, sub, fill, stroke, tc, glow, dim }
export function chromaticSVG({ node, polys = [], arcs = [], center = null, star = 0, lines = [], act = 'pc', size = 320 } = {}) {
  const cx = size / 2, cy = size / 2, R = size * 0.37;
  let s = `<svg class="circle" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Хроматический круг">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#discGrad)" stroke="#20283a" stroke-width="1.5"/>`;
  if (star) {
    let i = 0, path = '';
    for (let k = 0; k <= 12; k++) { const [x, y] = pt(cx, cy, R, mod12(i)); path += `${k ? 'L' : 'M'}${f1(x)} ${f1(y)}`; i += star; }
    s += `<path d="${path}" fill="none" stroke="#e8ecf3" stroke-opacity=".55" stroke-width="1.2"/>`;
  }
  for (const l of lines) {
    const [x1, y1] = pt(cx, cy, R, l.a), [x2, y2] = pt(cx, cy, R, l.b);
    s += `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${l.color}" stroke-width="2.4" stroke-dasharray="${l.dash ? '5 5' : ''}" filter="url(#glow)"/>`;
  }
  for (const p of polys) {
    const pts = p.pcs.map(pc => pt(cx, cy, R, pc));
    if (pts.length >= 2) s += `<polygon points="${pts.map(q => q.map(f1).join(',')).join(' ')}" fill="${p.color}" fill-opacity="${p.fill ?? 0.13}" stroke="${p.color}" stroke-width="${p.width || 2.6}" stroke-linejoin="round" stroke-dasharray="${p.dash ? '6 5' : ''}" filter="url(#glow)" opacity="${p.op ?? 1}"/>`;
    if (p.steps) {
      const n = p.pcs.length;
      for (let i = 0; i < n; i++) {
        if (n === 2 && i === 1 && !p.closeStep) break;
        const a = p.pcs[i], b = p.pcs[(i + 1) % n], d = mod12(b - a) || 12;
        const last = i === n - 1;
        if (last && p.closeStep === false) continue;
        const r2 = R + 25;
        s += `<path d="${arcPath(cx, cy, r2, a, a + d)}" fill="none" stroke="${p.color}" stroke-width="2" stroke-opacity="${last ? 0.35 : 0.85}" stroke-dasharray="${last ? '3 4' : ''}"/>`;
        const [mx, my] = pt(cx, cy, r2, a + d / 2);
        s += pillSVG(mx, my, '+' + d, p.color);
      }
    }
  }
  for (const a of arcs) {
    const r2 = R + (a.r || 25);
    s += `<path d="${arcPath(cx, cy, r2, a.from, a.from + a.steps)}" fill="none" stroke="${a.color}" stroke-width="2.4" stroke-dasharray="${a.dash ? '4 4' : ''}"/>`;
    const [ex, ey] = pt(cx, cy, r2, a.from + a.steps);
    s += `<circle cx="${f1(ex)}" cy="${f1(ey)}" r="3.5" fill="${a.color}"/>`;
    if (a.text) { const [mx, my] = pt(cx, cy, r2, a.from + a.steps / 2); s += pillSVG(mx, my, a.text, a.color); }
  }
  for (let pc = 0; pc < 12; pc++) {
    const [x, y] = pt(cx, cy, R, pc);
    const n = node(pc) || {};
    const fill = n.fill || '#121722', stroke = n.stroke || '#2b3346', tc = n.tc || '#e6eaf2';
    s += `<g class="node" data-act="${act}" data-pc="${pc}" opacity="${n.dim ? 0.38 : 1}">` +
      `<circle cx="${f1(x)}" cy="${f1(y)}" r="${n.big ? 22 : 19.5}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"${n.glow ? ' filter="url(#glow)"' : ''}/>` +
      `<text x="${f1(x)}" y="${f1(y + (n.sub ? 1.5 : 4.5))}" text-anchor="middle" font-size="${(n.text || '').length > 2 ? 11.5 : 13.5}" font-weight="800" fill="${tc}">${n.text || ''}</text>` +
      (n.sub ? `<text x="${f1(x)}" y="${f1(y + 11)}" text-anchor="middle" font-size="7.4" font-weight="600" fill="${n.subc || (n.fill ? '#1c1c1c' : '#7f889c')}">${n.sub}</text>` : '') +
      `<circle cx="${f1(x)}" cy="${f1(y)}" r="24" fill="transparent"/></g>`;
  }
  if (center) s += centerBox(cx, cy, center.big, center.small, center.color || COLORS.root, center.w);
  return s + '</svg>';
}

// Квинтовый круг: снаружи мажорные тональности, внутри параллельные минорные.
// keys[k] = { maj, min, sig } (из music.FIFTHS), sel = индекс выбранной тональности по кругу (0 = C)
export function fifthsSVG({ keys, sel = 0, minor = false, sector = true, labelMaj, labelMin, sigPills = true, romans = null, arrows = [], tritone = false, size = 340, center = null, hl = [] } = {}) {
  const cx = size / 2, cy = size / 2, R1 = size * 0.36, R2 = size * 0.235;
  let s = `<svg class="circle" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Квинтовый круг">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R1 + 22}" fill="url(#discGrad)" stroke="#20283a"/><circle cx="${cx}" cy="${cy}" r="${R2 - 18}" fill="#0c1018" stroke="#1c2333"/>`;
  if (sector) {
    // сектор тональности: соседи слева и справа + их параллельные минорные = 6 аккордов
    const a0 = rad(-90 + (sel - 1.5) * 30), a1 = rad(-90 + (sel + 1.5) * 30), ro = R1 + 21, ri = R2 - 17;
    const P = (r, a) => `${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`;
    s += `<path d="M${P(ro, a0)} A${ro} ${ro} 0 0 1 ${P(ro, a1)} L${P(ri, a1)} A${ri} ${ri} 0 0 0 ${P(ri, a0)} Z" fill="${COLORS.root}" fill-opacity=".1" stroke="${COLORS.root}" stroke-opacity=".55" stroke-width="1.5" filter="url(#glow)"/>`;
  }
  if (tritone) {
    const [x1, y1] = pt(cx, cy, R1, sel), [x2, y2] = pt(cx, cy, R1, sel + 6);
    s += `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${COLORS.seventh}" stroke-width="3" filter="url(#glow)"/>`;
  }
  for (const a of arrows) {
    const r = R1 + 30;
    const [x0, y0] = pt(cx, cy, r, a.from), [x1, y1] = pt(cx, cy, r, a.to);
    const sweep = mod12(a.to - a.from) <= 6 ? 1 : 0;
    s += `<path d="M${f1(x0)} ${f1(y0)} A${r} ${r} 0 0 ${sweep} ${f1(x1)} ${f1(y1)}" fill="none" stroke="${a.color || COLORS.root}" stroke-width="2.6" marker-end="url(#arrow-o)"/>`;
  }
  keys.forEach((K, k) => {
    const near = mod12(k - sel) <= 1 || mod12(sel - k) <= 1;
    const isSel = k === sel;
    const [x, y] = pt(cx, cy, R1, k);
    const majOn = sector && near, minOn = sector && near;
    const fillM = isSel && !minor ? COLORS.root : majOn ? '#5a4214' : '#121722';
    const tcM = isSel && !minor ? '#111' : majOn ? '#ffd9a0' : '#e6eaf2';
    s += `<g class="node" data-act="key" data-k="${k}" data-minor="0"><circle cx="${f1(x)}" cy="${f1(y)}" r="19" fill="${fillM}" stroke="${majOn ? COLORS.root : '#2b3346'}" stroke-width="1.5"${isSel && !minor ? ' filter="url(#glow)"' : ''}/>` +
      `<text x="${f1(x)}" y="${f1(y + 1.5)}" text-anchor="middle" font-size="13" font-weight="800" fill="${tcM}">${labelMaj(K)}</text>` +
      `<text x="${f1(x)}" y="${f1(y + 11)}" text-anchor="middle" font-size="7.2" fill="${isSel && !minor ? '#3a2a10' : '#7f889c'}">${romans && near ? romans.maj[mod12(k - sel + 1)] || '' : ''}</text><circle cx="${f1(x)}" cy="${f1(y)}" r="23" fill="transparent"/></g>`;
    if (hl.some(h => h.k === k && !h.minor)) s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="24" fill="none" stroke="#fff" stroke-width="2.5" filter="url(#glow)"/>`;
    const [xi, yi] = pt(cx, cy, R2, k);
    if (hl.some(h => h.k === k && h.minor)) s += `<circle cx="${f1(xi)}" cy="${f1(yi)}" r="20" fill="none" stroke="#fff" stroke-width="2.5" filter="url(#glow)"/>`;
    const fillm = isSel && minor ? COLORS.third : minOn ? '#2e2752' : '#121722';
    const tcm = isSel && minor ? '#111' : minOn ? '#d8d0ff' : '#c5cbd8';
    s += `<g class="node" data-act="key" data-k="${k}" data-minor="1"><circle cx="${f1(xi)}" cy="${f1(yi)}" r="16" fill="${fillm}" stroke="${minOn ? COLORS.third : '#2b3346'}" stroke-width="1.3"${isSel && minor ? ' filter="url(#glow)"' : ''}/>` +
      `<text x="${f1(xi)}" y="${f1(yi + 1.5)}" text-anchor="middle" font-size="10" font-weight="800" fill="${tcm}">${labelMin(K)}</text>` +
      `<text x="${f1(xi)}" y="${f1(yi + 10)}" text-anchor="middle" font-size="6.6" fill="${isSel && minor ? '#241c44' : '#7f889c'}">${romans && near ? romans.min[mod12(k - sel + 1)] || '' : ''}</text><circle cx="${f1(xi)}" cy="${f1(yi)}" r="19" fill="transparent"/></g>`;
    if (sigPills) {
      const [xs, ys] = pt(cx, cy, R1 + 38, k);
      const t = K.sig.sharps ? K.sig.sharps + '♯' : K.sig.flats ? K.sig.flats + '♭' : '0';
      const c = K.sig.sharps ? COLORS.sharp : K.sig.flats ? COLORS.flat : '#aab3c5';
      s += pillSVG(xs, ys, t, c, 9);
    }
  });
  if (center) s += centerBox(cx, cy, center.big, center.small, center.color || COLORS.root, 100);
  return s + '</svg>';
}
