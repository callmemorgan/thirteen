import { describe, expect, it } from 'vitest';
import type { Card, Difficulty } from '../types';
import { createDeck } from '../cards';
import { createRng, shuffled } from '../rng';
import { chooseMove } from './index';
import { assertLegalMove, c, d, h, isThreeOfSpades, makeState, s } from './testkit';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function deal(seed: number): Card[][] {
  const deck = shuffled(createDeck(), createRng(seed));
  return [0, 1, 2, 3].map((seat) => deck.slice(seat * 13, seat * 13 + 13));
}

const TRICK_SCENARIOS: Array<{ name: string; table: Card[] | null }> = [
  { name: 'a fresh lead', table: null },
  { name: 'a low single', table: [s(7)] },
  { name: 'a single ace', table: [h(14)] },
  { name: 'a single 2', table: [d(15)] },
  { name: 'a pair of 9s', table: [s(9), h(9)] },
  { name: 'a pair of 2s', table: [c(15), h(15)] },
  { name: 'a low 3-card straight', table: [s(3), c(4), d(5)] },
  { name: 'a broadway straight', table: [s(10), c(11), d(12), h(13), s(14)] },
  { name: 'a quad of 6s', table: [s(6), c(6), d(6), h(6)] },
  { name: 'a 3-pair run', table: [s(3), h(3), c(4), d(4), s(5), h(5)] },
];

describe('chooseMove legality over dealt hands', () => {
  for (let round = 0; round < 8; round++) {
    const hands = deal(1000 + round);
    describe(`dealt hand #${round}`, () => {
      for (const scenario of TRICK_SCENARIOS) {
        it(`returns only legal moves against ${scenario.name}`, () => {
          for (const difficulty of DIFFICULTIES) {
            const state = makeState({
              hand: hands[1],
              seat: 1,
              table: scenario.table,
              seed: 1000 + round,
            });
            const move = chooseMove(state, 1, difficulty);
            assertLegalMove(state, 1, move, difficulty === 'easy');
          }
        });
      }
    });
  }

  it('includes the 3 of spades in the first-round opening play', () => {
    for (let round = 0; round < 16; round++) {
      const hands = deal(5000 + round);
      const seat = hands.findIndex((hand) => hand.some(isThreeOfSpades));
      for (const difficulty of DIFFICULTIES) {
        const state = makeState({
          hand: hands[seat],
          seat,
          table: null,
          isFirstRound: true,
          openingPlayMade: false,
          seed: 5000 + round,
        });
        const move = chooseMove(state, seat, difficulty);
        expect(move.kind).toBe('play');
        assertLegalMove(state, seat, move);
      }
    }
  });

  it('never mutates the state it is given', () => {
    const hands = deal(777);
    const scenarios: Array<Card[] | null> = [null, [s(9)], [d(15)], [s(3), c(4), d(5)]];
    for (const table of scenarios) {
      const state = makeState({ hand: hands[2], seat: 2, table, seed: 7 });
      const snapshot = JSON.stringify(state);
      for (const difficulty of DIFFICULTIES) chooseMove(state, 2, difficulty);
      expect(JSON.stringify(state)).toBe(snapshot);
    }
  });
});

describe('determinism', () => {
  const scenarios: Array<{ name: string; options: Parameters<typeof makeState>[0] }> = [
    {
      name: 'a fresh lead',
      options: { hand: [s(3), d(4), s(9), c(10), h(11), c(12), s(13), h(14)], table: null },
    },
    {
      name: 'following a single',
      options: { hand: [c(12), s(15), s(3), c(4), d(5)], table: [d(11)] },
    },
    {
      name: 'a first-round opening',
      options: {
        hand: [s(3), c(4), d(5), h(6), s(7), c(8), h(10), s(12)],
        table: null,
        isFirstRound: true,
        openingPlayMade: false,
      },
    },
    {
      name: 'an endgame contest',
      options: {
        hand: [s(14), c(14), d(14), s(4), d(5)],
        table: [h(13)],
        opponentCards: [1, 8, 8],
      },
    },
  ];

  for (const scenario of scenarios) {
    it(`repeats the same move for ${scenario.name}`, () => {
      for (const difficulty of DIFFICULTIES) {
        const state = makeState({ ...scenario.options, seat: 1, seed: 99 });
        const withInjectedA = chooseMove(state, 1, difficulty, createRng(7));
        const withInjectedB = chooseMove(state, 1, difficulty, createRng(7));
        expect(withInjectedB).toEqual(withInjectedA);
        const withDefaultA = chooseMove(state, 1, difficulty);
        const withDefaultB = chooseMove(state, 1, difficulty);
        expect(withDefaultB).toEqual(withDefaultA);
      }
    });
  }
});
