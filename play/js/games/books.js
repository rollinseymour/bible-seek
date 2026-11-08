// Books of the Bible — put the canon back in order against the clock.
//
// Contract as in trivia.js. Journey never gates on this game; if a story ever
// arrives anyway the round is played untiered on the easy (New Testament) list.
//
// Mirrors Games/BooksGame.swift: three checks, every correctly placed book
// locks into its slot, and each later check is worth less (×1 / ×0.7 / ×0.4).
// Two deliberate differences, both from the web brief: a hit pays 10 ×
// multiplier instead of iOS's 4, and the time factor iOS dropped returns as a
// plain bonus on a perfect order, so the running clock is worth watching.

import { Content, MULTIPLIER, el, clear, shuffle, buzz, button, gameFor } from '../core/core.js';

const MAX_ATTEMPTS = 3;
const ATTEMPT_MULT = [1, 0.7, 0.4];
const TIER_LABEL = { easy: 'New Testament', medium: 'Old Testament', hard: 'Complete Bible' };
/** Seconds per book before the perfect bonus fades; it reaches zero at twice that. */
const PAR_PER_BOOK = 6;
const PERFECT_BONUS = 25;

const ACCENT = gameFor('books').color;
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export async function play(host, { difficulty, story, finish }) {
  const answer = await Content.tier('books', story ? 'easy' : difficulty);
  if (answer.length < 2) {
    clear(host).append(el('div.empty', { text: 'No books available.' }));
    return;
  }

  const mult = MULTIPLIER[difficulty] ?? 1;
  const order = shuffle(answer);
  const locked = new Set();
  let attempts = 0, score = 0, hits = 0, answered = false, marked = false, done = false;
  let picked = null;    // tap-to-move: the book waiting for a destination
  let dragging = null;  // the book under the finger or mouse
  let clockEl = null, worthEl = null;

  const started = Date.now();
  let stopped = null;
  const elapsed = () => Math.floor(((stopped ?? Date.now()) - started) / 1000);

  render();

  const clock = setInterval(() => {
    // The scaffold throws this host away on finish or a back tap; die with it.
    if (!host.isConnected || answered) { clearInterval(clock); return; }
    clockEl.textContent = mmss(elapsed());
    worthEl.textContent = `Worth ${bestNextCheck()}`;
  }, 500);

  // ── Scoring ────────────────────────────────────────────────────────────────

  function timeBonus(secs) {
    const par = PAR_PER_BOOK * answer.length;
    const left = Math.max(0, 1 - Math.max(0, secs - par) / par);
    return Math.round(PERFECT_BONUS * mult * left);
  }

  /** What a flawless next check would pay — the iOS status row's "Worth". */
  function bestNextCheck() {
    const perfect = answer.length * 10 * mult + timeBonus(elapsed());
    return Math.round(perfect * ATTEMPT_MULT[Math.min(attempts, MAX_ATTEMPTS - 1)]);
  }

  function check() {
    if (answered) return;
    let got = 0;
    order.forEach((book, i) => {
      if (book !== answer[i]) return;
      got += 1;
      locked.add(book); // lock the hits in, so a retry only has to fix mistakes
    });
    const perfect = got === answer.length;
    attempts += 1;
    hits = got;
    marked = true;
    picked = null;
    if (perfect || attempts >= MAX_ATTEMPTS) { answered = true; stopped = Date.now(); clearInterval(clock); }

    const base = got * 10 * mult + (perfect ? timeBonus(elapsed()) : 0);
    // iOS replaces the score each check; keep the best instead, so a child is
    // never punished for going back and fixing a row.
    score = Math.max(score, Math.round(base * ATTEMPT_MULT[attempts - 1]));
    buzz(perfect ? 18 : 40);
    render();
  }

  function seeScore() {
    if (done) return; // one finish() per round, however hard the button is tapped
    done = true;
    clearInterval(clock);
    finish({ score, totalRounds: answer.length, correctRounds: hits });
  }

  // ── Reordering ─────────────────────────────────────────────────────────────

  /** Slots the player may still rearrange — a locked book owns its slot.
   *  Declared, like the other helpers here, so the first render() above can
   *  reach it before this line is evaluated. */
  function openSlots() {
    return order.map((_, i) => i).filter((i) => !locked.has(order[i]));
  }

  /** Lift the book at `from` and drop it at `to`, sliding the rest along. The
   *  move runs across the open slots only, so locked books never drift. */
  function moveTo(from, to) {
    if (answered || from === to) return false;
    const slots = openSlots();
    const a = slots.indexOf(from), b = slots.indexOf(to);
    if (a < 0 || b < 0) return false;
    const seq = slots.map((i) => order[i]);
    seq.splice(b, 0, seq.splice(a, 1)[0]);
    slots.forEach((slot, k) => { order[slot] = seq[k]; });
    marked = false; // the red borders described the arrangement we just changed
    return true;
  }

  function step(from, to, sel) {
    const refocus = host.contains(document.activeElement);
    if (!moveTo(from, to)) return;
    buzz(8);
    render();
    if (refocus) rowAt(to)?.querySelector(sel)?.focus({ preventScroll: true });
  }

  function tap(i) {
    const book = order[i];
    if (answered || locked.has(book)) return;
    if (picked === null || picked === book) {
      picked = picked === book ? null : book;
      buzz(8);
      render();
      return;
    }
    const from = order.indexOf(picked);
    picked = null;
    if (moveTo(from, i)) buzz(10);
    render();
    rowAt(i)?.scrollIntoView({ block: 'nearest' }); // the list runs to 66 rows
  }

  /** Reorder live under a dragged finger. Touch events keep firing at their
   *  original target after a re-render, so redrawing mid-drag is safe here —
   *  the HTML5 path below cannot re-render without cancelling its own drag. */
  function hoverTo(node) {
    if (!dragging || !node) return;
    if (moveTo(order.indexOf(dragging), Number(node.dataset.i))) { buzz(6); render(); }
  }

  function startTouch(e, book) {
    if (answered || locked.has(book)) return;
    e.preventDefault(); // claim the gesture so the page does not scroll with it
    dragging = book;
    render();
    const move = (ev) => {
      const t = ev.touches[0];
      if (!t) return;
      ev.preventDefault();
      const under = document.elementFromPoint(t.clientX, t.clientY);
      hoverTo(under && under.closest ? under.closest('.order-item') : null);
    };
    const end = () => {
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      dragging = null;
      render();
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function rowAt(i) { return host.querySelector(`.order-item[data-i="${i}"]`); }

  function render() {
    clear(host);
    host.append(statusRow());
    host.append(el('div.label', {
      style: { color: ACCENT },
      text: `${TIER_LABEL[story ? 'easy' : difficulty] ?? 'Canonical order'} · ${answer.length} books`,
    }));
    const list = el('div.order-list');
    order.forEach((book, i) => list.append(row(book, i)));
    host.append(list);
    host.append(footer());
  }

  function statusRow() {
    clockEl = el('span.bk-clock', { title: 'Time elapsed', text: mmss(elapsed()) });
    worthEl = el('strong', { text: answered ? `Score ${score}` : `Worth ${bestNextCheck()}` });
    return el('div.progress-row', {}, [
      el('span', {
        text: answered
          ? `${hits} of ${answer.length} right`
          : `Attempt ${Math.min(attempts + 1, MAX_ATTEMPTS)}/${MAX_ATTEMPTS}`,
      }),
      clockEl,
      worthEl,
    ]);
  }

  function row(book, i) {
    const held = locked.has(book);
    const fixed = answered || held;
    const slots = openSlots();
    const at = slots.indexOf(i);
    const up = at > 0 ? slots[at - 1] : -1;
    const down = at >= 0 && at < slots.length - 1 ? slots[at + 1] : -1;

    const node = el('div.order-item', {
      'data-i': i,
      class: [held ? 'ok' : marked ? 'no' : '', book === picked ? 'sel' : '', book === dragging ? 'bk-drag' : '']
        .filter(Boolean).join(' ') || null,
      draggable: fixed ? null : 'true',
    }, [
      el('span.num', { text: String(i + 1) }),
      el('button.bk-pick', {
        text: book,
        disabled: fixed ? '' : null,
        'aria-pressed': book === picked ? 'true' : 'false',
        'aria-label': held ? `${book} is in the right place`
          : picked && picked !== book ? `Move ${picked} to position ${i + 1}`
          : `Pick up ${book}`,
        onclick: () => tap(i),
        onkeydown: (e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          step(i, e.key === 'ArrowUp' ? up : down, '.bk-pick');
        },
      }),
      held ? el('span.bk-lock', { 'aria-hidden': 'true', text: '✓' }) : null,
      fixed ? null : el('div.bk-ctl', {}, [
        stepButton('▲', `Move ${book} up`, 'up', i, up),
        stepButton('▼', `Move ${book} down`, 'down', i, down),
        grip(book),
      ]),
    ]);

    if (!fixed) {
      node.addEventListener('dragstart', (e) => {
        dragging = book;
        node.classList.add('bk-drag');
        e.dataTransfer?.setData('text/plain', book); // Firefox will not start a drag without a payload
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      node.addEventListener('dragend', () => {
        if (!dragging) return;
        dragging = null;
        render();
      });
    }
    // Any row is a drop target, including a locked one: dropping onto it is a
    // no-op, which is kinder than a target that silently refuses the pointer.
    node.addEventListener('dragover', (e) => {
      if (!dragging) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    node.addEventListener('dragenter', () => {
      if (!dragging) return;
      host.querySelectorAll('.bk-over').forEach((n) => n.classList.remove('bk-over'));
      node.classList.add('bk-over');
    });
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      const to = i;
      const from = order.indexOf(dragging);
      dragging = null;
      moveTo(from, to);
      render();
    });
    return node;
  }

  function stepButton(glyph, label, dir, i, to) {
    const b = el('button.bk-step', {
      text: glyph,
      'data-dir': dir,
      'aria-label': label,
      disabled: to < 0 ? '' : null,
      onclick: () => step(i, to, `.bk-step[data-dir="${dir}"]`),
    });
    return b;
  }

  function grip(book) {
    const g = el('button.bk-grip', { text: '⠿', 'aria-label': `Drag ${book} to reorder`, draggable: 'true' });
    g.addEventListener('touchstart', (e) => startTouch(e, book), { passive: false });
    return g;
  }

  function footer() {
    const bar = el('div.bk-bar');
    if (answered) {
      bar.append(button(`${hits} of ${answer.length} correct · See score`, { cls: 'btn primary', onclick: seeScore }));
    } else {
      bar.append(button(`Check order · ${MAX_ATTEMPTS - attempts} left`, { cls: 'btn primary', onclick: check }));
      bar.append(el('p.muted.small.center', {
        text: 'Tap a book, then tap where it goes — or use the arrows. Correct books lock in place.',
      }));
    }
    return bar;
  }
}
