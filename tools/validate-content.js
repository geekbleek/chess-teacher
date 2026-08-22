#!/usr/bin/env node
/**
 * Content CI. The single source of truth for what a lesson file may contain.
 *
 *   node tools/validate-content.js
 *
 * Patterns (content/patterns/*.json) are drillable move trees:
 *   { id, title, tier, side, idea, cues[], spot?, recognition?, plan?[], setup[], line, drills[], related?[] }
 *   line  = { threat?, focusSquares?, hints?[], moves[], mistakes?[], terminal? }
 *   move  = { san, quality: best|ok|inferior, why, then?: line }
 *   mistake = { san, why, punish?[] }
 *   drill = { id, mode: learn|test, playAs: white|black, opponent: best|mistakes, label, from?[] }
 *
 * Articles (content/library/*.json) are reading material:
 *   { id, title, tier, summary, sections[], related?[] }
 *   section = { heading, body, diagram?: { at[], highlight?[], caption } }
 *
 * Every move in every file is replayed through chess.js, so an illegal line or a
 * punish that claims mate without delivering it cannot ship.
 */
import { Chess } from 'chess.js';
import fs from 'node:fs';
import path from 'node:path';

const QUALITIES = ['best', 'ok', 'inferior'];
const MODES = ['learn', 'test'];
const COLORS = ['white', 'black'];
const OPPONENTS = ['best', 'mistakes'];

let errors = 0;
let checks = 0;
const ok = () => checks++;

function makeFail(file) {
  return (message) => {
    errors++;
    console.log(`  FAIL [${path.basename(file)}] ${message}`);
  };
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isSquare = (v) => typeof v === 'string' && /^[a-h][1-8]$/.test(v);

function replay(moves, from = new Chess()) {
  const board = new Chess(from.fen());
  for (const san of moves) board.move(san);
  return board;
}

// --- patterns ----------------------------------------------------------------

function validatePattern(file, p, fail) {
  for (const field of ['id', 'title', 'idea']) {
    isText(p[field]) ? ok() : fail(`missing ${field}`);
  }
  /^[a-z0-9-]+$/.test(p.id ?? '') ? ok() : fail(`id "${p.id}" must be kebab-case`);
  Number.isInteger(p.tier) && p.tier >= 0 && p.tier <= 3 ? ok() : fail('tier must be 0-3');
  COLORS.includes(p.side) ? ok() : fail(`side must be one of ${COLORS}`);
  Array.isArray(p.cues) && p.cues.length > 0 ? ok() : fail('needs at least one cue');
  for (const cue of p.cues ?? []) {
    isText(cue.text) ? ok() : fail('cue without text');
    for (const sq of cue.squares ?? []) isSquare(sq) ? ok() : fail(`bad cue square "${sq}"`);
  }

  let root;
  try {
    root = replay(p.setup ?? []);
    ok();
  } catch (e) {
    fail(`setup is illegal: ${e.message}`);
    return;
  }

  const learnerTurn = root.turn() === 'w' ? 'white' : 'black';
  learnerTurn === p.side
    ? ok()
    : fail(`setup leaves ${learnerTurn} to move but side is "${p.side}" — the taught side must move first`);

  validateNode(file, p.line, root, fail, `${p.id}:line`);

  if (p.spot) validateSpot(file, p.spot, fail);
  if (p.recognition) validateRecognition(file, p.recognition, fail);
  for (const step of p.plan ?? []) {
    isText(step.goal) ? ok() : fail('plan step without a goal');
  }

  Array.isArray(p.drills) && p.drills.length > 0 ? ok() : fail('needs at least one drill');
  const seen = new Set();
  for (const d of p.drills ?? []) {
    isText(d.id) && !seen.has(d.id) ? ok() : fail(`duplicate or missing drill id "${d.id}"`);
    seen.add(d.id);
    MODES.includes(d.mode) ? ok() : fail(`drill ${d.id}: bad mode`);
    COLORS.includes(d.playAs) ? ok() : fail(`drill ${d.id}: bad playAs`);
    OPPONENTS.includes(d.opponent) ? ok() : fail(`drill ${d.id}: bad opponent`);
    isText(d.label) ? ok() : fail(`drill ${d.id}: missing label`);
    if (d.from && !walkTo(p.line, replay(p.setup ?? []), d.from)) {
      fail(`drill ${d.id}: "from" does not follow the lesson tree`);
    } else ok();
    // A "punish the mistakes" drill only works from the other side of the lesson,
    // and only if the tree actually contains mistakes with punishments.
    if (d.opponent === 'mistakes') {
      // The app plays the mistakes, so they must sit at nodes where the OPPONENT
      // moves. A tree whose only mistakes belong to the learner's own side would
      // make this drill silently identical to opponent "best".
      const opponentColor = d.playAs === 'white' ? 'b' : 'w';
      const from = walkTo(p.line, replay(p.setup ?? []), d.from ?? []);
      from
        ? ok()
        : fail(`drill ${d.id}: "from" does not follow the lesson tree`);
      hasPunishableMistake(from?.node ?? p.line, from?.board ?? replay(p.setup ?? []), opponentColor)
        ? ok()
        : fail(
            `drill ${d.id}: opponent "mistakes" needs a mistake with a punish line at a node where ${opponentColor === 'w' ? 'White' : 'Black'} moves`,
          );
    }
  }
}

/** Follow a drill's `from` moves down the tree, returning where they land. */
function walkTo(node, board, moves) {
  let current = node;
  const cursor = new Chess(board.fen());
  for (const san of moves) {
    const next = (current.moves ?? []).find((m) => m.san === san);
    if (!next?.then) return null;
    try {
      cursor.move(san);
    } catch {
      return null;
    }
    current = next.then;
  }
  return { node: current, board: cursor };
}

function hasPunishableMistake(node, board, color) {
  if (!node) return false;
  if (board.turn() === color && (node.mistakes ?? []).some((m) => (m.punish ?? []).length > 0)) {
    return true;
  }
  return (node.moves ?? []).some((m) => {
    const next = new Chess(board.fen());
    try {
      next.move(m.san);
    } catch {
      return false;
    }
    return hasPunishableMistake(m.then, next, color);
  });
}

function validateNode(file, node, board, fail, where) {
  if (!node) return fail(`${where}: missing node`);

  if (node.terminal) {
    isText(node.terminal.summary) ? ok() : fail(`${where}: terminal without a summary`);
    ['pass', 'fail'].includes(node.terminal.verdict) ? ok() : fail(`${where}: bad terminal verdict`);
    (node.moves ?? []).length === 0 ? ok() : fail(`${where}: terminal node should not offer moves`);
    return;
  }

  Array.isArray(node.moves) && node.moves.length > 0
    ? ok()
    : fail(`${where}: needs at least one move (or a terminal)`);
  (node.moves ?? []).filter((m) => m.quality === 'best').length === 1
    ? ok()
    : fail(`${where}: needs exactly one move marked "best"`);
  for (const sq of node.focusSquares ?? []) isSquare(sq) ? ok() : fail(`${where}: bad square "${sq}"`);
  (node.hints ?? []).length <= 3 ? ok() : fail(`${where}: at most 3 hints (level 4 is the reveal)`);
  for (const hint of node.hints ?? []) isText(hint) ? ok() : fail(`${where}: empty hint`);

  for (const move of node.moves ?? []) {
    QUALITIES.includes(move.quality) ? ok() : fail(`${where}: bad quality on ${move.san}`);
    isText(move.why) ? ok() : fail(`${where}: ${move.san} has no explanation`);
    const next = new Chess(board.fen());
    try {
      next.move(move.san);
      ok();
    } catch {
      fail(`${where}: move "${move.san}" is illegal`);
      continue;
    }
    if (move.then) validateNode(file, move.then, next, fail, `${where} > ${move.san}`);
  }

  for (const mistake of node.mistakes ?? []) {
    isText(mistake.why) ? ok() : fail(`${where}: mistake ${mistake.san} has no explanation`);
    const next = new Chess(board.fen());
    try {
      next.move(mistake.san);
      ok();
    } catch {
      fail(`${where}: mistake "${mistake.san}" is illegal`);
      continue;
    }
    for (const san of mistake.punish ?? []) {
      try {
        next.move(san);
      } catch {
        fail(`${where}: punish "${san}" after ${mistake.san} is illegal`);
        break;
      }
      if (san.includes('#') && !next.isCheckmate()) {
        fail(`${where}: punish "${san}" claims mate but the position is not mate`);
      } else ok();
    }
    // A punish line must end with the punisher having made the last move.
    if ((mistake.punish ?? []).length % 2 === 0 && (mistake.punish ?? []).length > 0) {
      fail(`${where}: punish for ${mistake.san} has an even number of plies — it should end on the punishing side's move`);
    } else ok();
  }
}

function validateSpot(file, spot, fail) {
  try {
    replay(spot.at ?? []);
    ok();
  } catch {
    return fail('spot position is illegal');
  }
  isText(spot.prompt) && isText(spot.why) ? ok() : fail('spot needs a prompt and an explanation');
  const squares = spot.squares ?? [];
  squares.length >= 1 ? ok() : fail('spot needs at least one answer square');
  for (const sq of squares) isSquare(sq) ? ok() : fail(`bad spot square "${sq}"`);
}

function validateRecognition(file, r, fail) {
  try {
    replay(r.at ?? []);
    ok();
  } catch {
    return fail('recognition position is illegal');
  }
  isText(r.prompt) ? ok() : fail('recognition without a prompt');
  const choices = r.choices ?? [];
  choices.length >= 2 ? ok() : fail('recognition needs at least two choices');
  choices.filter((c) => c.correct).length === 1 ? ok() : fail('recognition needs exactly one correct choice');
  for (const c of choices) {
    isText(c.text) && isText(c.why) ? ok() : fail('recognition choice missing text or explanation');
  }
}

// --- articles ----------------------------------------------------------------

function validateArticle(file, a, fail) {
  for (const field of ['id', 'title', 'summary']) {
    isText(a[field]) ? ok() : fail(`missing ${field}`);
  }
  /^[a-z0-9-]+$/.test(a.id ?? '') ? ok() : fail(`id "${a.id}" must be kebab-case`);
  Number.isInteger(a.tier) && a.tier >= 0 && a.tier <= 3 ? ok() : fail('tier must be 0-3');
  Array.isArray(a.sections) && a.sections.length > 0 ? ok() : fail('needs at least one section');
  for (const section of a.sections ?? []) {
    isText(section.heading) && isText(section.body) ? ok() : fail('section missing heading or body');
    if (!section.diagram) continue;
    try {
      replay(section.diagram.at ?? []);
      ok();
    } catch (e) {
      fail(`diagram in "${section.heading}" is illegal: ${e.message}`);
    }
    isText(section.diagram.caption) ? ok() : fail(`diagram in "${section.heading}" has no caption`);
    for (const sq of section.diagram.highlight ?? []) {
      isSquare(sq) ? ok() : fail(`bad diagram square "${sq}"`);
    }
  }
}

// --- run ---------------------------------------------------------------------

const patternFiles = fs.existsSync('content/patterns')
  ? fs.readdirSync('content/patterns').filter((f) => f.endsWith('.json')).map((f) => `content/patterns/${f}`)
  : [];
const articleFiles = fs.existsSync('content/library')
  ? fs.readdirSync('content/library').filter((f) => f.endsWith('.json')).map((f) => `content/library/${f}`)
  : [];

const ids = new Set();
for (const file of [...patternFiles, ...articleFiles]) {
  const fail = makeFail(file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`not valid JSON: ${e.message}`);
    continue;
  }
  if (ids.has(data.id)) fail(`duplicate id "${data.id}"`);
  ids.add(data.id);
  if (file.includes('patterns/')) validatePattern(file, data, fail);
  else validateArticle(file, data, fail);
}

// Cross-links must point at something that exists, in either direction.
for (const file of [...patternFiles, ...articleFiles]) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const rel of data.related ?? []) {
    if (rel === data.id) makeFail(file)('related links to itself');
    else ids.has(rel) ? ok() : makeFail(file)(`related id "${rel}" does not exist`);
  }
}

console.log(
  `${patternFiles.length} patterns, ${articleFiles.length} articles — ${checks} checks passed, ${errors} failures`,
);
process.exit(errors ? 1 : 0);
