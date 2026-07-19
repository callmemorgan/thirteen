import type { Card, Combo } from '../types';
import { sortCards } from '../cards';
import { enumerateCombos, type Candidate } from './enumerate';

/** A multi-card combo (length ≥ 3) from one optimal decomposition of a hand. */
export interface Structure {
  combo: Combo;
  /** Bitmask over the sorted hand, same indexing as `Candidate.mask`. */
  mask: number;
}

export interface HandAnalysis {
  /** The hand, sorted ascending; all masks index into this array. */
  cards: Card[];
  /** Every legal combo in the hand (all suit variants). */
  candidates: Candidate[];
  /** Minimum number of plays needed to shed the whole hand ("turns to go out"). */
  turns: number;
  /** Protected multi-card combos of one optimal decomposition of the full hand. */
  structures: Structure[];
  /** Minimum number of plays needed to shed the sub-hand selected by `mask`. */
  turnsWithin(mask: number): number;
}

/**
 * Analyze a hand once per decision: enumerate its combos and solve the exact
 * minimum-combo decomposition over the card-bitmask lattice with memoization.
 * Sub-results are shared between the full hand and every hypothetical
 * "after playing X" hand a policy asks about via `turnsWithin`.
 */
export function analyzeHand(hand: Card[]): HandAnalysis {
  const cards = sortCards(hand);
  const candidates = enumerateCombos(cards);
  const patterns = candidates;

  // Patterns indexed by each hand position they cover, so the DP only tries
  // combos that can cover the lowest unsettled card of a mask.
  const patternsCovering: number[][] = Array.from({ length: cards.length }, () => []);
  patterns.forEach((pattern, patternIndex) => {
    for (let bit = 0; bit < cards.length; bit++) {
      if ((pattern.mask & (1 << bit)) !== 0) patternsCovering[bit].push(patternIndex);
    }
  });

  interface Node {
    turns: number;
    /** Total cards locked into length-≥3 combos; maximized as a tiebreak. */
    structureScore: number;
    /** Index into `patterns` chosen first in one optimal decomposition. */
    pick: number;
  }
  const memo = new Map<number, Node>();
  const EMPTY: Node = { turns: 0, structureScore: 0, pick: -1 };

  const solve = (mask: number): Node => {
    const cached = memo.get(mask);
    if (cached !== undefined) return cached;
    const lowestBit = mask & -mask;
    const lowestIndex = 31 - Math.clz32(lowestBit);
    let best: Node | null = null;
    for (const patternIndex of patternsCovering[lowestIndex]) {
      const pattern = patterns[patternIndex];
      if ((pattern.mask & mask) !== pattern.mask) continue;
      const rest = mask & ~pattern.mask;
      const sub = rest === 0 ? EMPTY : solve(rest);
      const node: Node = {
        turns: sub.turns + 1,
        structureScore: sub.structureScore + (pattern.combo.length >= 3 ? pattern.combo.length : 0),
        pick: patternIndex,
      };
      if (
        best === null ||
        node.turns < best.turns ||
        (node.turns === best.turns && node.structureScore > best.structureScore)
      ) {
        best = node;
      }
    }
    if (best === null) throw new Error('analyzeHand: singles cover every non-empty mask');
    memo.set(mask, best);
    return best;
  };

  const fullMask = (1 << cards.length) - 1;
  const turns = cards.length === 0 ? 0 : solve(fullMask).turns;

  // Reconstruct one optimal decomposition, keeping its multi-card combos as
  // the structures policies should try not to break.
  const structures: Structure[] = [];
  let mask = fullMask;
  while (mask !== 0) {
    const node = solve(mask);
    const pattern = patterns[node.pick];
    if (pattern.combo.length >= 3) structures.push({ combo: pattern.combo, mask: pattern.mask });
    mask &= ~pattern.mask;
  }

  return {
    cards,
    candidates,
    turns,
    structures,
    turnsWithin: (subMask) => (subMask === 0 ? 0 : solve(subMask).turns),
  };
}
