import { Chess } from 'chess.js';
import { indexPattern, normalizeFen, type PatternIndex } from '../content';
import type { Drill, LessonMove, LessonNode, Mistake, Pattern, PlanStep } from '../content/types';
import { chooseReply, reviewMove, snapshot, type Review } from '../engine/referee';
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
  /** Rejected attempts at the position below, so a retry loop cannot run forever. */
  attempts: number;
  attemptFen: string | null;
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
    attempts: 0,
    attemptFen: null,
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

const moveNumberOf = (fen: string): number => Number(fen.split(' ')[5] ?? '1');

function applyLine(fen: string, moves: string[]): string {
  const board = new Chess(fen);
  for (const san of moves) board.move(san);
  return board.fen();
}

const isLearn = (state: DrillState) => state.drill.mode === 'learn';

/**
 * The first hard plan goal this position breaks, if any.
 *
 * This is what makes a lesson's declared plan more than prose: a drill can say
 * "castle by move eight" and the drill will actually stop when you have not.
 */
export function planViolation(
  pattern: Pattern,
  before: Snapshot,
  after: Snapshot,
  fullmove: number,
): PlanStep | undefined {
  return (pattern.plan ?? []).find((step) => {
    if (!step.hard || !step.check) return false;
    const { metric, atLeast, byMove } = step.check;
    if (byMove !== undefined && fullmove < byMove) return false;
    const now = metric === 'development' ? after.development : after.kingSafety;
    if (now >= atLeast) return false;
    // Only fault a move that failed to improve things. If you are behind and
    // catching up that is progress, and rejecting it can leave no way out at all.
    const was = metric === 'development' ? before.development : before.kingSafety;
    return now <= was;
  });
}

/** Did this move actually make the position worse, or was it already bad? */
function madeItWorse(before: Snapshot, after: Snapshot): boolean {
  return (
    after.threatened > before.threatened ||
    after.material < before.material ||
    (after.mateAllowed && !before.mateAllowed) ||
    after.kingSafety <= before.kingSafety - 15
  );
}

/** Findings worth listing under a headline: no duplicates, no praise on a bad move. */
function supporting(review: Review, headline: string): Finding[] {
  return review.findings.filter((f) => f.severity !== 'good' && f.text !== headline).slice(0, 2);
}

const REWIND_LIMIT = 2;

/**
 * Turn a move down.
 *
 * Learn mode offers a retry, but only so many times at the same position. A position
 * can become one where nothing is good — a piece already trapped, a king already
 * exposed — and looping "Try again" forever is not teaching, it is a dead end.
 */
function reject(
  state: DrillState,
  journal: Ply[],
  feedback: Feedback,
  fenAfter: string,
  atPly: number,
): DrillState {
  const attempts = state.attemptFen === state.fen ? state.attempts + 1 : 1;
  const base = { ...state, journal, feedback, failedAtPly: atPly, attempts, attemptFen: state.fen };

  if (isLearn(state) && attempts <= REWIND_LIMIT) {
    return { ...base, fen: fenAfter, rewindTo: state.fen };
  }
  return {
    ...base,
    fen: fenAfter,
    status: 'failed',
    feedback: isLearn(state)
      ? {
          ...feedback,
          detail: `${feedback.detail ?? ''} The position has got away from you — replay it to see where it went wrong, then start again.`.trim(),
        }
      : feedback,
  };
}

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
    failedAtPly: null,
    feedback: { tone: 'info', headline: 'Back to the position. Try something else.' },
  };
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
      return reject(
        state,
        journal,
        {
          tone: 'bad',
          headline: isLearn(state) ? 'That lets them off the hook.' : 'Missed the punishment.',
          detail,
        },
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

    // A move can be in the book and still break the plan the lesson declared.
    const broken = planViolation(state.pattern, review.before, review.after, moveNumberOf(fenAfter));
    if (broken && !terminal) {
      return reject(
        state,
        journal,
        {
          tone: 'bad',
          headline: 'That breaks the plan.',
          detail: broken.goal,
          findings: supporting(review, 'That breaks the plan.'),
        },
        fenAfter,
        journal.length - 1,
      );
    }

    // A good move the lesson simply does not follow. Ending here is honest; drifting
    // off with the Referee playing both sides teaches nothing.
    if (!terminal && !nodeAt(next)) {
      return {
        ...next,
        status: 'passed',
        feedback: {
          tone: 'good',
          headline: accepted.quality === 'best' ? 'Right.' : 'Also good.',
          detail: `${accepted.why} The lesson follows a different move from here, so the drill stops — run it again to see the main line.`,
        },
      };
    }

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
    return reject(state, journal, feedback, shownFen, atPly);
  }

  // --- Off book: no lesson data, so the Referee judges it alone --------------
  const brokenPlan = planViolation(state.pattern, review.before, review.after, moveNumberOf(fenAfter));
  const ignoredMate = review.after.mateAllowed && review.before.mateAllowed;
  // Judge the move by what it changed, not by what was already wrong. Rejecting every
  // move because a piece was loose before you moved is how a drill becomes unwinnable.
  const bad = brokenPlan !== undefined || ignoredMate || madeItWorse(review.before, review.after);
  const journal = [...state.journal, record(state, san, 'you', review.headline)];

  if (bad) {
    const headline = brokenPlan ? 'That breaks the plan.' : review.headline;
    return reject(
      state,
      journal,
      {
        tone: 'bad',
        headline,
        detail: brokenPlan
          ? brokenPlan.goal
          : 'That move is not in the lesson, and it costs you something concrete.',
        findings: supporting(review, headline),
      },
      fenAfter,
      journal.length - 1,
    );
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
        findings: supporting(review, review.headline),
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
