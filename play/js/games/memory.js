// Memory Match — scripture references paired with the verse they point to.
//
// Follows the shared game contract (see trivia.js). Ported from
// Games/MemoryGame.swift: a memorize preview turns the whole board face-up,
// then the player taps two cards at a time until every pair is found.

import { Content, MULTIPLIER, el, clear, shuffle, sample, buzz, gameFor } from '../core/core.js';

const PAIRS = { easy: 6, medium: 8, hard: 10 };
const PREVIEW = { easy: 5, medium: 10, hard: 15 }; // seconds — bigger boards need longer
const FLIP_BACK = 800;
const ACCENT = gameFor('memory').color;

const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export async function play(host, { difficulty, story, finish }) {
  // The Journey never routes to Memory Match. If a gate ever does, play the
  // easy tier untiered rather than failing on a missing tier.
  const tier = story ? 'easy' : difficulty;
  const chosen = sample(await Content.tier('memory', tier), PAIRS[tier]);
  if (!chosen.length) {
    clear(host).append(el('div.empty', { text: 'No cards available.' }));
    return;
  }

  const deck = shuffle(chosen.flatMap((p, i) => [
    { pair: i, text: p.front, isRef: true },
    { pair: i, text: p.back, isRef: false },
  ]));
  const pairCount = chosen.length;
  const cols = pairCount <= 6 ? 3 : 4; // iOS: 3 columns on easy, 4 otherwise

  let phase = 'preview'; // 'preview' | 'play' | 'checking'
  let score = 0, moves = 0, matched = 0, left = PREVIEW[tier];
  let first = -1;        // index of the first card of the current attempt
  const faceUp = deck.map(() => false);
  const gone = deck.map(() => false);
  let flipTimer = 0;

  const info = el('span');
  const tally = el('strong');
  const fill = el('i');
  const cards = deck.map((_, i) => el('button.mem-card', { type: 'button', onclick: () => tap(i) }));

  clear(host).append(
    // Same header shape as the other games, in both phases, so the board never
    // shifts under the player's fingers when the preview ends.
    el('div.progress-row', {}, [info, tally]),
    el('div.bar', {}, [fill]),
    el('div.mem-grid', {
      style: {
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        maxWidth: `${cols * 152}px`,
        margin: '0 auto',
      },
    }, cards),
  );
  paintAll();

  const previewTimer = setInterval(() => {
    // The player can leave mid-round, which detaches the board but not the timer.
    if (!host.isConnected) { clearInterval(previewTimer); return; }
    left -= 1;
    if (left > 0) paintHead(); else endPreview();
  }, 1000);

  /** Every attempt past a perfect run costs a point. Charged live, so the
      results screen never surprises the player with a smaller number. */
  const net = () => Math.max(0, score - Math.max(0, moves - pairCount));

  function paintHead() {
    if (phase === 'preview') {
      info.textContent = 'Memorize the pairs · tap to begin';
      tally.textContent = `${left}s`;
      fill.style.width = `${(left / PREVIEW[tier]) * 100}%`;
    } else {
      info.textContent = `Pairs ${matched} of ${pairCount} · ${moves} ${moves === 1 ? 'move' : 'moves'}`;
      tally.textContent = `Score: ${net()}`;
      fill.style.width = `${(matched / pairCount) * 100}%`;
    }
  }

  function paintCard(i) {
    const card = deck[i], node = cards[i];
    const open = phase === 'preview' || faceUp[i] || gone[i];
    node.className = `mem-card${open ? ' up' : ''}${gone[i] ? ' gone' : ''}`;
    node.style.borderColor = open ? (gone[i] ? 'var(--success)' : ACCENT) : '';
    clear(node);
    if (open) {
      node.removeAttribute('aria-label');
      node.append(card.isRef
        ? el('span.mem-ref', { style: { color: ACCENT }, text: card.text })
        : el('span.mem-text', { text: card.text }));
    } else {
      // Face-down cards are indistinguishable, so give each one a spoken identity.
      node.setAttribute('aria-label', `Face-down card ${i + 1} of ${deck.length}`);
      node.append(el('span.mem-back', { text: '▣' }));
    }
  }

  /** Only matched cards leave play for good. The face-up card and the flip-back
      window are blocked by the guards in tap() instead, so a keyboard player
      does not lose focus — and their place in the board — on every flip. */
  function syncEnabled() {
    cards.forEach((node, i) => { node.disabled = gone[i]; });
  }

  function paintAll() {
    deck.forEach((_, i) => paintCard(i));
    syncEnabled();
    paintHead();
  }

  function endPreview() {
    clearInterval(previewTimer);
    if (phase !== 'preview') return;
    phase = 'play';
    paintAll();
  }

  function tap(i) {
    if (phase === 'preview') { endPreview(); return; } // the board itself is the start control
    if (phase === 'checking' || gone[i] || faceUp[i]) return;

    faceUp[i] = true;
    buzz();
    paintCard(i);

    if (first < 0) { first = i; return; }

    const a = first, b = i;
    first = -1;
    moves += 1;

    if (deck[a].pair === deck[b].pair) {
      gone[a] = gone[b] = true;
      matched += 1;
      score += 20 * MULTIPLIER[difficulty];
      buzz(14);
      pop(cards[a]); pop(cards[b]);
      paintCard(a); paintCard(b);
      syncEnabled();
      paintHead();
      if (matched === pairCount) complete();
      return;
    }

    // Hold the mismatch on screen long enough to read it, with the board locked.
    phase = 'checking';
    buzz(40);
    paintHead();
    flipTimer = setTimeout(() => {
      faceUp[a] = faceUp[b] = false;
      phase = 'play';
      paintCard(a); paintCard(b);
    }, FLIP_BACK);
  }

  /** Board cleared — the only way this game ends. */
  function complete() {
    clearInterval(previewTimer);
    clearTimeout(flipTimer);
    buzz(60);
    finish({ score: net(), totalRounds: pairCount, correctRounds: matched });
  }
}

function pop(node) {
  if (reduceMotion()) return;
  node.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], 220);
}
