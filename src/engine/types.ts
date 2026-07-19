/**
 * Shared game contracts for Thirteen (Tien Len).
 *
 * This file is the single source of truth for the engine, AI, controller, and UI.
 * Implementations live in sibling modules (cards.ts, combos.ts, rules.ts, state.ts, ai/).
 * Do not change these types without updating every consumer.
 *
 * Rules encoded here (v1, casual Southern-style Tien Len):
 * - 4 players, 13 cards each, standard 52-card deck.
 * - Rank order: 3 < 4 < ... < K < A < 2. Suit tiebreak: spades < clubs < diamonds < hearts.
 * - Legal combos: single, pair, triple, quad, straight (3+ consecutive ranks, no 2s),
 *   pair-run (3+ consecutive pairs, no 2s).
 * - First round: the holder of the 3 of spades leads and the first combo must include it.
 * - Passing locks a player out of the current trick by default (passLockout);
 *   the optional re-entry variant lets passers jump back in after a later play.
 * - A trick ends when every active player except the current leader has passed;
 *   the leader then starts the next trick with any legal combo.
 * - Players finishing shed all cards and are ranked in order; the round ends when
 *   three players are out (the remaining player takes 4th).
 */

/** Rank values: 3..10 are face value, 11=J, 12=Q, 13=K, 14=A, 15=2 (highest rank). */
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** Suits in ascending order of strength. */
export type Suit = 'spades' | 'clubs' | 'diamonds' | 'hearts';

export const SUITS: readonly Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
export const RANKS: readonly Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const RANK_ACE: Rank = 14;
export const RANK_TWO: Rank = 15;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type ComboType = 'single' | 'pair' | 'triple' | 'quad' | 'straight' | 'pair-run';

export interface Combo {
  type: ComboType;
  /** Cards sorted ascending by (rank, suit). */
  cards: Card[];
  /** Highest card in the combo — the comparison key. */
  top: Card;
  /** Number of cards; straights and pair-runs only beat same-length ones. */
  length: number;
}

export type Move = { kind: 'play'; cards: Card[] } | { kind: 'pass' };

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface RulesConfig {
  /** Instant win on deal for four 2s or a 12-card straight (3..A). */
  instantWin: boolean;
  /** Penalty points for leftover 2s / bombs when the round ends (display only). */
  thoi2Scoring: boolean;
  /** When true, passing locks a player out of the trick. When false, passers
   *  may re-enter the same trick after someone else plays (Southern style). */
  passLockout: boolean;
}

export const DEFAULT_RULES: RulesConfig = {
  instantWin: false,
  thoi2Scoring: false,
  passLockout: true,
};

export type GamePhase = 'dealing' | 'playing' | 'roundEnd' | 'gameEnd';

export interface PlayerState {
  /** Seat index 0..3. Seat 0 is the local human by convention. */
  id: number;
  name: string;
  isBot: boolean;
  /** Null for the human player. */
  difficulty: Difficulty | null;
  /**
   * The player's cards, sorted ascending. The engine state is fully observable;
   * the UI is responsible for rendering opponents' hands as face-down.
   */
  hand: Card[];
  finished: boolean;
  /** 1..4 once the player has shed all cards; null while still in. */
  finishPlace: number | null;
}

export interface TrickState {
  /** The combo currently on the table to beat; null means `leaderSeat` leads fresh. */
  combo: Combo | null;
  /** Seat that played the current combo, or the seat that must lead when combo is null. */
  leaderSeat: number;
  /** Seats that have passed on the current combo (they may re-enter on a later play). */
  passedSeats: number[];
}

export interface GameState {
  phase: GamePhase;
  /** 1-based round counter (a game may span multiple rounds via the controller). */
  round: number;
  players: PlayerState[];
  currentSeat: number;
  trick: TrickState;
  /** When true, the 3♠ holder leads and the first play must include the 3♠. */
  isFirstRound: boolean;
  /** True once the first play of a first round has been made. */
  openingPlayMade: boolean;
  rules: RulesConfig;
  seed: number;
}

/**
 * Transient events emitted alongside state transitions. The UI uses them to drive
 * animations and sound effects; they are not part of GameState.
 */
export type GameEvent =
  /** New hands dealt; state already reflects the new hands. */
  | { type: 'dealt' }
  /** `chop` is true when the combo chopped a 2-combo or a lower bomb. */
  | { type: 'played'; seat: number; combo: Combo; chop: boolean }
  | { type: 'passed'; seat: number }
  | { type: 'trickWon'; seat: number }
  | { type: 'playerOut'; seat: number; place: number }
  /** Seats in finish order (index 0 = 1st place). */
  | { type: 'roundEnd'; placements: number[] }
  | { type: 'gameEnd'; placements: number[] };
