// Bible Games — web core.
//
// Shared foundation for the web edition: theme tokens, persistence, content
// loading, the KJV reader and the DOM helpers every game is built from. Mirrors
// the iOS app (Theme.swift, the *Store services, ContentStore, BibleService) so
// the two stay recognisably the same product.

// ── Catalog ──────────────────────────────────────────────────────────────────

export const GAMES = [
  { key: 'trivia',     name: 'Bible Trivia',      color: '#1565C0', icon: '?',  blurb: 'Test your Bible knowledge across hundreds of questions.' },
  { key: 'scramble',   name: 'Verse Scramble',    color: '#2E7D32', icon: '⇄',  blurb: 'Unscramble shuffled words from popular Bible verses.' },
  { key: 'whoami',     name: 'Who Am I?',         color: '#6A1B9A', icon: '◉',  blurb: 'Guess the Bible character from a series of clues.' },
  { key: 'wordsearch', name: 'Word Search',       color: '#E65100', icon: '▦',  blurb: 'Find hidden Bible words in a colorful letter grid.' },
  { key: 'hangman',    name: 'Hangman',           color: '#00838F', icon: '✦',  blurb: "Guess the Bible-themed word before it's too late." },
  { key: 'memory',     name: 'Memory Match',      color: '#C62828', icon: '▣',  blurb: 'Match pairs of Bible-themed cards from memory.' },
  { key: 'books',      name: 'Books of the Bible', color: '#6D4C41', icon: '▤', blurb: 'Put the books of the Bible into their correct order.' },
];

export const gameFor = (key) => GAMES.find((g) => g.key === key);
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const MULTIPLIER = { easy: 1, medium: 2, hard: 3 };

// ── Persistence ──────────────────────────────────────────────────────────────

const NS = 'biblegames.';
const read = (k, fallback) => {
  try {
    const raw = localStorage.getItem(NS + k);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch {} };

const todayKey = () => new Date().toISOString().slice(0, 10);
/** Whole days since the epoch — the web twin of VerseMemoryStore.today. */
export const todayIndex = () => Math.floor(new Date(new Date().toDateString()).getTime() / 86400000);

export const Store = {
  // High scores
  high(key) { return read(`high.${key}`, 0); },
  saveScore(key, score) {
    if (score > this.high(key)) write(`high.${key}`, score);
    const plays = read('plays', {});
    plays[key] = (plays[key] || 0) + 1;
    write('plays', plays);
  },
  plays() { return read('plays', {}); },

  // XP + level. Levels every 100 XP, matching the app's feel.
  xp() { return read('xp', 0); },
  addXp(n) {
    write('xp', this.xp() + n);
    const d = read('xpDay', { day: todayKey(), amount: 0 });
    const cur = d.day === todayKey() ? d.amount : 0;
    write('xpDay', { day: todayKey(), amount: cur + n });
    this.creditStreak();
    return this.xp();
  },
  todayXp() {
    const d = read('xpDay', { day: todayKey(), amount: 0 });
    return d.day === todayKey() ? d.amount : 0;
  },
  level() { return Math.floor(this.xp() / 100) + 1; },
  levelProgress() { return (this.xp() % 100) / 100; },

  // Daily streak
  streak() { return read('streak', { count: 0, last: null }); },
  creditStreak() {
    const s = this.streak();
    const t = todayKey();
    if (s.last === t) return s.count;
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const next = s.last === y ? s.count + 1 : 1;
    write('streak', { count: next, last: t });
    return next;
  },

  // Journey progress
  journey() {
    return read('journey', { completed: [], stars: {}, passages: {}, gates: {}, lastStop: null });
  },
  saveJourney(j) { write('journey', j); },

  // Verse Vault
  vault() { return read('vault', {}); },
  saveVault(v) { write('vault', v); },

  // Settings
  theme() { return read('theme', 'system'); },
  setTheme(t) { write('theme', t); applyTheme(t); },
};

// ── Theme ────────────────────────────────────────────────────────────────────

export function applyTheme(mode = Store.theme()) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

// ── Content loading ──────────────────────────────────────────────────────────

const cache = new Map();
async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(path).then((r) => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  });
  cache.set(path, p);
  return p;
}

export const Content = {
  game(key) { return loadJSON(`data/${key}.json`); },

  /** Free-play items for a tier. Memory/Books store tiers as an object. */
  async tier(key, difficulty) {
    const d = await this.game(key);
    if (Array.isArray(d)) return d.filter((x) => x.difficulty === difficulty);
    return d[difficulty] || [];
  },

  async sections() { return loadJSON('data/journey/sections.json'); },

  async stops(folder) {
    const meta = await this.sections();
    const sec = meta.find((s) => s.folder === folder);
    if (!sec) return [];
    const files = MANIFEST[folder] || [];
    return Promise.all(files.map((f) => loadJSON(`data/journey/${folder}/${f}`)));
  },

  /** Every stop in canonical order, with its section attached. */
  async allStops() {
    if (this._all) return this._all;
    const secs = await this.sections();
    const out = [];
    for (const s of secs) {
      const stops = await this.stops(s.folder);
      stops.forEach((st) => out.push({ ...st, section: s }));
    }
    this._all = out;
    return out;
  },

  async stop(id) {
    return (await this.allStops()).find((s) => s.id === id) || null;
  },
};

/** Filled in at boot from data/journey/manifest.json (static hosting has no directory listing). */
export let MANIFEST = {};
export async function loadManifest() {
  MANIFEST = await loadJSON('data/journey/manifest.json');
  return MANIFEST;
}

// ── KJV ──────────────────────────────────────────────────────────────────────

const BOOK_NAMES = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
  JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth', '1SA': '1 Samuel', '2SA': '2 Samuel',
  '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs',
  ECC: 'Ecclesiastes', SNG: 'Song of Solomon', ISA: 'Isaiah', JER: 'Jeremiah',
  LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea', JOL: 'Joel',
  AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah', MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk',
  ZEP: 'Zephaniah', HAG: 'Haggai', ZEC: 'Zechariah', MAL: 'Malachi', MAT: 'Matthew',
  MRK: 'Mark', LUK: 'Luke', JHN: 'John', ACT: 'Acts', ROM: 'Romans', '1CO': '1 Corinthians',
  '2CO': '2 Corinthians', GAL: 'Galatians', EPH: 'Ephesians', PHP: 'Philippians',
  COL: 'Colossians', '1TH': '1 Thessalonians', '2TH': '2 Thessalonians', '1TI': '1 Timothy',
  '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James',
  '1PE': '1 Peter', '2PE': '2 Peter', '1JN': '1 John', '2JN': '2 John', '3JN': '3 John',
  JUD: 'Jude', REV: 'Revelation',
};

export const bookName = (code) => BOOK_NAMES[code] || code;

/** Tidy joined verse text — the web twin of BibleService.cleaned. */
function cleanVerse(text) {
  return text
    .replace(/¶/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

export const Bible = {
  async chapter(book, chap) {
    const raw = await loadJSON(`data/bible/${book}/${chap}.json`);
    const out = [];
    for (const item of raw.chapter.content) {
      if (item.type !== 'verse') continue;
      // Verse content mixes plain strings with {text, poem} / {text, wordsOfJesus}
      // objects. Reading only the strings blanks all of Psalms and much of the
      // Gospels — the exact bug that shipped in iOS 2.1.2.
      const parts = (item.content || []).map((p) =>
        typeof p === 'string' ? p : (p && p.text) || ''
      ).filter(Boolean);
      out.push({ book, chapter: chap, verse: item.number, text: cleanVerse(parts.join(' ')) });
    }
    return out;
  },

  /** "GEN.1.1", "GEN.1.1-5", "GEN.1.1-2.3" */
  parseRef(ref) {
    const [left, right] = String(ref).split('-');
    const L = left.split('.');
    if (L.length !== 3) return null;
    const book = L[0], c1 = +L[1], v1 = +L[2];
    let c2 = c1, v2 = v1;
    if (right) {
      const R = right.split('.');
      if (R.length === 1) v2 = +R[0];
      else { c2 = +R[0]; v2 = +R[1]; }
    }
    return { book, c1, v1, c2, v2 };
  },

  async passage(ref) {
    const p = this.parseRef(ref);
    if (!p || p.c2 < p.c1) return [];
    const out = [];
    for (let c = p.c1; c <= p.c2; c++) {
      const verses = await this.chapter(p.book, c);
      for (const v of verses) {
        const afterStart = c > p.c1 || v.verse >= p.v1;
        const beforeEnd = c < p.c2 || v.verse <= p.v2;
        if (afterStart && beforeEnd) out.push(v);
      }
    }
    return out;
  },

  displayRef(ref) {
    const p = this.parseRef(ref);
    if (!p) return ref;
    const base = `${bookName(p.book)} ${p.c1}:${p.v1}`;
    if (p.c1 === p.c2 && p.v1 === p.v2) return base;
    if (p.c1 === p.c2) return `${base}-${p.v2}`;
    return `${base}-${p.c2}:${p.v2}`;
  },
};

// ── DOM helpers ──────────────────────────────────────────────────────────────

/** el('div.card', {onclick}, [children]) — terse element builder. */
export function el(spec, props = {}, children = []) {
  const [tag, ...classes] = String(spec).split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') node.className += ` ${v}`;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (arr, n) => shuffle(arr).slice(0, n);

/** Small haptic-ish feedback: a short vibration where supported. */
export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch {} };

export function button(label, { cls = 'btn', onclick, style, disabled, html } = {}) {
  const b = el(`button.${cls.split(' ').join('.')}`, { onclick, style, html });
  if (!html) b.textContent = label;
  if (disabled) b.disabled = true;
  return b;
}
