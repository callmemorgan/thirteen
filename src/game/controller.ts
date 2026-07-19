import type { Card, GameEvent, GameState, Move } from '../engine/types';
import { applyInstantWin, applyMove, createGame, instantWinSeat } from '../engine/state';
import type { GameConfig } from '../engine/state';
import { isLegalMove } from '../engine/rules';
import { beats, classifyCombo, comboLabel } from '../engine/combos';
import { createRng } from '../engine/rng';
import { sameCard, sortCards } from '../engine/cards';
import { chooseMove } from '../engine/ai';
import type { ControllerSnapshot, GameController, GameControllerConfig } from './api';

/** The 3 of spades — it must be part of a first round's opening play. */
const THREE_OF_SPADES: Card = { rank: 3, suit: 'spades' };

/** Bots "think" for 600–1200 ms before acting. */
const MIN_BOT_DELAY_MS = 600;
const BOT_DELAY_SPREAD_MS = 600;

function isHumanTurn(state: GameState): boolean {
  return state.phase === 'playing' && state.currentSeat === 0;
}

/**
 * The real engine-backed controller: wires createGame/applyMove/isLegalMove and
 * bot scheduling (600–1200 ms thinking delays) behind the GameController API.
 *
 * Snapshot updates go to `subscribe` listeners (React via useSyncExternalStore);
 * transient engine events go to `onEvent` listeners after each transition.
 * The initial game is dealt silently — 'dealt' only fires inside newGame().
 */
class EngineController implements GameController {
  private config: GameControllerConfig;
  private snapshot: ControllerSnapshot;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: GameEvent) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Deterministic source for bot delays so seeded games stay reproducible. */
  private delayRng: () => number;

  constructor(config: GameControllerConfig) {
    const seed = config.seed ?? Date.now();
    this.config = { ...config, seed };
    this.delayRng = createRng(seed);
    // Events from an instant win are dropped silently here (no listeners yet),
    // matching the silent initial deal.
    const { state } = this.deal(seed);
    this.snapshot = {
      state,
      config: this.config,
      selectedCards: [],
      hint: null,
      selectionError: null,
      isHumanTurn: isHumanTurn(state),
    };
    this.maybeScheduleBot();
  }

  getSnapshot(): ControllerSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onEvent(listener: (event: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  toggleCard(card: Card): void {
    if (!this.snapshot.isHumanTurn) return;
    const hand = this.snapshot.state.players[0].hand;
    if (!hand.some((hc) => sameCard(hc, card))) return;
    const selectedCards = this.snapshot.selectedCards.some((sc) => sameCard(sc, card))
      ? this.snapshot.selectedCards.filter((sc) => !sameCard(sc, card))
      : sortCards([...this.snapshot.selectedCards, card]);
    this.setSnapshot({
      selectedCards,
      selectionError: this.validateSelection(selectedCards),
      hint: null,
    });
  }

  clearSelection(): void {
    this.setSnapshot({ selectedCards: [], selectionError: null, hint: null });
  }

  playSelected(): void {
    if (!this.snapshot.isHumanTurn) return;
    const selected = this.snapshot.selectedCards;
    const error = this.validateSelection(selected);
    if (error !== null || classifyCombo(selected) === null) {
      this.setSnapshot({ selectionError: error ?? 'Not a valid combination' });
      return;
    }
    const move: Move = { kind: 'play', cards: selected };
    if (!isLegalMove(this.snapshot.state, 0, move)) {
      // Unreachable in practice: validateSelection mirrors the legality rules.
      this.setSnapshot({ selectionError: 'Not a legal play' });
      return;
    }
    this.commit(applyMove(this.snapshot.state, move));
  }

  pass(): void {
    if (!this.snapshot.isHumanTurn) return;
    const { state } = this.snapshot;
    if (state.trick.combo === null) return;
    this.commit(applyMove(state, { kind: 'pass' }));
  }

  sortHand(): void {
    const { state } = this.snapshot;
    const players = state.players.map((player, seat) =>
      seat === 0 ? { ...player, hand: sortCards(player.hand) } : player,
    );
    this.setSnapshot({ state: { ...state, players } });
  }

  requestHint(): void {
    if (!this.snapshot.isHumanTurn) return;
    const move = chooseMove(this.snapshot.state, 0, 'easy');
    if (move.kind === 'play') {
      this.setSnapshot({
        hint: move.cards,
        selectedCards: sortCards(move.cards),
        selectionError: null,
      });
    } else {
      this.setSnapshot({
        hint: null,
        selectedCards: [],
        selectionError: 'No hint available — try passing',
      });
    }
  }

  newGame(config?: Partial<GameControllerConfig>): void {
    const previous = this.snapshot.state;
    const completed = previous.phase === 'gameEnd';
    const winnerSeat = completed
      ? previous.players.find((player) => player.finishPlace === 1)?.id
      : undefined;
    // Fresh seed per rematch unless the caller pins one.
    const seed = config?.seed ?? previous.seed + 1;
    this.config = {
      ...this.config,
      ...config,
      rules: { ...this.config.rules, ...config?.rules },
      seed,
    };
    this.clearTimer();
    this.delayRng = createRng(seed);
    const { state, events } = this.deal(
      seed,
      // Rematch: the previous winner leads and the 3♠ opening rule is off.
      completed && winnerSeat !== undefined
        ? { startingSeat: winnerSeat, isFirstRound: false }
        : { isFirstRound: true },
    );
    this.snapshot = {
      state,
      config: this.config,
      selectedCards: [],
      hint: null,
      selectionError: null,
      isHumanTurn: isHumanTurn(state),
    };
    this.notify();
    this.emit({ type: 'dealt' });
    for (const event of events) this.emit(event);
    this.maybeScheduleBot();
  }

  /** Deal a fresh game, resolving an instant win on the deal when enabled. */
  private deal(
    seed: number,
    extra?: Partial<GameConfig>,
  ): { state: GameState; events: GameEvent[] } {
    const state = createGame(this.gameConfig(seed, extra));
    if (!this.config.rules.instantWin) return { state, events: [] };
    const winner = instantWinSeat(state.players.map((player) => player.hand));
    return winner === null ? { state, events: [] } : applyInstantWin(state, winner);
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private gameConfig(seed: number, extra?: Partial<GameConfig>): GameConfig {
    return {
      playerNames: [this.config.playerName, 'Bot 1', 'Bot 2', 'Bot 3'],
      botDifficulties: [null, ...this.config.botDifficulties],
      rules: this.config.rules,
      seed,
      ...extra,
    };
  }

  /** Why `selected` cannot be played right now, or null when it can. */
  private validateSelection(selected: Card[]): string | null {
    if (selected.length === 0) return null;
    const combo = classifyCombo(selected);
    if (combo === null) return 'Not a valid combination';
    const { state } = this.snapshot;
    const target = state.trick.combo;
    if (target !== null) {
      if (state.rules.passLockout && state.trick.passedSeats.includes(0)) {
        return 'You passed — wait for the next trick';
      }
      if (!beats(combo, target)) {
        return `Doesn't beat ${comboLabel(target)}`;
      }
    }
    if (
      state.isFirstRound &&
      !state.openingPlayMade &&
      !selected.some((card) => sameCard(card, THREE_OF_SPADES))
    ) {
      return 'Opening play must include the 3♠';
    }
    return null;
  }

  /** Apply an engine transition: publish state, stream events, schedule bots. */
  private commit(result: { state: GameState; events: GameEvent[] }): void {
    this.snapshot = {
      ...this.snapshot,
      state: result.state,
      selectedCards: [],
      hint: null,
      selectionError: null,
      isHumanTurn: isHumanTurn(result.state),
    };
    this.notify();
    for (const event of result.events) this.emit(event);
    this.maybeScheduleBot();
  }

  private doBotTurn(): void {
    const { state } = this.snapshot;
    if (state.phase !== 'playing') return;
    const seat = state.currentSeat;
    const player = state.players[seat];
    if (!player.isBot || player.finished) return;
    // Bots keep playing even after the human (seat 0) has gone out.
    const move = chooseMove(state, seat, player.difficulty ?? 'medium');
    this.commit(applyMove(state, move));
  }

  private maybeScheduleBot(): void {
    const { state } = this.snapshot;
    if (state.phase !== 'playing') return;
    const current = state.players[state.currentSeat];
    if (!current.isBot || current.finished) return;
    const delay = MIN_BOT_DELAY_MS + Math.floor(this.delayRng() * BOT_DELAY_SPREAD_MS);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.doBotTurn();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private setSnapshot(partial: Partial<ControllerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private emit(event: GameEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }
}

/**
 * Create the real engine-backed controller: wires createGame/applyMove/isLegalMove
 * and bot scheduling (600–1200 ms thinking delays) behind the GameController API.
 */
export function createController(config: GameControllerConfig): GameController {
  return new EngineController(config);
}
