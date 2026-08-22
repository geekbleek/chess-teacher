import { Chess } from 'chess.js';
import { indexPattern, normalizeFen, type PatternIndex } from '../content';
import type { Drill, LessonMove, LessonNode, Mistake, Pattern } from '../content/types';
import { chooseReply, reviewMove, snapshot } from '../engine/referee';
import type { Color, Finding, Snapshot, Square } from '../engine/types';

export type Status = 'playing' | 'passed' | 'failed';

export interface Ply {
  san: string;
  from: Square;
  to: Square;
  by: 'you' | 'them';
  fenBefore: string;
  fenAfter: string;
  /** Measured from your point of view, so replay can chart what your moves did. */
  snapshot: Snapshot;
  note?: string;
}

export interface Feedback {
  tone: 'good' | 'info' | 'warn' | 'bad';
  headline: string;
  detail?: string;
  findings?: Finding[];
  /** The refutation, in SAN, when a mistake has just been played out on the board. */
  playedOut?: string[];
}

export interface DrillState {
  pattern: Pattern;
  drill: Drill;
  index: PatternIndex;
  you: Color;
  fen: string;
  status: Status;
  journal: Ply[];
  feedback: Feedback | null;
  hintLevel: number;
  /** Set when a mistake has been punished on the board and you can rewind. */
  rewindTo: string | null;
  /** A punishment line being played out move by move, when you are the punisher. */
  script: string[] | null;
  scriptIndex: number;
  /** How many mistakes the app has already shown, so it cycles rather than repeats. */
  mistakesShown: number;
  offBookPlies: number;
  failedAtPly: number | null;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const colorOf = (side: string): Color => (side === 'white' ? 'w' : 'b');

export function createDrill(pattern: Pattern, drill: Drill): DrillState {
  const index = indexPattern(pattern);
  // `from` lets a drill start deeper in the tree — useful when the interesting
  // moment is several moves past the position the lesson opens on.
  const board = new Chess(index.rootFen);
  for (const san of drill.from ?? []) board.move(san);

  return {
    pattern,
    drill,
    index,
    you: colorOf(drill.playAs),
    fen: board.fen(),
    status: 'playing',
    journal: [],
    feedback: null,
    hintLevel: 0,
    rewindTo: null,
    script: null,
    scriptIndex: 0,
    mistakesShown: 0,
    offBookPlies: drill.offBookPlies ?? 6,
    failedAtPly: null,
  };
}

export const nodeAt = (state: DrillState, fen = state.fen): LessonNode | undefined =>
  state.index.nodes.get(normalizeFen(fen));

export const yourTurn = (state: DrillState): boolean =>
  state.status === 'playing' && !state.rewindTo && new Chess(state.fen).turn() === state.you;

export const theirTurn = (state: DrillState): boolean =>
  state.status === 'playing' && !state.rewindTo && new Chess(state.fen).turn() !== state.you;

function record(state: DrillState, san: string, by: 'you' | 'them', note?: string): Ply {
  const board = new Chess(state.fen);
  const move = board.move(san);
  return {
    san,
    from: move.from,
    to: move.to,
    by,
    fenBefore: state.fen,
    fenAfter: board.fen(),
    snapshot: snapshot(board.fen(), state.you),
    ...(note ? { note } : {}),
  };
}

/**
 * Journal a whole sequence, alternating sides.
 *
 * Used for punishment lines so the replay contains the refutation, not just the
 * mistake — the metric charts need the consequence in order to show anything.
 */
function recordSequence(
  state: DrillState,
  moves: string[],
  firstBy: 'you' | 'them',
  firstNote?: string,
): Ply[] {
  const plies: Ply[] = [];
  let cursor = state.fen;
  let by = firstBy;
  for (const [i, san] of moves.entries()) {
    const ply = record({ ...state, fen: cursor }, san, by, i === 0 ? firstNote : undefined);
    plies.push(ply);
    cursor = ply.fenAfter;
    by = by === 'you' ? 'them' : 'you';
  }
  return plies;
}

function applyLine(fen: string, moves: string[]): string {
  const board = new Chess(fen);
  for (const san of moves) board.move(san);
  return board.fen();
}

const isLearn = (state: DrillState) => state.drill.mode === 'learn';

/** The move the lesson expects from you, for the hint ladder's final reveal. */
export function bestMove(state: DrillState): LessonMove | undefined {
  if (state.script) return undefined;
  const node = nodeAt(state);
  return (node?.moves ?? []).find((m) => m.quality === 'best') ?? node?.moves?.[0];
}

export function hint(state: DrillState): { level: number; text: string; exhausted: boolean } | null {
  if (state.status !== 'playing') return null;
  const node = nodeAt(state);
  const ladder = node?.hints ?? [];
  const level = state.hintLevel + 1;

  if (state.script) {
    return { level, text: 'Finish what you started — the punishment is forced.', exhausted: true };
  }
  if (level <= ladder.length) {
    return { level, text: ladder[level - 1]!, exhausted: false };
  }
  const best = bestMove(state);
  if (best) {
    // Level 4 is the reveal. Asking for it counts as failing the drill for
    // scheduling purposes — see progress.ts.
    return { level, text: `The move is ${best.san}. ${best.why}`, exhausted: true };
  }
  return { level, text: 'No hint available here.', exhausted: true };
}

export function takeHint(state: DrillState): DrillState {
  return { ...state, hintLevel: state.hintLevel + 1 };
}

/** Rewind after a mistake has been punished on the board (Learn mode). */
export function rewind(state: DrillState): DrillState {
  if (!state.rewindTo) return state;
  return {
    ...state,
    fen: state.rewindTo,
    rewindTo: null,
    feedback: { tone: 'info', headline: 'Back to the position. Try something else.' },
  };
}

function fail(state: DrillState, feedback: Feedback, fenAfter: string, atPly: number): DrillState {
  return { ...state, fen: fenAfter, status: 'failed', feedback, failedAtPly: atPly };
}

/** Your move. Judged against the lesson first, then against the position. */
export function playerMove(state: DrillState, san: string): DrillState {
  if (state.status !== 'playing' || state.rewindTo) return state;

  const review = reviewMove(state.fen, san);
  const board = new Chess(state.fen);
  board.move(san);
  const fenAfter = board.fen();

  // --- Finishing a punishment you were handed -------------------------------
  if (state.script) {
    const expected = state.script[state.scriptIndex];
    const delivered = board.isCheckmate();
    if (san !== expected && !delivered) {
      const journal = [...state.journal, record(state, san, 'you')];
      const detail = `The punishment was ${state.script.slice(state.scriptIndex).join(' ')}.`;
      if (isLearn(state)) {
        return {
          ...state,
          journal,
          fen: fenAfter,
          rewindTo: state.fen,
          feedback: { tone: 'warn', headline: 'That lets them off the hook.', detail },
        };
      }
      return fail(
        { ...state, journal },
        { tone: 'bad', headline: 'Missed the punishment.', detail },
        fenAfter,
        journal.length - 1,
      );
    }
    const journal = [...state.journal, record(state, san, 'you')];
    const nextIndex = state.scriptIndex + 1;
    const done = delivered || nextIndex >= state.script.length;
    return {
      ...state,
      journal,
      fen: fenAfter,
      script: done ? null : state.script,
      scriptIndex: nextIndex,
      status: done ? 'passed' : 'playing',
      feedback: done
        ? { tone: 'good', headline: 'That is the punishment. Exactly right.' }
        : { tone: 'good', headline: 'Right — keep going.' },
    };
  }

  const node = nodeAt(state);
  const accepted = (node?.moves ?? []).find((m) => m.san === san);
  const mistake = (node?.mistakes ?? []).find((m) => m.san === san);

  // --- A move the lesson names as good --------------------------------------
  if (accepted) {
    const journal = [...state.journal, record(state, san, 'you', accepted.why)];
    const next = { ...state, journal, fen: fenAfter, hintLevel: 0 };
    const terminal = nodeAt(next)?.terminal;
    return {
      ...next,
      status: terminal ? (terminal.verdict === 'pass' ? 'passed' : 'failed') : 'playing',
      feedback: isLearn(state)
        ? {
            tone: accepted.quality === 'best' ? 'good' : 'info',
            headline: accepted.quality === 'best' ? 'Yes.' : 'Playable.',
            detail: accepted.why,
            findings: review.findings.filter((f) => f.severity !== 'good').slice(0, 2),
          }
        : null,
    };
  }

  // --- A move the lesson names as a mistake ----------------------------------
  if (mistake) {
    const punish = mistake.punish ?? [];
    const shownFen = applyLine(fenAfter, punish);
    const atPly = state.journal.length;
    // The refutation goes into the journal too, so the replay can show what it cost.
    const journal = [
      ...state.journal,
      ...recordSequence(state, [san, ...punish], 'you', mistake.why),
    ];
    const feedback: Feedback = {
      tone: 'bad',
      headline: `${san} loses.`,
      detail: mistake.why,
      playedOut: punish.length ? [san, ...punish] : [san],
    };
    if (isLearn(state)) {
      return { ...state, journal, fen: shownFen, rewindTo: state.fen, feedback, failedAtPly: atPly };
    }
    return fail({ ...state, journal }, feedback, shownFen, atPly);
  }

  // --- Off book: no lesson data, so the Referee judges it alone --------------
  const worst = review.findings[0];
  const bad = worst && (worst.severity === 'critical' || worst.severity === 'major');
  const journal = [...state.journal, record(state, san, 'you', review.headline)];

  if (bad) {
    const feedback: Feedback = {
      tone: 'bad',
      headline: review.headline,
      detail: 'That move is not in the lesson, and it costs you something concrete.',
      findings: review.findings.slice(0, 3),
    };
    if (isLearn(state)) {
      return { ...state, journal, fen: fenAfter, rewindTo: state.fen, feedback, failedAtPly: journal.length - 1 };
    }
    return fail({ ...state, journal }, feedback, fenAfter, journal.length - 1);
  }

  const next: DrillState = {
    ...state,
    journal,
    fen: fenAfter,
    hintLevel: 0,
    offBookPlies: state.offBookPlies - 1,
  };
  if (isLearn(state)) {
    return {
      ...next,
      status: 'passed',
      feedback: {
        tone: 'info',
        headline: 'Sound, but it leaves the pattern.',
        detail: `${review.headline} The lesson follows a different move, so the drill stops here — replay it and try the main line.`,
        findings: review.findings.slice(0, 2),
      },
    };
  }
  if (next.offBookPlies <= 0) {
    return {
      ...next,
      status: 'passed',
      feedback: { tone: 'info', headline: 'Off book, but nothing broke. Call that a pass.' },
    };
  }
  return { ...next, feedback: null };
}

/** The app's move. From the book when possible, from the Referee when not. */
export function opponentMove(state: DrillState): DrillState {
  if (!theirTurn(state)) return state;

  // Continuing a punishment line the app started.
  if (state.script) {
    const san = state.script[state.scriptIndex];
    if (!san) return { ...state, script: null, status: 'passed' };
    const journal = [...state.journal, record(state, san, 'them')];
    return {
      ...state,
      journal,
      fen: applyLine(state.fen, [san]),
      scriptIndex: state.scriptIndex + 1,
    };
  }

  const node = nodeAt(state);

  // "Punish the mistakes" drills: the app deliberately plays a losing move.
  if (node && state.drill.opponent === 'mistakes') {
    const punishable = (node.mistakes ?? []).filter((m) => (m.punish ?? []).length > 0);
    if (punishable.length > 0) {
      const chosen = punishable[state.mistakesShown % punishable.length] as Mistake;
      const journal = [...state.journal, record(state, chosen.san, 'them', chosen.why)];
      return {
        ...state,
        journal,
        fen: applyLine(state.fen, [chosen.san]),
        mistakesShown: state.mistakesShown + 1,
        script: chosen.punish ?? null,
        scriptIndex: 0,
        hintLevel: 0,
        feedback: {
          tone: 'warn',
          headline: `They played ${chosen.san}. Punish it.`,
          detail: isLearn(state) ? chosen.why : undefined,
        },
      };
    }
  }

  const book = node && (node.moves ?? []).find((m) => m.quality === 'best');
  const san = book?.san ?? chooseReply(state.fen);
  if (!san) return { ...state, status: 'passed' };

  const journal = [...state.journal, record(state, san, 'them', book?.why)];
  const next: DrillState = { ...state, journal, fen: applyLine(state.fen, [san]), hintLevel: 0 };
  const terminal = nodeAt(next)?.terminal;
  return {
    ...next,
    status: terminal ? (terminal.verdict === 'pass' ? 'passed' : 'failed') : next.status,
    feedback: isLearn(state) && book?.why ? { tone: 'info', headline: `They played ${san}.`, detail: book.why } : next.feedback,
  };
}

/** The lesson's closing words, when the drill ended on a terminal node. */
export function terminalSummary(state: DrillState): string | undefined {
  return nodeAt(state)?.terminal?.summary;
}

/** Where it went wrong, for the replay to stop on. */
export function divergencePly(state: DrillState): number | null {
  if (state.failedAtPly !== null) return state.failedAtPly;
  return null;
}

export { other };
