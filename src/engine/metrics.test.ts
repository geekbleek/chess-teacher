import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { canBeHitWithTempo, centerControl, development, kingSafety, selfBlocks } from './metrics';

function after(...moves: string[]): string {
  const board = new Chess();
  for (const move of moves) board.move(move);
  return board.fen();
}

const START = new Chess().fen();

describe('development', () => {
  it('is zero for both sides at the start', () => {
    expect(development(START, 'w')).toBe(0);
    expect(development(START, 'b')).toBe(0);
  });

  it('counts each minor piece that leaves home', () => {
    expect(development(after('e4', 'e5', 'Nf3'), 'w')).toBe(1);
    expect(development(after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4'), 'w')).toBe(2);
  });

  it('does not double-count a piece that moves twice', () => {
    const twice = after('e4', 'e5', 'Nf3', 'Nc6', 'Ng5', 'Nf6');
    expect(development(twice, 'w')).toBe(1);
  });

  it('rewards connected rooks after castling and clearing the back rank', () => {
    const connected = after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'd3', 'd6', 'Bg5', 'Bg4', 'Nbd2', 'Qd7', 'Qe2', 'O-O');
    // White: 4 minors out, rooks on a1 and f1 with b1/c1/d1/e1 all empty.
    expect(development(connected, 'w')).toBe(5);
  });
});

describe('centerControl', () => {
  it('is symmetric at the start', () => {
    expect(centerControl(START, 'w')).toBe(centerControl(START, 'b'));
  });

  it('rises when you put a pawn in the centre', () => {
    expect(centerControl(after('e4'), 'w')).toBeGreaterThan(centerControl(START, 'w'));
  });

  it('rates two centre pawns above one', () => {
    const one = centerControl(after('e4', 'c5'), 'w');
    const two = centerControl(after('e4', 'c5', 'd4'), 'w');
    expect(two).toBeGreaterThan(one);
  });

  it('counts a knight aiming at the centre even from the edge of it', () => {
    const before = centerControl(after('e4', 'e5'), 'w');
    const afterKnight = centerControl(after('e4', 'e5', 'Nf3'), 'w');
    expect(afterKnight).toBeGreaterThan(before); // Nf3 attacks d4 and e5
  });
});

describe('kingSafety', () => {
  it('is symmetric at the start', () => {
    expect(kingSafety(START, 'w')).toBe(kingSafety(START, 'b'));
  });

  it('improves after castling', () => {
    const before = after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5');
    const castled = after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O');
    expect(kingSafety(castled, 'w')).toBeGreaterThan(kingSafety(before, 'w'));
  });

  it('drops when the king walks and loses the right to castle', () => {
    const before = after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5');
    const walked = after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'Ke2');
    expect(kingSafety(walked, 'w')).toBeLessThan(kingSafety(before, 'w'));
  });

  it('punishes shredding the pawns in front of a castled king', () => {
    const intact = '6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1';
    const shredded = '6k1/5p1p/6p1/8/8/8/5P1P/6K1 w - - 0 1';
    expect(kingSafety(shredded, 'w')).toBeLessThan(kingSafety(intact, 'w'));
  });

  it('punishes an enemy rook on the king\'s file', () => {
    const quiet = '6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1';
    const rooked = '6k1/5ppp/8/8/8/8/5PPP/6Kr w - - 0 1';
    expect(kingSafety(rooked, 'w')).toBeLessThan(kingSafety(quiet, 'w'));
  });
});

describe('selfBlocks', () => {
  it('finds nothing at the start', () => {
    expect(selfBlocks(START, 'w')).toEqual([]);
  });

  it('flags a bishop parked in front of its own unmoved d-pawn', () => {
    // 1.e4 e5 2.Bd3?! -- the bishop now stares at its own d2 pawn.
    expect(selfBlocks(after('e4', 'e5', 'Bd3'), 'w')).toEqual(['d3']);
  });

  it('is happy once the pawn has moved out of the way', () => {
    expect(selfBlocks(after('e4', 'e5', 'd4', 'd5', 'Bd3'), 'w')).toEqual([]);
  });
});

describe('canBeHitWithTempo', () => {
  it('sees that an early queen sortie invites a free developing move', () => {
    // 1.e4 e5 2.Qh5 -- Black plays Nc6 and later g6/Nf6 hitting the queen.
    const fen = after('e4', 'e5', 'Qh5', 'Nc6');
    expect(canBeHitWithTempo(fen, 'h5', 'w')).toBe(true);
  });

  it('does not flag a knight on a good square with nothing cheap attacking it', () => {
    expect(canBeHitWithTempo(after('e4', 'e5', 'Nf3'), 'f3', 'w')).toBe(false);
  });

  it('does not count an attack that simply loses the attacker', () => {
    // A lone black pawn cannot safely attack a defended white queen.
    const fen = '4k3/8/8/8/8/5P2/4Q3/4K3 w - - 0 1';
    expect(canBeHitWithTempo(fen, 'e2', 'w')).toBe(false);
  });
});

describe('kingSafety: opening sanity', () => {
  it('does not treat 1.e4 as a king-safety mistake', () => {
    expect(kingSafety(after('e4'), 'w')).toBe(kingSafety(START, 'w'));
  });

  it('does not treat a normal opening as a king-safety mistake either', () => {
    const opening = after('d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6');
    expect(kingSafety(opening, 'w')).toBe(50);
    expect(kingSafety(opening, 'b')).toBe(50);
  });
});
