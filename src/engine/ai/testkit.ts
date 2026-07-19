import { expect } from 'vitest';
import type { Card, Combo, GameState, Move, PlayerState, Rank, Suit } from '../types';
import { DEFAULT_RULES } from '../types';
import { cardLabel, createDeck, sameCard } from '../cards';
import { beats, classifyCombo } from '../combos';

/** Shared helpers for crafting GameState objects directly (no controller). */

export const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });
export const s = (rank: Rank): Card => card(rank, 'spades');
export const c = (rank: Rank): Card => card(rank, 'clubs');
export const d = (rank: Rank): Card => card(rank, 'diamonds');
export const h = (rank: Rank): Card => card(rank, 'hearts');

export const isThreeOfSpades = (target: Card): boolean =>
  target.rank === 3 && target.suit === 'spades';

export function comboOf(cards: Card[]): Combo {
  const combo = classifyCombo(cards);
  if (combo === null) throw new Error('test setup error: cards do not form a legal combo');
  return combo;
}

export interface StateOptions {
  /** The bot's cards (the seat under test). */
  hand: Card[];
  /** The bot's seat; defaults to 1. */
  seat?: number;
  /** Cards of the combo on the table to beat; null/omitted means the bot leads. */
  table?: Card[] | null;
  leaderSeat?: number;
  passedSeats?: number[];
  /** Hand sizes of the other seats, in seat order skipping the bot. Default [8, 8, 8]. */
  opponentCards?: number[];
  /** Seats marked finished (excluded from "about to go out" checks). */
  finishedSeats?: number[];
  isFirstRound?: boolean;
  openingPlayMade?: boolean;
  seed?: number;
  round?: number;
}

/**
 * Build a minimal but well-formed playing-phase GameState around one bot's
 * hand. Opponent hands are filled with real deck cards (excluding the bot's
 * hand and the table cards) so hand sizes are realistic.
 */
export function makeState(options: StateOptions): GameState {
  const seat = options.seat ?? 1;
  const table = options.table ?? null;
  const reserved = table === null ? options.hand : [...options.hand, ...table];
  const deck = createDeck().filter(
    (deckCard) => !reserved.some((held) => sameCard(held, deckCard)),
  );

  const opponentCards = options.opponentCards ?? [8, 8, 8];
  const players: PlayerState[] = [];
  let cursor = 0;
  let opponent = 0;
  for (let index = 0; index < 4; index++) {
    const isBot = index === seat;
    const size = isBot ? options.hand.length : opponentCards[opponent++];
    let handCards: Card[];
    if (isBot) {
      handCards = [...options.hand];
    } else {
      handCards = deck.slice(cursor, cursor + size);
      cursor += size;
    }
    players.push({
      id: index,
      name: `P${index}`,
      isBot: true,
      difficulty: 'medium',
      hand: handCards,
      finished: options.finishedSeats?.includes(index) ?? false,
      finishPlace: null,
    });
  }

  return {
    phase: 'playing',
    round: options.round ?? 1,
    players,
    currentSeat: seat,
    trick: {
      combo: table === null ? null : comboOf(table),
      leaderSeat: options.leaderSeat ?? (table === null ? seat : (seat + 1) % 4),
      passedSeats: options.passedSeats ?? [],
    },
    isFirstRound: options.isFirstRound ?? false,
    openingPlayMade: options.openingPlayMade ?? true,
    rules: DEFAULT_RULES,
    seed: options.seed ?? 42,
  };
}

/**
 * Independently verify a move against the mirrored legality rules, using only
 * the engine's public classifyCombo/beats (never the AI's own enumeration):
 * - a play must classify as a legal combo and come from the bot's hand;
 * - a play following a table combo must beat it;
 * - the first-round opening play must contain the 3 of spades;
 * - a pass is legal whenever the bot is following a table combo; with
 *   `strictPass` (the easy bot's contract) a pass additionally requires that
 *   no subset of the hand can beat the table.
 */
export function assertLegalMove(
  state: GameState,
  seat: number,
  move: Move,
  strictPass = false,
): void {
  const hand = state.players[seat].hand;
  const table = state.trick.combo;
  const mustUseThree = state.isFirstRound && !state.openingPlayMade && hand.some(isThreeOfSpades);

  if (move.kind === 'pass') {
    if (table === null) throw new Error('illegal move: passed while leading');
    if (strictPass) {
      expect(
        existsBeater(hand, table, mustUseThree),
        'this bot may pass only when no hand subset beats the table',
      ).toBe(false);
    }
    return;
  }

  const played = classifyCombo(move.cards);
  if (played === null) {
    throw new Error(`illegal move: cards do not form a legal combo: ${move.cards.map(cardLabel)}`);
  }

  const remaining = [...hand];
  for (const playedCard of move.cards) {
    const index = remaining.findIndex((held) => sameCard(held, playedCard));
    if (index < 0) throw new Error(`illegal move: ${cardLabel(playedCard)} is not in the hand`);
    remaining.splice(index, 1);
  }

  if (mustUseThree) {
    expect(move.cards.some(isThreeOfSpades), 'opening play must contain the 3 of spades').toBe(
      true,
    );
  }
  if (table !== null) {
    expect(beats(played, table), 'played combo must beat the table combo').toBe(true);
  }
}

/**
 * Brute-force check (all 2^n subsets) for whether `hand` contains any combo
 * beating `target`. Used to validate passes independently of the AI's logic.
 */
export function existsBeater(hand: Card[], target: Combo, mustUseThree = false): boolean {
  const count = hand.length;
  for (let mask = 1; mask < 1 << count; mask++) {
    const subset = hand.filter((_, index) => (mask & (1 << index)) !== 0);
    if (mustUseThree && !subset.some(isThreeOfSpades)) continue;
    const combo = classifyCombo(subset);
    if (combo !== null && beats(combo, target)) return true;
  }
  return false;
}
