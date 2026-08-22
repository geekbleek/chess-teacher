import { useMemo, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from './board/Board';
import { chooseReply, reviewMove, snapshot, type Review } from './engine/referee';
import type { Color, Square } from './engine/types';

interface Ply {
  san: string;
  fenBefore: string;
  review: Review;
}

const START = new Chess().fen();

/**
 * Phase 1-2 shell: a real board with the Referee wired up live.
 *
 * There are no lesson modes yet. This exists so the engine can be felt on a phone —
 * play any move and see exactly what the teaching layer will have to say about it.
 */
export function App() {
  const [fen, setFen] = useState(START);
  const [history, setHistory] = useState<Ply[]>([]);
  const [orientation] = useState<'white' | 'black'>('white');
  const [thinking, setThinking] = useState(false);

  const you: Color = orientation === 'white' ? 'w' : 'b';
  const view = useMemo(() => snapshot(fen, you), [fen, you]);
  const last = history[history.length - 1];

  function play(san: string) {
    const review = reviewMove(fen, san);
    const board = new Chess(fen);
    board.move(san);
    const next = board.fen();

    setHistory((h) => [...h, { san, fenBefore: fen, review }]);
    setFen(next);

    if (board.isGameOver()) return;
    setThinking(true);
    // Yield to the browser so the board paints your move before the reply lands.
    setTimeout(() => {
      const reply = chooseReply(next);
      if (reply) {
        const after = new Chess(next);
        after.move(reply);
        setHistory((h) => [
          ...h,
          { san: reply, fenBefore: next, review: reviewMove(next, reply) },
        ]);
        setFen(after.fen());
      }
      setThinking(false);
    }, 60);
  }

  function reset() {
    setFen(START);
    setHistory([]);
  }

  function undo() {
    if (history.length === 0) return;
    // Step back over both your move and the reply.
    const back = history.length >= 2 ? 2 : 1;
    const target = history[history.length - back]!;
    setFen(target.fenBefore);
    setHistory((h) => h.slice(0, h.length - back));
  }

  const highlight: Square[] = view.hanging.map((h) => h.square);
  const yourLast = [...history].reverse().find((p) => p.review.move.color === you);
  const lastMove: [Square, Square] | undefined = last
    ? [last.review.move.from, last.review.move.to]
    : undefined;

  return (
    <div class="app">
      <header>
        <h1>Chess Teacher</h1>
        <span class="mode">sandbox</span>
      </header>

      <Board
        fen={fen}
        orientation={orientation}
        highlight={highlight}
        lastMove={lastMove}
        onMove={play}
        interactive={!thinking}
      />

      <div class="metrics">
        <Metric label="material" value={pawnString(view.material)} tone={tone(view.material, -50, 50)} />
        <Metric label="king" value={String(view.kingSafety)} tone={tone(view.kingSafety, 45, 60)} />
        <Metric label="develop" value={`${view.development}/5`} tone={tone(view.development, 1, 3)} />
        <Metric label="centre" value={String(view.centerControl)} tone={tone(view.centerControl, 3, 6)} />
      </div>

      <div class={`feedback ${yourLast ? severityClass(yourLast) : ''}`}>
        {view.mateAllowed && <p class="alarm">There is a mate threat against you right now.</p>}
        {!view.mateAllowed && view.hanging[0] && (
          <p class="alarm">
            Right now: your {pieceName(view.hanging[0].piece)} on {view.hanging[0].square} is loose.
          </p>
        )}
        {yourLast ? (
          <>
            <p class="headline">
              <strong>{yourLast.san}</strong> — {yourLast.review.headline}
            </p>
            <ul>
              {yourLast.review.findings.slice(1, 4).map((f) => (
                <li key={f.code} class={f.severity}>
                  {f.text}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p class="headline">Play a move. Every one gets judged on what it did to the position.</p>
        )}
        {last && last.review.move.color !== you && (
          <p class="reply">They played {last.san}.</p>
        )}
      </div>

      <div class="controls">
        <button onClick={undo} disabled={history.length === 0}>
          Take back
        </button>
        <button onClick={reset} disabled={history.length === 0}>
          Reset
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div class={`metric ${tone}`}>
      <span class="value">{value}</span>
      <span class="label">{label}</span>
    </div>
  );
}

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function pieceName(symbol: string): string {
  return PIECE_NAMES[symbol] ?? 'piece';
}

function tone(value: number, bad: number, good: number): string {
  if (value <= bad) return 'bad';
  if (value >= good) return 'good';
  return 'ok';
}

function pawnString(centipawns: number): string {
  if (centipawns === 0) return '=';
  const pawns = (centipawns / 100).toFixed(centipawns % 100 === 0 ? 0 : 1);
  return centipawns > 0 ? `+${pawns}` : pawns;
}

function severityClass(ply: Ply): string {
  return ply.review.findings[0]?.severity ?? 'good';
}
