import type { Card, Combo, ComboType, Rank } from './types';
import { RANK_TWO } from './types';
import { compareCards, sortCards } from './cards';

/**
 * Classify a set of cards into a Combo, or null if it is not a legal combination.
 * Legal combinations:
 * - single (1 card)
 * - pair / triple / quad (same rank)
 * - straight: 3+ cards of consecutive ranks, may NOT contain a 2 (rank 15)
 * - pair-run: 3+ consecutive pairs (e.g. 3-3-4-4-5-5), may NOT contain a 2
 * The returned Combo has cards sorted ascending and `top` set to the highest card.
 */
export function classifyCombo(cards: Card[]): Combo | null {
  if (cards.length === 0) return null;

  const sorted = sortCards(cards);
  const length = sorted.length;

  // Same-rank groups: single, pair, triple, quad.
  if (sorted.every((card) => card.rank === sorted[0].rank)) {
    switch (length) {
      case 1:
        return makeCombo('single', sorted);
      case 2:
        return makeCombo('pair', sorted);
      case 3:
        return makeCombo('triple', sorted);
      case 4:
        return makeCombo('quad', sorted);
      default:
        return null;
    }
  }

  const containsTwo = sorted.some((card) => card.rank === RANK_TWO);

  // Straight: 3+ cards of strictly consecutive ranks, no 2.
  if (length >= 3 && !containsTwo && isConsecutive(sorted.map((card) => card.rank))) {
    return makeCombo('straight', sorted);
  }

  // Pair-run: 3+ consecutive pairs (6, 8, 10... cards), no 2.
  if (length >= 6 && length % 2 === 0 && !containsTwo) {
    const pairRanks: number[] = [];
    let isPairs = true;
    for (let i = 0; i < length; i += 2) {
      if (sorted[i].rank !== sorted[i + 1].rank) {
        isPairs = false;
        break;
      }
      pairRanks.push(sorted[i].rank);
    }
    if (isPairs && isConsecutive(pairRanks)) {
      return makeCombo('pair-run', sorted);
    }
  }

  return null;
}

/**
 * Whether `challenger` legally beats the current table `target`.
 *
 * Comparison matrix:
 * - Same type and same length: challenger wins iff its `top` card is higher
 *   (rank, then suit). Straights and pair-runs only compete at equal length.
 * - Chop rules (challenger may break type to beat 2s and bombs):
 *   - quad beats a single 2 (target single whose top rank is 15)
 *   - pair-run of length 6 (3 pairs) beats a single 2
 *   - pair-run of length 8 (4 pairs) beats a single 2, a pair of 2s, any quad,
 *     and any 3-pair run
 *   - a quad does NOT beat a pair of 2s; a 3-pair run does NOT beat a quad
 * - Everything else: false.
 */
export function beats(challenger: Combo, target: Combo): boolean {
  const targetIsSingleTwo = target.type === 'single' && target.top.rank === RANK_TWO;

  // Chop rules. The 4-pair-run chop of a 3-pair run crosses lengths within the
  // same type, so chops are checked before the same-type comparison.
  if (challenger.type === 'quad' && targetIsSingleTwo) {
    return true;
  }
  if (challenger.type === 'pair-run' && challenger.length === 6 && targetIsSingleTwo) {
    return true;
  }
  if (challenger.type === 'pair-run' && challenger.length === 8) {
    if (targetIsSingleTwo) return true;
    if (target.type === 'pair' && target.top.rank === RANK_TWO) return true;
    if (target.type === 'quad') return true;
    if (target.type === 'pair-run' && target.length === 6) return true;
  }

  if (challenger.type !== target.type) return false;
  if (challenger.length !== target.length) return false;
  return compareCards(challenger.top, target.top) > 0;
}

/** Human-readable label, e.g. "single 7", "pair of Queens", "straight (6 cards)", "3-pair run". */
export function comboLabel(combo: Combo): string {
  const [name, plural] = rankNames(combo.top.rank);
  switch (combo.type) {
    case 'single':
      return `single ${name}`;
    case 'pair':
      return `pair of ${plural}`;
    case 'triple':
      return `triple of ${plural}`;
    case 'quad':
      return `quad of ${plural}`;
    case 'straight':
      return `straight (${combo.length} cards)`;
    case 'pair-run':
      return `${combo.length / 2}-pair run`;
  }
}

function makeCombo(type: ComboType, cards: Card[]): Combo {
  return { type, cards, top: cards[cards.length - 1], length: cards.length };
}

/** True when each rank is exactly one above the previous (strictly consecutive). */
function isConsecutive(ranks: number[]): boolean {
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

/** Singular and plural display names for a rank, e.g. ['Queen', 'Queens'], ['7', '7s']. */
function rankNames(rank: Rank): [string, string] {
  switch (rank) {
    case 11:
      return ['Jack', 'Jacks'];
    case 12:
      return ['Queen', 'Queens'];
    case 13:
      return ['King', 'Kings'];
    case 14:
      return ['Ace', 'Aces'];
    case 15:
      return ['2', '2s'];
    default: {
      const face = String(rank);
      return [face, `${face}s`];
    }
  }
}
