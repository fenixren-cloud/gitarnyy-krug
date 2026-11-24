// music.js — чистая теория: ноты, интервалы, аккорды, гаммы, лады, аппликатуры.
// Без DOM и без звука: модуль тестируется в Node.

export const mod12 = n => ((n % 12) + 12) % 12;
export const MAX_FRET = 22; // 22 лада — как у большинства электрогитар

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
export const RU_LETTERS = ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си'];
const ACC = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
const RU_ACC_LONG = { '-2': '-дубль-бемоль', '-1': '-бемоль', '0': '', '1': '-диез', '2': '-дубль-диез' };

export const TUNINGS = {
  std: { id: 'std', name: 'Standard E', short: 'E A D G B E', midi: [40, 45, 50, 55, 59, 64] },
  dropd: { id: 'dropd', name: 'Drop D', short: 'D A D G B E', midi: [38, 45, 50, 55, 59, 64] },
};
// Индекс струны: 0 = 6-я (самая толстая) … 5 = 1-я (самая тонкая)
export const STRING_NUM = ['6', '5', '4', '3', '2', '1'];

// ---------- Ноты с правильным написанием ----------
// Нота = { l: индекс буквы 0..6, a: знак -2..2 }
export const sp = (l, a = 0) => ({ l: ((l % 7) + 7) % 7, a });
export const pcOf = n => mod12(LETTER_PC[n.l] + n.a);
export const sameSp = (x, y) => x.l === y.l && x.a === y.a;

export function noteName(n, german = false) {
  if (german && n.l === 6) {
    if (n.a === 0) return 'H';
    if (n.a === -1) return 'B';
    return 'H' + ACC[n.a];
  }
  return LETTERS[n.l] + ACC[n.a];
}
export const ruName = (n, long = false) => RU_LETTERS[n.l] + (long ? RU_ACC_LONG[n.a] : ACC[n.a]);

const SHARP_SP = [sp(0), sp(0, 1), sp(1), sp(1, 1), sp(2), sp(3), sp(3, 1), sp(4), sp(4, 1), sp(5), sp(5, 1), sp(6)];
const FLAT_SP = [sp(0), sp(1, -1), sp(1), sp(2, -1), sp(2), sp(3), sp(4, -1), sp(4), sp(5, -1), sp(5), sp(6, -1), sp(6)];
export const spellPc = (pc, flat = false) => (flat ? FLAT_SP : SHARP_SP)[mod12(pc)];

// Написать высоту pc заданной буквой l (B♭, а не A♯, если буква B)
export function spellWithLetter(pc, l) {
  l = ((l % 7) + 7) % 7;
  let a = mod12(pc - LETTER_PC[l]);
  if (a > 6) a -= 12;
  return { l, a };
}
const accScore = notes => notes.reduce((s, n) => s + Math.abs(n.a) + (Math.abs(n.a) >= 2 ? 10 : 0), 0);

// ---------- Интервалы ----------
export const INTERVALS = [
  { st: 0, short: 'ч1', name: 'чистая прима (унисон)', deg: '1', feel: 'та же самая нота' },
  { st: 1, short: 'м2', name: 'малая секунда', deg: '♭2', feel: 'самое «трущееся» и тревожное расстояние' },
  { st: 2, short: 'б2', name: 'большая секунда', deg: '2', feel: 'целый тон, обычный шаг гаммы' },
  { st: 3, short: 'м3', name: 'малая терция', deg: '♭3', feel: 'основа минора, грустная' },
  { st: 4, short: 'б3', name: 'большая терция', deg: '3', feel: 'основа мажора, светлая' },
  { st: 5, short: 'ч4', name: 'чистая кварта', deg: '4', feel: 'открытая, «вопросительная»; так настроены соседние струны' },
  { st: 6, short: 'тт', name: 'тритон (ув. кварта = ум. квинта)', deg: '♭5', feel: 'максимум напряжения, «дьявольский» интервал метала' },
  { st: 7, short: 'ч5', name: 'чистая квинта', deg: '5', feel: 'мощная и «пустая»: это пауэр-аккорд' },
  { st: 8, short: 'м6', name: 'малая секста', deg: '♭6', feel: 'мягкая, тёмная, драматичная' },
  { st: 9, short: 'б6', name: 'большая секста', deg: '6', feel: 'тёплая и светлая' },
  { st: 10, short: 'м7', name: 'малая септима', deg: '♭7', feel: 'блюзовое напряжение, звук доминанты' },
  { st: 11, short: 'б7', name: 'большая септима', deg: '7', feel: '«дорогая», почти октава, лёгкое трение' },
  { st: 12, short: 'ч8', name: 'октава', deg: '8', feel: 'та же нота выше: круг замкнулся' },
];
// Где лежит интервал на грифе относительно корня: та же струна, соседняя (+5), переход G→B (+4)
export function intervalOnNeck(st) {
  return { same: st, next: st - 5, gb: st - 4, next2: st - 10, next2gb: st - 9 };
}

// ---------- Ступени и их «семьи» (для цветов) ----------
const NAT = [0, 2, 4, 5, 7, 9, 11];
export function degLabel(st, lt) {
  const d = st - NAT[lt];
  return (d <= -2 ? '𝄫' : d === -1 ? '♭' : d === 1 ? '♯' : d >= 2 ? '𝄪' : '') + (lt + 1);
}
// root / third / fifth / seventh / other
export function degreeFamily(label) {
  const n = String(label).replace(/[^0-9]/g, '');
  if (n === '1' || n === '8') return 'root';
  if (n === '3') return 'third';
  if (n === '5') return 'fifth';
  if (n === '7') return 'seventh';
  return 'other';
}
const DEG_DEFAULT = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
export const defaultDegree = st => DEG_DEFAULT[mod12(st)];

// ---------- Аккорды ----------
// iv — полутоны от корня, lt — сдвиг буквы (терция = +2 буквы, квинта = +4, септима = +6, кварта = +3)
export const CHORDS = {
  power: { name: 'Пауэр-аккорд', sym: '5', iv: [0, 7], lt: [0, 4], q: 'power' },
  maj: { name: 'Мажор', sym: '', iv: [0, 4, 7], lt: [0, 2, 4], q: 'maj' },
  min: { name: 'Минор', sym: 'm', iv: [0, 3, 7], lt: [0, 2, 4], q: 'min' },
  sus4: { name: 'Sus4', sym: 'sus4', iv: [0, 5, 7], lt: [0, 3, 4], q: 'sus' },
  dim: { name: 'Уменьшённый', sym: 'dim', iv: [0, 3, 6], lt: [0, 2, 4], q: 'dim' },
  aug: { name: 'Увеличенный', sym: '+', iv: [0, 4, 8], lt: [0, 2, 4], q: 'aug' },
  maj7: { name: 'Большой мажорный септаккорд', sym: 'maj7', iv: [0, 4, 7, 11], lt: [0, 2, 4, 6], q: 'maj7' },
  dom7: { name: 'Доминантсептаккорд', sym: '7', iv: [0, 4, 7, 10], lt: [0, 2, 4, 6], q: 'dom7' },
  m7: { name: 'Минорный септаккорд', sym: 'm7', iv: [0, 3, 7, 10], lt: [0, 2, 4, 6], q: 'm7' },
  m7b5: { name: 'Полууменьшённый септаккорд', sym: 'm7♭5', iv: [0, 3, 6, 10], lt: [0, 2, 4, 6], q: 'm7b5' },
  dim7: { name: 'Уменьшённый септаккорд', sym: 'dim7', iv: [0, 3, 6, 9], lt: [0, 2, 4, 6], q: 'dim7' },
  mmaj7: { name: 'Минорный с большой септимой', sym: 'm(maj7)', iv: [0, 3, 7, 11], lt: [0, 2, 4, 6], q: 'mmaj7' },
  maj7s5: { name: 'Увеличенный с большой септимой', sym: 'maj7♯5', iv: [0, 4, 8, 11], lt: [0, 2, 4, 6], q: 'maj7s5' },
};
export const chordDegrees = type => CHORDS[type].iv.map((st, i) => degLabel(st, CHORDS[type].lt[i]));
export const chordPcs = (rootPc, type) => CHORDS[type].iv.map(st => mod12(rootPc + st));

export function spellChord(rootSp, type) {
  const c = CHORDS[type];
  return c.iv.map((st, i) => spellWithLetter(pcOf(rootSp) + st, rootSp.l + c.lt[i]));
}
// Корень аккорда вне тональности: вариант с меньшим числом знаков (ничья → диез)
export function chordRoot(pc, type) {
  const a = SHARP_SP[mod12(pc)], b = FLAT_SP[mod12(pc)];
  if (sameSp(a, b)) return a;
  return accScore(spellChord(b, type)) < accScore(spellChord(a, type)) ? b : a;
}
export const chordSymbol = (rootSp, type, german = false) => noteName(rootSp, german) + CHORDS[type].sym;
export function chordRuName(rootSp, type) {
  const r = ruName(rootSp, true);
  const n = { power: `пауэр-аккорд от ${r}`, maj: `${r} мажор`, min: `${r} минор`, sus4: `${r} sus4`,
    dim: `${r} уменьшённый`, aug: `${r} увеличенный`, maj7: `${r} maj7`, dom7: `${r} доминантсепт`,
    m7: `${r} минорный септ`, m7b5: `${r} полууменьшённый`, dim7: `${r} уменьшённый септ`,
    mmaj7: `${r} минор с б.7`, maj7s5: `${r} maj7♯5` };
  return n[type] || r;
}
export function classifyChord(st3, st5, st7 = null) {
  if (st7 == null) {
    if (st3 === 4 && st5 === 7) return 'maj';
    if (st3 === 3 && st5 === 7) return 'min';
    if (st3 === 3 && st5 === 6) return 'dim';
    if (st3 === 4 && st5 === 8) return 'aug';
    return null;
  }
  const k = `${st3},${st5},${st7}`;
  return { '4,7,11': 'maj7', '4,7,10': 'dom7', '3,7,10': 'm7', '3,6,10': 'm7b5', '3,6,9': 'dim7', '3,7,11': 'mmaj7', '4,8,11': 'maj7s5' }[k] || null;
}

// ---------- Лады ----------
export const MODES = {
  ionian: { name: 'Ионийский', alt: 'натуральный мажор', iv: [0, 2, 4, 5, 7, 9, 11], parent: 0, family: 'major', char: [11],
    mood: 'светлый, устойчивый, «домашний»', genres: 'поп, поп-панк, мажорный рок, гимны, детские песни' },
  dorian: { name: 'Дорийский', alt: 'минор с большой секстой', iv: [0, 2, 3, 5, 7, 9, 10], parent: 2, family: 'minor', char: [9],
    mood: 'минор, но не печальный: «крутой», грувовый, с надеждой', genres: 'фанк, соул, джаз-рок, латино-рок, психоделия, кельтская музыка' },
  phrygian: { name: 'Фригийский', alt: 'минор с малой секундой', iv: [0, 1, 3, 5, 7, 8, 10], parent: 4, family: 'minor', char: [1],
    mood: 'тёмный, угрожающий, «испанский»', genres: 'трэш- и дэт-метал, ню-метал, фламенко, дарк-эмбиент' },
  lydian: { name: 'Лидийский', alt: 'мажор с увеличенной квартой', iv: [0, 2, 4, 6, 7, 9, 11], parent: 5, family: 'major', char: [6],
    mood: 'мечтательный, волшебный, «парящий»', genres: 'саундтреки и фэнтези, прог-рок, инструментальный гитарный рок, дрим-поп' },
  mixolydian: { name: 'Миксолидийский', alt: 'мажор с малой септимой', iv: [0, 2, 4, 5, 7, 9, 10], parent: 7, family: 'major', char: [10],
    mood: 'бодрый мажор с блюзовой «грязью»', genres: 'классический и блюз-рок, хард-рок, кантри, фолк, джем-бэнды' },
  aeolian: { name: 'Эолийский', alt: 'натуральный минор', iv: [0, 2, 3, 5, 7, 8, 10], parent: 9, family: 'minor', char: [8],
    mood: 'грустный, серьёзный, эпичный', genres: 'рок- и метал-баллады, хэви-метал, пауэр-метал, поп-минор' },
  locrian: { name: 'Локрийский', alt: 'без чистой квинты', iv: [0, 1, 3, 5, 6, 8, 10], parent: 11, family: 'minor', char: [6],
    mood: 'неустойчивый, тревожный, «висит в воздухе»', genres: 'экстремальный и прог-метал (диссонансные риффы), джаз (над m7♭5)' },
  harmonic: { name: 'Гармонический минор', alt: 'минор с большой септимой', iv: [0, 2, 3, 5, 7, 8, 11], parent: null, family: 'minor', char: [11],
    mood: 'драматичный, «восточный», классический', genres: 'неоклассический метал, симфо-метал, классика, восточная музыка' },
  phrygdom: { name: 'Фригийский доминантовый', alt: '5-й лад гармонического минора', iv: [0, 1, 4, 5, 7, 8, 10], parent: null, family: 'minor', char: [1, 4],
    mood: 'экзотический, «пустынный», зловещий', genres: 'метал (ориентальные риффы), фламенко, клезмер, ближневосточная музыка' },
};
export const MODE_ORDER = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'harmonic', 'phrygdom'];
// Лестница яркости: каждый шаг понижает одну ступень на полутон
export const BRIGHTNESS = ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'];
export const modeDegrees = id => MODES[id].iv.map((st, i) => degLabel(st, i));

export function spellScale(tonicSp, iv) {
  return iv.map((st, i) => spellWithLetter(pcOf(tonicSp) + st, tonicSp.l + i));
}
// Лучшее написание тоники для лада: меньше знаков; ничья → диезы (F♯ мажор, D♯ минор)
export function keyTonic(pc, modeId) {
  const iv = MODES[modeId].iv;
  const a = SHARP_SP[mod12(pc)], b = FLAT_SP[mod12(pc)];
  if (sameSp(a, b)) return a;
  return accScore(spellScale(b, iv)) < accScore(spellScale(a, iv)) ? b : a;
}
export function keySignature(tonicSp, modeId) {
  const base = modeId === 'harmonic' ? 'aeolian' : modeId === 'phrygdom' ? 'phrygian' : modeId;
  const notes = spellScale(tonicSp, MODES[base].iv);
  const SH = [3, 0, 4, 1, 5, 2, 6], FL = [6, 2, 5, 1, 4, 0, 3];
  const sharps = SH.map(l => notes.find(n => n.l === l && n.a > 0)).filter(Boolean);
  const flats = FL.map(l => notes.find(n => n.l === l && n.a < 0)).filter(Boolean);
  return { sharps: sharps.length, flats: flats.length, list: sharps.length ? sharps : flats };
}
// Родительский мажор для 7 ладов мажора (D дорийский → C мажор)
export function parentMajor(tonicSp, modeId) {
  const m = MODES[modeId];
  if (m.parent == null) return null;
  const notes = spellScale(tonicSp, m.iv);
  const idx = (7 - MODE_ORDER.indexOf(modeId)) % 7;
  return notes[idx];
}

// ---------- Пентатоника ----------
export const PENTA = {
  minor: { name: 'Минорная пентатоника', iv: [0, 3, 5, 7, 10], lt: [0, 2, 3, 4, 6], blue: 6, steps: [3, 2, 2, 3, 2] },
  major: { name: 'Мажорная пентатоника', iv: [0, 2, 4, 7, 9], lt: [0, 1, 2, 4, 5], blue: 3, steps: [2, 2, 3, 2, 3] },
};
export const pentaDegrees = kind => PENTA[kind].iv.map((st, i) => degLabel(st, PENTA[kind].lt[i]));
export function spellPenta(tonicSp, kind) {
  const P = PENTA[kind];
  return P.iv.map((st, i) => spellWithLetter(pcOf(tonicSp) + st, tonicSp.l + P.lt[i]));
}

// 5 позиций методом «линеек»: позиция = 10 нот пентатоники подряд, по 2 на струну.
// Позиция 1 начинается с тоники на 6-й струне; каждая следующая — с ноты, где кончилась линейка.
// Считаем в Standard; в Drop D 6-я струна та же по высоте, но на 2 лада правее.
export function pentaPositions(rootPc, kind, tuning) {
  const P = PENTA[kind], STD = TUNINGS.std.midi;
  const out = [];
  let start = STD[0] + mod12(rootPc - STD[0]); // тоника на 6-й струне, лады 0..11
  for (let p = 0; p < 5; p++) {
    const notes = [];
    let deg = p, pitch = start;
    for (let s = 0; s < 6; s++) {
      for (let k = 0; k < 2; k++) {
        if (s || k) { pitch += P.steps[deg % 5]; deg++; }
        notes.push({ s, midi: pitch, degIdx: deg % 5 });
      }
    }
    // если что-то ушло ниже нулевого лада — на октаву выше
    if (notes.some(n => n.midi - STD[n.s] < 0)) notes.forEach(n => { n.midi += 12; });
    let frets = notes.map(n => n.midi - tuning[n.s]);
    if (Math.max(...frets) > MAX_FRET && Math.min(...frets) >= 12) { notes.forEach(n => { n.midi -= 12; }); frets = frets.map(f => f - 12); }
    notes.forEach((n, i) => { n.f = frets[i]; n.pc = mod12(n.midi); n.deg = degLabel(P.iv[n.degIdx], P.lt[n.degIdx]); });
    const rulers = [];
    for (let s = 0; s < 6; s++) {
      const [a, b] = notes.filter(n => n.s === s);
      rulers.push({ s, from: a.f, to: b.f, len: b.f - a.f, fromDeg: a.degIdx });
    }
    out.push({ index: p, notes, rulers, minFret: Math.min(...frets), maxFret: Math.max(...frets) });
    // следующая позиция начинается там, где кончилась линейка на 6-й струне
    start = notes[1].midi;
  }
  return out;
}

// Позиции 7-нотного лада: окна позиций пентатоники (±1 лад), все ноты лада в окне, без повторов высоты
export function modePositions(rootPc, modeId, tuning) {
  const m = MODES[modeId];
  const pp = pentaPositions(rootPc, m.family === 'major' ? 'major' : 'minor', tuning);
  const pcs = m.iv.map(x => mod12(rootPc + x));
  return pp.map(pos => {
    const cand = [];
    for (let s = 0; s < 6; s++) {
      const r = pos.rulers[s];
      for (let f = Math.max(0, r.from - 1); f <= Math.min(MAX_FRET, r.to + 1); f++) {
        const midi = tuning[s] + f, di = pcs.indexOf(mod12(midi));
        if (di < 0) continue;
        const dist = f < r.from ? r.from - f : f > r.to ? f - r.to : 0;
        cand.push({ s, f, midi, pc: mod12(midi), degIdx: di, deg: degLabel(m.iv[di], di), dist });
      }
    }
    const byMidi = new Map();
    for (const c of cand) {
      const prev = byMidi.get(c.midi);
      if (!prev || c.dist < prev.dist || (c.dist === prev.dist && c.s < prev.s)) byMidi.set(c.midi, c);
    }
    const notes = [...byMidi.values()].sort((a, b) => a.midi - b.midi);
    const frets = notes.map(n => n.f);
    return { index: pos.index, notes, minFret: Math.min(...frets), maxFret: Math.max(...frets), penta: pos };
  });
}

// ---------- Тональности, диатонические аккорды, квинтовый круг ----------
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const LOWER = new Set(['min', 'dim', 'm7', 'm7b5', 'dim7', 'mmaj7']);
const RSUF = { maj: '', min: '', dim: '°', aug: '+', maj7: 'maj7', dom7: '7', m7: '7', m7b5: 'ø7', dim7: '°7', mmaj7: '(maj7)', maj7s5: '+maj7' };
export function romanFor(i, type) {
  const r = ROMAN[i];
  return (LOWER.has(type) ? r.toLowerCase() : r) + (RSUF[type] ?? '');
}
export function diatonicChords(tonicSp, modeId, sevenths = false) {
  const iv = MODES[modeId].iv;
  const notes = spellScale(tonicSp, iv);
  return notes.map((root, i) => {
    const st = k => mod12(iv[(i + k) % 7] - iv[i]);
    const type = sevenths ? classifyChord(st(2), st(4), st(6)) : classifyChord(st(2), st(4));
    return { degree: i, root, rootPc: pcOf(root), type, roman: romanFor(i, type) };
  });
}
export const FIFTHS = Array.from({ length: 12 }, (_, k) => {
  const pc = mod12(7 * k), minPc = mod12(pc + 9);
  const maj = keyTonic(pc, 'ionian'), min = keyTonic(minPc, 'aeolian');
  return { k, pc, minPc, maj, min, sig: keySignature(maj, 'ionian') };
});
export const fifthsIndex = pc => mod12(pc * 7); // позиция мажорной тональности на квинтовом круге

// Последовательности: ступени (0 = I), длина в тактах
export const PROGRESSIONS = {
  major: [
    { id: 'pop', name: 'I–V–vi–IV', degs: [0, 4, 5, 3] },
    { id: 'rock', name: 'I–IV–V–IV', degs: [0, 3, 4, 3] },
    { id: 'fifties', name: 'I–vi–IV–V', degs: [0, 5, 3, 4] },
    { id: 'emo', name: 'vi–IV–I–V', degs: [5, 3, 0, 4] },
    { id: 'cadence', name: 'I–IV–V–I', degs: [0, 3, 4, 0] },
    { id: 'blues', name: '12-тактовый блюз', degs: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], type: 'dom7' },
  ],
  minor: [
    { id: 'epic', name: 'i–VI–III–VII', degs: [0, 5, 2, 6] },
    { id: 'metal', name: 'i–VII–VI–VII', degs: [0, 6, 5, 6] },
    { id: 'ivv', name: 'i–iv–v–i', degs: [0, 3, 4, 0] },
    { id: 'andal', name: 'i–VII–VI–V (андалузский)', degs: [0, 6, 5, 4], over: { 4: 'maj' } },
    { id: 'vi', name: 'i–VI–VII–i', degs: [0, 5, 6, 0] },
    { id: 'mblues', name: 'Минорный блюз', degs: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], type: 'm7', over: { 4: 'dom7' } },
  ],
};
export function progressionChords(tonicSp, modeId, prog) {
  const dia = diatonicChords(tonicSp, modeId);
  return prog.degs.map(d => {
    const c = dia[d];
    let type = c.type;
    if (prog.type) type = (prog.type === 'm7' && (c.type === 'maj')) ? 'dom7' : prog.type;
    if (prog.over && prog.over[d]) type = prog.over[d];
    return { degree: d, root: c.root, rootPc: c.rootPc, type, roman: romanFor(d, type) };
  });
}

// ---------- Аппликатуры ----------
// off — смещения ладов от корня на корневой струне (null = струна не играет), индексы 0 = 6-я струна
const SH = (name, rs, off) => ({ name, rs, off });
export const SHAPES = {
  power: [SH('от 6-й струны', 0, [0, 2, null, null, null, null]), SH('от 6-й + октава', 0, [0, 2, 2, null, null, null]),
    SH('от 5-й струны', 1, [null, 0, 2, null, null, null]), SH('от 5-й + октава', 1, [null, 0, 2, 2, null, null])],
  maj: [SH('E-форма, баррэ от 6-й', 0, [0, 2, 2, 1, 0, 0]), SH('A-форма, баррэ от 5-й', 1, [null, 0, 2, 2, 2, 0])],
  min: [SH('Em-форма, баррэ от 6-й', 0, [0, 2, 2, 0, 0, 0]), SH('Am-форма, баррэ от 5-й', 1, [null, 0, 2, 2, 1, 0])],
  sus4: [SH('Esus4-форма, от 6-й', 0, [0, 2, 2, 2, 0, 0]), SH('Asus4-форма, от 5-й', 1, [null, 0, 2, 2, 3, 0])],
  dim: [SH('от 6-й (4 струны)', 0, [0, 1, 2, 0, null, null]), SH('от 5-й (4 струны)', 1, [null, 0, 1, 2, 1, null])],
  aug: [SH('от 6-й (4 струны)', 0, [0, null, 2, 1, 1, null]), SH('от 5-й (4 струны)', 1, [null, 0, 3, 2, 2, null])],
  maj7: [SH('от 6-й', 0, [0, null, 1, 1, 0, null]), SH('от 5-й', 1, [null, 0, 2, 1, 2, null])],
  dom7: [SH('от 6-й', 0, [0, null, 0, 1, 0, null]), SH('E7-форма, баррэ', 0, [0, 2, 0, 1, 0, 0]), SH('от 5-й', 1, [null, 0, 2, 0, 2, null])],
  m7: [SH('от 6-й', 0, [0, null, 0, 0, 0, null]), SH('Em7-форма, баррэ', 0, [0, 2, 0, 0, 0, 0]), SH('от 5-й', 1, [null, 0, 2, 0, 1, null])],
  m7b5: [SH('от 6-й', 0, [0, null, 0, 0, -1, null]), SH('от 5-й', 1, [null, 0, 1, 0, 1, null])],
  dim7: [SH('от 6-й', 0, [0, null, -1, 0, -1, null]), SH('от 5-й', 1, [null, 0, 1, -1, 1, null])],
};
// Для Drop D формы от 6-й струны пересчитываются: 6-я на тон ниже, значит остальные струны на 2 лада левее
export function shapesFor(type, tuningId) {
  const base = SHAPES[type] || [];
  if (tuningId !== 'dropd') return base.map((s, i) => ({ ...s, id: `${type}-${i}` }));
  return base.map((s, i) => {
    if (s.rs !== 0) return { ...s, id: `${type}-${i}` };
    const off = s.off.map((o, k) => (o == null ? null : k === 0 ? o : o - 2));
    let name = 'Drop D: ' + s.name.replace(', баррэ от 6-й', ' от 6-й');
    if (type === 'power') name = i === 0 ? 'Drop D: один палец (6+5)' : 'Drop D: один палец (6+5+4)';
    return { ...s, off, name, id: `${type}-${i}`, drop: true };
  });
}
export function placeShape(shape, rootPc, tuning, target = null) {
  const r = mod12(rootPc - tuning[shape.rs]);
  const make = base => shape.off.map(o => (o == null ? null : o + base));
  const opts = [r, r + 12, r - 12].map(make).filter(fr => {
    const u = fr.filter(f => f != null);
    return Math.min(...u) >= 0 && Math.max(...u) <= MAX_FRET;
  });
  if (!opts.length) return null;
  const avg = fr => { const u = fr.filter(f => f != null); return u.reduce((a, b) => a + b, 0) / u.length; };
  if (target == null) return opts.sort((a, b) => avg(a) - avg(b))[0];
  return opts.sort((a, b) => Math.abs(avg(a) - target) - Math.abs(avg(b) - target))[0];
}
export const voicingMidis = (frets, tuning) => frets.map((f, s) => (f == null ? null : tuning[s] + f)).filter(m => m != null);
export function voicingAvg(frets) { const u = frets.filter(f => f != null); return u.reduce((a, b) => a + b, 0) / u.length; }
// Ближайшая к нужному ладу аппликатура данного типа
export function bestVoicing(type, rootPc, tuningId, target = 5) {
  const tuning = TUNINGS[tuningId].midi;
  let best = null;
  for (const shape of shapesFor(type, tuningId)) {
    const fr = placeShape(shape, rootPc, tuning, target);
    if (!fr) continue;
    const d = Math.abs(voicingAvg(fr) - target);
    if (!best || d < best.d) best = { shape, frets: fr, d };
  }
  return best;
}

// Все позиции нот из набора pcs на грифе
export function neckNotes(pcs, tuning, from = 0, to = MAX_FRET) {
  const set = new Set(pcs.map(mod12)), out = [];
  for (let s = 0; s < 6; s++) for (let f = from; f <= to; f++) {
    const midi = tuning[s] + f;
    if (set.has(mod12(midi))) out.push({ s, f, midi, pc: mod12(midi) });
  }
  return out;
}
export const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);
export const midiName = (m, german = false) => noteName(spellPc(mod12(m)), german) + (Math.floor(m / 12) - 1);

// ---------- Темп ----------
const TEMPI = [[40, 'Grave', 'очень медленно, тяжело'], [60, 'Largo', 'медленно, широко'], [66, 'Larghetto', 'медленно'],
  [76, 'Adagio', 'спокойно'], [108, 'Andante', 'шагом'], [120, 'Moderato', 'умеренно'], [168, 'Allegro', 'быстро, бодро'],
  [200, 'Presto', 'очень быстро'], [1e9, 'Prestissimo', 'максимально быстро']];
export function tempoName(bpm) { const t = TEMPI.find(x => bpm < x[0]); return { name: t[1], ru: t[2] }; }
