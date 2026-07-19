import type { Card, Difficulty, GameEvent, GameState, RulesConfig } from '../engine/types';

export interface GameControllerConfig {
  playerName: string;
  /** Difficulty for bot seats 1, 2, 3 (seat 0 is always the human). */
  botDifficulties: [Difficulty, Difficulty, Difficulty];
  rules: RulesConfig;
  seed?: number;
}

/** Everything the UI needs to render one frame. */
export interface ControllerSnapshot {
  state: GameState;
  config: GameControllerConfig;
  /** Seat 0's currently selected cards (subset of their hand). */
  selectedCards: Card[];
  /** Hint cards suggested for seat 0, or null. Cleared on any state change. */
  hint: Card[] | null;
  /** Why the current selection can't be played (e.g. "Doesn't beat pair of 7s"), else null. */
  selectionError: string | null;
  /** True when it is seat 0's turn and the game is in the playing phase. */
  isHumanTurn: boolean;
  /**
   * Running match score per seat across rounds of this controller (rematches):
   * 3/2/1/0 points for finishing 1st–4th, accrued when a round reaches gameEnd.
   * A fresh controller (new match from the menu) starts at zero.
   */
  matchScore: number[];
}

/**
 * The UI-facing game controller. The UI must code against this interface only —
 * the real engine-backed controller (game/controller.ts) and the development mock
 * (ui/mocks.ts) both implement it.
 *
 * React integration: `subscribe`/`getSnapshot` follow the useSyncExternalStore
 * contract (see game/store.ts). Transient events (animations, SFX) go through
 * `onEvent`. Note the 'dealt' event fires inside `newGame()`; the initial game is
 * already dealt before listeners attach, so the UI should render first hands statically.
 */
export interface GameController {
  getSnapshot(): ControllerSnapshot;
  subscribe(listener: () => void): () => void;
  onEvent(listener: (event: GameEvent) => void): () => void;

  /** Add/remove a card from the selection; updates selectionError. */
  toggleCard(card: Card): void;
  clearSelection(): void;
  /** Play the current selection if legal; otherwise sets selectionError. */
  playSelected(): void;
  /** Pass on the current combo (only legal when not leading). */
  pass(): void;
  /** Sort seat 0's hand ascending by (rank, suit). */
  sortHand(): void;
  /** Suggest a legal play; sets hint (also selects the hinted cards). */
  requestHint(): void;

  /** Start a fresh game; previous winner leads on rematch (handled internally). */
  newGame(config?: Partial<GameControllerConfig>): void;
}
