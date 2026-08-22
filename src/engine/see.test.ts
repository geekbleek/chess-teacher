import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { materialBalance, mateInOneAvailable, see, threatsAgainst, withTurn } from './see';

/** Play SAN moves from the start and return the FEN. Keeps tests readable. */
function after(...moves: string[]): string {
  const board = new Chess();
  for (const move of moves) board.move(move);
  return board.fen();
}

describe('see', () => {
  it('wins an undefended pawn', () => {
    // White knight f4 (which does hit d5), lone black pawn d5.
    expect(see('4k3/8/8/3p4/5N2/8/8/4K3 w - - 0 1', 'd5', 'w')).toBe(100);
  });

  it('refuses a pawn defended by a pawn', () => {
    // Nxd5 cxd5 loses a knight (320) for a pawn (100).
    expect(see('4k3/8/2p5/3p4/5N2/8/8/4K3 w - - 0 1', 'd5', 'w')).toBe(-220);
  });

  it('takes the pawn when the exchange comes out level', () => {
    // Black pawn d5 defended by c6; white has a pawn on c4 to trade first.
    // cxd5 cxd5 is pawn for pawn.
    expect(see('4k3/8/2p5/3p4/2P5/8/8/4K3 w - - 0 1', 'd5', 'w')).toBe(0);
  });

  it('sees through an x-ray battery', () => {
    // Rooks doubled on e1/e2 hitting a pawn on e5 defended once by a rook on e8.
    // Rxe5 Rxe5 Rxe5 nets a pawn plus a rook for a rook.
    const fen = '4r1k1/8/8/4p3/8/8/4R3/4R1K1 w - - 0 1';
    expect(see(fen, 'e5', 'w')).toBe(100);
  });

  it('does not let a king capture into a defended square', () => {
    // Black pawn d5 is defended by c6; the white king must not "win" it.
    expect(see('4k3/8/2p5/3p4/8/8/8/3K4 w - - 0 1', 'd5', 'w')).toBeLessThanOrEqual(0);
  });

  it('returns 0 when there is nothing to capture', () => {
    expect(see(after('e4'), 'd5', 'w')).toBe(0);
  });
});

describe('threatsAgainst', () => {
  it('finds nothing in the starting position', () => {
    expect(threatsAgainst(new Chess().fen(), 'w')).toEqual([]);
  });

  it('flags a genuinely hanging knight', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 Nd4 4.Nxd4 -- black's e5 pawn hangs, not the knight.
    const fen = '4k3/8/8/8/4n3/5P2/8/4K3 b - - 0 1';
    const threats = threatsAgainst(fen, 'b');
    expect(threats.map((t) => t.square)).toContain('e4');
    expect(threats[0]!.loss).toBe(320);
  });

  it('does not flag a defended piece', () => {
    // Black knight e4 defended by the f5 pawn, attacked by a white knight on c3.
    // Nxe4 fxe4 is knight for knight -- no material won, so it is not a threat.
    const fen = '4k3/8/8/5p2/4n3/2N5/8/4K3 b - - 0 1';
    expect(threatsAgainst(fen, 'b')).toEqual([]);
  });

  it('ignores a defender that is pinned to its king', () => {
    // Black rook e5 is "defended" by the d6 pawn, but that pawn is pinned by Bh2.
    // SEE alone would call the rook safe; the legal-capture filter catches it.
    const fen = '4k3/8/3p4/4r3/8/8/4R2B/4K3 w - - 0 1';
    const threats = threatsAgainst(fen, 'b');
    expect(threats.map((t) => t.square)).toContain('e5');
  });
});

describe('mateInOneAvailable', () => {
  it('sees Scholar\'s Mate coming', () => {
    // 1.e4 e5 2.Bc4 Nc6 3.Qh5 -- Qxf7# is on.
    expect(mateInOneAvailable(after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5'), 'w')).toBe(true);
  });

  it('is quiet after the correct defense', () => {
    expect(mateInOneAvailable(after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'g6'), 'w')).toBe(false);
  });

  it('sees it again after the queen retreats to f3', () => {
    expect(mateInOneAvailable(after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'g6', 'Qf3'), 'w')).toBe(true);
  });

  it('is quiet once the f-file is blocked', () => {
    const fen = after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'g6', 'Qf3', 'Nf6');
    expect(mateInOneAvailable(fen, 'w')).toBe(false);
  });

  it('sees the Blackburne Shilling trap', () => {
    // 4...Nd4?? walks into Qxf7# because the black queen covers her king's only flight square.
    const fen = after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'g6', 'Qf3', 'Nd4');
    expect(mateInOneAvailable(fen, 'w')).toBe(true);
  });
});

describe('materialBalance', () => {
  it('is level at the start', () => {
    expect(materialBalance(new Chess().fen(), 'w')).toBe(0);
  });

  it('counts a won queen', () => {
    const fen = after('e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qe5+', 'Be2', 'Qxe2+', 'Ngxe2');
    expect(materialBalance(fen, 'w')).toBe(900 - 330);
  });
});

describe('withTurn', () => {
  it('flips the side to move and clears en passant', () => {
    const fen = after('e4');
    expect(fen.split(' ')[1]).toBe('b');
    expect(withTurn(fen, 'w').split(' ')[1]).toBe('w');
    expect(withTurn(fen, 'w').split(' ')[3]).toBe('-');
  });

  it('is a no-op when it is already that side\'s turn', () => {
    const fen = after('e4');
    expect(withTurn(fen, 'b')).toBe(fen);
  });
});
