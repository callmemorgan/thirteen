import type { Card, Combo, Rank } from '../types';
import { RANK_TWO } from '../types';
import { sortCards } from '../cards';
import { classifyCombo } from '../combos';

/** A legal combo contained in a hand, plus a bitmask locating its cards. */
export interface Candidate {
  combo: Combo;
  /**
   * Bitmask over the ascending-sorted hand this candidate was enumerated from
   * (bit i = the i-th card of `sortCards(hand)`). Hands never exceed 13 cards,
   * so a 32-bit integer is sufficient.
   */
  mask: number;
}

/**
 * Enumerate every legal combo (single, pair, triple, quad, straight, pair-run)
 * contained in `hand`, delegating legality to `classifyCombo` so the AI never
 * invents shapes the engine would reject. Suit variants of the same rank
 * pattern are all generated (policies care which physical cards leave the
 * hand). Output order is deterministic for a deterministic input order.
 */
export function enumerateCombos(hand: Card[]): Candidate[] {
  const cards = sortCards(hand);
  const byRank = new Map<Rank, number[]>();
  cards.forEach((card, index) => {
    const group = byRank.get(card.rank);
    if (group === undefined) byRank.set(card.rank, [index]);
    else group.push(index);
  });
  const groupAt = (rank: Rank): number[] => {
    const group = byRank.get(rank);
    if (group === undefined) throw new Error('enumerateCombos: rank group missing');
    return group;
  };

  const candidates: Candidate[] = [];
  const push = (indices: number[]): void => {
    const combo = classifyCombo(indices.map((index) => cards[index]));
    if (combo === null) return; // defensive: the generators below only build legal shapes
    let mask = 0;
    for (const index of indices) mask |= 1 << index;
    candidates.push({ combo, mask });
  };

  // Singles: every card on its own.
  for (let index = 0; index < cards.length; index++) push([index]);

  // Same-rank groups: every pair / triple / quad subset.
  for (const group of byRank.values()) {
    for (const size of [2, 3, 4]) {
      for (const subset of subsets(group, size)) push(subset);
    }
  }

  // Straights: consecutive rank windows of length 3+, one card per rank, no 2s.
  const ladderRanks = [...byRank.keys()].filter((rank) => rank !== RANK_TWO).sort((a, b) => a - b);
  for (let length = 3; length <= ladderRanks.length; length++) {
    for (let start = 0; start + length <= ladderRanks.length; start++) {
      const window = ladderRanks.slice(start, start + length);
      if (!isConsecutive(window)) continue;
      for (const picks of product(window.map(groupAt))) push(picks);
    }
  }

  // Pair-runs: consecutive windows of ranks held at least twice, no 2s.
  const pairedRanks = ladderRanks.filter((rank) => groupAt(rank).length >= 2);
  for (let length = 3; length <= pairedRanks.length; length++) {
    for (let start = 0; start + length <= pairedRanks.length; start++) {
      const window = pairedRanks.slice(start, start + length);
      if (!isConsecutive(window)) continue;
      const pairChoices = window.map((rank) => subsets(groupAt(rank), 2));
      for (const picked of product(pairChoices)) push(picked.flat());
    }
  }

  return candidates;
}

/** All `size`-element subsets of `items`, in input order. */
function subsets<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  const picked: T[] = [];
  const walk = (start: number): void => {
    if (picked.length === size) {
      result.push([...picked]);
      return;
    }
    for (let i = start; i <= items.length - (size - picked.length); i++) {
      picked.push(items[i]);
      walk(i + 1);
      picked.pop();
    }
  };
  walk(0);
  return result;
}

/** Cartesian product of the given choice lists. */
function product<T>(choices: T[][]): T[][] {
  let result: T[][] = [[]];
  for (const options of choices) {
    const next: T[][] = [];
    for (const prefix of result) {
      for (const option of options) next.push([...prefix, option]);
    }
    result = next;
  }
  return result;
}

/** True when each rank is exactly one above the previous. */
function isConsecutive(ranks: readonly number[]): boolean {
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}
