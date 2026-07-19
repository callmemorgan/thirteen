import { describe, expect, it } from 'vitest';
import { chooseMove } from './index';
import { c, d, h, makeState, s } from './testkit';

describe('medium bot', () => {
  it('leads a natural straight whole instead of breaking its quad', () => {
    // Decomposition: straight 3-4-5-6 + quad of 9s + K + 2. The lowest
    // structure-preserving lead is the straight itself.
    const hand = [s(3), c(4), d(5), h(6), s(9), c(9), d(9), h(9), s(13), c(15)];
    const state = makeState({ hand, table: null });
    expect(chooseMove(state, 1, 'medium')).toEqual({
      kind: 'play',
      cards: [s(3), c(4), d(5), h(6)],
    });
  });

  it('leads its lowest single when there is nothing to protect', () => {
    const state = makeState({ hand: [s(4), c(9), h(11), s(15)], table: null });
    expect(chooseMove(state, 1, 'medium')).toEqual({ kind: 'play', cards: [s(4)] });
  });

  it('does not burn a 2 to beat a mid single when a lower card also beats', () => {
    const hand = [c(12), s(15), s(3), c(4), d(5)];
    const state = makeState({ hand, table: [d(11)] });
    expect(chooseMove(state, 1, 'medium')).toEqual({ kind: 'play', cards: [c(12)] });
  });

  it('spends its 2 when nothing else beats the table', () => {
    const hand = [s(15), s(3), c(4), d(5), h(9)];
    const state = makeState({ hand, table: [h(14)] });
    expect(chooseMove(state, 1, 'medium')).toEqual({ kind: 'play', cards: [s(15)] });
  });

  it('breaks the end of a straight rather than spend a 2', () => {
    // Only the 7 (breaking the 3-4-5-6-7 straight) or the 2 beat the 6♥;
    // a straight end is cheap, a 2 is not.
    const hand = [s(3), c(4), d(5), h(6), s(7), c(15)];
    const state = makeState({ hand, table: [h(6)] });
    expect(chooseMove(state, 1, 'medium')).toEqual({ kind: 'play', cards: [s(7)] });
  });

  it('sheds its lowest pair when following a pair', () => {
    const hand = [s(3), s(7), h(7), c(9), d(9)];
    const state = makeState({ hand, table: [s(5), d(5)] });
    expect(chooseMove(state, 1, 'medium')).toEqual({ kind: 'play', cards: [s(7), h(7)] });
  });

  it('passes rather than split a quad — while easy splits it', () => {
    const hand = [s(13), c(13), d(13), h(13), s(3), d(4)];
    const state = makeState({ hand, table: [s(12), h(12)] });
    expect(chooseMove(state, 1, 'medium')).toEqual({ kind: 'pass' });
    expect(chooseMove(state, 1, 'easy')).toEqual({ kind: 'play', cards: [s(13), c(13)] });
  });

  it('contests with everything once an opponent is about to go out', () => {
    const hand = [s(13), c(13), d(13), h(13), s(3), d(4)];
    const state = makeState({
      hand,
      table: [s(12), h(12)],
      opponentCards: [1, 8, 8],
    });
    expect(chooseMove(state, 1, 'medium')).toEqual({ kind: 'play', cards: [s(13), c(13)] });
  });
});
