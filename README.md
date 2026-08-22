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

Phases 1–2 of the build order are done: the PWA shell and the engine.

The current screen is a **sandbox** — a real board with the Referee wired up live, so
every move you play gets judged on what it did to the position. The Learn and Test
modes are not built yet.

```bash
npm install
npm run dev        # local dev server
npm test           # 59 engine tests
npm run build      # typecheck + production build (31 KB gzipped)
```

## Layout

- `src/engine/` — the part that does the teaching, with no UI and no chess engine.
  `see.ts` is static exchange evaluation, `metrics.ts` is the positional measurements,
  `referee.ts` turns the difference between two positions into plain-English feedback.
- `src/board/` — Chessground wrapper. Tap-tap to move; legal destinations are
  deliberately *not* lit up.
- `content/patterns/` — every lesson is a JSON file. `content/schema/pattern.schema.json`
  is the contract.
- `tools/validate-patterns.js` — replays every lesson through `chess.js` in CI, so a
  broken line can never ship.

## Deploying

Enable GitHub Pages once (Settings → Pages → Source: **GitHub Actions**). Pushes to
`main` publish; `workflow_dispatch` lets you publish a feature branch to try on your
phone first. Then open the site in Safari and **Share → Add to Home Screen**.

## Licence

This app uses [Chessground](https://github.com/lichess-org/chessground), which is
**GPL-3.0**, so the combined work is GPL-3.0 too and its source has to stay available.
That is fine for a public repo. If you ever want this closed-source, swap the board
for an MIT one before building more UI on it.
