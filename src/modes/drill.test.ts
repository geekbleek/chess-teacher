import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { patternById, patterns } from '../content';
import {
  bestMove,
  createDrill,
  hint,
  opponentMove,
  planViolation,
  playerMove,
  rewind,
  theirTurn,
  yourTurn,
} from './drill';
import { snapshot } from '../engine/referee';
import type { Drill, Pattern } from '../content/types';

const pattern = patternById('scholars-mate-defense') as Pattern;
const drillNamed = (id: string): Drill => pattern.drills.find((d) => d.id === id)!;

const start = (id: string) => createDrill(pattern, drillNamed(id));

describe('learn mode', () => {
  it('starts with you to move in the taught position', () => {
    const s = start('learn');
    expect(yourTurn(s)).toBe(true);
    expect(s.fen).toContain(' b '); // Black to move after 3.Qh5
  });

  it('accepts the main line and explains why', () => {
    const s = playerMove(start('learn'), 'g6');
    expect(s.status).toBe('playing');
    expect(s.feedback?.tone).toBe('good');
    expect(s.feedback?.detail).toContain('tempo');
  });

  it('accepts a second good move, and stops because the lesson does not follow it', () => {
    // Qe7 defends f7 and is listed as playable, but the tree continues after g6.
    // Ending here is honest; drifting off with the Referee playing both sides is not.
    const s = playerMove(start('learn'), 'Qe7');
    expect(s.feedback?.headline).toBe('Also good.');
    expect(s.feedback?.detail).toContain('main line');
    expect(s.status).toBe('passed');
  });

  it('plays the punishment out on the board and offers a rewind', () => {
    const s = playerMove(start('learn'), 'Nf6');
    expect(s.feedback?.tone).toBe('bad');
    expect(s.feedback?.playedOut).toEqual(['Nf6', 'Qxf7#']);
    expect(s.rewindTo).not.toBeNull();
    expect(s.status).toBe('playing'); // learn mode never ends on a mistake

    const back = rewind(s);
    expect(back.fen).toBe(start('learn').fen);
    expect(back.rewindTo).toBeNull();
  });

  it('catches an off-book blunder with no lesson data', () => {
    // b5 is in no list; it drops a pawn and ignores the mate threat.
    const s = playerMove(start('learn'), 'b5');
    expect(s.feedback?.tone).toBe('bad');
    expect(s.rewindTo).not.toBeNull();
  });

  it('walks the whole main line to a pass', () => {
    let s = start('learn');
    for (const san of ['g6', 'Nf6']) {
      s = playerMove(s, san);
      while (theirTurn(s)) s = opponentMove(s);
    }
    expect(s.status).toBe('passed');
  });
});

describe('the hint ladder', () => {
  it('escalates and only reveals the move at the end', () => {
    let s = start('learn');
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const h = hint(s)!;
      seen.push(h.text);
      s = { ...s, hintLevel: s.hintLevel + 1 };
    }
    expect(seen[0]).not.toContain('g6');
    expect(seen[1]).not.toContain('g6');
    expect(seen[2]).not.toContain('g6');
    expect(seen[3]).toContain('g6'); // level 4 is the reveal
  });

  it('knows the expected move', () => {
    expect(bestMove(start('learn'))?.san).toBe('g6');
  });
});

describe('test mode', () => {
  it('stops dead on a mistake and records where', () => {
    const s = playerMove(start('test'), 'Nf6');
    expect(s.status).toBe('failed');
    expect(s.failedAtPly).toBe(0);
    expect(s.rewindTo).toBeNull(); // no second chances
  });

  it('gives no running commentary while you are right', () => {
    const s = playerMove(start('test'), 'g6');
    expect(s.feedback).toBeNull();
    expect(s.status).toBe('playing');
  });

  it('journals every ply with a snapshot for replay', () => {
    let s = playerMove(start('test'), 'g6');
    while (theirTurn(s)) s = opponentMove(s);
    expect(s.journal.length).toBe(2);
    expect(s.journal[0]!.by).toBe('you');
    expect(s.journal[1]!.by).toBe('them');
    expect(s.journal[0]!.snapshot.development).toBeGreaterThanOrEqual(0);
  });
});

describe('playing the attacking side', () => {
  it('makes the app play a losing defence for you to punish', () => {
    let s = start('attack');
    expect(theirTurn(s)).toBe(true);
    s = opponentMove(s);
    expect(s.script).not.toBeNull();
    expect(s.feedback?.headline).toContain('Punish it');
    expect(yourTurn(s)).toBe(true);
  });

  it('passes when you deliver the mate', () => {
    let s = opponentMove(start('attack'));
    s = playerMove(s, 'Qxf7#');
    expect(s.status).toBe('passed');
    expect(s.feedback?.tone).toBe('good');
  });

  it('fails when you miss it', () => {
    let s = opponentMove(start('attack'));
    s = playerMove(s, 'd3');
    expect(s.status).toBe('failed');
    expect(s.feedback?.detail).toContain('Qxf7#');
  });

  it('cycles through the different mistakes rather than repeating one', () => {
    const first = opponentMove(start('attack'));
    const second = opponentMove({ ...start('attack'), mistakesShown: 1 });
    expect(first.journal[0]!.san).not.toBe(second.journal[0]!.san);
  });
});

describe('every drill in the library', () => {
  // A sweep, not a sample: every drill of every lesson, played by always taking the
  // move the lesson calls best. Content that cannot be completed -- a dangling
  // branch, a punishment that never resolves -- fails here rather than on a phone.
  it(
    'is playable to a pass, and offers a punishment in every punish drill',
    () => {
      for (const pattern of patterns) {
        for (const drill of pattern.drills) {
          let s = createDrill(pattern, drill);
          let sawScript = false;
          for (let guard = 0; guard < 80 && s.status === 'playing'; guard++) {
            if (theirTurn(s)) {
              s = opponentMove(s);
              sawScript ||= s.script !== null;
              continue;
            }
            const expected = s.script ? s.script[s.scriptIndex] : bestMove(s)?.san;
            if (!expected) break;
            s = playerMove(s, expected);
          }
          const id = `${pattern.id}/${drill.id}`;
          expect(`${id}: ${s.status}`).toBe(`${id}: passed`);
          if (drill.opponent === 'mistakes') {
            // The app must actually play a losing move somewhere, or the drill is
            // silently identical to an ordinary one.
            expect(`${id}: ${sawScript ? 'punishable' : 'never offered a mistake'}`).toBe(
              `${id}: punishable`,
            );
          }
        }
      }
    },
    30_000,
  );

  it('starts every drill with a legal side to move', () => {
    for (const pattern of patterns) {
      for (const drill of pattern.drills) {
        const s = createDrill(pattern, drill);
        expect(`${pattern.id}/${drill.id}`).toBe(
          yourTurn(s) || theirTurn(s) ? `${pattern.id}/${drill.id}` : 'nobody to move',
        );
      }
    }
  });
});

describe('the replay journal', () => {
  it('records the refutation, not just the mistake', () => {
    const s = playerMove(start('test'), 'Nf6');
    expect(s.journal.map((p) => p.san)).toEqual(['Nf6', 'Qxf7#']);
    expect(s.failedAtPly).toBe(0);
    expect(s.journal[0]!.by).toBe('you');
    expect(s.journal[1]!.by).toBe('them');
  });

  it('shows the cost in the metrics, which is what the charts read', () => {
    const fried = patternById('fried-liver-defense')!;
    let s = createDrill(fried, fried.drills.find((d) => d.id === 'test')!);
    s = playerMove(s, 'd5');
    while (theirTurn(s)) s = opponentMove(s);
    s = playerMove(s, 'Nxd5'); // the Fried Liver
    expect(s.status).toBe('failed');
    const atMistake = s.journal[s.failedAtPly!]!;
    const atEnd = s.journal[s.journal.length - 1]!;
    // King safety collapses over the refutation even though it looks fine at the mistake.
    expect(atEnd.snapshot.kingSafety).toBeLessThan(atMistake.snapshot.kingSafety);
  });
});

describe('hard plan goals', () => {
  const habits = patternById('opening-habits')!;

  const positionAfterMoves = (...moves: string[]) => {
    const board = new Chess();
    for (const m of moves) board.move(m);
    return board.fen();
  };

  it('is quiet when the opening is played properly', () => {
    const fen = positionAfterMoves('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O', 'Be7', 'd3', 'd6');
    expect(planViolation(habits, snapshot(fen, 'w'), snapshot(fen, 'w'), 6)).toBeUndefined();
  });

  it('fires when development is behind by the move it names', () => {
    // Five pawn moves and not a single piece out.
    const fen = positionAfterMoves('e4', 'e5', 'a3', 'a6', 'b3', 'b6', 'c3', 'c6', 'd3', 'd6');
    const broken = planViolation(habits, snapshot(fen, 'w'), snapshot(fen, 'w'), 6);
    expect(broken?.goal).toContain('two minor pieces');
  });

  it('does not fire before the move it names', () => {
    const fen = positionAfterMoves('e4', 'e5', 'a3', 'a6');
    expect(planViolation(habits, snapshot(fen, 'w'), snapshot(fen, 'w'), 3)).toBeUndefined();
  });

  it('fires when the king loses the right to castle', () => {
    const fen = positionAfterMoves('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'Ke2');
    const broken = planViolation(habits, snapshot(fen, 'w'), snapshot(fen, 'w'), 4);
    expect(broken?.goal).toContain('king');
  });

  it('leaves lessons without hard checks alone', () => {
    const scholars = patternById('scholars-mate-defense')!;
    const fen = positionAfterMoves('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'g6');
    expect(planViolation(scholars, snapshot(fen, 'b'), snapshot(fen, 'b'), 4)).toBeUndefined();
  });
});

describe('no drill can get stuck', () => {
  /**
   * Plays a legal move that is deliberately not the one the lesson wants, over and
   * over. Whatever the player does, a drill has to reach a conclusion — it must never
   * sit in a state where every move is rejected and the only button is "Try again".
   */
  function stubbornRun(pattern: Pattern, drill: Drill, seed: number) {
    let s = createDrill(pattern, drill);
    let rewinds = 0;
    let playerMoves = 0;

    for (let step = 0; step < 200 && s.status === 'playing'; step++) {
      if (s.rewindTo) {
        rewinds += 1;
        if (rewinds > 6) break; // stuck: rejected over and over at the same spot
        s = rewind(s);
        continue;
      }
      if (theirTurn(s)) {
        s = opponentMove(s);
        continue;
      }
      const board = new Chess(s.fen);
      const legal = board.moves();
      if (legal.length === 0) break;
      const avoid = s.script ? s.script[s.scriptIndex] : bestMove(s)?.san;
      const options = legal.filter((m) => m !== avoid);
      const san = (options.length ? options : legal)[(seed + playerMoves * 7) % (options.length || legal.length)]!;
      s = playerMove(s, san);
      playerMoves += 1;
    }
    return { status: s.status, rewinds, playerMoves };
  }

  it('always reaches a conclusion, however badly it is played', () => {
    const stuck: string[] = [];
    for (const pattern of patterns) {
      for (const drill of pattern.drills) {
        for (const seed of [0, 1, 2, 3, 5]) {
          const run = stubbornRun(pattern, drill, seed);
          if (run.status === 'playing') {
            stuck.push(
              `${pattern.id}/${drill.id} seed ${seed}: still playing after ${run.playerMoves} moves and ${run.rewinds} rewinds`,
            );
          }
        }
      }
    }
    expect(stuck).toEqual([]);
  }, 60_000);
});

describe('the retry cap', () => {
  it('gives up after a couple of rejections rather than looping forever', () => {
    let s = createDrill(patternById('scholars-mate-defense')!, {
      id: 'learn',
      mode: 'learn',
      playAs: 'black',
      opponent: 'best',
      label: 'x',
    });
    let rejections = 0;
    for (let i = 0; i < 10 && s.status === 'playing'; i++) {
      s = playerMove(s, 'Nf6'); // walks into Qxf7# every time
      if (s.rewindTo) {
        rejections += 1;
        s = rewind(s);
      }
    }
    expect(rejections).toBe(2);
    expect(s.status).toBe('failed');
    expect(s.failedAtPly).not.toBeNull(); // so "Show me where" still works
  });

  it('does not count attempts at different positions against you', () => {
    const pattern = patternById('scholars-mate-defense')!;
    const drill = pattern.drills.find((d) => d.id === 'learn')!;
    let s = createDrill(pattern, drill);
    s = rewind(playerMove(s, 'Nf6')); // one rejection here
    s = playerMove(s, 'g6'); // correct, moves on
    while (theirTurn(s)) s = opponentMove(s);
    s = playerMove(s, 'Nd4'); // a mistake at the new position
    expect(s.rewindTo).not.toBeNull(); // still gets a retry, not an instant fail
    expect(s.attempts).toBe(1);
  });
});

describe('positions that end by themselves', () => {
  it('concludes when the game is over instead of locking the board', () => {
    // Play into Scholar's Mate as Black in test mode: the app delivers mate, and the
    // drill has to end. Otherwise the board locks with no legal move and no button.
    const pattern = patternById('scholars-mate-defense')!;
    let s = createDrill(pattern, pattern.drills.find((d) => d.id === 'test')!);
    s = playerMove(s, 'Nf6'); // Qxf7# is played out as the punishment
    expect(s.status).not.toBe('playing');
    expect(new Chess(s.fen).isCheckmate()).toBe(true);
  });

  it('never leaves you to move with no legal moves', () => {
    for (const pattern of patterns) {
      for (const drill of pattern.drills) {
        let s = createDrill(pattern, drill);
        for (let i = 0; i < 60 && s.status === 'playing'; i++) {
          if (s.rewindTo) { s = rewind(s); continue; }
          if (theirTurn(s)) { s = opponentMove(s); continue; }
          const legal = new Chess(s.fen).moves();
          expect(`${pattern.id}/${drill.id}: ${legal.length} legal moves`).not.toBe(
            `${pattern.id}/${drill.id}: 0 legal moves`,
          );
          const expected = s.script ? s.script[s.scriptIndex] : bestMove(s)?.san;
          if (!expected) break;
          s = playerMove(s, expected);
        }
      }
    }
  }, 30_000);
});
