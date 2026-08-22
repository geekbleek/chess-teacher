import { Chess } from 'chess.js';
import { PIECE_VALUE, type Color, type Hanging, type Square } from './types';

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/**
 * Rewrite a FEN so it is `color`'s turn. Used to ask "what could they do if it
 * were their move?" — the question behind every threat.
 *
 * The en-passant square is cleared because it cannot survive a turn flip.
 */
export function withTurn(fen: string, color: Color): string {
  const fields = fen.split(' ');
  if (fields[1] === color) return fen;
  fields[1] = color;
  fields[3] = '-';
  return fields.join(' ');
}

export function loadRelaxed(fen: string): Chess {
  // Turn-flipped positions are often "illegal" (the side not to move is in check),
  // but they are exactly the positions we need to reason about.
  return new Chess(fen, { skipValidation: true });
}

/**
 * Static Exchange Evaluation.
 *
 * Plays out the full capture sequence on `target` — cheapest attacker first, both
 * sides recapturing — and returns the centipawns `attacker` nets by starting it.
 * Positive means the capture wins material.
 *
 * No search tree: the answer is exact for the capture sequence itself. X-rays are
 * handled because the board is genuinely mutated as pieces come off, so a rook
 * behind a rook is revealed to `attackers()` on the next iteration.
 *
 * Known limitation, shared with every engine's SEE: pins are ignored. A defender
 * that is pinned to its king still counts as a defender here. `threatsAgainst()`
 * compensates by requiring a legal capture to exist before reporting a threat.
 */
export function see(fen: string, target: Square, attacker: Color): number {
  const board = loadRelaxed(fen);
  const victim = board.get(target);
  if (!victim || victim.color === attacker) return 0;

  let from = leastValuableAttacker(board, target, attacker);
  if (!from) return 0;

  const gain: number[] = [PIECE_VALUE[victim.type]];
  let side = attacker;
  let depth = 0;

  for (;;) {
    const piece = board.get(from);
    if (!piece) break;

    // A king may only capture if the other side no longer defends the square.
    if (piece.type === 'k' && board.attackers(target, other(side)).length > 0) break;

    depth++;
    gain[depth] = PIECE_VALUE[piece.type] - (gain[depth - 1] ?? 0);

    // Actually move the piece. Mutating the board is what makes x-rays work:
    // a rook behind the rook that just captured becomes a real attacker next pass.
    board.remove(from);
    board.remove(target);
    board.put({ type: piece.type, color: piece.color }, target);

    side = other(side);
    const next = leastValuableAttacker(board, target, side);
    if (!next) break;
    from = next;
  }

  // Negamax back up: at every point either side could have declined to continue.
  for (let d = depth - 1; d > 0; d--) {
    gain[d - 1] = -Math.max(-(gain[d - 1] ?? 0), gain[d] ?? 0);
  }
  const result = gain[0] ?? 0;
  return result === 0 ? 0 : result; // normalize -0
}

function leastValuableAttacker(board: Chess, target: Square, side: Color): Square | undefined {
  let best: Square | undefined;
  let bestValue = Infinity;
  for (const square of board.attackers(target, side)) {
    const piece = board.get(square);
    if (!piece) continue;
    const value = PIECE_VALUE[piece.type];
    if (value < bestValue) {
      bestValue = value;
      best = square;
    }
  }
  return best;
}

/**
 * Every piece of `color` that the opponent can profitably capture, worst loss first.
 *
 * This is the workhorse behind "you just hung a knight" and behind the automatic
 * generation of recognition quizzes — no lesson has to declare its own threats.
 */
export function threatsAgainst(fen: string, color: Color): Hanging[] {
  const opponent = other(color);
  const oppTurn = withTurn(fen, opponent);
  const board = loadRelaxed(oppTurn);

  // Pin- and check-aware: only squares the opponent can *legally* capture on.
  const legalTargets = new Set<Square>();
  for (const move of board.moves({ verbose: true })) {
    if (move.captured) legalTargets.add(move.to);
  }

  const found: Hanging[] = [];
  for (const target of legalTargets) {
    const piece = board.get(target);
    if (!piece || piece.color !== color || piece.type === 'k') continue;
    const loss = see(oppTurn, target, opponent);
    if (loss > 0) found.push({ square: target, piece: piece.type, loss });
  }
  return found.sort((a, b) => b.loss - a.loss);
}

/** Does the opponent have mate in one available right now? */
export function mateInOneAvailable(fen: string, forColor: Color): boolean {
  const board = loadRelaxed(withTurn(fen, forColor));
  for (const move of board.moves()) {
    board.move(move);
    const mate = board.isCheckmate();
    board.undo();
    if (mate) return true;
  }
  return false;
}

/** Material balance in centipawns from `color`'s point of view. Kings excluded. */
export function materialBalance(fen: string, color: Color): number {
  const board = loadRelaxed(fen);
  let total = 0;
  for (const row of board.board()) {
    for (const square of row) {
      if (!square || square.type === 'k') continue;
      total += square.color === color ? PIECE_VALUE[square.type] : -PIECE_VALUE[square.type];
    }
  }
  return total;
}
