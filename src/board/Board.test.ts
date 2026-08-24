import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A source-level invariant, because the failure mode is invisible.
 *
 * Chessground adds its own classes (cg-wrap, manipulable, orientation-*) to the
 * element it is handed, after mount. If Preact ever re-renders a computed class onto
 * that same element it wipes them, and every Chessground CSS rule stops applying —
 * including the pointer-events rules on its overlay layers, which then float over the
 * buttons below the board and make them untappable. The board still looks fine, so
 * nothing catches it except a hit test.
 *
 * Modifiers therefore belong on .board-frame, which Preact owns outright.
 */
describe('the board element', () => {
  const source = readFileSync('src/board/Board.tsx', 'utf8');

  it('gets a constant class, so Chessground can add its own', () => {
    expect(source).toMatch(/<div\s+class="board"\s+ref=\{host\}/);
  });

  it('puts every modifier on the frame instead', () => {
    // The frame's class may be computed freely; the board's may not.
    expect(source).toMatch(/class=\{`board-frame /);
    const boardClasses = [...source.matchAll(/class=\{`board[^-][^`]*`\}/g)];
    expect(boardClasses.map((m) => m[0])).toEqual([]);
  });
});
