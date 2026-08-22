#!/usr/bin/env node
/**
 * Content CI: replay every pattern through chess.js and prove it is playable.
 *
 * Checks per pattern file:
 *   - setupLine is legal and actually produces `root`
 *   - every node's FEN parses and its `toMove` matches the FEN
 *   - every accept / reject / reply / punish move is legal in its node
 *   - a `punish` line claiming mate (#) really is mate
 *   - following best-accept + reply lands on a node that exists (no dangling lines)
 *   - every node has `accept` unless it is `terminal`
 *   - every drill's startFen names a real node
 *
 * Usage: node tools/validate-patterns.js content/patterns/*.json
 *
 * Note: chess.js v1 THROWS on an illegal move rather than returning null.
 */
const { Chess } = require('chess.js');
const fs = require('fs');

const norm = (f) => f.split(' ').slice(0, 4).join(' ');
const load = (fen) => new Chess(fen.split(' ').length === 4 ? `${fen} 0 1` : fen);

let totalErrors = 0;

for (const file of process.argv.slice(2)) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  let errs = 0;
  let checks = 0;
  const fail = (m) => { errs++; console.log(`  FAIL ${m}`); };
  const ok = () => { checks++; };
  const tryMove = (board, san, label) => {
    try { board.move(san); return true; } catch { fail(label); return false; }
  };

  console.log(`${p.id} (${file})`);

  if (p.setupLine) {
    const c = new Chess();
    let good = true;
    for (const m of p.setupLine) good = tryMove(c, m, `setupLine illegal: ${m}`) && good;
    if (good) {
      norm(c.fen()) === p.root ? ok() : fail(`setupLine -> ${norm(c.fen())}, but root is ${p.root}`);
    }
  }

  for (const [fen, node] of Object.entries(p.nodes)) {
    let board;
    try { board = load(fen); } catch { fail(`unparseable FEN: ${fen}`); continue; }

    (board.turn() === 'w' ? 'white' : 'black') === node.toMove
      ? ok()
      : fail(`${fen}: toMove says ${node.toMove}, FEN says ${board.turn()}`);

    if (!node.accept && !node.terminal) fail(`${fen}: node has neither accept nor terminal`);
    if (!node.terminal && !node.reply) fail(`${fen}: non-terminal node has no reply`);

    for (const a of node.accept || []) {
      if (tryMove(load(fen), a.san, `${fen}: accept "${a.san}" is illegal`)) ok();
    }

    for (const r of node.reject || []) {
      const t = load(fen);
      if (!tryMove(t, r.san, `${fen}: reject "${r.san}" is illegal`)) continue;
      ok();
      for (const pm of r.punish || []) {
        if (!tryMove(t, pm, `${fen}: punish "${pm}" after ${r.san} is illegal`)) break;
        if (pm.includes('#') && !t.isCheckmate()) fail(`${fen}: punish "${pm}" claims mate but is not mate`);
        else ok();
      }
    }

    if (node.reply) {
      const best = (node.accept || []).find((a) => a.quality === 'best') || (node.accept || [])[0];
      if (!best) { fail(`${fen}: has a reply but no accept to reply to`); continue; }
      const t = load(fen);
      t.move(best.san);
      if (!tryMove(t, node.reply.san, `${fen}: reply "${node.reply.san}" illegal after ${best.san}`)) continue;
      ok();
      const next = norm(t.fen());
      p.nodes[next] ? ok() : fail(`${fen}: ${best.san} ${node.reply.san} -> ${next} has no node (dangling line)`);
    }
  }

  for (const d of p.drills) {
    p.nodes[d.startFen] ? ok() : fail(`drill ${d.id}: startFen names no node`);
  }
  if (p.recognition) {
    try { load(p.recognition.fen); ok(); } catch { fail('recognition FEN is unparseable'); }
  }

  console.log(`  ${checks} checks passed, ${errs} failures`);
  totalErrors += errs;
}

process.exit(totalErrors ? 1 : 0);
