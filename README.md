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

- `content/patterns/` — every lesson is a JSON file. `content/schema/pattern.schema.json`
  is the contract.
- `tools/validate-patterns.js` — replays every lesson through `chess.js` in CI, so a
  broken line can never ship.
