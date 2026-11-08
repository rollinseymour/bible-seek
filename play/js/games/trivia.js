// Bible Trivia — the reference implementation for every web game.
//
// Contract (all seven games follow it):
//   export function play(host, { difficulty, story, finish })
//   • `story` is a Journey gate Challenge when launched from a stop, else null.
//     Journey content is UNTIERED — play exactly what the story provides.
//   • call finish({ score, totalRounds, correctRounds, gateAccuracy? }) when done.
//     gateAccuracy is optional and only for games whose whole-number count is
//     too coarse to judge a Journey gate fairly.

import { Content, MULTIPLIER, el, clear, shuffle, sample, buzz, button } from '../core/core.js';

const PER_ROUND = 10;

/** Shuffle each question's options so the answer never sits in a fixed slot. */
function shuffledOptions(qs) {
  return qs.map((q) => {
    const order = shuffle(q.options.map((_, i) => i));
    return {
      ...q,
      options: order.map((i) => q.options[i]),
      correctIndex: order.indexOf(q.correctIndex),
    };
  });
}

async function resolve(difficulty, story) {
  if (story?.triviaQuestions) return shuffledOptions(story.triviaQuestions);
  const pool = await Content.tier('trivia', difficulty);
  return shuffledOptions(sample(pool, Math.min(PER_ROUND, pool.length)));
}

export async function play(host, { difficulty, story, finish }) {
  const questions = await resolve(difficulty, story);
  if (!questions.length) {
    clear(host).append(el('div.empty', { text: 'No questions available.' }));
    return;
  }

  let index = 0, score = 0, correct = 0, answered = false, picked = -1;
  render();

  function render() {
    const q = questions[index];
    clear(host);

    host.append(el('div.progress-row', {}, [
      el('span', { text: `Question ${index + 1} of ${questions.length}` }),
      el('strong', { text: `Score: ${score}` }),
    ]));
    host.append(el('div.bar', {}, [
      el('i', { style: { width: `${((index + 1) / questions.length) * 100}%` } }),
    ]));
    host.append(el('div.q-card', { text: q.question }));

    const opts = el('div.options');
    q.options.forEach((text, i) => {
      const cls = answered
        ? (i === q.correctIndex ? 'option correct' : i === picked ? 'option wrong' : 'option')
        : 'option';
      const b = el(`button.${cls.split(' ').join('.')}`, {
        onclick: () => choose(i),
      }, [
        el('span.letter', {
          style: { background: 'color-mix(in srgb, currentColor 16%, transparent)' },
          text: String.fromCharCode(65 + i),
        }),
        el('span', { text }),
        answered && i === q.correctIndex ? el('span', { text: '✓' }) : null,
        answered && i === picked && i !== q.correctIndex ? el('span', { text: '✕' }) : null,
      ]);
      if (answered) b.disabled = true;
      opts.append(b);
    });
    host.append(opts);

    if (answered && q.explanation) host.append(el('div.explain', { text: q.explanation }));

    if (answered) {
      const last = index + 1 >= questions.length;
      host.append(el('div.actions', {}, [
        button(last ? 'See results' : 'Next question', {
          cls: 'btn primary',
          onclick: () => {
            if (last) {
              finish({ score, totalRounds: questions.length, correctRounds: correct });
            } else {
              index += 1; answered = false; picked = -1; render();
            }
          },
        }),
      ]));
    }
  }

  function choose(i) {
    if (answered) return;
    answered = true;
    picked = i;
    if (i === questions[index].correctIndex) {
      correct += 1;
      score += 10 * MULTIPLIER[difficulty];
      buzz(14);
    } else {
      buzz(40);
    }
    render();
  }
}
