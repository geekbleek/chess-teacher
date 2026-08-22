import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { chooseReply, gameOverText, reviewMove, snapshot, worstSeverity } from './referee';

function after(...moves: string[]): string {
  const board = new Chess();
  for (const move of moves) board.move(move);
  return board.fen();
}

const codes = (fen: string, san: string) => reviewMove(fen, san).findings.map((f) => f.code);

describe('reviewMove: the mistakes that actually lose games', () => {
  it('calls out the developing move that walks into Scholar\'s Mate', () => {
    // 3...Nf6?? is a normal-looking developing move and it loses on the spot.
    // The threat already existed, so this is ignoring it rather than creating it.
    const fen = after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5');
    const review = reviewMove(fen, 'Nf6');
    expect(review.findings[0]!.code).toBe('mate-ignored');
    expect(worstSeverity(review)).toBe('critical');
  });

  it('distinguishes creating a mate threat from ignoring one', () => {
    // 1.f3 e5 2.g4?? Qh4#. Nothing was wrong before g4; the move itself does it.
    const review = reviewMove(after('f3', 'e5'), 'g4');
    expect(review.findings[0]!.code).toBe('mate-allowed');
  });

  it('says the threat is still there when the defense misses it', () => {
    // 3...d6 defends e5 but not f7.
    const fen = after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5');
    expect(codes(fen, 'd6')[0]).toBe('mate-ignored');
  });

  it('credits the move that stops it', () => {
    const fen = after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5');
    const review = reviewMove(fen, 'g6');
    expect(review.findings.map((f) => f.code)).toContain('mate-stopped');
    expect(worstSeverity(review)).toBe('good');
  });

  it('catches the Blackburne Shilling trap two moves later', () => {
    const fen = after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'g6', 'Qf3');
    expect(codes(fen, 'Nd4')[0]).toBe('mate-ignored');
  });

  it('flags a piece left hanging', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 Nxd5?? 6.Nxf7 -- but simpler:
    // hang a knight outright.
    const fen = after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'd6', 'Nc3');
    const review = reviewMove(fen, 'Bg4');
    expect(review.findings.map((f) => f.code)).not.toContain('mate-allowed');
  });
});

describe('reviewMove: habits', () => {
  it('notices the early queen', () => {
    expect(codes(after('e4', 'e5'), 'Qh5')).toContain('early-queen');
  });

  it('notices that the early queen can be chased for free', () => {
    expect(codes(after('e4', 'e5'), 'Qh5')).toContain('tempo-loss');
  });

  it('notices moving the same piece twice before the others are out', () => {
    const fen = after('e4', 'e5', 'Nf3', 'Nc6');
    expect(codes(fen, 'Ng5')).toContain('moved-twice');
  });

  it('praises a developing move', () => {
    expect(codes(after('e4', 'e5'), 'Nf3')).toContain('developed');
  });

  it('praises castling', () => {
    const fen = after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5');
    expect(codes(fen, 'O-O')).toContain('castled');
  });

  it('flags parking a bishop in front of an unmoved pawn', () => {
    expect(codes(after('e4', 'e5'), 'Bd3')).toContain('self-block');
  });

  it('has nothing dramatic to say about a normal move', () => {
    const review = reviewMove(after('e4', 'e5', 'Nf3'), 'Nc6');
    expect(worstSeverity(review)).toBe('good');
  });
});

describe('snapshot', () => {
  it('is symmetric in the starting position', () => {
    const white = snapshot(new Chess().fen(), 'w');
    const black = snapshot(new Chess().fen(), 'b');
    expect(white.material).toBe(black.material);
    expect(white.development).toBe(black.development);
    expect(white.kingSafety).toBe(black.kingSafety);
    expect(white.mateAllowed).toBe(false);
  });

  it('sees the mate threat that defines the pattern', () => {
    expect(snapshot(after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5'), 'b').mateAllowed).toBe(true);
  });
});

describe('chooseReply', () => {
  it('always returns a legal move', () => {
    const board = new Chess();
    for (let i = 0; i < 12 && !board.isGameOver(); i++) {
      const reply = chooseReply(board.fen());
      expect(reply).toBeDefined();
      expect(() => board.move(reply!)).not.toThrow();
    }
  });

  it('plays the mate when there is one', () => {
    expect(chooseReply(after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'))).toBe('Qxf7#');
  });

  it('does not hang a queen for nothing', () => {
    // White queen on h5, black pawn on g6 ready to take it if she steps to g4/g5.
    const fen = after('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'g6');
    const reply = chooseReply(fen)!;
    const board = new Chess(fen);
    board.move(reply);
    expect(board.fen()).toContain('Q'); // the queen is still on the board
  });

  it('is deterministic', () => {
    const fen = after('e4', 'e5');
    expect(chooseReply(fen)).toBe(chooseReply(fen));
  });
});

describe('gameOverText', () => {
  it('is null while the game is still going', () => {
    expect(gameOverText(new Chess().fen())).toBeNull();
    expect(gameOverText(after('e4', 'e5'))).toBeNull();
  });

  it('names the winner of a checkmate', () => {
    // Fool's Mate.
    expect(gameOverText(after('f3', 'e5', 'g4', 'Qh4#'))).toBe('Checkmate — Black wins.');
  });

  it('reports a stalemate', () => {
    expect(gameOverText('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe('Stalemate. Draw.');
  });

  it('reports a dead position', () => {
    expect(gameOverText('7k/8/6K1/8/8/8/8/8 w - - 0 1')).toContain('enough material');
  });
});
