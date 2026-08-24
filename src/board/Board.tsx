import { useEffect, useRef } from 'preact/hooks';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Color as CgColor, Key } from 'chessground/types';
import { Chess } from 'chess.js';
import type { Square } from '../engine/types';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/**
 * True on a touch device.
 *
 * Dragging a piece and scrolling the page are the same gesture, and the board is most
 * of the screen — so on a phone the board gives the gesture up entirely and moves are
 * made tap-tap, which is the primary interaction anyway. A mouse keeps drag.
 */
const coarsePointer =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Squares in display order, top-left to bottom-right, for the tap overlay. */
function displayOrder(orientation: 'white' | 'black'): Square[] {
  const files = orientation === 'white' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'white' ? [...RANKS].reverse() : RANKS;
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square));
}

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  /** Squares to tint — used for threats and lesson focus. Never for showing a move. */
  highlight?: Square[];
  /** The move just played, so the board shows where it came from. */
  lastMove?: [Square, Square];
  /** Called with SAN when the player makes a legal move. */
  onMove: (san: string) => void;
  interactive?: boolean;
  /** Called when a square is tapped. Used by the "spot the square" challenges. */
  onSquareSelect?: (square: Square) => void;
  /** Tint applied to a correctly identified square. */
  correct?: Square[];
  /** Tint applied to a wrong guess. */
  wrong?: Square[];
}

/** Legal destinations per origin square, in the shape Chessground wants. */
function legalDests(fen: string): Map<Key, Key[]> {
  const board = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  for (const move of board.moves({ verbose: true })) {
    const list = dests.get(move.from as Key) ?? [];
    list.push(move.to as Key);
    dests.set(move.from as Key, list);
  }
  return dests;
}

export function Board({
  fen,
  orientation,
  highlight = [],
  lastMove,
  onMove,
  interactive = true,
  onSquareSelect,
  correct = [],
  wrong = [],
}: BoardProps) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api>();
  // Kept in a ref so the Chessground callback always sees the current handler
  // without tearing down and rebuilding the board on every render.
  const handler = useRef(onMove);
  handler.current = onMove;

  useEffect(() => {
    if (!host.current) return;
    api.current = Chessground(host.current, {
      // Ranks only. Chessground draws file letters along the bottom rank, where the
      // pieces are; ours go in a dedicated row under the board instead.
      coordinates: true,
      animation: { duration: 180 },
      // Tap-tap is the primary interaction on a phone; drag still works.
      draggable: { enabled: true, showGhost: true },
      selectable: { enabled: true },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: false },
      // User drawing is off, but we still render our own square tints.
      drawable: { enabled: false, visible: true },
    });
    return () => api.current?.destroy();
  }, []);

  useEffect(() => {
    const cg = api.current;
    if (!cg) return;
    const board = new Chess(fen);
    const turn: CgColor = board.turn() === 'w' ? 'white' : 'black';

    cg.set({
      fen,
      orientation,
      turnColor: turn,
      // A board you cannot move on must not swallow touches, or the page cannot be
      // scrolled by dragging over it — and on a phone the board is most of the page.
      draggable: { enabled: interactive && !coarsePointer, showGhost: true },
      selectable: { enabled: interactive },
      check: board.isCheck(),
      lastMove: lastMove as Key[] | undefined,
      movable: {
        free: false,
        color: interactive && turn === orientation ? turn : undefined,
        dests: legalDests(fen),
        // `showDests: false` is deliberate. Lighting up every legal square is a
        // crutch that does half the thinking for you.
        showDests: false,
        events: {
          after: (from: Key, to: Key) => {
            const candidates = new Chess(fen)
              .moves({ verbose: true })
              .filter((m) => m.from === from && m.to === to);
            // Auto-queen: which piece you promote to is never the lesson here.
            const move = candidates.find((m) => m.promotion === 'q') ?? candidates[0];
            if (move) handler.current(move.san);
          },
        },
      },
    });
    // Circles on squares, never arrows between them: the app tints what matters and
    // leaves you to work out the move.
    cg.setAutoShapes([
      ...highlight.map((square) => ({ orig: square as Key, brush: 'red' })),
      ...correct.map((square) => ({ orig: square as Key, brush: 'green' })),
      ...wrong.map((square) => ({ orig: square as Key, brush: 'yellow' })),
    ]);
  }, [
    fen,
    orientation,
    interactive,
    highlight.join(','),
    correct.join(','),
    wrong.join(','),
    lastMove?.join(','),
  ]);

  const files = orientation === 'white' ? FILES : [...FILES].reverse();

  return (
    <div class="board-stack">
      {/* The modifier lives on the frame, never on the board itself: Chessground adds
          its own classes (cg-wrap, orientation-*) to that element after mount, and a
          class Preact re-renders would wipe them — taking all of Chessground's CSS
          with them, including the pointer-events rules on its overlay layers. */}
      <div
        class={`board-frame ${interactive ? 'live' : 'static'}${coarsePointer ? ' coarse' : ''}`}
      >
        <div class="board" ref={host} />
        {/* Chessground only reports square taps while the board is movable, which a
            static diagram is not — so tapping goes through our own overlay grid. */}
        {onSquareSelect && (
          <div class="square-grid">
            {displayOrder(orientation).map((square) => (
              <button
                key={square}
                type="button"
                aria-label={square}
                onClick={() => onSquareSelect(square)}
              />
            ))}
          </div>
        )}
      </div>
      <div class="file-labels">
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    </div>
  );
}
