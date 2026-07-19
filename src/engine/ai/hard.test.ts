import { describe, expect, it } from 'vitest';
import { chooseMove } from './index';
import { c, d, h, makeState, s } from './testkit';

describe('hard bot', () => {
  it('leads a long straight that sheds most of the hand, where medium leads a low single', () => {
    // Straight 9-10-J-Q-K-A plus two low scraps. Decomposition needs 3 turns;
    // leading the straight sheds 6 cards for the same 1-turn progress, so hard
    // takes it while medium and easy dribble out the 3♠.
    const hand = [s(3), d(4), s(9), c(10), h(11), c(12), s(13), h(14)];
    const state = makeState({ hand, table: null });
    expect(chooseMove(state, 1, 'hard')).toEqual({
      kind: 'play',
      cards: [s(9), c(10), h(11), c(12), s(13), h(14)],
    });
    expect(chooseMove(state, 1, 'medium')).toEqual({ kind: 'play', cards: [s(3)] });
    expect(chooseMove(state, 1, 'easy')).toEqual({ kind: 'play', cards: [s(3)] });
  });

  it('keeps a quad intact rather than splitting it to beat a pair', () => {
    const hand = [s(13), c(13), d(13), h(13), s(3), d(4)];
    const state = makeState({ hand, table: [s(12), h(12)] });
    expect(chooseMove(state, 1, 'hard')).toEqual({ kind: 'pass' });
  });

  it('chops a single 2 with the whole quad', () => {
    const hand = [s(13), c(13), d(13), h(13), s(3), d(4)];
    const state = makeState({ hand, table: [s(15)] });
    expect(chooseMove(state, 1, 'hard')).toEqual({
      kind: 'play',
      cards: [s(13), c(13), d(13), h(13)],
    });
  });

  it('contests aggressively once an opponent has 2 or fewer cards', () => {
    // Beating the K means cracking the triple of aces: no progress, so hard
    // passes against a healthy table — but not when someone is about to go out.
    const hand = [s(14), c(14), d(14), s(4), d(5)];
    const table = [h(13)];
    const calm = makeState({ hand, table, opponentCards: [5, 8, 8] });
    expect(chooseMove(calm, 1, 'hard')).toEqual({ kind: 'pass' });
    const urgent = makeState({ hand, table, opponentCards: [2, 8, 8] });
    expect(chooseMove(urgent, 1, 'hard')).toEqual({ kind: 'play', cards: [s(14)] });
  });

  it('ignores finished opponents when deciding whether to contest', () => {
    const hand = [s(14), c(14), d(14), s(4), d(5)];
    const state = makeState({
      hand,
      table: [h(13)],
      opponentCards: [0, 8, 8],
      finishedSeats: [0],
    });
    expect(chooseMove(state, 1, 'hard')).toEqual({ kind: 'pass' });
  });

  it('keeps a 2 as control instead of overspending on a mid single', () => {
    const hand = [c(12), s(15), s(3), c(4), d(5)];
    const state = makeState({ hand, table: [d(11)] });
    expect(chooseMove(state, 1, 'hard')).toEqual({ kind: 'play', cards: [c(12)] });
  });

  it('spends a 2 to steal the trick when close to going out', () => {
    const hand = [s(15), s(5), h(5)];
    const state = makeState({ hand, table: [h(14)] });
    expect(chooseMove(state, 1, 'hard')).toEqual({ kind: 'play', cards: [s(15)] });
  });

  it('sheds its lowest natural pair when following a pair', () => {
    const hand = [s(3), c(4), d(5), h(6), s(7), s(9), h(9), c(11), d(11), c(15)];
    const state = makeState({ hand, table: [s(8), d(8)] });
    expect(chooseMove(state, 1, 'hard')).toEqual({ kind: 'play', cards: [s(9), h(9)] });
  });

  it('does not gift a cheap lead to an opponent about to go out', () => {
    const hand = [s(5), h(5), s(9), h(9)];
    const calm = makeState({ hand, table: null, opponentCards: [8, 8, 8] });
    expect(chooseMove(calm, 1, 'hard')).toEqual({ kind: 'play', cards: [s(5), h(5)] });
    const urgent = makeState({ hand, table: null, opponentCards: [2, 9, 9] });
    expect(chooseMove(urgent, 1, 'hard')).toEqual({ kind: 'play', cards: [s(9), h(9)] });
  });

  it('opens the first round with the long straight containing the 3 of spades', () => {
    const hand = [s(3), c(4), d(5), h(6), s(7), c(8), h(10), s(12)];
    const options = { hand, table: null, isFirstRound: true, openingPlayMade: false };
    expect(chooseMove(makeState(options), 1, 'hard')).toEqual({
      kind: 'play',
      cards: [s(3), c(4), d(5), h(6), s(7), c(8)],
    });
    expect(chooseMove(makeState(options), 1, 'medium')).toEqual({
      kind: 'play',
      cards: [s(3), c(4), d(5), h(6), s(7), c(8)],
    });
    expect(chooseMove(makeState(options), 1, 'easy')).toEqual({
      kind: 'play',
      cards: [s(3)],
    });
  });
});
