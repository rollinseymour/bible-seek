// Verse Scramble — the words of a verse, shuffled, tapped back into order.
//
// Ported from Games/ScrambleGame.swift, including the thing that makes it work:
// it is TAP-TO-LOCK. Only the next correct word can be placed, and a wrong tap
// is refused rather than committed — so scripture is never shown in the wrong
// order, and a verse is built out of small confirmations instead of one verdict
// at the end. Hints are a Journey affordance only: those rounds are untiered
// and have to suit the youngest player.

import { Content, MULTIPLIER, el, clear, shuffle, sample, buzz, button, gameFor } from '../core/core.js';

const PER_ROUND = 6;        // GameRound.scrambleVerses
const MAX_HINTS = 3;        // Journey only
const WRONG_PENALTY = 2;    // free play only — a Journey stop is never marked
const HINT_PENALTY = 3;     // kept from iOS: free play deducts, but has no hints to spend
/** A verse still counts toward accuracy — and so toward stars — within this
 *  much fumbling. A child who is learning shouldn't lose a star over two taps. */
const FORGIVEN_WRONG = 2;
const FORGIVEN_HINTS = 1;

const ACCENT = gameFor('scramble').color;
const tint = (pct) => `color-mix(in srgb, ${ACCENT} ${pct}%, transparent)`;

async function resolve(difficulty, story) {
  // Journey gate: untiered — play exactly what this story provides.
  if (story?.scrambleVerses) return story.scrambleVerses;
  // Free play draws a handful from the tier, not the whole tier, so a round ends
  // while a child still wants another one and the next round isn't the same one.
  const pool = await Content.tier('scramble', difficulty);
  return sample(pool, Math.min(PER_ROUND, pool.length));
}

export async function play(host, { difficulty, story, finish }) {
  const verses = await resolve(difficulty, story);
  if (!verses.length) {
    clear(host).append(el('div.empty', { text: 'No verses available.' }));
    return;
  }

  const journey = !!story;   // Journey coaches; only free play deducts.
  let index = 0, score = 0, correct = 0;
  const cleanliness = [];    // per-verse 0..1, averaged for the gate

  // Per-verse state. Since only the correct word can ever be placed, the answer
  // so far is always words.slice(0, placed) — a count is the whole of it.
  let words, bank, used, placed, wrongTaps, hints, lost, earned;

  // Live nodes. A tap repaints what changed instead of rebuilding the bank: a
  // rebuild would drop keyboard focus in the middle of a verse.
  let scoreEl, answerBox, promptEl, coachSlot, hintSlot, chipEls;
  const nudgeTimers = new WeakMap();

  setup();
  render();

  function setup() {
    words = verses[index].text.split(/\s+/).filter(Boolean);
    bank = shuffle(words);
    used = words.map(() => false);
    placed = 0; wrongTaps = 0; hints = 0; lost = 0; earned = 0;
  }

  function nextWord() { return placed < words.length ? words[placed] : null; }
  function promptText() { return placed === 0 ? 'Tap the word that starts the verse' : 'Tap the next word'; }

  function render() {
    const verse = verses[index];
    clear(host);

    scoreEl = el('strong', { style: { color: ACCENT }, text: `Score: ${score}` });
    host.append(el('div.progress-row', {}, [
      el('span', { text: `Verse ${index + 1} of ${verses.length}` }),
      scoreEl,
    ]));
    host.append(el('div.bar', {}, [
      el('i', { style: { width: `${((index + 1) / verses.length) * 100}%` } }),
    ]));
    host.append(el('div.verse-ref', {
      style: { color: ACCENT, background: tint(14) },
      text: verse.reference,
    }));

    host.append(el('div.label', { text: 'YOUR ANSWER' }));
    answerBox = el('div.answer-box', { 'aria-live': 'polite' });
    host.append(answerBox);
    paintPlaced();

    if (placed >= words.length) { host.append(doneBanner(verse)); return; }

    promptEl = el('p.muted.small', { text: promptText(), style: { marginTop: '12px' } });
    host.append(promptEl);

    const chips = el('div.chips.sc-bank');
    chipEls = bank.map((word, i) => {
      const chip = el('button.chip', {
        style: { background: tint(12), borderColor: ACCENT },
        onclick: () => tap(i),
      }, [word]);
      chips.append(chip);
      return chip;
    });
    host.append(chips);

    coachSlot = el('div', { 'aria-live': 'polite' });
    hintSlot = el('div', { style: { marginTop: '16px' } });
    host.append(coachSlot, hintSlot);
    if (journey) paintHint();
  }

  function paintPlaced() {
    clear(answerBox);
    for (let i = 0; i < placed; i++) answerBox.append(placedChip(words[i]));
  }

  /** A placed word is a kept word — it was right when it was tapped, so there
   *  is nothing to undo and nothing to lose. */
  function placedChip(word) { return el('span.chip.sc-placed', { text: word }); }

  function tap(i) {
    if (placed >= words.length || used[i]) return;

    if (bank[i] !== nextWord()) {
      wrongTaps += 1;
      nudge(chipEls[i]);
      buzz(40);
      if (!journey) {
        lost += WRONG_PENALTY;
        score = Math.max(0, score - WRONG_PENALTY);
        scoreEl.textContent = `Score: ${score}`;
      }
      paintCoach();
      return;
    }
    lock(i);
  }

  function lock(i) {
    used[i] = true;
    const chip = chipEls[i];
    chip.classList.remove('sc-nudge');
    chip.classList.add('used');
    // aria-disabled, not `disabled`: a disabled button loses focus, which would
    // throw a keyboard player back to the top of the bank on every word.
    chip.setAttribute('aria-disabled', 'true');

    placed += 1;
    answerBox.append(placedChip(bank[i]));
    buzz(12);
    if (placed >= words.length) completeVerse();
    else promptEl.textContent = promptText();
  }

  /** Refused, not placed — so the chip itself has to say "not that one" and
   *  then settle back, rather than stay marked. */
  function nudge(chip) {
    clearTimeout(nudgeTimers.get(chip));
    chip.classList.remove('sc-nudge');
    void chip.offsetWidth;   // restart the animation when the same chip is tapped twice
    chip.classList.add('sc-nudge');
    nudgeTimers.set(chip, setTimeout(() => chip.classList.remove('sc-nudge'), 420));
  }

  /** Names the next step instead of the mistake, and in the Journey never
   *  mentions points, because none were taken. */
  function paintCoach() {
    clear(coachSlot).append(el('div.sc-coach', {
      text: journey
        ? 'Not that one yet — listen for what comes next.'
        : `Not that one yet — ${lost} points so far.`,
    }));
  }

  function paintHint() {
    const left = MAX_HINTS - hints;
    clear(hintSlot).append(button(left > 0 ? `Show me the next word · ${left}` : 'No hints left', {
      cls: 'btn gold', disabled: left === 0, onclick: useHint,
    }));
  }

  /** Place the next correct word for a child who is stuck. With tap-to-lock
   *  there is never a wrong run to clear out first. */
  function useHint() {
    if (!journey || hints >= MAX_HINTS || placed >= words.length) return;
    const want = nextWord();
    const slot = bank.findIndex((word, i) => !used[i] && word === want);
    if (slot < 0) return;

    hints += 1;
    if (!journey) { lost += HINT_PENALTY; score = Math.max(0, score - HINT_PENALTY); }
    lock(slot);
    if (placed < words.length) paintHint();   // completeVerse() re-renders and drops the slot
  }

  function completeVerse() {
    const award = 15 * MULTIPLIER[difficulty];
    score += award;
    earned = Math.max(0, award - lost);   // display only; the deductions already landed
    if (wrongTaps <= FORGIVEN_WRONG && hints <= FORGIVEN_HINTS) correct += 1;
    // Every mis-tap costs a slice of this verse rather than all of it, so a
    // two-verse gate judged pass/fail never blocks a star on one messy moment.
    cleanliness.push(Math.max(0.25, 1 - wrongTaps * 0.15 - hints * 0.10));
    buzz(18);
    render();
  }

  function doneBanner(verse) {
    const clean = wrongTaps === 0 && hints === 0;
    const last = index + 1 >= verses.length;
    const praise = clean ? 'Perfect!' : 'You got it!';
    return el('div.sc-done', {}, [
      el('div.sc-done-head', { text: earned > 0 ? `✓  ${praise}  +${earned} points` : `✓  ${praise}` }),
      el('div.sc-done-text', { text: verse.text }),
      button(last ? 'See results' : 'Next verse', { cls: 'btn primary', onclick: nextVerse }),
    ]);
  }

  function nextVerse() {
    if (index + 1 >= verses.length) {
      const avg = cleanliness.length
        ? cleanliness.reduce((a, b) => a + b, 0) / cleanliness.length
        : 1;
      finish({ score, totalRounds: verses.length, correctRounds: correct, gateAccuracy: avg });
      return;
    }
    index += 1;
    setup();
    render();
  }
}
