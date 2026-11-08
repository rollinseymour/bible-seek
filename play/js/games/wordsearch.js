// Word Search — hunt every word hidden in a generated letter grid.
//
// Follows the trivia.js contract, with two things worth knowing:
//  • the board is built here, by the placer ported from WordSearchGame.swift;
//  • it reports gateAccuracy, because the round only ends once every word is
//    found, so correctRounds/totalRounds would always be a perfect 1.0.

import { Content, MULTIPLIER, el, clear, shuffle, sample, buzz, gameFor } from '../core/core.js';

const PER_LETTER = 5;
const CLEAR_BONUS = 50;
const SIZE = { easy: 8, medium: 10, hard: 12 };

// Eight directions, grouped so a board mixes orientations instead of piling
// every word into one (the Swift placer rotates through these categories too).
const CATEGORIES = [
  [[0, 1], [0, -1]],
  [[1, 0], [-1, 0]],
  [[1, 1], [1, -1], [-1, 1], [-1, -1]],
];

// ── Find colours ─────────────────────────────────────────────────────────────

/** Hue of a hex colour, 0..360. */
function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0)
    : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

/** HSL→RGB triple; s and l are 0..1. */
function hsl(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

// Each find takes the next colour so every word reads as its own. The hues are
// spun off the game's own accent rather than a second hard-coded palette, and
// the fixed lightness keeps all eight above 3.9:1 against the white cell text.
const PALETTE = Array.from({ length: 8 }, (_, i) =>
  hsl((hueOf(gameFor('wordsearch').color) + i * 45) % 360, 0.55, 0.34));

const css = ([r, g, b]) => `rgb(${r} ${g} ${b})`;
/** Mean of the colours running through a cell, so a crossing reads as both. */
const blend = (list) => list.length === 1 ? list[0]
  : list.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0])
    .map((v) => Math.round(v / list.length));

// ── Board ────────────────────────────────────────────────────────────────────

async function resolve(difficulty, story) {
  const curated = story?.wordSearchPuzzles;
  if (curated?.length) {
    // Journey gives one board and no tier; size it to the longest word so a
    // five-year-old's puzzle is never cramped and never a 20×20 wall either.
    const longest = Math.max(...curated[0].words.map((w) => w.length));
    return { ...curated[0], size: Math.min(Math.max(longest + 2, 8), 20) };
  }
  const pool = await Content.tier('wordsearch', difficulty);
  const board = sample(pool, 1)[0];
  return board ? { ...board, size: SIZE[difficulty] || 10 } : null;
}

/**
 * Place the words longest-first, then flood the gaps with decoy letters.
 * Crossings may share a letter; conflicting overlaps are rejected; a word with
 * nowhere left to go is dropped from the round, exactly as on iOS.
 */
function generate(words, n) {
  const grid = Array.from({ length: n }, () => Array(n).fill(''));
  const placed = [];

  const fits = (w, r, c, dr, dc) => {
    for (let i = 0; i < w.length; i++) {
      const rr = r + i * dr, cc = c + i * dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) return false;
      const have = grid[rr][cc];
      if (have && have !== w[i]) return false;
    }
    return true;
  };

  const put = (w, r, c, dr, dc) => {
    const cells = [];
    for (let i = 0; i < w.length; i++) {
      const rr = r + i * dr, cc = c + i * dc;
      grid[rr][cc] = w[i];
      cells.push(rr * n + cc);
    }
    placed.push({ word: w, cells });
  };

  const queue = [...new Set(words.map((w) => w.toUpperCase().replace(/[^A-Z]/g, '')))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  queue.forEach((word, i) => {
    const pref = i % CATEGORIES.length;
    const dirs = shuffle(CATEGORIES[pref]).concat(...CATEGORIES.filter((_, k) => k !== pref));
    for (const [dr, dc] of dirs) {
      for (let t = 0; t < 60; t++) {
        const r = Math.floor(Math.random() * n), c = Math.floor(Math.random() * n);
        if (fits(word, r, c, dr, dc)) { put(word, r, c, dr, dc); return; }
      }
    }
    // Random darts miss the handful of legal slots a 12-letter word has in a
    // 12-wide grid, so sweep the board before giving up on it.
    for (const [dr, dc] of shuffle(dirs)) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (fits(word, r, c, dr, dc)) { put(word, r, c, dr, dc); return; }
        }
      }
    }
  });

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!grid[r][c]) grid[r][c] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    }
  }
  return { grid, placed };
}

// ── Play ─────────────────────────────────────────────────────────────────────

export async function play(host, { difficulty, story, finish }) {
  const puzzle = await resolve(difficulty, story);
  const n = puzzle?.size || 0;
  const { grid, placed } = puzzle ? generate(puzzle.words, n) : { grid: [], placed: [] };
  if (!placed.length) {
    clear(host).append(el('div.empty', { text: 'No puzzle available.' }));
    return;
  }

  const words = placed.map((p) => p.word).sort();
  const total = words.length;
  const title = puzzle.category || 'Bible words';
  const mult = story ? 1 : MULTIPLIER[difficulty];   // Journey gates are untiered
  const calm = matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let score = 0, misses = 0, over = false;
  const found = new Map();        // word → its colour
  const inked = new Map();        // cell index → colours of every word through it
  let nextColor = 0;

  // ── View. Built once: a drag repaints cells many times a second, so
  // selection toggles classes instead of re-rendering the board.
  clear(host);

  const countEl = el('span', { role: 'status', 'aria-live': 'polite' });
  const scoreEl = el('strong');
  const barFill = el('i');
  host.append(
    el('div.progress-row', {}, [countEl, scoreEl]),
    el('div.bar', {}, [barFill]),
  );

  const gridEl = el('div.ws-grid', {
    role: 'group',
    'aria-label': `${title} word search, ${n} by ${n} letters`,
    style: { gridTemplateColumns: `repeat(${n}, 1fr)` },
  });
  // Letters are sized from the board's own width (see app.css) — one fixed px
  // size is either tiny on an 8×8 board or illegible on a 12×12 at phone width.
  gridEl.style.setProperty('--ws-letter', `${(46 / n).toFixed(2)}cqw`);

  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const cell = el('div.ws-cell', {
        role: 'button',
        tabindex: i === 0 ? 0 : -1,
        'data-i': i,
        'aria-label': `${grid[r][c]}, row ${r + 1} column ${c + 1}`,
        text: grid[r][c],
      });
      cells.push(cell);
      gridEl.append(cell);
    }
  }
  host.append(gridEl);

  const chips = new Map();
  const wordsEl = el('div.ws-words');
  words.forEach((w) => {
    const chip = el('span.ws-word', { text: w });
    chips.set(w, chip);
    wordsEl.append(chip);
  });
  host.append(wordsEl);

  host.append(el('p.muted.small.center', {
    style: { marginTop: '12px' },
    text: 'Drag across a word, or tap its first letter then its last. Words run across, down, diagonally and backwards.',
  }));

  refresh();

  // ── Selection ──────────────────────────────────────────────────────────────

  let sel = [];          // cells under the live selection
  let anchor = null;     // a committed tap-start, waiting for its tap-end
  let down = null;       // cell the current pointer went down on
  let last = null;       // last cell the pointer was genuinely over
  let moved = false;     // this gesture left its starting cell → it's a drag
  let cursor = 0;        // roving tabindex for keyboard play

  /** Geometric hit test, so gaps, padding and borders stay a CSS concern. */
  function cellAt(x, y) {
    const node = document.elementFromPoint(x, y);
    const cell = node?.closest?.('.ws-cell');
    return cell?.parentElement === gridEl ? Number(cell.dataset.i) : null;
  }

  /** Cell under the pointer, holding the last one while it crosses a gap. */
  function track(e) {
    const i = cellAt(e.clientX, e.clientY);
    if (i != null) last = i;
    return last;
  }

  /** Snap a free drag to the nearest of the 8 straight runs — small fingers
   *  rarely trace an exact diagonal. Mirrors snappedLine in the Swift. */
  function line(from, to) {
    const r0 = Math.floor(from / n), c0 = from % n;
    const dr = Math.floor(to / n) - r0, dc = (to % n) - c0;
    if (!dr && !dc) return [from];
    const ar = Math.abs(dr), ac = Math.abs(dc);
    let sr, sc, steps;
    if (ac * 2 <= ar) { sr = Math.sign(dr); sc = 0; steps = ar; }
    else if (ar * 2 <= ac) { sr = 0; sc = Math.sign(dc); steps = ac; }
    else { sr = Math.sign(dr); sc = Math.sign(dc); steps = Math.max(ar, ac); }

    const run = [];
    for (let i = 0; i <= steps; i++) {
      const r = r0 + i * sr, c = c0 + i * sc;
      if (r < 0 || r >= n || c < 0 || c >= n) break;
      run.push(r * n + c);
    }
    return run;
  }

  function paint(next) {
    for (const i of sel) if (!next.includes(i)) cells[i].classList.remove('sel');
    for (const i of next) cells[i].classList.add('sel');
    sel = next;
  }

  gridEl.addEventListener('pointerdown', (e) => {
    if (over) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i == null) return;
    // Capture keeps the drag alive when the finger wanders off the board; a
    // pointer the browser no longer tracks simply refuses it.
    try { gridEl.setPointerCapture(e.pointerId); } catch {}
    down = i; last = i; moved = false;
    paint(anchor == null ? [i] : line(anchor, i));
  });

  gridEl.addEventListener('pointermove', (e) => {
    if (over || down == null) return;
    const i = track(e);
    if (i !== down) moved = true;
    paint(moved ? line(down, i) : anchor == null ? [down] : line(anchor, down));
  });

  gridEl.addEventListener('pointerup', (e) => {
    if (over || down == null) return;
    const end = track(e);
    const start = down;
    down = null;

    if (moved) {                 // a drag stands on its own; drop any tap anchor
      anchor = null;
      const run = line(start, end);
      paint([]);
      commit(run);
      return;
    }
    if (anchor == null) {        // first tap arms the word's first letter
      anchor = start;
      paint([start]);
      buzz(8);
      return;
    }
    if (anchor === start) {      // tapping the anchor again cancels it
      anchor = null;
      paint([]);
      return;
    }
    const run = line(anchor, start);
    anchor = null;
    paint([]);
    commit(run);
  });

  gridEl.addEventListener('pointercancel', () => {
    down = null; moved = false;
    paint(anchor == null ? [] : [anchor]);
  });

  const STEPS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

  gridEl.addEventListener('keydown', (e) => {
    if (over) return;
    const step = STEPS[e.key];
    if (step) {
      e.preventDefault();
      const r = Math.min(n - 1, Math.max(0, Math.floor(cursor / n) + step[0]));
      const c = Math.min(n - 1, Math.max(0, (cursor % n) + step[1]));
      cells[cursor].tabIndex = -1;
      cursor = r * n + c;
      cells[cursor].tabIndex = 0;
      cells[cursor].focus();
      paint(anchor == null ? [] : line(anchor, cursor));
      return;
    }
    if (e.key === 'Escape' && anchor != null) {
      anchor = null;
      paint([]);
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (anchor == null) { anchor = cursor; paint([cursor]); return; }
    if (anchor === cursor) { anchor = null; paint([]); return; }
    const run = line(anchor, cursor);
    anchor = null;
    paint([]);
    commit(run);
  });

  // ── Outcome ────────────────────────────────────────────────────────────────

  /** Judge a finished selection. Letters are matched in either direction, as on
   *  iOS, so a word stumbled upon by accident still counts. */
  function commit(run) {
    if (run.length < 2) return;
    const letters = run.map((i) => grid[Math.floor(i / n)][i % n]).join('');
    const backwards = [...letters].reverse().join('');
    const word = words.find((w) => !found.has(w) && (w === letters || w === backwards));
    if (!word) {
      misses += 1;
      buzz(40);
      return;
    }

    const color = PALETTE[nextColor++ % PALETTE.length];
    found.set(word, color);
    for (const i of run) {
      const list = inked.get(i) || [];
      list.push(color);
      inked.set(i, list);
      cells[i].classList.add('found');
      cells[i].style.background = css(blend(list));
      if (!calm) cells[i].animate?.([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], 220);
    }
    score += PER_LETTER * word.length * mult;
    buzz(14);
    refresh();
    if (found.size === total) end();
  }

  function refresh() {
    countEl.textContent = `${title} · ${found.size} of ${total} found`;
    scoreEl.textContent = `Score: ${score}`;
    barFill.style.width = `${(found.size / total) * 100}%`;
    for (const [word, chip] of chips) {
      const color = found.get(word);
      if (!color || chip.classList.contains('hit')) continue;
      chip.classList.add('hit');
      chip.style.color = css(color);
      chip.style.borderColor = css(color);
    }
  }

  function end() {
    if (over) return;
    over = true;
    score += CLEAR_BONUS * mult;
    refresh();
    buzz(60);

    // One stray drag per word is normal hunting; past that the board was a
    // struggle and the gate star should say so.
    const allowance = Math.max(total, 1);
    const gateAccuracy = Math.max(0.3, 1 - Math.max(0, misses - allowance) / (allowance * 2));
    const outcome = { score, totalRounds: total, correctRounds: total, gateAccuracy };

    // Let the last word's colour land before the results screen takes over. If
    // the player has navigated away by then the round is simply abandoned.
    setTimeout(() => { if (host.isConnected) finish(outcome); }, 520);
  }
}
