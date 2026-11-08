// Bible Hangman — the web twin of Games/HangmanGame.swift.
//
// 10 words per round; six wrong guesses end the word. A solve is worth
// (10 + (6 − wrong) × 5) × multiplier, so quick solves score higher.

import { Content, MULTIPLIER, gameFor, el, clear, sample, buzz, button } from '../core/core.js';

const PER_ROUND = 10;
const MAX_WRONG = 6;
const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const ACCENT = gameFor('hangman').color;

const isLetter = (ch) => ch >= 'A' && ch <= 'Z';
const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, var(--card))`;

async function resolve(difficulty, story) {
  // Journey gate: untiered — play exactly the words this story provides.
  if (story?.hangmanWords) return story.hangmanWords.slice(0, PER_ROUND);
  const pool = await Content.tier('hangman', difficulty);
  return sample(pool, Math.min(PER_ROUND, pool.length));
}

/** Gallows plus a plain stick figure, one part per wrong guess (iOS proportions). */
function figureSVG(wrong) {
  const part = (n, markup) => (wrong >= n ? markup : '');
  return `<svg viewBox="0 0 160 160" width="180" height="180" aria-hidden="true"
    fill="none" stroke-width="3" stroke-linecap="round" style="max-width:100%;height:auto">
    <path stroke="var(--on-muted)" d="M20 150 H140 M50 150 V20 H80 V40"/>
    <g stroke="var(--on-scaffold)">
      ${part(1, '<circle cx="80" cy="55" r="15"/>')}
      ${part(2, '<path d="M80 70 V110"/>')}
      ${part(3, '<path d="M80 80 L55 95"/>')}
      ${part(4, '<path d="M80 80 L105 95"/>')}
      ${part(5, '<path d="M80 110 L60 135"/>')}
      ${part(6, '<path d="M80 110 L100 135"/>')}
    </g>
  </svg>`;
}

export async function play(host, { difficulty, story, finish }) {
  const words = await resolve(difficulty, story);
  if (!words.length) {
    clear(host).append(el('div.empty', { text: 'No words available.' }));
    return;
  }

  const mult = story ? 1 : MULTIPLIER[difficulty];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let index = 0, score = 0, correct = 0;
  let guessed = new Set(), wrong = 0, over = false, ended = false;
  let figureNode = null;

  const letters = () => [...String(words[index].word).toUpperCase()];
  // Hints and words are hand-authored, so a stray hyphen or space must not make
  // a word unsolvable: only letters have keys, so only letters have to be found.
  const needed = () => letters().filter(isLetter);
  const solved = () => needed().every((ch) => guessed.has(ch));

  window.addEventListener('keydown', onKey);
  render();

  function render() {
    const { word, hint } = words[index];
    clear(host);

    host.append(el('div.progress-row', {}, [
      el('span', { text: `Word ${index + 1} of ${words.length}` }),
      el('strong', { style: { color: ACCENT }, text: `Score: ${score}` }),
    ]));
    host.append(el('div.bar', {}, [
      el('i', { style: { width: `${((index + 1) / words.length) * 100}%` } }),
    ]));

    figureNode = el('div.center', { html: figureSVG(wrong) });
    host.append(figureNode);

    host.append(el('div.explain', {
      style: { background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` },
    }, [
      el('strong', { style: { color: ACCENT }, text: 'Hint: ' }),
      el('em', { text: hint }),
    ]));

    host.append(wordRow());
    host.append(el('p.small.center', {
      style: { marginTop: '10px', color: wrong >= MAX_WRONG - 1 ? 'var(--error)' : 'var(--on-muted)' },
      text: `Wrong: ${wrong} / ${MAX_WRONG}`,
    }));

    if (over) {
      const won = solved();
      host.append(el('div.q-card', {
        style: { marginTop: '14px', color: won ? 'var(--success)' : 'var(--error)' },
        text: won ? '✓  Correct!' : `✕  The word was: ${String(word).toUpperCase()}`,
      }));
      const last = index + 1 >= words.length;
      host.append(el('div.actions', {}, [
        button(last ? 'See results' : 'Next word', { cls: 'btn primary', onclick: next }),
      ]));
    } else {
      host.append(keyboard());
    }
  }

  function wordRow() {
    const chars = letters();
    const row = el('div.hang-word', {
      role: 'img',
      'aria-label': chars.map((ch) => (over || guessed.has(ch) || !isLetter(ch) ? ch : 'blank')).join(' '),
      style: {
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: '10px 8px', letterSpacing: '0',
        // Long words (up to 15 letters in free play) must still fit a phone.
        fontSize: chars.length > 9 ? '21px' : '26px',
      },
    });
    chars.forEach((ch) => {
      const shown = guessed.has(ch) || !isLetter(ch);
      const missed = over && !shown;
      row.append(el('span', {
        style: {
          minWidth: '0.95em', textAlign: 'center',
          borderBottom: isLetter(ch) ? '2px solid' : 'none',
          borderColor: missed ? 'var(--error)' : 'var(--on-muted)',
          color: missed ? 'var(--error)' : 'var(--on-scaffold)',
        },
        text: shown || over ? ch : ' ',
      }));
    });
    return row;
  }

  function keyboard() {
    const inWord = new Set(needed());
    const keys = el('div.keys');
    ALPHABET.forEach((ch) => {
      const used = guessed.has(ch);
      const hit = used && inWord.has(ch);
      const k = el('button.key', {
        style: {
          minHeight: '44px',
          background: used ? (hit ? tint('var(--success)', 34) : 'var(--card)') : tint(ACCENT, 14),
          color: hit ? 'var(--success)' : used ? 'var(--on-muted)' : 'var(--on-scaffold)',
          borderColor: hit ? 'var(--success)' : 'var(--rule)',
          // Found letters stay legible; .key[disabled] would fade them out too.
          opacity: hit ? '1' : used ? '.34' : '1',
        },
        text: ch,
        onclick: () => guess(ch),
      });
      if (used) k.disabled = true;
      keys.append(k);
    });
    return keys;
  }

  function guess(ch) {
    if (over || guessed.has(ch)) return;
    guessed.add(ch);
    const hit = needed().includes(ch);
    if (!hit) wrong += 1;

    if (solved()) {
      score += (10 + (MAX_WRONG - wrong) * 5) * mult;
      correct += 1;
      over = true;
      buzz(14);
    } else if (wrong >= MAX_WRONG) {
      over = true;
      buzz(40);
    } else {
      buzz(hit ? 10 : 30);
    }

    render();
    if (!hit && !calm) {
      figureNode.animate?.(
        [{ transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
        200,
      );
    }
  }

  function next() {
    if (ended) return;
    if (index + 1 >= words.length) {
      ended = true;
      window.removeEventListener('keydown', onKey);
      finish({ score, totalRounds: words.length, correctRounds: correct });
      return;
    }
    index += 1;
    guessed = new Set();
    wrong = 0;
    over = false;
    render();
  }

  function onKey(e) {
    // The scaffold swaps the host out for the results screen, so a listener that
    // outlives this round would keep answering keys for a game nobody can see.
    if (!host.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ch = e.key.length === 1 ? e.key.toUpperCase() : '';
    if (isLetter(ch)) { e.preventDefault(); guess(ch); }
  }
}
