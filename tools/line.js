#!/usr/bin/env node
/**
 * Authoring helper: print the normalized FEN after each ply of a line.
 *
 *   node tools/line.js e4 e5 Bc4 Nc6 Qh5
 *
 * Add --mate to also report check/checkmate at the final position. Used while
 * writing lesson files so node keys are never hand-typed.
 */
import { Chess } from 'chess.js';

const args = process.argv.slice(2);
const wantMate = args.includes('--mate');
const moves = args.filter((a) => a !== '--mate');

const board = new Chess();
const norm = (f) => f.split(' ').slice(0, 4).join(' ');
console.log(`start                ${norm(board.fen())}`);
for (const san of moves) {
  try {
    const move = board.move(san);
    console.log(`${move.san.padEnd(8)} ${move.color === 'w' ? 'w' : 'b'}  ${norm(board.fen())}`);
  } catch {
    console.log(`${san.padEnd(8)} ILLEGAL — stopping`);
    process.exit(1);
  }
}
if (wantMate) {
  console.log(`check=${board.isCheck()} mate=${board.isCheckmate()} turn=${board.turn()}`);
}
