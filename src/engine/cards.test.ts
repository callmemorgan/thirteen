import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from './types';
import { RANKS, SUITS } from './types';
import { cardLabel, compareCards, createDeck, sameCard, sortCards } from './cards';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });

describe('createDeck', () => {
  it('returns 52 cards', () => {
    expect(createDeck()).toHaveLength(52);
  });

  it('contains 52 unique rank/suit combinations', () => {
    const keys = new Set(createDeck().map((c) => `${c.rank}-${c.suit}`));
    expect(keys.size).toBe(52);
  });

  it('contains every rank in every suit', () => {
    const deck = createDeck();
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        expect(deck.some((c) => sameCard(c, card(rank, suit)))).toBe(true);
      }
    }
  });

  it('returns a fresh equal deck on each call', () => {
    expect(createDeck()).not.toBe(createDeck());
    expect(createDeck()).toEqual(createDeck());
  });
});

describe('compareCards', () => {
  it('returns 0 for identical cards', () => {
    expect(compareCards(card(7, 'hearts'), card(7, 'hearts'))).toBe(0);
  });

  it('orders by rank first: 2♠ beats A♥', () => {
    expect(compareCards(card(15, 'spades'), card(14, 'hearts'))).toBeGreaterThan(0);
    expect(compareCards(card(14, 'hearts'), card(15, 'spades'))).toBeLessThan(0);
  });

  it('orders the lowest rank below all others regardless of suit', () => {
    expect(compareCards(card(3, 'hearts'), card(4, 'spades'))).toBeLessThan(0);
  });

  it('breaks rank ties by suit: 7♥ > 7♦ > 7♣ > 7♠', () => {
    expect(compareCards(card(7, 'hearts'), card(7, 'diamonds'))).toBeGreaterThan(0);
    expect(compareCards(card(7, 'diamonds'), card(7, 'clubs'))).toBeGreaterThan(0);
    expect(compareCards(card(7, 'clubs'), card(7, 'spades'))).toBeGreaterThan(0);
    expect(compareCards(card(7, 'spades'), card(7, 'hearts'))).toBeLessThan(0);
  });

  it('is antisymmetric', () => {
    const a = card(10, 'clubs');
    const b = card(11, 'diamonds');
    expect(Math.sign(compareCards(a, b))).toBe(-Math.sign(compareCards(b, a)));
  });
});

describe('sortCards', () => {
  it('sorts ascending by rank, then suit', () => {
    const sorted = sortCards([
      card(15, 'spades'),
      card(3, 'hearts'),
      card(3, 'spades'),
      card(7, 'diamonds'),
    ]);
    expect(sorted).toEqual([
      card(3, 'spades'),
      card(3, 'hearts'),
      card(7, 'diamonds'),
      card(15, 'spades'),
    ]);
  });

  it('returns a new array without mutating the input', () => {
    const input = [card(9, 'hearts'), card(4, 'spades'), card(9, 'clubs')];
    const snapshot = [...input];
    const sorted = sortCards(input);
    expect(sorted).not.toBe(input);
    expect(input).toEqual(snapshot);
  });

  it('handles empty and singleton inputs', () => {
    expect(sortCards([])).toEqual([]);
    expect(sortCards([card(5, 'clubs')])).toEqual([card(5, 'clubs')]);
  });
});

describe('sameCard', () => {
  it('is true for the same rank and suit across object identities', () => {
    expect(sameCard(card(12, 'diamonds'), card(12, 'diamonds'))).toBe(true);
  });

  it('is false when rank or suit differs', () => {
    expect(sameCard(card(12, 'diamonds'), card(12, 'hearts'))).toBe(false);
    expect(sameCard(card(12, 'diamonds'), card(13, 'diamonds'))).toBe(false);
  });
});

describe('cardLabel', () => {
  it('labels number ranks with their face value', () => {
    expect(cardLabel(card(3, 'spades'))).toBe('3♠');
    expect(cardLabel(card(10, 'clubs'))).toBe('10♣');
  });

  it('labels face ranks and aces', () => {
    expect(cardLabel(card(11, 'diamonds'))).toBe('J♦');
    expect(cardLabel(card(12, 'diamonds'))).toBe('Q♦');
    expect(cardLabel(card(13, 'hearts'))).toBe('K♥');
    expect(cardLabel(card(14, 'spades'))).toBe('A♠');
  });

  it('labels the 2 with its rank', () => {
    expect(cardLabel(card(15, 'hearts'))).toBe('2♥');
  });
});
