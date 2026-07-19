import type { Card, Combo, GameState, Move } from '../types';
import { RANK_TWO } from '../types';
import { SUIT_ORDER } from '../cards';
import { beats } from '../combos';
import type { Candidate } from './enumerate';
import type { HandAnalysis } from './evaluate';

/** What the current decision looks like, derived from the game state. */
export interface TurnContext {
  /** True when the table is empty and the bot must lead a fresh combo. */
  leading: boolean;
  /** First-round opening: the play must contain the 3 of spades. */
  mustIncludeThreeOfSpades: boolean;
  /** An active opponent has ≤2 cards left: contest every trick aggressively. */
  contest: boolean;
  /** The bot is close to going out itself: control cards may be spent freely. */
  selfNearOut: boolean;
}

/** An opponent at or below this many cards is treated as "about to go out". */
const CONTEST_THRESHOLD = 2;
/** Own-hand size at or below which the endgame is considered near. */
const ENDGAME_HAND_SIZE = 4;
/** Turns-to-go-out at or below which hard stops preserving control cards. */
const ENDGAME_TURNS = 2;

export function buildContext(state: GameState, seat: number): TurnContext {
  const hand = state.players[seat].hand;
  const opponentCounts = state.players
    .filter((player, index) => index !== seat && !player.finished)
    .map((player) => player.hand.length);
  return {
    leading: state.trick.combo === null,
    mustIncludeThreeOfSpades:
      state.isFirstRound && !state.openingPlayMade && hand.some(isThreeOfSpades),
    contest: opponentCounts.length > 0 && Math.min(...opponentCounts) <= CONTEST_THRESHOLD,
    selfNearOut: hand.length <= ENDGAME_HAND_SIZE,
  };
}

/**
 * Filter enumerated candidates down to legal plays: those containing the 3 of
 * spades when the first-round opening rule applies, and those beating the
 * table combo when following.
 */
export function legalCandidates(
  candidates: Candidate[],
  table: Combo | null,
  mustIncludeThreeOfSpades: boolean,
): Candidate[] {
  let legal = candidates;
  if (mustIncludeThreeOfSpades) {
    legal = legal.filter((candidate) => candidate.combo.cards.some(isThreeOfSpades));
  }
  if (table !== null) {
    legal = legal.filter((candidate) => beats(candidate.combo, table));
  }
  return legal;
}

/**
 * easy: leads its lowest single; when following, plays the lowest legal combo
 * (by top card, fewer cards on ties) and passes whenever it cannot beat the
 * table. No hand evaluation at all — happily breaks straights or wastes bombs.
 */
export function chooseEasy(legal: Candidate[], ctx: TurnContext, rng: () => number): Move {
  if (ctx.leading) {
    const singles = legal.filter((candidate) => candidate.combo.type === 'single');
    return play(pick(singles.length > 0 ? singles : legal, (c) => [topKey(c)], rng));
  }
  if (legal.length === 0) return { kind: 'pass' };
  return play(pick(legal, (c) => [topKey(c), c.combo.length], rng));
}

/**
 * medium: sheds low cards first and protects the structures found in its hand
 * via staged preferences:
 *   1. combos that break no structure and spend no 2;
 *   2. combos that only break a straight/triple (never a quad or pair-run) and spend no 2;
 *   3. combos that break no structure (2s allowed — a 2 is spent only when
 *      nothing cheaper beats the table);
 *   4. combos that break no bomb;
 *   5. anything at all — but only when leading (it must play) or when an
 *      opponent is about to go out (contest with everything).
 * Otherwise it passes. In the endgame (own hand nearly out, or an opponent
 * about to go out) 2s are treated as ordinary cards from stage 1 on.
 */
export function chooseMedium(
  analysis: HandAnalysis,
  legal: Candidate[],
  ctx: TurnContext,
  rng: () => number,
): Move {
  const structureMasks = analysis.structures.map((structure) => structure.mask);
  const bombMasks = analysis.structures
    .filter((structure) => structure.combo.type === 'quad' || structure.combo.type === 'pair-run')
    .map((structure) => structure.mask);
  const breaksStructure = (candidate: Candidate): boolean =>
    overlapsPartially(candidate, structureMasks);
  const breaksBomb = (candidate: Candidate): boolean => overlapsPartially(candidate, bombMasks);

  const stages: Array<(candidate: Candidate) => boolean> =
    ctx.contest || ctx.selfNearOut
      ? [(c) => !breaksStructure(c), (c) => !breaksBomb(c)]
      : [
          (c) => !breaksStructure(c) && !containsTwo(c),
          (c) => !breaksBomb(c) && !containsTwo(c),
          (c) => !breaksStructure(c),
          (c) => !breaksBomb(c),
        ];
  if (ctx.leading || ctx.contest) stages.push(() => true);

  for (const stage of stages) {
    const pool = legal.filter(stage);
    if (pool.length > 0) return play(pick(pool, (c) => [topKey(c), -c.combo.length], rng));
  }
  return { kind: 'pass' };
}

/**
 * hard: full hand evaluation. Every legal play is scored by the exact number
 * of turns the remaining hand would need to go out (`turnsWithin`), then by
 * control cost (2s and bombs are kept unless contesting or nearly out), then
 * by how many cards it sheds, then by table presence.
 *
 * - Following: plays only when the move actually reduces its turns-to-go-out,
 *   so it never splits a quad/straight for a trick that buys nothing — unless
 *   contesting, where any beater is played.
 * - Leading: maximises shedding from its strongest line (long straights,
 *   pair-runs, groups); when an opponent is about to go out it leads the
 *   highest-topping line instead of the cheapest, so the lead is not gifted.
 */
export function chooseHard(
  analysis: HandAnalysis,
  legal: Candidate[],
  ctx: TurnContext,
  rng: () => number,
): Move {
  if (!ctx.leading && legal.length === 0) return { kind: 'pass' };

  const fullMask = (1 << analysis.cards.length) - 1;
  const holdControl = !ctx.contest && !ctx.selfNearOut && analysis.turns > ENDGAME_TURNS;
  const controlPenalty = (candidate: Candidate): number => {
    if (!holdControl) return 0;
    const twos = candidate.combo.cards.filter((card) => card.rank === RANK_TWO).length;
    return twos * 2 + (isBomb(candidate) ? 3 : 0);
  };
  const turnsAfter = (candidate: Candidate): number =>
    analysis.turnsWithin(fullMask & ~candidate.mask);

  const keys = ctx.leading
    ? (c: Candidate) => [
        turnsAfter(c),
        -c.combo.length,
        controlPenalty(c),
        ctx.contest ? -topKey(c) : topKey(c),
      ]
    : (c: Candidate) => [turnsAfter(c), controlPenalty(c), -c.combo.length, topKey(c)];

  const best = pick(legal, keys, rng);
  if (!ctx.leading && !ctx.contest && analysis.turns - turnsAfter(best) < 1) {
    return { kind: 'pass' };
  }
  return play(best);
}

/** Choose a minimum by lexicographic numeric keys; ties are broken by `rng`. */
function pick<T>(items: T[], keys: (item: T) => readonly number[], rng: () => number): T {
  let best: T[] = [];
  let bestKeys: readonly number[] | null = null;
  for (const item of items) {
    const itemKeys = keys(item);
    let cmp = -1;
    if (bestKeys !== null) {
      cmp = 0;
      for (let i = 0; i < itemKeys.length; i++) {
        if (itemKeys[i] !== bestKeys[i]) {
          cmp = itemKeys[i] < bestKeys[i] ? -1 : 1;
          break;
        }
      }
    }
    if (cmp < 0) {
      best = [item];
      bestKeys = itemKeys;
    } else if (cmp === 0) {
      best.push(item);
    }
  }
  const index = Math.floor(rng() * best.length);
  return best[Math.min(index, best.length - 1)];
}

function play(candidate: Candidate): Move {
  return { kind: 'play', cards: [...candidate.combo.cards] };
}

/** True when `candidate` uses some but not all cards of any structure mask. */
function overlapsPartially(candidate: Candidate, structureMasks: number[]): boolean {
  return structureMasks.some(
    (mask) => (candidate.mask & mask) !== 0 && (mask & ~candidate.mask) !== 0,
  );
}

function isThreeOfSpades(card: Card): boolean {
  return card.rank === 3 && card.suit === 'spades';
}

function containsTwo(candidate: Candidate): boolean {
  return candidate.combo.cards.some((card) => card.rank === RANK_TWO);
}

function isBomb(candidate: Candidate): boolean {
  return candidate.combo.type === 'quad' || candidate.combo.type === 'pair-run';
}

/** Comparison key for a combo's top card: rank first, then suit strength. */
function topKey(candidate: Candidate): number {
  return candidate.combo.top.rank * 4 + SUIT_ORDER[candidate.combo.top.suit];
}
