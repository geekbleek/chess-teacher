import { load, save } from './storage';

const KEY = 'chess-teacher/progress/v1';

export interface Card {
  /** SM-2 ease factor. Lower means the pattern comes back sooner. */
  ease: number;
  /** Days until the next review. */
  interval: number;
  /** Epoch day number this becomes due. */
  due: number;
  passes: number;
  fails: number;
}

export interface Progress {
  cards: Record<string, Card>;
  read: string[];
}

const DAY = 86_400_000;
export const today = (now: number): number => Math.floor(now / DAY);

const empty = (): Progress => ({ cards: {}, read: [] });
const freshCard = (): Card => ({ ease: 2.5, interval: 0, due: 0, passes: 0, fails: 0 });

export const read = (): Progress => load<Progress>(KEY, empty());
const write = (p: Progress): void => save(KEY, p);

export const cardFor = (progress: Progress, id: string): Card => progress.cards[id] ?? freshCard();

/**
 * SM-2, trimmed to what a drill can actually report: you passed, or you didn't.
 *
 * A pass grows the interval by the ease factor; a failure resets the interval to a
 * day and makes the card slightly harder forever. Asking for the level-4 hint counts
 * as a failure — that is the point of making the reveal expensive.
 */
export function grade(id: string, passed: boolean, now = Date.now()): Progress {
  const progress = read();
  const card = { ...cardFor(progress, id) };

  if (passed) {
    card.passes += 1;
    card.interval = card.interval === 0 ? 1 : card.interval === 1 ? 3 : Math.round(card.interval * card.ease);
    card.ease = Math.min(2.8, card.ease + 0.1);
  } else {
    card.fails += 1;
    card.interval = 1;
    card.ease = Math.max(1.3, card.ease - 0.2);
  }
  card.due = today(now) + card.interval;

  const next: Progress = { ...progress, cards: { ...progress.cards, [id]: card } };
  write(next);
  return next;
}

export function markRead(id: string): Progress {
  const progress = read();
  if (progress.read.includes(id)) return progress;
  const next = { ...progress, read: [...progress.read, id] };
  write(next);
  return next;
}

/** Patterns due for review, plus anything never attempted. */
export function due(ids: string[], now = Date.now()): string[] {
  const progress = read();
  const day = today(now);
  return ids.filter((id) => {
    const card = progress.cards[id];
    return !card || card.due <= day;
  });
}

export function mastery(progress: Progress, id: string): 'new' | 'learning' | 'solid' {
  const card = progress.cards[id];
  if (!card || card.passes === 0) return 'new';
  return card.interval >= 7 ? 'solid' : 'learning';
}

export function resetAll(): Progress {
  const next = empty();
  write(next);
  return next;
}
