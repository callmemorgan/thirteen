/**
 * Presentation helpers for cards and combos (UI-side only).
 * Domain truth lives in src/engine/types.ts — nothing here mutates game logic.
 */
import type { Card, Combo, Rank, Suit } from '../engine/types';

export const SUIT_GLYPH: Record<Suit, string> = {
  spades: '♠',
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
};

const FACE_RANKS: Partial<Record<Rank, string>> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };

export function rankLabel(rank: Rank): string {
  return FACE_RANKS[rank] ?? String(rank);
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'diamonds' || suit === 'hearts';
}

/** Stable React key / identity for a card. */
export function cardKey(card: Card): string {
  return `${card.rank}${card.suit[0]}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function containsCard(cards: Card[], card: Card): boolean {
  return cards.some((c) => sameCard(c, card));
}

/** Short human-readable label for a combo, e.g. "Pair of 9s", "Straight to Q". */
export function comboLabel(combo: Combo): string {
  const top = rankLabel(combo.top.rank);
  switch (combo.type) {
    case 'single':
      return `Single ${top}`;
    case 'pair':
      return `Pair of ${top}s`;
    case 'triple':
      return `Triple ${top}s`;
    case 'quad':
      return `Quad ${top}s`;
    case 'straight':
      return `Straight to ${top}`;
    case 'pair-run':
      return `${combo.length / 2}-pair run`;
  }
}

/** Identity for a combo instance on the table (changes whenever a new combo lands). */
export function comboKey(combo: Combo, leaderSeat: number): string {
  return `${leaderSeat}:${combo.cards.map(cardKey).join(',')}`;
}

/**
 * Unit vector pointing from the table centre toward a seat.
 * Seat 0 = human (bottom), 1 = left, 2 = top, 3 = right.
 * Used to fly played cards in from — and swept cards out toward — a seat.
 */
export function seatVector(seat: number): { x: number; y: number } {
  switch (seat) {
    case 1:
      return { x: -1, y: 0 };
    case 2:
      return { x: 0, y: -1 };
    case 3:
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 1 };
  }
}

/** Ordinal badge text for a finish place (1 → "1st"). */
export function placeLabel(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return '4th';
}
