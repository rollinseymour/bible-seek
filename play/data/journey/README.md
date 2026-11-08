# Bible Journey content

Every story is one file. To change what a story says, open its file and edit the
text — no code changes, no rebuild of anything else. The app assembles the whole
Journey from this folder at launch.

```
Journey/
  sections.json        ← the books, in order
  _TEMPLATE.json       ← blank story to copy when adding a new one
  genesis/
    01-creation.json   ← one story per file; the NN prefix sets the order
    02-fall.json
    ...
```

## Editing a story

Open e.g. `genesis/05-jacob.json`. Every story has the same shape:

| Field | What it is | Shows up as |
|---|---|---|
| `id` | unique id, e.g. `gen.jacob` | *(internal — don't reuse one)* |
| `title` | story name | screen title + map node |
| `anchorRef` | the memory verse, `BOOK.CH.V` | "Memory verse" chip at the top |
| `backstory` | 2-3 sentences of setup | **Backstory** section |
| `passages` | the readings, in order | **The Story** |
| `gate` | the games | **Test yourself** |
| `crossRefs` | related verses, `BOOK.CH.V` | **Dig deeper** chips |
| `reflection` | closing question | **Dig deeper** |

### Passages (The Story)

Each entry is a scripture range plus the summary the reader sees *before* they
tap in to read the actual text:

```json
{ "ref": "GEN.27.1-29", "synopsis": "Old and nearly blind, Isaac prepared to bless…" }
```

- `ref` grammar: `GEN.25.29` (one verse), `GEN.25.29-34` (range in a chapter),
  or `GEN.1.1-2.3` (across chapters). The reader pulls the KJV text automatically —
  you never paste scripture here, just the reference.
- Passages unlock in order, so keep them in narrative order.
- Any number works; four is the norm.

### Gate (Test yourself)

One entry per game. The `gameKey` decides which content key it needs:

| `gameKey` | content key |
|---|---|
| `scramble` | `scrambleVerses` |
| `wordsearch` | `wordSearchPuzzles` |
| `trivia` | `triviaQuestions` |
| `whoami` | `whoAmIChars` |
| `hangman` | `hangmanWords` |

Rules that matter:
- **There is no difficulty here.** Journey games aren't tiered — the player never
  sees a difficulty screen, they tap the game and play. Just write the content
  for *this* story; every item you list gets used. (`difficulty` is a free-play
  concept only, for the games reached from the home screen.)
- **Write for the youngest player.** Because there's no difficulty picker, a
  5-year-old gets exactly what you write. Hard limits (the validator enforces them):

  | Game | Limit | Why |
  |---|---|---|
  | scramble `text` | **4-14 words** (aim 6-12) | every word becomes a tile the child taps back into order — 30 words is 30 tiles |
  | hangman `word` | **3-10 letters** | |
  | wordsearch `words` | **3-10 letters** | long words are hard to spot in the grid |

- **Scramble verses may be trimmed.** Prefer a naturally short verse from the
  stop's own passages. If the story has no short verse, you may quote a verbatim
  **clause** of a longer one: copy it exactly from the bundled KJV, cut only at
  natural clause boundaries, keep the meaning intact, and leave `reference`
  pointing at the whole verse. That is this app's house style for word games.
- Word-search words must be A-Z uppercase. The grid **sizes itself** to your
  longest word, so you don't have to think about the grid — just the length limit.
- Word search uses **one board per story**: the first entry in
  `wordSearchPuzzles`. The other games use everything you list.
- Any scripture you quote (scramble `text`, trivia `explanation`) must be
  **verbatim KJV** — copy it from the bundled Bible, don't retype from memory.
- The player must finish every game here to unlock the next story, so 2-3 is a
  good number.

## Adding a story

1. Copy `_TEMPLATE.json` into the book's folder.
2. Name it with the next number, e.g. `07-newstory.json`.
3. Fill it in and give it a unique `id`.

## Adding a book

1. Make a folder, add its story files.
2. Add an entry to `sections.json` (order in that file = order on the map).
3. Add a badge for it in `JourneyBadge.registry` (`Models/Content.swift`).

## If something breaks

A malformed file stops that story from loading. In a **Debug** build the app
halts immediately and names the exact file and problem, e.g.

```
Journey content error in genesis/05-jacob.json: … keyNotFound("synopsis") …
```

Most common causes: a missing comma, a trailing comma, a smart quote instead of
`"`, or a renamed field. In a Release build the bad story is skipped instead of
crashing.
