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

Playable. Six drillable lessons, ten library articles, three modes, and progress that
schedules itself.

- **Library** — read first. Articles explain what a position wants; lessons show you
  the position and judge what you do in it.
- **Learn** — feedback after every move, and a four-step hint ladder that only reveals
  the move at the very end. Play a losing move and the refutation is played out on the
  board, then you rewind and try again.
- **Test** — silence until something goes wrong, then it stops and replays the game
  back to you with the divergence marked and the measurement that collapsed flagged.
- **Either side** — every trap can be played as the defender or as the attacker, where
  the app deliberately plays the losing defences for you to punish.
- **Free play** — no lesson, just the board and the Referee.

Progress uses SM-2 spaced repetition. Failing a drill, or asking for the final hint,
brings it back tomorrow.

```bash
npm install
npm run dev              # local dev server
npm test                 # 84 unit tests
npm run validate:content # replay every lesson through chess.js
npm run build            # typecheck + production build
```

## Layout

- `src/engine/` — the part that does the teaching, with no UI and no chess engine.
  `see.ts` is static exchange evaluation, `metrics.ts` the positional measurements,
  `referee.ts` turns the difference between two positions into plain-English feedback.
- `src/modes/drill.ts` — the drill state machine: judging, hints, punishment lines,
  and the journal the replay reads.
- `src/content/` — loads the lessons and builds a FEN index so transpositions work.
- `content/patterns/` — lessons, authored as SAN move trees.
- `content/library/` — articles.
- `tools/validate-content.js` — the contract. Replays every lesson through `chess.js`
  in CI, so an illegal line or a false mate claim cannot ship.

## Deploying

Enable GitHub Pages once (Settings → Pages → Source: **GitHub Actions**). Pushes to
`main` publish; `workflow_dispatch` lets you publish a feature branch to try on your
phone first. Then open the site in Safari and **Share → Add to Home Screen**.

## Licence

This app uses [Chessground](https://github.com/lichess-org/chessground), which is
**GPL-3.0**, so the combined work is GPL-3.0 too and its source has to stay available.
That is fine for a public repo. If you ever want this closed-source, swap the board
for an MIT one before building more UI on it.
