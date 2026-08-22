import { useEffect, useRef } from 'preact/hooks';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Color as CgColor, Key } from 'chessground/types';
import { Chess } from 'chess.js';
import type { Square } from '../engine/types';

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
      // Rank and file labels, restyled in styles.css to sit inside the board edge.
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
    cg.setAutoShapes(highlight.map((square) => ({ orig: square as Key, brush: 'red' })));
  }, [fen, orientation, interactive, highlight.join(','), lastMove?.join(',')]);

  return <div class="board" ref={host} />;
}
