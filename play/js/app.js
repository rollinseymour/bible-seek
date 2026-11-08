// Bible Games — web edition entry point: routing and the home screen.

import {
  GAMES, gameFor, Store, Content, applyTheme, loadManifest, el, clear, button,
} from './core/core.js';
import { runGame } from './core/scaffold.js';
import * as Journey from './journey/journey.js';

const main = document.getElementById('main');
const topTitle = document.getElementById('topTitle');
const backBtn = document.getElementById('backBtn');

applyTheme();
document.getElementById('themeBtn').addEventListener('click', () => {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(Store.theme()) + 1) % order.length];
  Store.setTheme(next);
  toast(`Theme: ${next}`);
});
backBtn.addEventListener('click', () => history.back());

export function toast(msg) {
  const t = el('div.toast', { text: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

function setChrome(title, canGoBack) {
  topTitle.textContent = title;
  backBtn.style.visibility = canGoBack ? 'visible' : 'hidden';
  document.title = title === 'Bible Games' ? 'Bible Games — Play Online Free' : `${title} — Bible Games`;
}

export const go = (hash) => { location.hash = hash; };

// ── Router ───────────────────────────────────────────────────────────────────

async function route() {
  const path = (location.hash || '#/').slice(2).split('/').filter(Boolean);
  window.scrollTo(0, 0);
  try {
    if (path.length === 0) return home();
    if (path[0] === 'game') return freePlay(path[1]);
    if (path[0] === 'journey') {
      if (path.length === 1) return Journey.map(main, setChrome);
      if (path.length === 2) return Journey.stop(main, setChrome, path[1]);
      if (path.length === 4 && path[2] === 'play') return gateGame(path[1], path[3]);
    }
    if (path[0] === 'vault') return Journey.vault(main, setChrome, path[1] || null);
    if (path[0] === 'stats') return stats();
    home();
  } catch (err) {
    console.error(err);
    setChrome('Bible Games', true);
    clear(main).append(el('div.empty', { text: `Something went wrong: ${err.message}` }));
  }
}

window.addEventListener('hashchange', route);

// ── Home ─────────────────────────────────────────────────────────────────────

async function home() {
  setChrome('Bible Games', false);
  clear(main);

  const streak = Store.streak();
  const hero = el('div.hero');
  hero.append(
    el('h1', { text: 'Bible Games' }),
    el('div.tagline', { text: 'Seven games and a guided journey through Scripture' }),
  );
  const pills = el('div.hero-stats');
  pills.append(
    el('div.pill', { text: `Level ${Store.level()}` }),
    el('div.pill', { text: `${Store.xp()} XP` }),
    el('div.pill', { text: `🔥 ${streak.count} day${streak.count === 1 ? '' : 's'}` }),
  );
  hero.append(pills, el('div.xp-bar', {}, [el('i', { style: { width: `${Store.levelProgress() * 100}%` } })]));
  main.append(hero);

  const body = el('div', { style: { padding: '16px 0 32px' } });

  // Verse Vault — only when something is actually due.
  const due = Journey.dueCount();
  if (due > 0) {
    body.append(el('button.vault-card', { onclick: () => go('#/vault') }, [
      el('div', { style: { fontSize: '22px' }, text: '🧠' }),
      el('div', { class: 'grow' }, [
        el('div', { style: { fontWeight: 700 }, text: `${due} verse${due === 1 ? '' : 's'} to review` }),
        el('div.sub', { text: 'A few minutes to keep them in memory' }),
      ]),
      el('div', { text: '›' }),
    ]));
  }

  // Journey entry
  const j = Store.journey();
  const allStops = await Content.allStops();
  const doneCount = j.completed.length;
  const current = allStops.find((s) => !j.completed.includes(s.id));
  body.append(el('button.card.journey-card', { onclick: () => go('#/journey') }, [
    el('div.glyph', { text: '📖' }),
    el('div.grow', {}, [
      el('div', { style: { fontWeight: 700 }, text: 'Bible Journey' }),
      el('div.sub', {
        text: current
          ? `${doneCount} of ${allStops.length} stories · next: ${current.title}`
          : `All ${allStops.length} stories complete`,
      }),
    ]),
    el('div', { text: '›' }),
  ]));

  const grid = el('div.game-grid');
  GAMES.forEach((g) => {
    grid.append(el('button.game-tile', { onclick: () => go(`#/game/${g.key}`) }, [
      el('div.disc', { style: { background: `${g.color}22`, color: g.color }, text: g.icon }),
      el('div.gt-name', { style: { color: g.color }, text: g.name }),
      el('div.gt-blurb', { text: g.blurb }),
      el('div.gt-best', { text: `Best: ${Store.high(g.key)}` }),
    ]));
  });
  body.append(grid);

  body.append(el('div', { style: { marginTop: '22px', textAlign: 'center' } }, [
    button('Your stats', { cls: 'btn', onclick: () => go('#/stats') }),
  ]));
  main.append(body);
}

// ── Games ────────────────────────────────────────────────────────────────────

const loaders = {
  trivia: () => import('./games/trivia.js'),
  scramble: () => import('./games/scramble.js'),
  whoami: () => import('./games/whoami.js'),
  wordsearch: () => import('./games/wordsearch.js'),
  hangman: () => import('./games/hangman.js'),
  memory: () => import('./games/memory.js'),
  books: () => import('./games/books.js'),
};

async function freePlay(key) {
  const meta = gameFor(key);
  if (!meta) return home();
  setChrome(meta.name, true);
  clear(main).append(el('div.empty', { text: 'Loading…' }));
  const mod = await loaders[key]();
  runGame(main, { game: key, onDone: () => go('#/'), play: mod.play });
}

async function gateGame(stopId, key) {
  const meta = gameFor(key);
  const stop = await Content.stop(stopId);
  if (!meta || !stop) return home();
  const challenge = stop.gate.find((g) => g.gameKey === key);
  if (!challenge) return go(`#/journey/${stopId}`);
  setChrome(meta.name, true);
  clear(main).append(el('div.empty', { text: 'Loading…' }));
  const mod = await loaders[key]();
  runGame(main, {
    game: key, story: challenge, stopId,
    onDone: () => go(`#/journey/${stopId}`),
    play: mod.play,
  });
}

// ── Stats ────────────────────────────────────────────────────────────────────

function stats() {
  setChrome('Your Stats', true);
  clear(main);
  const plays = Store.plays();
  const j = Store.journey();
  const wrap = el('div', { style: { paddingTop: '8px' } });

  const top = el('div.stat-grid');
  top.append(
    tile('Level', String(Store.level())),
    tile('Total XP', String(Store.xp())),
    tile('Streak', `${Store.streak().count} d`),
    tile('Stories done', String(j.completed.length)),
  );
  wrap.append(top, el('div.sec-title', { text: 'High scores' }));

  const list = el('div.stops', { style: { marginTop: '8px' } });
  GAMES.forEach((g) => {
    list.append(el('div.stop-row', {}, [
      el('div.node', { style: { background: `${g.color}22`, color: g.color }, text: g.icon }),
      el('div.st-title', { text: g.name }),
      el('div.muted.small', { text: `${Store.high(g.key)} · ${plays[g.key] || 0} plays` }),
    ]));
  });
  wrap.append(list);

  const vault = Store.vault();
  const refs = Object.keys(vault);
  if (refs.length) {
    const rooted = refs.filter((r) => vault[r].stage >= 3).length;
    wrap.append(el('div.sec-title', { text: 'Verse Vault' }));
    const vg = el('div.stat-grid');
    vg.append(tile('Verses learning', String(refs.length)), tile('Taking root', String(rooted)));
    wrap.append(vg);
  }
  main.append(wrap);

  function tile(label, value) {
    return el('div.stat', {}, [el('div.stat-value', { text: value }), el('div.stat-label', { text: label })]);
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

(async function boot() {
  await loadManifest();
  Journey.init();
  route();
})();
