# Chess Teacher

A pattern-drilling chess coach for the phone. It teaches you a *plan*, then plays the
position against you and tells you whether your move served that plan — without ever
leading with the move itself.

Not an engine. Not a game. A trainer.

- **Learn** — see the idea, prove you can recognize the threat, then play it with
  feedback after every move.
- **Test** — play it cold, from either side. The moment the pattern breaks, it stops
  and replays the whole game back to you with the exact move where it went wrong.

**Start here: [`docs/DESIGN.md`](docs/DESIGN.md)** — platform choice, curriculum,
content model, and the static evaluator that does the teaching.

## Status

Playable and complete through the build order: 18 drills, 10 articles and 17 reference
entries across four stages, three modes, and progress that schedules itself.

### Three kinds of content

- **Articles** — long-form. What a structure or opening wants, and why.
- **Reference** — one idea each, wiki-style. Article and drill prose links to them
  inline with `[[id]]` markup, so a term is explained once and pointed at from
  everywhere. CI fails on a link that points at nothing.
- **Drills** — playable lessons, authored as SAN move trees.

### One screen

The home screen is the whole map: every article, drill and reference term, grouped by
stage, with a jump bar across the top. Tapping a drill opens its modes in place rather
than behind another page, so playing is two taps from launch. Articles lead with what
is playable rather than burying it under the prose.

| Stage | Read | Drill |
| --- | --- | --- |
| 0. Habits | The Five Habits | Ten Moves of Good Habits |
| 1. Traps | How Opening Traps Actually Work | Scholar's Mate, Wayward Queen, Fried Liver, Legal's Mate, Blackburne Shilling, Fishing Pole, Englund Gambit, Danish Gambit, punishing 2...f6 |
| 2. Repertoire | Italian, Caro-Kann, QGD | Playing each of the three |
| 3. Structures | IQP, minority attack, outposts, good/bad bishops, open files | A plan drill for each |

### Modes

- **Recognise before you move** — most drills open with a board and "tap the square
  that matters", then a question about what the threat actually is.
- **Learn** — feedback after every move, and a four-step hint ladder that only reveals
  the move at the very end. Play a losing move and the refutation is played out on the
  board, then you rewind and try again.
- **Test** — silence until something goes wrong, then it stops and replays the game
  back with the divergence marked and the measurement that collapsed flagged.
- **Either side** — a drill can set `opponent: "mistakes"` and the app plays the losing
  moves for you to punish, so every trap is drillable from both sides.
- **Free play** — no lesson, just the board and the Referee.

A drill can also declare a plan goal the app checks after every move — "at least two
minor pieces out by move five" — and breaking one stops a Test drill like a blunder.

Progress uses SM-2 spaced repetition, on device. Failing a drill, or asking for the
final hint, brings it back tomorrow.

```bash
npm install
npm run dev              # local dev server
npm test                 # unit tests, including a sweep of every drill
npm run validate:content # replays every lesson through chess.js
npm run build            # typecheck + production build
```

## Layout

- `src/engine/` — the part that does the teaching, with no UI and no chess engine.
  `see.ts` is static exchange evaluation, `metrics.ts` the positional measurements,
  `referee.ts` turns the difference between two positions into plain-English feedback.
- `src/modes/drill.ts` — the drill state machine: judging, hints, punishment lines,
  and the journal the replay reads.
- `src/content/` — loads all three content kinds and builds a FEN index so
  transpositions work.
- `content/patterns/`, `content/library/`, `content/reference/` — the content.
- `tools/validate-content.js` — the contract, run in CI.
- `tools/line.js` — authoring helper: prints the position after each ply.
- `tools/wait-for-deploy.sh` — waits for the live site to serve a given commit.

## Deploying

Enable GitHub Pages once (Settings → Pages → Source: **GitHub Actions**). Pushes to
`main` publish; `workflow_dispatch` lets you publish a feature branch to try on your
phone first. Then open the site in Safari and **Share → Add to Home Screen**.

## Licence

This app uses [Chessground](https://github.com/lichess-org/chessground), which is
**GPL-3.0**, so the combined work is GPL-3.0 too and its source has to stay available.
That is fine for a public repo. If you ever want this closed-source, swap the board
for an MIT one before building more UI on it.
