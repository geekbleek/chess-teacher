import { CENTER, PIECE_VALUE, type Color, type Square } from './types';
import { loadRelaxed, see, withTurn } from './see';
import type { Chess } from 'chess.js';

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const fileOf = (square: Square): string => square[0]!;
const rankOf = (square: Square): number => Number(square[1]);
const sq = (file: string, rank: number): Square => `${file}${rank}` as Square;

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Where the minor pieces start. Getting them off these squares is "development". */
const HOME: Record<Color, Array<{ square: Square; type: 'n' | 'b' }>> = {
  w: [
    { square: 'b1', type: 'n' },
    { square: 'g1', type: 'n' },
    { square: 'c1', type: 'b' },
    { square: 'f1', type: 'b' },
  ],
  b: [
    { square: 'b8', type: 'n' },
    { square: 'g8', type: 'n' },
    { square: 'c8', type: 'b' },
    { square: 'f8', type: 'b' },
  ],
};

/**
 * Minor pieces off their starting squares (0-4), plus 1 if the rooks see each other.
 *
 * Deliberately crude. It is not measuring whether the pieces are *well* placed —
 * only whether they have joined the game, which is the habit being taught.
 */
export function development(fen: string, color: Color): number {
  const board = loadRelaxed(fen);
  let score = 0;
  for (const { square, type } of HOME[color]) {
    const piece = board.get(square);
    if (!piece || piece.color !== color || piece.type !== type) score++;
  }
  if (rooksConnected(board, color)) score++;
  return score;
}

function rooksConnected(board: Chess, color: Color): boolean {
  const rank = color === 'w' ? 1 : 8;
  const rooks: Square[] = [];
  for (const file of FILES) {
    const piece = board.get(sq(file, rank));
    if (piece && piece.color === color && piece.type === 'r') rooks.push(sq(file, rank));
  }
  if (rooks.length < 2) return false;
  const [left, right] = [rooks[0]!, rooks[1]!];
  const from = FILES.indexOf(fileOf(left));
  const to = FILES.indexOf(fileOf(right));
  for (let i = from + 1; i < to; i++) {
    if (board.get(sq(FILES[i]!, rank))) return false;
  }
  return true;
}

/**
 * Weighted grip on d4/e4/d5/e5: a pawn planted there counts double, a piece counts
 * once, and every attacker of the square counts once more.
 */
export function centerControl(fen: string, color: Color): number {
  const board = loadRelaxed(fen);
  let score = 0;
  for (const square of CENTER) {
    const piece = board.get(square);
    if (piece && piece.color === color) score += piece.type === 'p' ? 2 : 1;
    score += board.attackers(square, color).length;
  }
  return score;
}

/**
 * 0-100, where 50 is "starting position, nothing decided yet".
 *
 * The pawn shield is only assessed once the king has actually settled — castled, or
 * stuck in the centre with the right to castle gone. While the king is still on e1
 * with both rooks available, pushing the e-pawn is not a safety problem, it is just
 * chess, and an earlier version of this that scored it as one called 1.e4 a blunder.
 */
export function kingSafety(fen: string, color: Color): number {
  const board = loadRelaxed(fen);
  const king = findKing(board, color);
  if (!king) return 0;

  const homeRank = color === 'w' ? 1 : 8;
  const kingFileIndex = FILES.indexOf(fileOf(king));
  const castled = rankOf(king) === homeRank && (kingFileIndex <= 2 || kingFileIndex >= 6);
  const rights = fen.split(' ')[2] ?? '-';
  const hasRights = color === 'w' ? /[KQ]/.test(rights) : /[kq]/.test(rights);

  // Nothing has been decided yet.
  if (!castled && hasRights) return 50;

  let score = castled ? 70 : 35;
  const shieldRanks = color === 'w' ? [2, 3] : [7, 6];
  const nearbyFiles = [kingFileIndex - 1, kingFileIndex, kingFileIndex + 1].filter(
    (i) => i >= 0 && i < 8,
  );

  for (const index of nearbyFiles) {
    const file = FILES[index]!;
    const near = board.get(sq(file, shieldRanks[0]!));
    const far = board.get(sq(file, shieldRanks[1]!));
    if (near && near.color === color && near.type === 'p') score += 6;
    else if (far && far.color === color && far.type === 'p') score += 3;
    else score -= 8; // no shield pawn on this file at all
  }

  // Enemy queens and rooks pointing at the king down a nearby file.
  for (const index of nearbyFiles) {
    const file = FILES[index]!;
    for (let rank = 1; rank <= 8; rank++) {
      const piece = board.get(sq(file, rank));
      if (piece && piece.color !== color && (piece.type === 'q' || piece.type === 'r')) {
        score -= 10;
        break;
      }
    }
  }

  return Math.max(0, Math.min(100, score));
}

function findKing(board: Chess, color: Color): Square | undefined {
  for (const row of board.board()) {
    for (const entry of row) {
      if (entry && entry.color === color && entry.type === 'k') return entry.square;
    }
  }
  return undefined;
}

/**
 * Your own pieces standing on d3/e3 (or d6/e6) while the pawn behind them has not
 * moved — the classic self-inflicted traffic jam that leaves a bishop staring at
 * its own pawn all game.
 */
export function selfBlocks(fen: string, color: Color): Square[] {
  const board = loadRelaxed(fen);
  const blockRank = color === 'w' ? 3 : 6;
  const pawnRank = color === 'w' ? 2 : 7;
  const blocked: Square[] = [];
  for (const file of ['d', 'e']) {
    const blocker = board.get(sq(file, blockRank));
    const pawn = board.get(sq(file, pawnRank));
    if (
      blocker &&
      blocker.color === color &&
      blocker.type !== 'p' &&
      pawn &&
      pawn.color === color &&
      pawn.type === 'p'
    ) {
      blocked.push(sq(file, blockRank));
    }
  }
  return blocked;
}

/**
 * Can the opponent attack the piece on `square` with something cheaper, and get away
 * with it? That is the definition of losing a tempo: you have to react, they gained
 * a free move of development.
 */
export function canBeHitWithTempo(fen: string, square: Square, color: Color): boolean {
  const opponent = other(color);
  const board = loadRelaxed(withTurn(fen, opponent));
  const target = board.get(square);
  if (!target || target.color !== color) return false;

  for (const move of board.moves({ verbose: true })) {
    if (PIECE_VALUE[move.piece] >= PIECE_VALUE[target.type]) continue;
    board.move(move);
    const hits = board.attackers(square, opponent).includes(move.to);
    // The attacking piece has to survive where it lands, or it is not a threat.
    const survives = hits && see(board.fen(), move.to, color) <= 0;
    board.undo();
    if (survives) return true;
  }
  return false;
}
