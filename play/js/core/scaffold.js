// The shared game flow — the web twin of GameScaffold in GameFlow.swift.
//
// Every game is driven through the same sequence: pick a difficulty (free play
// only), a short countdown, the game's own view, then results and XP. Journey
// gate games skip the picker entirely: their content is fixed to the story's
// passages, so there is no tier to choose.

import { Store, MULTIPLIER, DIFFICULTIES, gameFor, el, clear, button, buzz } from './core.js';

/**
 * Mount a game.
 *
 * @param {HTMLElement} root  where to render
 * @param {object} opts
 *   game       – game key
 *   story      – a Journey gate Challenge, or null for free play
 *   stopId     – the Journey stop this gate belongs to (story mode)
 *   onDone     – called when the player leaves the results screen
 *   play       – (host, {difficulty, story, finish}) => void
 *                finish({score, totalRounds, correctRounds, gateAccuracy})
 */
export function runGame(root, { game, story = null, stopId = null, onDone, play }) {
  const meta = gameFor(game);
  let difficulty = 'easy';

  const host = el('div.game-host');
  clear(root).append(host);

  const phase = {
    choose() {
      clear(host).append(difficultyPicker());
    },
    countdown() {
      clear(host).append(countdownView(() => phase.playing()));
    },
    playing() {
      clear(host);
      play(host, { difficulty, story, finish: (outcome) => phase.results(outcome) });
    },
    results(outcome) {
      const award = recordCompletion(game, difficulty, outcome, story, stopId);
      clear(host).append(resultsView(outcome, award));
    },
  };

  // A Journey gate has no tier to pick — drop straight into the round.
  story ? phase.countdown() : phase.choose();

  function difficultyPicker() {
    const wrap = el('div.picker');
    wrap.append(
      el('div.picker-icon', { style: { background: meta.color + '22', color: meta.color } }, meta.icon),
      el('h2', { text: meta.name }),
      el('p.muted', { text: meta.blurb }),
      el('div.label', { text: 'CHOOSE DIFFICULTY' }),
    );
    const rows = el('div.tiers');
    DIFFICULTIES.forEach((d) => {
      rows.append(button('', {
        cls: 'tier',
        onclick: () => { difficulty = d; buzz(); phase.countdown(); },
        html: `<span class="tier-name">${d[0].toUpperCase() + d.slice(1)}</span>
               <span class="tier-mult">×${MULTIPLIER[d]} points</span>`,
      }));
    });
    wrap.append(rows);
    wrap.append(el('p.muted.small', { text: `Best: ${Store.high(game)}` }));
    return wrap;
  }

  function countdownView(done) {
    const wrap = el('div.countdown');
    const num = el('div.countdown-num', { text: '3' });
    wrap.append(el('div.countdown-game', { style: { color: meta.color }, text: meta.name }), num);
    let n = 3;
    const tick = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(tick); done(); return; }
      num.textContent = String(n);
      num.animate?.([{ transform: 'scale(1.3)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], 260);
    }, 700);
    return wrap;
  }

  function resultsView(outcome, award) {
    const acc = outcome.totalRounds
      ? Math.round((outcome.correctRounds / outcome.totalRounds) * 100) : 0;
    const wrap = el('div.results');
    wrap.append(
      el('div.results-badge', { style: { background: meta.color }, text: '★' }),
      el('h2', { text: 'Round complete!' }),
      el('div.score-big', { style: { color: meta.color }, text: String(outcome.score) }),
      el('p.muted', { text: 'points' }),
    );

    if (award.storyComplete) {
      wrap.append(storyCompleteBanner(award.storyComplete));
    }

    const stats = el('div.stat-grid');
    // Element.append stringifies `false`, so a conditional tile has to be
    // filtered out rather than passed through — it rendered as the word "false".
    [
      statTile('Correct', `${outcome.correctRounds}/${outcome.totalRounds}`),
      statTile('Accuracy', `${acc}%`),
      story ? null : statTile('Difficulty', difficulty[0].toUpperCase() + difficulty.slice(1)),
      statTile('Best', String(Store.high(game))),
    ].filter(Boolean).forEach((t) => stats.append(t));
    wrap.append(stats);
    wrap.append(el('div.xp-row', { text: `+${award.xp} XP · Level ${Store.level()}` }));

    const actions = el('div.actions');
    if (!story) {
      actions.append(button('Play again', { cls: 'btn primary', onclick: () => phase.choose() }));
    }
    actions.append(button('Done', { cls: story ? 'btn primary' : 'btn', onclick: onDone }));
    wrap.append(actions);
    return wrap;
  }

  function statTile(label, value) {
    return el('div.stat', {}, [el('div.stat-value', { text: value }), el('div.stat-label', { text: label })]);
  }

  function storyCompleteBanner(result) {
    const stars = el('div.stars');
    for (let i = 0; i < 3; i++) stars.append(el('span', { text: i < result.stars ? '★' : '☆' }));
    return el('div.story-complete', {}, [
      el('div.sc-title', { text: 'Story complete!' }),
      stars,
      el('p.muted.small', {
        text: result.stars < 3
          ? "Keep this story's verse in the Verse Vault to earn your third star."
          : "You've read it, played it, and learned it.",
      }),
      result.unlockedNext && el('p.small.success', { text: 'The next story is open.' }),
    ]);
  }
}

/** Save the score, award XP, and feed Journey gates. Twin of GameCompletion.record. */
function recordCompletion(game, difficulty, outcome, story, stopId) {
  Store.saveScore(game, outcome.score);
  const xp = 5 * MULTIPLIER[difficulty] + (outcome.correctRounds >= outcome.totalRounds ? 5 : 0);
  Store.addXp(xp);

  let storyComplete = null;
  if (stopId) {
    const accuracy = outcome.gateAccuracy != null
      ? outcome.gateAccuracy
      : (outcome.totalRounds ? outcome.correctRounds / outcome.totalRounds : 0);
    const res = recordGate(stopId, game, accuracy >= 0.6, accuracy);
    // Only the round that actually FINISHES the story gets the banner —
    // otherwise "Story complete!" appears after merely playing one game.
    storyComplete = res && res.isNewCompletion ? res : null;
  }
  return { xp, storyComplete };
}

/** Journey gate bookkeeping — the web twin of JourneyStore.recordGateResult. */
export function recordGate(stopId, gameKey, cleared, accuracy) {
  const j = Store.journey();
  j.gates[stopId] = j.gates[stopId] || {};
  const prev = j.gates[stopId][gameKey];
  if (!prev || accuracy > prev.accuracy) {
    j.gates[stopId][gameKey] = { cleared: cleared || (prev && prev.cleared) || false, accuracy };
  }
  Store.saveJourney(j);
  // evaluate() lives in the journey module to avoid a cycle; it is attached at boot.
  return (recordGate.evaluate && recordGate.evaluate(stopId)) || null;
}
