// Who Am I? — identify a Bible character from clues revealed one at a time.
//
// Follows the trivia.js contract. The whole mechanic is restraint: a correct
// guess pays (totalClues − cluesUsed + 1) × 10 × multiplier, so every extra
// clue costs ten points. Ported from Games/WhoAmIGame.swift.

import { Content, MULTIPLIER, gameFor, el, clear, shuffle, sample, buzz, button } from '../core/core.js';

const PER_ROUND = 8;                      // GameRound.whoAmICharacters
const ACCENT = gameFor('whoami').color;

/** Fix each character's four options once, so re-renders never move them. */
function prepare(chars) {
  return chars
    .filter((c) => c && c.name && c.clues?.length)
    .map((c) => ({ ...c, options: shuffle([c.name, ...(c.wrongChoices || [])]) }));
}

async function resolve(difficulty, story) {
  if (story?.whoAmIChars) return prepare(story.whoAmIChars);
  const pool = await Content.tier('characters', difficulty);
  return prepare(sample(pool, Math.min(PER_ROUND, pool.length)));
}

export async function play(host, { difficulty, story, finish }) {
  const chars = await resolve(difficulty, story);
  if (!chars.length) {
    clear(host).append(el('div.empty', { text: 'No characters available.' }));
    return;
  }

  let index = 0, clue = 0, score = 0, correct = 0, answered = false, picked = null;
  let fresh = false; // animate only the clue the player just asked for
  render();

  function render() {
    const c = chars[index];
    const worth = (c.clues.length - clue) * 10 * MULTIPLIER[difficulty];
    const moreClues = clue < c.clues.length - 1;
    clear(host);

    host.append(el('div.progress-row', {}, [
      el('span', { text: `Character ${index + 1} of ${chars.length}` }),
      el('strong', { style: { color: ACCENT }, text: `Score: ${score}` }),
    ]));
    host.append(el('div.bar', {}, [
      el('i', { style: { width: `${((index + 1) / chars.length) * 100}%` } }),
    ]));

    // Every render rebuilds the card, so an aria-live region here would be a
    // brand-new node and announce nothing. Focusing the new clue reads it out
    // and leaves Tab heading straight into the options.
    let newClue = null;
    host.append(el('div.q-card', {
      style: { background: `color-mix(in srgb, ${ACCENT} 12%, var(--card))` },
    }, [
      el('div.wai-head', { style: { color: ACCENT }, text: 'Who am I?' }),
      el('div.wai-clues', {}, c.clues.slice(0, clue + 1).map((text, i) => {
        const isNew = i === clue && fresh;
        const row = el(`div.wai-clue${isNew ? '.fresh' : ''}`, isNew ? { tabindex: '-1' } : {}, [
          el('span.n', { style: { color: ACCENT }, text: `${i + 1}.` }),
          el('span', { text }),
        ]);
        if (isNew) newClue = row;
        return row;
      })),
    ]));

    if (!answered) {
      host.append(el('p.muted.small.wai-worth', { text: `Guess now for ${worth} points.` }));
      if (moreClues) {
        host.append(button(`Show clue ${clue + 2} — fewer points`, {
          cls: 'btn',
          style: { color: ACCENT },
          onclick: () => { clue += 1; fresh = true; buzz(); render(); },
        }));
      }
    }

    host.append(el('div.label', { text: 'YOUR GUESS' }));

    const opts = el('div.options');
    c.options.forEach((name, i) => {
      const isAnswer = name === c.name;
      const cls = answered
        ? (isAnswer ? 'option correct' : name === picked ? 'option wrong' : 'option')
        : 'option';
      const b = el(`button.${cls.split(' ').join('.')}`, { onclick: () => guess(name) }, [
        el('span.letter', {
          style: { background: 'color-mix(in srgb, currentColor 16%, transparent)' },
          text: String.fromCharCode(65 + i),
        }),
        el('span', { text: name }),
        answered && isAnswer ? el('span', { text: '✓' }) : null,
        answered && name === picked && !isAnswer ? el('span', { text: '✕' }) : null,
      ]);
      if (answered) b.disabled = true;
      opts.append(b);
    });
    host.append(opts);

    if (answered) {
      const last = index + 1 >= chars.length;
      host.append(el('div.actions', {}, [
        button(last ? 'See results' : 'Next character', {
          cls: 'btn primary',
          onclick: () => {
            if (last) {
              finish({ score, totalRounds: chars.length, correctRounds: correct });
            } else {
              index += 1; clue = 0; answered = false; picked = null; render();
            }
          },
        }),
      ]));
    }

    newClue?.focus({ preventScroll: true });
    fresh = false;
  }

  function guess(name) {
    if (answered) return;
    const c = chars[index];
    answered = true;
    picked = name;
    if (name === c.name) {
      correct += 1;
      score += (c.clues.length - clue) * 10 * MULTIPLIER[difficulty];
      buzz(14);
    } else {
      buzz(40);
    }
    render();
  }
}
