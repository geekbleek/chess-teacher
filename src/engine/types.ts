import type { Color, PieceSymbol, Square } from 'chess.js';

export type { Color, PieceSymbol, Square };

/** Centipawn values. Deliberately classical — the numbers only need to rank moves. */
export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export const CENTER: Square[] = ['d4', 'e4', 'd5', 'e5'];

/** A piece of yours the opponent can profitably take. */
export interface Hanging {
  square: Square;
  piece: PieceSymbol;
  /** Centipawns you lose if they take and the exchange plays out. Always > 0. */
  loss: number;
}

/** Everything the Referee measures about one position, from one side's point of view. */
export interface Snapshot {
  fen: string;
  color: Color;
  /** Material balance in centipawns, positive = `color` is ahead. */
  material: number;
  /** Your pieces the opponent can win material on, worst first. */
  hanging: Hanging[];
  /** Total centipawns available to the opponent right now. */
  threatened: number;
  /** True if the opponent has a mate in one available. */
  mateAllowed: boolean;
  /** Minor pieces off their home squares (0-4), plus 1 per connected rook. */
  development: number;
  /** Weighted occupation + attack count over d4/e4/d5/e5. */
  centerControl: number;
  /** 0-100. Castling, pawn shield, and open lines pointing at your king. */
  kingSafety: number;
  /** Your own pieces standing in the way of your other pieces. */
  selfBlocks: Square[];
}

/** `good` is a finding too — the Referee is supposed to tell you what worked. */
export type Severity = 'critical' | 'major' | 'minor' | 'good';

export interface Finding {
  code: string;
  severity: Severity;
  text: string;
  squares?: Square[];
}
