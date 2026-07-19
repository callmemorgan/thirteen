import type { Card, Combo, GameState, Move, Rank } from './types';
import { RANKS, RANK_TWO } from './types';
import { compareCards, sameCard } from './cards';
import { beats, classifyCombo } from './combos';

/** The 3 of spades — it must be part of a first round's opening play. */
const THREE_OF_SPADES: Card = { rank: 3, suit: 'spades' };

function cardKey(card: Card): string {
  return `${card.rank}:${card.suit}`;
}

/** True when both arrays hold the same cards, ignoring order. */
function sameCardSet(a: Card[], b: Card[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort(compareCards);
  const sortedB = [...b].sort(compareCards);
  return sortedA.every((card, index) => sameCard(card, sortedB[index]));
}

/** All k-element subsets of `items`. */
function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, k - 1).map((subset) => [first, ...subset]);
  return [...withFirst, ...combinations(rest, k)];
}

/** Cartesian product: every way to pick one item from each list, in list order. */
function cartesian<T>(lists: T[][]): T[][] {
  let result: T[][] = [[]];
  for (const list of lists) {
    const next: T[][] = [];
    for (const prefix of result) {
      for (const item of list) {
        next.push([...prefix, item]);
      }
    }
    result = next;
  }
  return result;
}

/**
 * Every classifiable combo that can be formed from `hand`, deduplicated by card set.
 * Enumerates singles, same-rank groups (pairs/triples/quads), straights of every
 * length, and pair-runs of every length. Every suit selection is listed separately:
 * the top card's suit decides ties, so suit variants are distinct plays.
 */
function handCombos(hand: Card[]): Combo[] {
  const combos: Combo[] = [];
  const seen = new Set<string>();
  const add = (cards: Card[]) => {
    const combo = classifyCombo(cards);
    if (combo === null) return;
    const key = combo.cards.map(cardKey).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    combos.push(combo);
  };

  const byRank = new Map<Rank, Card[]>();
  for (const card of hand) {
    const group = byRank.get(card.rank);
    if (group) group.push(card);
    else byRank.set(card.rank, [card]);
  }

  // Singles and same-rank groups (every pair/triple/quad subset).
  for (const group of byRank.values()) {
    for (const card of group) add([card]);
    for (let size = 2; size <= group.length; size++) {
      for (const subset of combinations(group, size)) add(subset);
    }
  }

  // Straights and pair-runs never include 2s, so windows run over ranks 3..A.
  const runRanks = RANKS.filter((rank) => rank !== RANK_TWO);

  // Straights of every length: one card per rank from each consecutive window.
  for (let start = 0; start < runRanks.length; start++) {
    const window: Card[][] = [];
    for (let end = start; end < runRanks.length; end++) {
      const group = byRank.get(runRanks[end]);
      if (group === undefined) break;
      window.push(group);
      if (window.length >= 3) {
        for (const picks of cartesian(window)) add(picks);
      }
    }
  }

  // Pair-runs of every length: one pair per rank from each consecutive window.
  for (let start = 0; start < runRanks.length; start++) {
    const window: Card[][][] = [];
    for (let end = start; end < runRanks.length; end++) {
      const group = byRank.get(runRanks[end]);
      if (group === undefined || group.length < 2) break;
      window.push(combinations(group, 2));
      if (window.length >= 3) {
        for (const picks of cartesian(window)) add(picks.flat());
      }
    }
  }

  return combos;
}

/**
 * All legal moves for `seat` in the current state, including { kind: 'pass' } when
 * passing is allowed. Rules enforced:
 * - It must be `seat`'s turn and the seat must not be finished.
 * - Leading (trick.combo === null): any legal combo from hand; pass NOT allowed.
 * - Following: only combos that beat trick.combo (see combos.beats), or pass.
 * - First round, opening play: the play must include the 3 of spades.
 * A player who passed earlier in the trick may play again (southern-style re-entry).
 */
export function legalPlays(state: GameState, seat: number): Move[] {
  if (state.phase !== 'playing') return [];
  if (seat < 0 || seat >= state.players.length) return [];
  const player = state.players[seat];
  if (player.finished) return [];
  if (state.currentSeat !== seat) return [];

  const target = state.trick.combo;
  const openingPlay = state.isFirstRound && !state.openingPlayMade;

  const moves: Move[] = [];
  for (const combo of handCombos(player.hand)) {
    if (openingPlay && !combo.cards.some((card) => sameCard(card, THREE_OF_SPADES))) {
      continue;
    }
    if (target !== null && !beats(combo, target)) continue;
    moves.push({ kind: 'play', cards: combo.cards });
  }
  // Passes are only possible when following a combo, never when leading.
  if (target !== null) moves.push({ kind: 'pass' });
  return moves;
}

/** Convenience check: is this exact move legal for `seat` right now? */
export function isLegalMove(state: GameState, seat: number, move: Move): boolean {
  return legalPlays(state, seat).some((legal) => {
    if (move.kind === 'pass') return legal.kind === 'pass';
    if (legal.kind !== 'play') return false;
    return sameCardSet(legal.cards, move.cards);
  });
}
