import { beforeEach, describe, expect, it } from 'vitest';
import { cardFor, due, grade, mastery, read, resetAll, today } from './progress';

const DAY = 86_400_000;
const NOW = 1_760_000_000_000;

beforeEach(() => resetAll());

describe('scheduling', () => {
  it('treats anything unseen as due', () => {
    expect(due(['a', 'b'], NOW)).toEqual(['a', 'b']);
  });

  it('pushes a passed card into the future', () => {
    grade('a', true, NOW);
    expect(due(['a'], NOW)).toEqual([]);
  });

  it('brings it back when the interval elapses', () => {
    grade('a', true, NOW); // interval 1 day
    expect(due(['a'], NOW + DAY)).toEqual(['a']);
  });

  it('lengthens the interval each time you pass', () => {
    grade('a', true, NOW);
    expect(cardFor(read(), 'a').interval).toBe(1);
    grade('a', true, NOW);
    expect(cardFor(read(), 'a').interval).toBe(3);
    grade('a', true, NOW);
    expect(cardFor(read(), 'a').interval).toBeGreaterThan(3);
  });

  it('resets to tomorrow on a failure and makes the card harder', () => {
    grade('a', true, NOW);
    grade('a', true, NOW);
    const easeBefore = cardFor(read(), 'a').ease;
    grade('a', false, NOW);
    const card = cardFor(read(), 'a');
    expect(card.interval).toBe(1);
    expect(card.ease).toBeLessThan(easeBefore);
    expect(card.due).toBe(today(NOW) + 1);
  });

  it('never lets ease run away in either direction', () => {
    for (let i = 0; i < 30; i++) grade('a', false, NOW);
    expect(cardFor(read(), 'a').ease).toBe(1.3);
    for (let i = 0; i < 30; i++) grade('b', true, NOW);
    expect(cardFor(read(), 'b').ease).toBeLessThanOrEqual(2.8);
  });
});

describe('mastery', () => {
  it('reports new, then learning, then solid', () => {
    expect(mastery(read(), 'a')).toBe('new');
    grade('a', true, NOW);
    expect(mastery(read(), 'a')).toBe('learning');
    for (let i = 0; i < 4; i++) grade('a', true, NOW);
    expect(mastery(read(), 'a')).toBe('solid');
  });
});
