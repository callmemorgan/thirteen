import type { Card, Rank, Suit } from './types';
import { RANKS, SUITS } from './types';

/** Ascending suit strength for tiebreaks: spades(0) < clubs(1) < diamonds(2) < hearts(3). */
export const SUIT_ORDER: Record<Suit, number> = {
  spades: 0,
  clubs: 1,
  diamonds: 2,
  hearts: 3,
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
};

/** A fresh ordered 52-card deck (13 ranks × 4 suits). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Compare by rank first, then suit. Negative if a < b, 0 if equal, positive if a > b. */
export function compareCards(a: Card, b: Card): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
}

/** Return a new array sorted ascending by (rank, suit). */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort(compareCards);
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function rankLabel(rank: Rank): string {
  switch (rank) {
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    case 14:
      return 'A';
    case 15:
      return '2';
    default:
      return String(rank);
  }
}

/** Short display label, e.g. "3♠", "10♣", "Q♦", "2♥". */
export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${SUIT_SYMBOLS[card.suit]}`;
}
