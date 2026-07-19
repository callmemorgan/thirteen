import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, RANKS, SUITS } from './types';

describe('engine contracts', () => {
  it('defines 13 ranks and 4 suits', () => {
    expect(RANKS).toHaveLength(13);
    expect(SUITS).toHaveLength(4);
    expect(RANKS[0]).toBe(3);
    expect(RANKS[12]).toBe(15);
  });

  it('ships optional rule flags disabled by default', () => {
    expect(DEFAULT_RULES).toEqual({ instantWin: false, thoi2Scoring: false });
  });
});
