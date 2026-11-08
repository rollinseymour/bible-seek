// Bible Journey + the Verse Vault, for the web edition.
//
// The shape of the iOS feature, faithfully: read a story's passages in order,
// play its games, earn stars — and then have its memory verse come back at
// widening intervals until you know it by heart.

import {
  Content, Bible, Store, el, clear, button, shuffle, buzz, todayIndex, gameFor,
} from '../core/core.js';
import { recordGate } from '../core/scaffold.js';

const MAX_STAGE = 6;
const MEMORY_STAR_STAGE = 3;         // stage at which a verse counts as taking root
const SESSION_CAP = 5;               // never serve more than this at once
const GATE_CAP = 3;
const BASE_INTERVAL = [0, 1, 3, 7, 16, 35, 90];
const MAX_CHUNK_WORDS = 14;

let go;                              // set in init(), avoids a circular import

export function init() {
  go = (h) => { location.hash = h; };
  // scaffold.js records gate results but can't import us without a cycle.
  recordGate.evaluate = evaluate;
  backfillVault();
}

// ── Progress ─────────────────────────────────────────────────────────────────

const read = () => Store.journey();
const save = (j) => Store.saveJourney(j);

const isCompleted = (j, id) => j.completed.includes(id);
const starsFor = (j, id) => j.stars[id] || 0;
const readSet = (j, id) => new Set(j.passages[id] || []);

function isPassageUnlocked(j, id, i) {
  return isCompleted(j, id) || i === 0 || readSet(j, id).has(i - 1);
}

async function allPassagesRead(j, id) {
  const stop = await Content.stop(id);
  if (!stop) return false;
  const s = readSet(j, id);
  return stop.passages.every((_, i) => s.has(i));
}

async function allGatesPlayed(j, id) {
  const stop = await Content.stop(id);
  if (!stop) return false;
  const res = j.gates[id] || {};
  return stop.gate.every((g) => res[g.gameKey]);
}

/** Soft-linear unlock: the first story, or the one after a completed story. */
async function isUnlocked(j, id) {
  const stops = await Content.allStops();
  const i = stops.findIndex((s) => s.id === id);
  return i === 0 || (i > 0 && isCompleted(j, stops[i - 1].id));
}

/**
 * Re-evaluate a stop: completion, stars, and enrolment of its memory verse.
 * Returns {stars, isNewCompletion, unlockedNext} for the results screen.
 * Synchronous on purpose — the scaffold calls it mid-render — so it reads the
 * stop from the already-resolved cache.
 */
function evaluate(id) {
  const stop = cachedStop(id);
  if (!stop) return null;
  const j = read();
  const was = isCompleted(j, id);

  const rs = readSet(j, id);
  const readAll = stop.passages.every((_, i) => rs.has(i));
  const gates = j.gates[id] || {};
  const playedAll = stop.gate.every((g) => gates[g.gameKey]);
  const nowComplete = readAll && playedAll;

  let unlockedNext = null;
  if (nowComplete && !was) {
    j.completed.push(id);
    const stops = cachedAll();
    const i = stops.findIndex((s) => s.id === id);
    unlockedNext = i >= 0 && i + 1 < stops.length ? stops[i + 1].id : null;
    enroll(stop.anchorRef, id);
    Store.addXp(30);
  }

  let s = starsFor(j, id);
  if (nowComplete || was) {
    const cleared = stop.gate.length > 0 && stop.gate.every((g) => gates[g.gameKey]?.cleared);
    s = Math.max(s, 1);
    if (cleared) s = Math.max(s, 2);
    // The third star is memory, not tidiness: it lands when this story's verse
    // has actually taken root in the Vault, which no single sitting can fake.
    if (cleared && (Store.vault()[stop.anchorRef]?.stage || 0) >= MEMORY_STAR_STAGE) s = 3;
    j.stars[id] = s;
  }
  save(j);
  return { stars: s, isNewCompletion: nowComplete && !was, unlockedNext };
}

// A tiny synchronous mirror of the content cache, filled as pages render.
let _allCache = null;
const cachedAll = () => _allCache || [];
const cachedStop = (id) => cachedAll().find((s) => s.id === id) || null;
async function warm() { _allCache = await Content.allStops(); return _allCache; }

// ── Verse Vault ──────────────────────────────────────────────────────────────

function enroll(ref, stopId) {
  const v = Store.vault();
  if (v[ref]) return;
  v[ref] = { ref, stopId, stage: 0, box: 0, dueDay: todayIndex(), ease: 2.5, reps: 0, lapses: 0 };
  Store.saveVault(v);
}

/**
 * One-time catch-up for stories finished before the Vault existed. Without it a
 * returning player has an empty vault and never sees the feature at all.
 * Enrolments are spread over coming days so nobody meets a wall.
 */
async function backfillVault() {
  if (localStorage.getItem('biblegames.vault.backfilled')) return;
  const stops = await warm();
  const j = read();
  const v = Store.vault();
  let day = todayIndex(), added = 0;
  for (const s of stops) {
    if (!j.completed.includes(s.id) || v[s.anchorRef]) continue;
    v[s.anchorRef] = { ref: s.anchorRef, stopId: s.id, stage: 0, box: 0, dueDay: day, ease: 2.5, reps: 0, lapses: 0 };
    if (++added >= SESSION_CAP) { added = 0; day += 1; }
  }
  Store.saveVault(v);
  localStorage.setItem('biblegames.vault.backfilled', '1');
}

export function dueCount() {
  const t = todayIndex();
  return Object.values(Store.vault()).filter((i) => i.dueDay <= t).length;
}

function dueSession(excludeStop = null, limit = SESSION_CAP) {
  const t = todayIndex();
  return shuffle(Object.values(Store.vault())
    .filter((i) => i.dueDay <= t && (!excludeStop || i.stopId !== excludeStop)))
    .slice(0, limit);
}

/** Grade a finished review and schedule the next sighting. */
function recordReview(ref, grade) {
  const v = Store.vault();
  const it = v[ref];
  if (!it) return;
  it.reps += 1;
  if (grade === 0) {
    it.box = 0; it.ease = Math.max(1.3, it.ease - 0.2); it.lapses += 1;
    it.stage = Math.max(0, it.stage - 1);   // fade a cue back IN after a lapse
  } else if (grade === 1) {
    it.box = Math.max(0, it.box - 1); it.ease = Math.max(1.3, it.ease - 0.15);
  } else {
    it.box = Math.min(BASE_INTERVAL.length - 1, it.box + 1);
    if (grade === 3) it.ease = Math.min(2.8, it.ease + 0.1);
    if (it.stage < MAX_STAGE) it.stage += 1;
  }
  const base = BASE_INTERVAL[Math.min(it.box, BASE_INTERVAL.length - 1)];
  const days = Math.max(1, Math.round(base * (it.ease / 2.5) * (0.85 + Math.random() * 0.3)));
  it.dueDay = todayIndex() + days;
  Store.saveVault(v);
  // A verse taking root can earn its story's third star, and stars are stored.
  if (it.stopId) evaluate(it.stopId);
}

// ── Chunking + fading ────────────────────────────────────────────────────────

/** Split a verse into clauses no longer than the cap, with no stranded scraps. */
export function chunks(text) {
  const cleaned = (text || '').trim();
  if (!cleaned) return [];
  if (cleaned.split(/\s+/).length <= MAX_CHUNK_WORDS) return [cleaned];

  // Cut after clause punctuation, but only when a space follows, so a token
  // like "Father,)" is never split down the middle.
  const pieces = [];
  let cur = '';
  for (let i = 0; i < cleaned.length; i++) {
    cur += cleaned[i];
    if (';:,.?!'.includes(cleaned[i]) && cleaned[i + 1] === ' ') { pieces.push(cur.trim()); cur = ''; }
  }
  if (cur.trim()) pieces.push(cur.trim());

  // Split anything still over the cap EVENLY (16 words becomes 8+8, not 14+2)
  // so a clause never ends on a stray fragment.
  const sized = [];
  for (const p of pieces) {
    const w = p.split(/\s+/);
    if (w.length <= MAX_CHUNK_WORDS) { sized.push(p); continue; }
    const parts = Math.ceil(w.length / MAX_CHUNK_WORDS);
    const per = Math.ceil(w.length / parts);
    for (let i = 0; i < w.length; i += per) sized.push(w.slice(i, i + per).join(' '));
  }

  // Recombine neighbours while they still fit.
  const out = [];
  for (const p of sized) {
    const last = out[out.length - 1];
    if (last && (last + ' ' + p).split(/\s+/).length <= MAX_CHUNK_WORDS) out[out.length - 1] = last + ' ' + p;
    else out.push(p);
  }
  return out;
}

const SKIP = new Set(('the and of a an to in that it is was for unto with as be he i my thy thee his her ' +
  'their them you ye we us but or shall will have hath not so on at by from').split(' '));

function hashSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

const HIDE = [0, 0.2, 0.25, 0.5, 0.75, 1, 1];

/** Which word indices are hidden at this stage — stable for a given (ref, stage). */
export function blanked(text, ref, stage) {
  const words = text.split(/\s+/);
  if (stage <= 0) return new Set();
  const frac = HIDE[Math.min(stage, HIDE.length - 1)];
  if (frac >= 1) return new Set(words.map((_, i) => i));
  const content = words.map((w, i) => i).filter((i) => !SKIP.has(words[i].toLowerCase().replace(/[^a-z]/g, '')));
  const pool = content.length ? content : words.map((_, i) => i);
  const count = Math.max(1, Math.round(pool.length * frac));
  // Deterministic shuffle so the same stage hides the same words.
  let seed = hashSeed(`${ref}#${stage}`);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return new Set(a.slice(0, count));
}

/** First-letter cues are held back to the last fill stage, or stage 4 would be
 *  easier than stage 3 and the ladder would invert. */
const showsCue = (stage) => stage >= 5;
const cueFor = (w) => {
  const trail = (w.match(/[;:,.?!]+$/) || [''])[0];
  return w[0] + '_'.repeat(Math.max(1, w.length - trail.length - 1)) + trail;
};

// ── Map ──────────────────────────────────────────────────────────────────────

export async function map(main, setChrome) {
  setChrome('Bible Journey', true);
  clear(main).append(el('div.empty', { text: 'Loading the journey…' }));
  const sections = await Content.sections();
  await warm();
  const j = read();

  clear(main);
  const due = dueCount();
  if (due > 0) {
    main.append(el('button.vault-card', { onclick: () => go('#/vault') }, [
      el('div', { style: { fontSize: '22px' }, text: '🧠' }),
      el('div.grow', {}, [
        el('div', { style: { fontWeight: 700 }, text: `${due} verse${due === 1 ? '' : 's'} to review` }),
        el('div.sub', { text: 'A few minutes to keep them in memory' }),
      ]),
      el('div', { text: '›' }),
    ]));
  }

  for (const sec of sections) {
    const stops = await Content.stops(sec.folder);
    const secDone = stops.every((s) => isCompleted(j, s.id));
    main.append(el('div.section-head', {}, [
      el('div.bk', { text: sec.title }),
      el('div.tv', { text: Bible.displayRef(sec.themeVerse) }),
      el('span', { class: `badge-chip${secDone ? ' earned' : ''}`, text: secDone ? '★ Badge earned' : 'Badge locked' }),
    ]));

    const list = el('div.stops');
    for (const stop of stops) {
      const done = isCompleted(j, stop.id);
      const unlocked = done || await isUnlocked(j, stop.id);
      const stars = starsFor(j, stop.id);
      const row = el('button', {
        class: `stop-row${done ? ' done' : unlocked ? ' current' : ''}`,
        onclick: unlocked ? () => go(`#/journey/${stop.id}`) : null,
      }, [
        el('div.node', { text: done ? '✓' : unlocked ? '▶' : '🔒' }),
        el('div.st-title', { text: stop.title }),
        el('div.st-stars', { text: '★'.repeat(stars) + '☆'.repeat(3 - stars) }),
      ]);
      if (!unlocked) row.disabled = true;
      list.append(row);
    }
    main.append(list);
  }
}

// ── A single stop ────────────────────────────────────────────────────────────

export async function stop(main, setChrome, stopId) {
  const s = await Content.stop(stopId);
  await warm();
  if (!s) { clear(main).append(el('div.empty', { text: 'This story is unavailable.' })); return; }
  setChrome(s.title, true);
  render();

  function render() {
    const j = read();
    const rs = readSet(j, stopId);
    const total = s.passages.length;
    const readCount = s.passages.reduce((n, _, i) => n + (rs.has(i) ? 1 : 0), 0);
    const storyRead = readCount >= total;

    clear(main);
    main.append(el('div', { style: { marginBottom: '12px' } }, [
      el('span.anchor-chip', { text: `🔖 Memory verse · ${Bible.displayRef(s.anchorRef)}` }),
    ]));

    if (s.backstory) {
      main.append(el('div.card', { style: { marginBottom: '14px' } }, [
        el('div', { style: { fontWeight: 700, marginBottom: '6px' }, text: '📜 Backstory' }),
        el('div.muted', { text: s.backstory }),
      ]));
    }

    main.append(el('div', {}, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, [
        el('div.sec-title', { style: { marginTop: 0 }, text: 'The story' }),
        el('div.small', { class: storyRead ? 'success' : 'muted', text: `${readCount} / ${total} read` }),
      ]),
      el('div.muted.small', { text: 'Tap each passage to read it. Finish the story to unlock the games.' }),
    ]));

    const list = el('div.stops', { style: { marginTop: '10px' } });
    s.passages.forEach((p, i) => {
      const isRead = rs.has(i);
      const unlocked = isPassageUnlocked(j, stopId, i);
      const row = el('button.passage', {
        onclick: unlocked ? () => openReader(i) : null,
      }, [
        el('div.mark', { text: isRead ? '✅' : unlocked ? '📖' : '🔒' }),
        el('div', {}, [
          el('div.pr', { text: Bible.displayRef(p.ref) }),
          el('div.syn', { text: p.synopsis }),
        ]),
      ]);
      if (!unlocked) row.disabled = true;
      list.append(row);
    });
    main.append(list);

    if (s.crossRefs?.length || s.reflection) {
      main.append(el('div.sec-title', { text: 'Dig deeper' }));
      const dd = el('div.card');
      if (s.crossRefs?.length) {
        dd.append(el('div.small.muted', { text: 'Cross references' }));
        dd.append(el('div', { style: { marginTop: '4px', fontWeight: 600 }, text: s.crossRefs.map((r) => Bible.displayRef(r)).join('  ·  ') }));
      }
      if (s.reflection) dd.append(el('p', { style: { marginTop: '10px' }, text: s.reflection }));
      main.append(dd);
    }

    // Games
    main.append(el('div.sec-title', { text: 'Test yourself' }));
    if (!storyRead) {
      main.append(el('div.muted.small', { text: 'Read the whole story to unlock these.' }));
    }
    const grid = el('div.gate-grid');
    s.gate.forEach((g) => {
      const meta = gameFor(g.gameKey);
      const played = (j.gates[stopId] || {})[g.gameKey];
      const b = el('button.gate', {
        onclick: storyRead ? () => go(`#/journey/${stopId}/play/${g.gameKey}`) : null,
      }, [
        el('div.disc', { style: { background: meta.color }, text: meta.icon }),
        el('div', { style: { flex: 1 } }, [
          el('div', { style: { fontWeight: 600 }, text: meta.name }),
          played ? el('div.small.success', { text: `Played · ${Math.round(played.accuracy * 100)}%` })
                 : el('div.small.muted', { text: 'Not played yet' }),
        ]),
        el('div', { text: storyRead ? '›' : '🔒' }),
      ]);
      if (!storyRead) b.disabled = true;
      grid.append(b);
    });
    main.append(grid);

    // A review of EARLIER verses — never the one just read here.
    if (dueSession(stopId, GATE_CAP).length) {
      main.append(el('button.vault-card', { style: { marginTop: '14px' }, onclick: () => go(`#/vault/${stopId}`) }, [
        el('div', { style: { fontSize: '20px' }, text: '🧠' }),
        el('div.grow', {}, [
          el('div', { style: { fontWeight: 700 }, text: 'Remember earlier verses' }),
          el('div.sub', { text: 'A quick review from stories you have already read' }),
        ]),
        el('div', { text: '›' }),
      ]));
    }
  }

  /** The reader walks the whole story: Next advances, Continue closes at the end. */
  async function openReader(startIndex) {
    let i = startIndex;
    await show();

    async function show() {
      const p = s.passages[i];
      setChrome(Bible.displayRef(p.ref), true);
      clear(main).append(el('div.empty', { text: 'Loading passage…' }));
      const verses = await Bible.passage(p.ref);

      clear(main);
      main.append(el('div.small.muted', { text: `Passage ${i + 1} of ${s.passages.length}` }));
      main.append(el('p', { style: { fontStyle: 'italic', margin: '8px 0 16px' }, class: 'muted', text: p.synopsis }));
      const body = el('div.card');
      if (!verses.length) body.append(el('div.muted', { text: 'Passage unavailable.' }));
      verses.forEach((v) => {
        body.append(el('div.reader-verse', {}, [
          el('span.vn', { text: String(v.verse) }),
          document.createTextNode(v.text),
        ]));
      });
      main.append(body);

      const last = i + 1 >= s.passages.length;
      const row = el('div.actions');
      if (i > 0) row.append(button('‹ Previous', { cls: 'btn', onclick: () => { i -= 1; show(); } }));
      row.append(button(last ? 'Continue' : 'Next ›', {
        cls: 'btn primary',
        onclick: () => {
          markRead(i);
          if (last) { setChrome(s.title, true); render(); }
          else { i += 1; show(); }
        },
      }));
      main.append(row);
      main.append(el('div', { style: { marginTop: '10px' } }, [
        button('Close', { cls: 'btn', onclick: () => { setChrome(s.title, true); render(); } }),
      ]));
      window.scrollTo(0, 0);
    }
  }

  function markRead(i) {
    const j = read();
    const set = readSet(j, stopId);
    set.add(i);
    j.passages[stopId] = [...set];
    save(j);
    evaluate(stopId);
    buzz();
  }
}

// ── Verse Vault review ───────────────────────────────────────────────────────

export async function vault(main, setChrome, excludeStop) {
  setChrome('Verse Vault', true);
  await warm();
  const queue = dueSession(excludeStop, excludeStop ? GATE_CAP : SESSION_CAP);
  let qi = 0;

  if (!queue.length) {
    clear(main).append(el('div.empty', {}, [
      el('div', { style: { fontSize: '40px' }, text: '✅' }),
      el('h2', { text: 'Nothing due right now' }),
      el('p.muted', { text: 'Verses come back on their own, a little further apart each time you get them right.' }),
      el('div', { style: { marginTop: '16px' } }, [button('Done', { cls: 'btn primary', onclick: () => history.back() })]),
    ]));
    return;
  }

  next();

  function next() {
    if (qi >= queue.length) return finished();
    round(queue[qi]);
  }

  function finished() {
    Store.addXp(2 * queue.length);
    clear(main).append(el('div.empty', {}, [
      el('div', { style: { fontSize: '40px' }, text: '✨' }),
      el('h2', { text: 'Well done' }),
      el('p.muted', { text: `${queue.length} verse${queue.length === 1 ? '' : 's'} reviewed. They'll come back when it's time.` }),
      el('div', { style: { marginTop: '16px' } }, [button('Done', { cls: 'btn primary', onclick: () => history.back() })]),
    ]));
  }

  async function round(item) {
    clear(main).append(el('div.empty', { text: 'Loading verse…' }));
    const p = Bible.parseRef(item.ref);
    const verses = await Bible.chapter(p.book, p.c1);
    const verse = verses.find((v) => v.verse === p.v1);
    if (!verse) { qi += 1; return next(); }

    const parts = chunks(verse.text);
    let ci = 0, wrong = 0, totalBlanks = 0;
    const recite = item.stage >= MAX_STAGE;
    renderChunk();

    function renderChunk() {
      clear(main);
      main.append(el('div.progress-row', {}, [
        el('span', { text: parts.length > 1 ? `Part ${ci + 1} of ${parts.length}` : 'Memory verse' }),
        meter(item.stage),
      ]));
      main.append(el('div.verse-ref', { style: { margin: '10px 0 16px' }, text: Bible.displayRef(item.ref) }));

      if (recite) return renderRecite();

      const words = parts[ci].split(/\s+/);
      const hidden = blanked(parts[ci], item.ref, item.stage);
      totalBlanks += hidden.size;
      const filled = new Map();
      const order = [...hidden].sort((a, b) => a - b);

      const card = el('div.card');
      const line = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'baseline' } });
      const bankBox = el('div.chips', { style: { marginTop: '14px' } });
      card.append(line);
      main.append(card, el('div.small.muted', { style: { marginTop: '14px' }, text: 'Tap the missing words' }), bankBox);

      // The bank is drawn once per chunk and holds stable identities, so a
      // repeated word can't collapse and the chips don't reshuffle on each tap.
      let bank = shuffle(order.map((i) => words[i])).map((w, id) => ({ id, word: w }));

      const nextSlot = () => order.find((i) => !filled.has(i));
      paint();

      function paint() {
        clear(line);
        words.forEach((w, i) => {
          if (!hidden.has(i)) { line.append(el('span', { style: { fontFamily: 'var(--f-serif)', fontSize: '18px' }, text: w })); return; }
          const got = filled.get(i);
          const cls = `slot${got ? ' filled' : ''}${i === nextSlot() ? ' next' : ''}`;
          line.append(el('span', {
            class: cls,
            'aria-label': got ? `${got}, placed` : 'blank',
            text: got || (showsCue(item.stage) ? cueFor(w) : '____'),
          }));
        });
        clear(bankBox);
        bank.forEach((entry) => {
          bankBox.append(button(entry.word, { cls: 'chip', onclick: () => place(entry) }));
        });
        if (!nextSlot()) {
          const last = ci + 1 >= parts.length;
          bankBox.append(el('div', { style: { width: '100%', marginTop: '10px' } }, [
            button(last ? 'Finish verse' : 'Next part', {
              cls: 'btn primary',
              onclick: () => {
                if (!last) { ci += 1; renderChunk(); return; }
                const acc = totalBlanks ? Math.max(0, totalBlanks - wrong) / totalBlanks : 1;
                grade(acc);
              },
            }),
          ]));
        }
      }

      // Tap-to-lock: a wrong tap is refused, never committed — committing it
      // would leave incorrect Scripture on screen.
      function place(entry) {
        const slot = nextSlot();
        if (slot == null) return;
        if (entry.word !== words[slot]) { wrong += 1; buzz(40); return; }
        filled.set(slot, entry.word);
        bank = bank.filter((b) => b.id !== entry.id);
        buzz(12);
        paint();
      }
    }

    function renderRecite() {
      const card = el('div.card.center');
      card.append(
        el('h3', { text: 'Say it from memory' }),
        el('p.muted.small', { style: { marginTop: '6px' }, text: 'Say the whole verse out loud, then check yourself.' }),
      );
      main.append(card);
      const actions = el('div.actions');
      actions.append(button('Show me the verse', {
        cls: 'btn primary',
        onclick: () => {
          clear(card).append(
            el('h3', { text: 'Say it from memory' }),
            el('p', { style: { fontFamily: 'var(--f-serif)', fontSize: '18px', marginTop: '10px' }, text: verse.text }),
          );
          clear(actions).append(
            button('Not yet', { cls: 'btn', onclick: () => grade(0) }),
            button('I knew it', { cls: 'btn primary', onclick: () => grade(1) }),
          );
        },
      }));
      main.append(actions);
    }

    function grade(acc) {
      // Stage 0 shows the whole verse with nothing to fill, so there is nothing
      // to judge — treat it as a clean pass rather than faking a perfect score.
      let g;
      if (recite) g = acc >= 1 ? 3 : 0;
      else if (totalBlanks === 0) g = 2;
      else if (acc >= 0.95) g = 3;
      else if (acc >= 0.8) g = 2;
      else if (acc >= 0.5) g = 1;
      else g = 0;
      recordReview(item.ref, g);
      qi += 1;
      next();
    }
  }

  function meter(stage) {
    const m = el('span.fade-meter', { 'aria-label': `Memory strength ${stage} of ${MAX_STAGE}` });
    for (let i = 0; i < MAX_STAGE; i++) m.append(el('i', { class: i < stage ? 'on' : '' }));
    return m;
  }
}
