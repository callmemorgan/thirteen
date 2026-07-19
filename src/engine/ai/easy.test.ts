import { describe, expect, it } from 'vitest';
import { chooseMove } from './index';
import { c, d, h, makeState, s } from './testkit';

describe('easy bot', () => {
  it('leads its lowest single, even when holding a pair', () => {
    const state = makeState({ hand: [h(3), c(5), d(5), s(9), h(13)], table: null });
    expect(chooseMove(state, 1, 'easy')).toEqual({ kind: 'play', cards: [h(3)] });
  });

  it('opens the first round with the 3 of spades', () => {
    const state = makeState({
      hand: [s(3), c(4), h(4), d(9), s(13)],
      table: null,
      isFirstRound: true,
      openingPlayMade: false,
    });
    expect(chooseMove(state, 1, 'easy')).toEqual({ kind: 'play', cards: [s(3)] });
  });

  it('beats a single with its lowest single, even by splitting a pair', () => {
    const state = makeState({ hand: [c(8), h(8), s(11)], table: [s(7)] });
    expect(chooseMove(state, 1, 'easy')).toEqual({ kind: 'play', cards: [c(8)] });
  });

  it('beats a pair with its lowest pair', () => {
    const state = makeState({
      hand: [s(4), s(7), h(7), c(9), d(9)],
      table: [s(5), d(5)],
    });
    expect(chooseMove(state, 1, 'easy')).toEqual({ kind: 'play', cards: [s(7), h(7)] });
  });

  it('plays the lowest-top combo that beats, even when that is a bomb', () => {
    // Against a single 2 the quad of 4s (top 4♥) is lower than the 2♥, so
    // easy — which only looks at the top card — wastes the quad.
    const state = makeState({
      hand: [s(3), s(4), c(4), d(4), h(4), h(15)],
      table: [s(15)],
    });
    expect(chooseMove(state, 1, 'easy')).toEqual({
      kind: 'play',
      cards: [s(4), c(4), d(4), h(4)],
    });
  });

  it('passes when no single beats a 2', () => {
    const state = makeState({ hand: [s(3), c(5), d(9), h(11)], table: [h(15)] });
    expect(chooseMove(state, 1, 'easy')).toEqual({ kind: 'pass' });
  });

  it('passes against a pair of 2s without a 4-pair run', () => {
    // A quad does not beat a pair of 2s, and neither does a lone 2.
    const state = makeState({
      hand: [s(3), s(4), c(4), d(4), h(4), s(15)],
      table: [c(15), h(15)],
    });
    expect(chooseMove(state, 1, 'easy')).toEqual({ kind: 'pass' });
  });
});
