import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './types';
import { applyInstantWin, createGame, instantWinSeat, thoi2Penalty } from './state';

const c = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

/** Build a 13-card hand from ranks (suits cycle so same-rank groups are legal). */
const SUITS: Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
function handOf(ranks: Rank[]): Card[] {
  const counts = new Map<Rank, number>();
  return ranks.map((rank) => {
    const n = counts.get(rank) ?? 0;
    counts.set(rank, n + 1);
    return c(rank, SUITS[n % 4]);
  });
}

describe('instantWinSeat', () => {
  // Pairs-only hand: no dragon, no four 2s.
  const ordinary = () => handOf([3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10] as Rank[]);

  it('detects four 2s', () => {
    const hands: Card[][] = [
      ordinary(),
      handOf([15, 15, 15, 15, 3, 4, 5, 6, 7, 8, 9, 9, 10] as Rank[]),
      ordinary(),
      ordinary(),
    ];
    expect(instantWinSeat(hands)).toBe(1);
  });

  it('detects a 12-card dragon straight (3..A)', () => {
    const dragon = handOf([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 3] as Rank[]);
    expect(instantWinSeat([dragon, dragon, dragon, dragon])).toBe(0);
  });

  it('returns null for ordinary hands', () => {
    expect(instantWinSeat([ordinary(), ordinary(), ordinary(), ordinary()])).toBeNull();
  });
});

describe('applyInstantWin', () => {
  it('ends the game with the winner 1st and the rest in seat order', () => {
    const state = createGame({ seed: 1 });
    const { state: next, events } = applyInstantWin(state, 2);
    expect(next.phase).toBe('gameEnd');
    expect(next.players.map((p) => p.finishPlace)).toEqual([3, 4, 1, 2]);
    expect(events.map((e) => e.type)).toEqual(['playerOut', 'roundEnd', 'gameEnd']);
    const gameEnd = events[2];
    expect(gameEnd.type === 'gameEnd' && gameEnd.placements).toEqual([2, 3, 0, 1]);
  });
});

describe('thoi2Penalty', () => {
  it('scores nothing for an empty hand', () => {
    expect(thoi2Penalty([])).toEqual({ points: 0, items: [] });
  });

  it('charges 1 for black 2s and 2 for red 2s', () => {
    const penalty = thoi2Penalty([c(15, 'spades'), c(15, 'hearts'), c(7, 'clubs')]);
    expect(penalty.points).toBe(3);
    expect(penalty.items).toHaveLength(2);
  });

  it('charges 4 for a leftover quad', () => {
    expect(thoi2Penalty(handOf([9, 9, 9, 9] as Rank[])).points).toBe(4);
  });

  it('charges 1 per pair in a leftover pair-run, ignoring 2s and quads', () => {
    // 3-pair run (3 pts) + a two-pair stretch (0) + a quad (4) + a 2 (2 for hearts)
    const hand = [
      ...handOf([3, 3, 4, 4, 5, 5] as Rank[]),
      ...handOf([8, 8, 9, 9] as Rank[]),
      ...handOf([11, 11, 11, 11] as Rank[]),
      c(15, 'hearts'),
    ];
    expect(thoi2Penalty(hand).points).toBe(3 + 4 + 2);
  });
});
