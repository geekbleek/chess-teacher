import { describe, expect, it } from 'vitest';
import { patternById, patterns } from '../content';
import { createDrill, opponentMove, playerMove, theirTurn, yourTurn, hint, rewind, bestMove } from './drill';
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

  it('accepts a second good move without calling it best', () => {
    const s = playerMove(start('learn'), 'Qe7');
    expect(s.feedback?.headline).toBe('Playable.');
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
