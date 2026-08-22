import { Chess } from 'chess.js';
import type { Article, Entry, LessonNode, Pattern } from './types';

// Lessons are data, loaded at build time. Adding a file to content/ is all it takes
// to add a lesson; CI replays every one of them through chess.js first.
const patternFiles = import.meta.glob('../../content/patterns/*.json', { eager: true });
const articleFiles = import.meta.glob('../../content/library/*.json', { eager: true });

const asDefault = <T>(module: unknown): T => (module as { default: T }).default;

export const patterns: Pattern[] = Object.values(patternFiles)
  .map((m) => ({ ...asDefault<Pattern>(m), kind: 'pattern' as const }))
  .sort((a, b) => a.tier - b.tier || a.title.localeCompare(b.title));

export const articles: Article[] = Object.values(articleFiles)
  .map((m) => ({ ...asDefault<Article>(m), kind: 'article' as const }))
  .sort((a, b) => a.tier - b.tier || a.title.localeCompare(b.title));

export const entries: Entry[] = [...articles, ...patterns];

export const byId = new Map<string, Entry>(entries.map((e) => [e.id, e]));

export const patternById = (id: string): Pattern | undefined => {
  const entry = byId.get(id);
  return entry?.kind === 'pattern' ? entry : undefined;
};

export const tiers: number[] = [...new Set(entries.map((e) => e.tier))].sort();

/** Position after a list of SAN moves from the initial position. */
export function positionAfter(moves: string[]): string {
  const board = new Chess();
  for (const san of moves) board.move(san);
  return board.fen();
}

export const normalizeFen = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

export interface PatternIndex {
  /** Normalized FEN -> the lesson node for that position. */
  nodes: Map<string, LessonNode>;
  rootFen: string;
}

/**
 * Walk a lesson's move tree and key every node by its position.
 *
 * Authoring uses SAN trees because hand-written FENs are the main way lesson data
 * goes wrong. Looking positions up by FEN is what makes transpositions work at
 * runtime — reach the same position by a different move order and you land on the
 * same node.
 */
export function indexPattern(pattern: Pattern): PatternIndex {
  const board = new Chess();
  for (const san of pattern.setup) board.move(san);
  const rootFen = board.fen();

  const nodes = new Map<string, LessonNode>();
  const walk = (node: LessonNode, fen: string) => {
    nodes.set(normalizeFen(fen), node);
    for (const move of node.moves ?? []) {
      if (!move.then) continue;
      const next = new Chess(fen);
      next.move(move.san);
      walk(move.then, next.fen());
    }
  };
  walk(pattern.line, rootFen);
  return { nodes, rootFen };
}
