import type { Difficulty, GameState, Move } from '../types';
import { SUIT_ORDER } from '../cards';
import { createRng } from '../rng';
import { analyzeHand } from './evaluate';
import { buildContext, chooseEasy, chooseHard, chooseMedium, legalCandidates } from './policies';

/**
 * Choose a move for `seat` at the given difficulty. Never mutates state.
 * `rng` (defaults to a seeded source) supplies any randomness so games stay reproducible.
 *
 * - easy: plays the lowest legal combo; passes only when it cannot beat the table.
 * - medium: sheds low cards first, avoids breaking straights/bombs, keeps 2s for control.
 * - hard: full hand evaluation (combo counting, endgame awareness, holding control cards,
 *   leading from strength).
 *
 * Internally: `enumerate` lists every legal combo in the hand, `evaluate`
 * solves an exact minimum-combo decomposition ("turns to go out") over the
 * card-bitmask lattice, and `policies` maps those signals to a move per
 * difficulty. See the sibling modules for details.
 */
export function chooseMove(
  state: GameState,
  seat: number,
  difficulty: Difficulty,
  rng?: () => number,
): Move {
  const hand = state.players[seat].hand;
  if (hand.length === 0) return { kind: 'pass' }; // defensive: a finished seat has no play

  const random = rng ?? defaultRng(state, seat);
  const analysis = analyzeHand(hand);
  const ctx = buildContext(state, seat);
  const legal = legalCandidates(
    analysis.candidates,
    state.trick.combo,
    ctx.mustIncludeThreeOfSpades,
  );

  switch (difficulty) {
    case 'easy':
      return chooseEasy(legal, ctx, random);
    case 'medium':
      return chooseMedium(analysis, legal, ctx, random);
    case 'hard':
      return chooseHard(analysis, legal, ctx, random);
    default:
      throw new Error(`chooseMove: unknown difficulty ${String(difficulty)}`);
  }
}

/**
 * Derive the default rng from state fields (seed XOR turn-dependent data) so
 * every decision is reproducible for a given game without an injected source.
 */
function defaultRng(state: GameState, seat: number): () => number {
  let mixed = state.seed | 0;
  mixed ^= Math.imul(state.round + 1, 0x9e3779b9);
  mixed ^= Math.imul(seat + 1, 0x85ebca6b);
  mixed ^= Math.imul(state.players[seat].hand.length + 1, 0xc2b2ae35);
  mixed ^= Math.imul(state.trick.passedSeats.length + 1, 0x27d4eb2f);
  const top = state.trick.combo?.top;
  if (top !== undefined) mixed ^= top.rank * 4 + SUIT_ORDER[top.suit] + 1;
  if (state.isFirstRound && !state.openingPlayMade) mixed ^= 0x5bf03635;
  return createRng(mixed);
}
