import { useMemo, useState } from 'preact/hooks';
import { Chess } from 'chess.js';
import { Board } from '../board/Board';
import { chooseReply, gameOverText, reviewMove, snapshot, type Review } from '../engine/referee';
import type { Color, Square } from '../engine/types';
import { MetricStrip } from './MetricStrip';
import { go } from './router';

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
export function FreePlay() {
  const [fen, setFen] = useState(START);
  const [history, setHistory] = useState<Ply[]>([]);
  const [orientation] = useState<'white' | 'black'>('white');
  const [thinking, setThinking] = useState(false);

  const you: Color = orientation === 'white' ? 'w' : 'b';
  const view = useMemo(() => snapshot(fen, you), [fen, you]);

  // Without this the board simply locks when the game ends, with nothing to explain why.
  const over = useMemo(() => gameOverText(fen), [fen]);
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
    <div class="screen">
      <header class="app-header">
        <button type="button" class="back" onClick={() => go('#/')}>
          ‹ Home
        </button>
        <h1>Free play</h1>
      </header>
      <p class="lede">
        No lesson, no book. Play anything and the Referee tells you what it did to your position.
      </p>

      <Board
        fen={fen}
        orientation={orientation}
        highlight={highlight}
        lastMove={lastMove}
        onMove={play}
        interactive={!thinking && !over}
      />

      <MetricStrip view={view} />

      <div class={`feedback ${over ? 'info' : yourLast ? severityClass(yourLast) : ''}`}>
        {over && <p class="headline">{over} Take back a move, or reset.</p>}
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



function severityClass(ply: Ply): string {
  return ply.review.findings[0]?.severity ?? 'good';
}
