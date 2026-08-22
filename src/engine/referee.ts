import type { Move } from 'chess.js';
import {
  canBeHitWithTempo,
  centerControl,
  development,
  kingSafety,
  selfBlocks,
} from './metrics';
import { loadRelaxed, materialBalance, mateInOneAvailable, threatsAgainst } from './see';
import type { Color, Finding, Severity, Snapshot, Square } from './types';

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const pawns = (centipawns: number): string => (centipawns / 100).toFixed(centipawns % 100 ? 1 : 0);

/** Everything measurable about a position, from one side's point of view. */
export function snapshot(fen: string, color: Color): Snapshot {
  const hanging = threatsAgainst(fen, color);
  return {
    fen,
    color,
    material: materialBalance(fen, color),
    hanging,
    threatened: hanging.reduce((sum, h) => sum + h.loss, 0),
    mateAllowed: mateInOneAvailable(fen, other(color)),
    development: development(fen, color),
    centerControl: centerControl(fen, color),
    kingSafety: kingSafety(fen, color),
    selfBlocks: selfBlocks(fen, color),
  };
}

export interface Review {
  move: Move;
  before: Snapshot;
  after: Snapshot;
  /** Worst first. Empty means the move was unremarkable and fine. */
  findings: Finding[];
  /** The single line worth showing under the board. */
  headline: string;
}

const RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2, good: 3 };

/**
 * Judge one move by what it did to the position, not by whether it matches a book.
 *
 * This is what lets Learn mode respond to any legal move you play, including moves
 * no lesson ever anticipated: the feedback is the difference between two Snapshots.
 */
export function reviewMove(fenBefore: string, san: string): Review {
  const board = loadRelaxed(fenBefore);
  const move = board.move(san);
  const fenAfter = board.fen();
  const color = move.color;

  const before = snapshot(fenBefore, color);
  const after = snapshot(fenAfter, color);
  const findings: Finding[] = [];
  const add = (code: string, severity: Severity, text: string, squares?: Square[]) =>
    findings.push({ code, severity, text, ...(squares ? { squares } : {}) });

  // --- Did you just lose the game? ---------------------------------------------
  if (after.mateAllowed) {
    add(
      before.mateAllowed ? 'mate-ignored' : 'mate-allowed',
      'critical',
      before.mateAllowed
        ? 'That does not stop the mate. It is still there next move.'
        : 'That allows mate in one.',
    );
  } else if (before.mateAllowed) {
    add('mate-stopped', 'good', 'Mate threat handled.');
  }

  // --- Material ------------------------------------------------------------------
  const worst = after.hanging[0];
  if (worst) {
    const wasAlready = before.hanging.some((h) => h.square === worst.square);
    const severity: Severity = worst.loss >= 200 ? 'critical' : 'major';
    add(
      wasAlready ? 'material-still-hanging' : 'material-hangs',
      severity,
      wasAlready
        ? `Your ${NAMES[worst.piece]} on ${worst.square} was already loose and still is — ${pawns(worst.loss)} pawns.`
        : `That leaves your ${NAMES[worst.piece]} on ${worst.square} for free — ${pawns(worst.loss)} pawns.`,
      [worst.square],
    );
  } else if (before.threatened > 0) {
    add('material-saved', 'good', 'Everything is defended again.');
  }

  const lost = before.material - after.material;
  if (lost > 0 && !move.captured) {
    add('material-lost', 'major', `That move costs ${pawns(lost)} pawns outright.`);
  }

  // --- King safety ---------------------------------------------------------------
  const safetyDelta = after.kingSafety - before.kingSafety;
  if (safetyDelta <= -10) {
    add('king-exposed', 'major', 'That makes your king noticeably less safe.');
  } else if (move.san.startsWith('O-O')) {
    add('castled', 'good', 'King tucked away, rook joins the game.');
  }

  // --- Development and tempo -----------------------------------------------------
  const fullmove = Number(fenBefore.split(' ')[5] ?? '1');
  const developedSomething = after.development > before.development;
  const homeSquares: Record<Color, Square[]> = {
    w: ['b1', 'g1', 'c1', 'f1'],
    b: ['b8', 'g8', 'c8', 'f8'],
  };

  if (developedSomething) {
    add('developed', 'good', `${NAMES[move.piece]} into the game.`);
  } else if (
    after.development < 4 &&
    (move.piece === 'n' || move.piece === 'b') &&
    !homeSquares[color].includes(move.from)
  ) {
    add(
      'moved-twice',
      'minor',
      `You moved the same ${NAMES[move.piece]} again while ${4 - after.development} pieces are still at home.`,
    );
  }

  if (move.piece === 'q' && fullmove <= 5 && before.development < 2) {
    add('early-queen', 'minor', 'The queen is out before your pieces. She is the easiest piece to chase.');
  }

  if (canBeHitWithTempo(after.fen, move.to, color)) {
    add(
      'tempo-loss',
      'minor',
      `They can hit your ${NAMES[move.piece]} on ${move.to} with something cheaper and develop for free.`,
      [move.to],
    );
  }

  // --- Position ------------------------------------------------------------------
  const centerDelta = after.centerControl - before.centerControl;
  if (centerDelta <= -2) {
    add('center-given-up', 'minor', 'That gives up ground in the centre.');
  } else if (centerDelta >= 2) {
    add('center-gained', 'good', 'That takes more of the centre.');
  }

  const newBlocks = after.selfBlocks.filter((s) => !before.selfBlocks.includes(s));
  for (const square of newBlocks) {
    add('self-block', 'minor', `Your piece on ${square} is now blocking your own pawn.`, [square]);
  }

  findings.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return {
    move,
    before,
    after,
    findings,
    headline: findings[0]?.text ?? 'Reasonable. Nothing broke.',
  };
}

/** The worst thing in a review, for deciding whether a Test drill should stop. */
export function worstSeverity(review: Review): Severity {
  return review.findings[0]?.severity ?? 'good';
}

/**
 * The opponent's move when the drill has left its book.
 *
 * A static one-ply chooser: never hang material, then take the most development,
 * centre and king safety available. Around club level for the first dozen moves,
 * which is the only span it is ever asked to cover.
 */
export function chooseReply(fen: string): string | undefined {
  const board = loadRelaxed(fen);
  const color = board.turn();
  const legal = [...board.moves()].sort(); // sorted so ties break deterministically
  if (legal.length === 0) return undefined;

  // Pass 1: cheap positional score for every legal move.
  const scored = legal.map((san) => {
    board.move(san);
    const next = board.fen();
    board.undo();

    const threatened = threatsAgainst(next, color).reduce((sum, h) => sum + h.loss, 0);
    let score = materialBalance(next, color) - threatened;
    score += development(next, color) * 8;
    score += centerControl(next, color) * 4;
    score += kingSafety(next, color) * 0.5;
    if (san.includes('#')) score += 100_000;
    return { san, next, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Pass 2: the mate check is the expensive one, so only the shortlist pays for it.
  // A move that lets the opponent mate is disqualified no matter how good it looked.
  for (const candidate of scored.slice(0, 6)) {
    if (candidate.san.includes('#')) return candidate.san;
    if (!mateInOneAvailable(candidate.next, other(color))) return candidate.san;
  }
  return scored[0]?.san;
}
