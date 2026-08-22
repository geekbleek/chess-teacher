import type { Square } from '../engine/types';

export type Quality = 'best' | 'ok' | 'inferior';
export type Side = 'white' | 'black';

export interface LessonMove {
  san: string;
  quality: Quality;
  why: string;
  then?: LessonNode;
}

export interface Mistake {
  san: string;
  why: string;
  /** Played out on the board so you feel it. Odd length: ends on the punisher's move. */
  punish?: string[];
}

export interface LessonNode {
  threat?: string;
  focusSquares?: Square[];
  /** Levels 1-3. Level 4, the reveal, is generated from the best move. */
  hints?: string[];
  moves?: LessonMove[];
  mistakes?: Mistake[];
  terminal?: { verdict: 'pass' | 'fail'; summary: string };
}

export interface Drill {
  id: string;
  mode: 'learn' | 'test';
  playAs: Side;
  /** `mistakes` makes the app play the losing moves so you can punish them. */
  opponent: 'best' | 'mistakes';
  label: string;
  /** SAN moves from the lesson root, to start the drill deeper in the tree. */
  from?: string[];
  offBookPlies?: number;
}

export interface Recognition {
  at: string[];
  prompt: string;
  choices: { text: string; correct: boolean; why: string }[];
}

/** "Tap the square that matters" — recognition without any moves involved. */
export interface Spot {
  at: string[];
  prompt: string;
  squares: Square[];
  why: string;
}

export interface Pattern {
  kind: 'pattern';
  id: string;
  title: string;
  tier: number;
  side: Side;
  eco?: string;
  idea: string;
  cues: { text: string; squares?: Square[] }[];
  spot?: Spot;
  recognition?: Recognition;
  plan?: { goal: string; hard?: boolean }[];
  setup: string[];
  line: LessonNode;
  drills: Drill[];
  /** Articles and lessons worth reading alongside this one. */
  related?: string[];
}

export interface Diagram {
  at: string[];
  highlight?: Square[];
  caption: string;
}

export interface Article {
  kind: 'article';
  id: string;
  title: string;
  tier: number;
  summary: string;
  sections: { heading: string; body: string; diagram?: Diagram }[];
  related?: string[];
}

export type Entry = Pattern | Article;

export const TIER_NAMES: Record<number, string> = {
  0: 'Habits',
  1: 'Traps',
  2: 'Repertoire',
  3: 'Structures',
};

export const TIER_BLURBS: Record<number, string> = {
  0: 'The five things every opening move should be doing.',
  1: 'The attacks that beat club players. Recognise them, then refute them.',
  2: 'Three openings, forever: one as White, one against 1.e4, one against 1.d4.',
  3: 'Pawn structures and the plans that come out of them — what to do on move twelve.',
};
