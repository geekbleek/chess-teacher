# Chess Teacher — Design

A pattern-drilling chess coach. It does **not** play strong chess and it does **not**
show you the move. It teaches you a *plan*, then plays the position against you and
judges whether your moves served that plan.

---

## 1. Platform decision: PWA on GitHub Pages

**Recommendation: a Progressive Web App deployed to GitHub Pages.** Not an iOS app.

| | PWA on Pages | iOS + TestFlight |
| --- | --- | --- |
| Cost | $0 | $99/yr Apple Developer Program |
| Deploy | `git push` → live in ~60s | Build, sign, upload, wait for processing |
| Install on iPhone | Safari → Share → *Add to Home Screen* | TestFlight app, 90-day build expiry |
| Offline | Service worker, works on a plane | Yes |
| Full-screen, no browser chrome | Yes (`display: standalone`) | Yes |
| Works on desktop browser too | Yes, same code | No |
| Iteration speed while learning | Minutes | Hours |

A chess board is a grid of tap targets and some SVG overlays. There is nothing here
that needs native. The one thing iOS PWAs lack is push notifications for study
reminders — not worth $99/yr and a build pipeline.

**Escape hatch:** if you later want it in the App Store, wrap the same build with
[Capacitor](https://capacitorjs.com/) — no rewrite, and *then* add TestFlight via
Actions. Design for that from day one by keeping all storage behind one
`storage.ts` module.

### Stack

- **Vite + TypeScript + Preact** — small bundle, fast cold start on mobile.
- **[chess.js](https://github.com/jhlywa/chess.js)** — move legality, FEN/PGN, check/mate
  detection. Never hand-roll this.
- **[Chessground](https://github.com/lichess-org/chessground)** — Lichess's board widget.
  Touch-first, already handles tap-tap moves, arrows, square highlights, and piece
  animation. This is what gives you a mobile-grade board for free.
- **vite-plugin-pwa** — manifest + service worker, one config block.
- **IndexedDB** (via `idb`) for progress and the review schedule.
- **GitHub Actions** → `actions/deploy-pages`. Plus a **content CI job** (§7).

No backend. No accounts. Everything is on-device.

---

## 2. The core problem, and the actual fix

You said you beat average players but lose to anyone with an opening. That is almost
never an opening-*memorization* gap. It's two things:

1. **You walk into known traps** in the first 10 moves. (Fried Liver, Scholar's,
   Legal's, Blackburne Shilling, Fishing Pole.) A prepared opponent isn't
   out-thinking you — they're steering you into a position they've seen 50 times.
2. **You have no plan on move 12.** Development finishes and you start shuffling.
   Your opponent has a *structural* plan (minority attack, open file, outpost) and
   grinds you down.

So the curriculum is not "memorize 20 openings." It's:

> **Recognize → Refute → Repertoire → Plan.**

Openings are the *vehicle* for teaching recognition and planning, not the content.

---

## 3. Curriculum

### Tier 0 — Principles as measurable habits
Not prose. Each is a number the app computes on your position every move, so it can
say *"your development score dropped and your king is still on e1 at move 11."*

- Center occupancy + center control (d4/e4/d5/e5)
- Development count (minors off the back rank)
- King safety (castled? rights intact? pawn shield? open file toward king?)
- Same piece moved twice before development finished
- Early queen sortie that can be chased with tempo
- Self-blocking (Nd2 in front of the c1 bishop, Bd3 in front of the d-pawn)
- Material, via static exchange evaluation (§5)

### Tier 1 — Traps to recognize and refute *(highest value, build first)*
These are the ones actually being used on you.

| Pattern | You learn to |
| --- | --- |
| Scholar's Mate (`Qh5`/`Qf3` + `Bc4`) | See the f7 double-attack instantly |
| Wayward Queen (`2.Qh5`) | Punish the queen, gain tempo |
| Fried Liver / Traxler (`Ng5` on f7) | Meet `Ng5` correctly, know when `d5` is real |
| Legal's Mate | Recognize the pinned-knight sacrifice |
| Blackburne Shilling (`Nd4`) | Not fall for it *and* not fall for the counter |
| Fishing Pole (`Ng4` + `h5`) | Refuse the free knight |
| Englund Gambit (`1.d4 e5`) | Decline greed, keep the extra pawn safely |
| Smith-Morra / Danish gambits | Accept, return the pawn, finish development |

### Tier 2 — A small coherent repertoire
Three openings total. That is enough forever at club level.

- **As White:** the **Italian Game** (`1.e4 e5 2.Nf3 Nc6 3.Bc4`). Chosen because
  every classical principle is visible in it. (Alternative if you want near-zero
  theory: the **London System** — but it teaches less.)
- **vs 1.e4:** the **Caro-Kann** (`1...c6`). Solid, plan-driven, punishes people who
  only know how to attack.
- **vs 1.d4:** the **Queen's Gambit Declined**. Teaches the Carlsbad structure, which
  feeds directly into Tier 3.

### Tier 3 — Structures, i.e. the actual strategy
This is what you're missing beyond openings. Each is taught as a *plan*, not moves.

- **Isolated queen's pawn** — attacker gets `d5`/`e5` outposts and piece play;
  defender trades pieces and blockades `d5`.
- **Carlsbad / minority attack** — push `b4-b5` to make a backward `c6` pawn.
- **Open file → 7th rank** — how rooks actually win games.
- **Outposts and knight vs. bishop** — when a knight beats a bishop.
- **Good bishop / bad bishop** — put your pawns on the other color.
- **Space and the pawn break** — every locked position has one correct break.

Tier 3 lessons reuse the *same* drill engine; the "line" is just deeper in the game
and the accept-set is wider.

---

## 4. Content model

Everything the app teaches is data in `content/patterns/*.json`, validated in CI.
Adding a lesson is adding a file. See `content/schema/pattern.schema.json` and the
worked example `content/patterns/scholars-mate-defense.json`.

```
Pattern
├─ id, title, tier, side ("black" | "white" | "both")
├─ idea       — one paragraph: what this position WANTS
├─ cues[]     — recognizable triggers, each anchored to squares/pieces
│              e.g. "White's queen and bishop both aim at f7"
├─ recognition — the pre-drill quiz (§6): tap the threatened square,
│                name the threat. No moves shown.
├─ tree       — FEN-keyed move graph (§4.1)
├─ plan[]     — the metric goals: "castle by move 8", "keep a knight on f6"
└─ drills[]   — which node to start from, which side you play, mode config
```

### 4.1 The tree is FEN-keyed, not move-list-keyed

Storing lines as `["e4","e5","Bc4",...]` breaks the moment you transpose. Instead
each node is keyed by a normalized FEN (position + side to move + castling + en
passant; move counters dropped). That gives transposition handling for free and lets
one node be reached from several move orders.

```jsonc
"nodes": {
  "<fen>": {
    "toMove": "black",
    "threat": "Qxf7# — f7 is attacked twice and defended only by the king.",
    "accept": [
      { "san": "g6", "quality": "best", "why": "Blocks the queen's diagonal and gains a tempo." },
      { "san": "Qe7", "quality": "ok", "why": "Defends f7, but blocks your own bishop." }
    ],
    "reject": [
      { "san": "Nf6", "why": "Doesn't address f7 — Qxf7# ends the game.", "punish": ["Qxf7#"] }
    ],
    "reply": { "san": "Qf3", "why": "White renews the threat on f7." }
  }
}
```

- `accept` — **multiple** correct answers. Critical: the app must never teach that
  there is one holy move.
- `reject` — the mistakes people actually make, each with a `punish` continuation the
  app *plays out* so you feel it.
- `reply` — the computer's move. Deterministic, from the book.
- Anything not in either list falls through to the Referee (§5).

### 4.2 Who plays the other side

The opponent is a **book**, not an engine — by design.

- In book → play `reply`.
- Out of book, **Learn mode** → stop immediately: *"That's not wrong, but it leaves
  the pattern. Here's what changed."* Offer rewind.
- Out of book, **Test mode** → the Referee picks a principled reply (§5) and play
  continues for up to N more plies before final judgment. This is the only place the
  app "thinks," and it only needs to be club-level-plausible for ~6 moves.

---

## 5. The Referee — where the intelligence lives

This is the piece that makes the app work without an engine. It's a **static
evaluator** — no search tree, no opening database — that runs after every move and
answers *"did that move hurt you, and how?"*

### 5.1 Static Exchange Evaluation (SEE)
The single highest-value 150 lines in the project. For a target square, list all
attackers and defenders of both colors, sort by value, and simulate the capture
sequence in order. No search required, exact answer.

It gives you, for free:
- "You just hung a knight."
- "That capture loses material: you win a pawn but lose the exchange."
- "That piece is defended — the capture doesn't work for them."

Run SEE over every square containing one of your pieces after your move → **hanging
piece detection**. Run it over every square your opponent can capture on → **threat
detection**, which powers the `cues` and recognition quizzes automatically.

### 5.2 Principle metrics
Cheap, computed from the FEN every ply:

```ts
type Snapshot = {
  material: number;           // centipawns, SEE-adjusted
  hanging: Square[];          // your undefended/losing pieces
  threats: Threat[];          // what they can win next move
  development: number;        // minors + rooks off back rank
  centerControl: number;      // attackers of d4/e4/d5/e5, weighted
  kingSafety: number;         // castled, shield pawns, open lines toward king
  tempoLoss: boolean;         // can they hit the piece you just moved, for free?
  selfBlocks: Square[];       // pieces blocking your own pieces
};
```

Feedback = the **diff** between the snapshot before and after your move, ranked by
severity. That means the app can say something useful about *any* legal move you
play, including moves nobody ever wrote a lesson about. That's the trick that lets
"correct me after every move" work without an engine.

### 5.3 Off-book replies
When it must move on its own, the Referee picks the move that: doesn't hang material
(SEE), maximizes `development + centerControl + kingSafety`, and prefers checks/
captures that gain material. That's roughly 1200-strength for the first dozen moves —
which is all it ever needs to be.

### 5.4 Optional later: Stockfish
`stockfish.wasm` runs in a worker on iOS Safari. If you ever want a hard truth check
("was my off-book move actually fine?"), add it as an **opt-in** module behind a
lazy import. Not in v1 — it's ~1MB and the Referee already covers the teaching case.

---

## 6. Modes

### Learn
1. **Concept card** — the `idea`, in words. Board shows the position with *square
   overlays* (target squares, control zones, the piece that's the problem). No arrows
   showing a move. No SAN.
2. **Recognition check** — "Tap the square White is attacking." / "What is the
   threat?" (multiple choice, phrased as ideas: *"Mate on f7"*, *"Winning the e-pawn"*,
   *"Nothing yet — it's a bluff"*). Generated from SEE, so it's free.
3. **Guided play** — you move, feedback every ply:
   - `accept` → confirm *why* it works, in plan language.
   - `reject` → explain, then **play the punishment out on the board** so you see it,
     then rewind one ply and let you retry.
   - unlisted → Referee diff. *"That develops a piece, but it hangs the b-pawn and
     your king is still in the center."*
4. **Hint ladder**, escalating only on request — never volunteered:
   - L1 nudge: *"Something in your position is attacked twice."*
   - L2 constraint: *"The answer involves the kingside pawns."*
   - L3 elimination: highlights 3 candidate squares, one is right.
   - L4 reveal: shows the move. Marks the drill as failed for scheduling purposes.

### Test
No feedback during play. Play the pattern from either side — including **playing the
attack yourself**, which is the fastest way to learn to defend it.

Stop conditions:
- You play a `reject` move, or
- The Referee sees a severity ≥ threshold drop (hung a piece, allowed mate, lost the
  plan metric the pattern declared), or
- The line completes → pass.

On failure → **Replay** (§6.1).

### 6.1 Replay — the post-mortem
Every ply is journaled with its `Snapshot`. On failure the app rewinds to move 1 and
auto-steps forward with:

- The board, one ply at a time (tap to step, or auto-play at ~1s).
- A **metric strip** under the board — small sparklines for material, king safety,
  development, center. The one that fell off a cliff is highlighted red.
- **The divergence ply is marked and the replay pauses there**, with the before/after
  overlay: what you didn't see (the square that was attacked twice), and what the
  position wanted instead — described as a *plan*, still not as a move, unless you
  tap "show me."
- Then it offers: *retry from divergence* / *retry from start* / *play the other side*.

This is the highest-value feature in the app. Losing is normal; not knowing *which
move* lost is what stalls people at your level.

---

## 7. Repo structure and CI

```
/src
  /board        Chessground wrapper, overlays, touch handling
  /engine
    see.ts          static exchange evaluation
    metrics.ts      Snapshot computation
    referee.ts      diff → ranked feedback; off-book move choice
    book.ts         FEN-keyed tree walk + transposition
  /modes
    learn.ts  test.ts  replay.ts
  /store
    progress.ts     mastery, streaks
    schedule.ts     SM-2 spaced repetition over patterns
    storage.ts      the ONLY place that touches IndexedDB (Capacitor escape hatch)
  /ui
/content
  /schema/pattern.schema.json
  /patterns/*.json
/docs/DESIGN.md
/.github/workflows
  deploy.yml     build + deploy to Pages
  content.yml    validate every pattern file
```

**`content.yml` is the important one.** It runs on every push and, for each pattern:
- validates against the JSON Schema;
- replays every line through chess.js — **every FEN must be reachable and every
  `accept`/`reject`/`reply`/`punish` move must be legal**;
- asserts each `reject.punish` actually delivers what it claims (if it says `#`, chess.js
  must agree it's mate);
- asserts every node has ≥1 `accept`.

That means you can write lessons quickly and never ship a broken one.

### Spaced repetition
Each pattern carries an SM-2 state (ease, interval, due date). The home screen is a
single **"Today: 6 drills"** button. Failed Test drills reset the interval. This is
what turns it from a toy into something that actually moves your rating.

---

## 8. Mobile UI

Portrait, one thumb, no scrolling during play.

```
┌─────────────────────┐
│ Fried Liver · Learn │  ← pattern + mode, tap for the idea card
├─────────────────────┤
│                     │
│    BOARD            │  ← full viewport width, tap-tap to move
│    (square)         │     (drag also works; tap-tap is primary on phone)
│                     │
├─────────────────────┤
│ ● material  ● king  │  ← metric dots, green/amber/red, tap to expand
├─────────────────────┤
│ Feedback / plan text│  ← ~3 lines, thumb-reachable
│  [Hint]     [Retry] │
└─────────────────────┘
```

- Board fills the width; everything else is below it and reachable.
- Haptic tick on legal move, buzz on a rejected move.
- Overlays use **square tints and target-square dots**, deliberately *not* move
  arrows — arrows give away moves, which is exactly what you asked it not to do.
- Dark by default, `prefers-color-scheme` aware.

---

## 9. Build order

| Phase | Deliverable |
| --- | --- |
| 1 | Vite + Preact + Chessground + chess.js, PWA manifest, Pages deploy. Board you can move pieces on, on your phone. |
| 2 | `see.ts` + `metrics.ts` + `referee.ts` with unit tests. The brain, headless. |
| 3 | Pattern schema + `content.yml` CI + 3 Tier-1 patterns. |
| 4 | Learn mode with the hint ladder. |
| 5 | Test mode + Replay with the metric strip. |
| 6 | Progress + SM-2 scheduling + home screen. |
| 7 | Fill out Tier 1 (8 patterns), then Tier 2 repertoire, then Tier 3 structures. |

Phases 1–3 are the real work. After that, adding content is writing JSON.
