import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Card, GameEvent } from '../engine/types';
import { DEFAULT_RULES } from '../engine/types';
import { compareCards, sameCard, sortCards } from '../engine/cards';
import { classifyCombo, comboLabel } from '../engine/combos';
import { isLegalMove } from '../engine/rules';
import type { GameController, GameControllerConfig } from './api';
import { createController } from './controller';

/**
 * Seat 0 holds the 3♠ and leads with seed 3. Its hint-driven game flow:
 * human opens with the 3♠ single; bots 1-3 top it with single 3/4/5 in turn,
 * then the human can follow or pass. The human finishes 3rd (winner: seat 2).
 */
const SEED = 3;
/** With seed 17 the hint-driven human finishes 1st and the bots play on. */
const SEED_HUMAN_WINS = 17;

const THREE_OF_SPADES: Card = { rank: 3, suit: 'spades' };

function makeConfig(overrides?: Partial<GameControllerConfig>): GameControllerConfig {
  return {
    playerName: 'You',
    botDifficulties: ['easy', 'easy', 'easy'],
    rules: { ...DEFAULT_RULES },
    seed: SEED,
    ...overrides,
  };
}

function handOf(controller: GameController, seat = 0): Card[] {
  return controller.getSnapshot().state.players[seat].hand;
}

function findCard(hand: Card[], rank: Card['rank'], suit: Card['suit']): Card {
  const card = hand.find((c) => c.rank === rank && c.suit === suit);
  if (card === undefined) throw new Error(`card ${rank}/${suit} not in hand`);
  return card;
}

/** Human plays the 3♠ as a single (seed 3 opening); turn passes to seat 1. */
function openWithThreeOfSpades(controller: GameController): void {
  controller.toggleCard(findCard(handOf(controller), 3, 'spades'));
  controller.playSelected();
}

/** Advance fake timers one bot move at a time until it is the human's turn. */
function advanceToHumanTurn(controller: GameController, maxMoves = 12): void {
  for (let i = 0; i < maxMoves && !controller.getSnapshot().isHumanTurn; i++) {
    vi.advanceTimersByTime(1200);
  }
}

/** One step of the hint-driven loop: humans act, bots wait for their timer. */
function stepOnce(controller: GameController): void {
  const snap = controller.getSnapshot();
  if (snap.isHumanTurn) {
    controller.requestHint();
    if (controller.getSnapshot().hint !== null) controller.playSelected();
    else controller.pass();
  } else {
    vi.advanceTimersByTime(1200);
  }
}

function driveToGameEnd(controller: GameController, maxSteps = 2000): number {
  let steps = 0;
  while (controller.getSnapshot().state.phase !== 'gameEnd' && steps < maxSteps) {
    steps++;
    stepOnce(controller);
  }
  return steps;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('construction', () => {
  it('deals 13 cards to each of 4 players and the human leads the first round', () => {
    const controller = createController(makeConfig());
    const snap = controller.getSnapshot();

    expect(snap.state.phase).toBe('playing');
    expect(snap.state.players).toHaveLength(4);
    for (const player of snap.state.players) expect(player.hand).toHaveLength(13);

    expect(snap.state.players[0].name).toBe('You');
    expect(snap.state.players[0].isBot).toBe(false);
    expect(snap.state.players[0].difficulty).toBeNull();
    expect(snap.state.players.slice(1).map((p) => p.difficulty)).toEqual([
      'easy',
      'easy',
      'easy',
    ]);

    expect(snap.state.isFirstRound).toBe(true);
    expect(snap.state.openingPlayMade).toBe(false);
    expect(handOf(controller).some((c) => sameCard(c, THREE_OF_SPADES))).toBe(true);
    expect(snap.state.currentSeat).toBe(0);
    expect(snap.isHumanTurn).toBe(true);

    expect(snap.selectedCards).toEqual([]);
    expect(snap.hint).toBeNull();
    expect(snap.selectionError).toBeNull();
    expect(snap.config.playerName).toBe('You');
  });

  it('deals silently: no dealt event on construction', () => {
    const controller = createController(makeConfig());
    const events: GameEvent[] = [];
    controller.onEvent((event) => events.push(event));
    expect(events).toEqual([]);
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const controller = createController(makeConfig());
    let calls = 0;
    const unsubscribe = controller.subscribe(() => {
      calls++;
    });
    controller.toggleCard(findCard(handOf(controller), 3, 'spades'));
    expect(calls).toBeGreaterThan(0);
    unsubscribe();
    const after = calls;
    controller.toggleCard(findCard(handOf(controller), 3, 'spades'));
    expect(calls).toBe(after);
  });

  it('schedules a bot when a bot holds the 3♠', () => {
    // Seed 1: the 3♠ lands with a bot, so the opening move comes from a bot.
    const controller = createController(makeConfig({ seed: 1 }));
    expect(controller.getSnapshot().isHumanTurn).toBe(false);
    const events: GameEvent[] = [];
    controller.onEvent((event) => events.push(event));
    vi.advanceTimersByTime(1200);
    expect(events.some((e) => e.type === 'played')).toBe(true);
  });
});

describe('opening rule', () => {
  it('rejects an opening play without the 3♠ and leaves state untouched', () => {
    const controller = createController(makeConfig());
    controller.toggleCard(findCard(handOf(controller), 4, 'hearts'));
    expect(controller.getSnapshot().selectionError).toBe('Opening play must include the 3♠');

    const before = controller.getSnapshot().state;
    controller.playSelected();
    expect(controller.getSnapshot().state).toBe(before);
    expect(controller.getSnapshot().selectionError).toBe('Opening play must include the 3♠');
  });

  it('plays a combo containing the 3♠', () => {
    const controller = createController(makeConfig());
    const events: GameEvent[] = [];
    controller.onEvent((event) => events.push(event));

    controller.toggleCard(findCard(handOf(controller), 3, 'spades'));
    expect(controller.getSnapshot().selectionError).toBeNull();
    controller.playSelected();

    const snap = controller.getSnapshot();
    expect(handOf(controller)).toHaveLength(12);
    expect(snap.state.trick.combo).not.toBeNull();
    expect(snap.state.trick.combo?.cards.some((c) => sameCard(c, THREE_OF_SPADES))).toBe(true);
    expect(snap.state.openingPlayMade).toBe(true);
    expect(snap.state.currentSeat).toBe(1);
    expect(snap.isHumanTurn).toBe(false);
    expect(snap.selectedCards).toEqual([]);
    expect(events.some((e) => e.type === 'played' && e.seat === 0)).toBe(true);
  });
});

describe('bot scheduling', () => {
  it('bots act one at a time, never before their delay elapses', () => {
    const controller = createController(makeConfig());
    openWithThreeOfSpades(controller);
    const events: GameEvent[] = [];
    controller.onEvent((event) => events.push(event));

    // Bot delays are at least 600 ms: nothing may happen before that.
    vi.advanceTimersByTime(599);
    expect(controller.getSnapshot().state.currentSeat).toBe(1);
    expect(events).toEqual([]);

    // Delays are under 1200 ms: exactly one bot move by then.
    vi.advanceTimersByTime(601);
    expect(controller.getSnapshot().state.currentSeat).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'played', seat: 1 });

    vi.advanceTimersByTime(1200);
    expect(controller.getSnapshot().state.currentSeat).toBe(3);
    expect(events).toHaveLength(2);
  });

  it('newGame clears pending bot timers', () => {
    const controller = createController(makeConfig());
    openWithThreeOfSpades(controller); // bot 1 now has a pending timer
    controller.newGame({ seed: SEED });
    openWithThreeOfSpades(controller);
    vi.advanceTimersByTime(1200);
    // A leaked pre-newGame timer would have double-moved the bots by now.
    expect(controller.getSnapshot().state.currentSeat).toBe(2);
  });
});

describe('pass flow', () => {
  it('pass appends to passedSeats and rotates the turn', () => {
    const controller = createController(makeConfig());
    const events: GameEvent[] = [];
    controller.onEvent((event) => events.push(event));
    openWithThreeOfSpades(controller);
    advanceToHumanTurn(controller);

    const snap = controller.getSnapshot();
    expect(snap.isHumanTurn).toBe(true);
    expect(snap.state.trick.combo).not.toBeNull();

    controller.pass();
    const after = controller.getSnapshot().state;
    expect(after.trick.passedSeats).toContain(0);
    expect(after.currentSeat).toBe(1);
    expect(events).toContainEqual({ type: 'passed', seat: 0 });
  });

  it('pass is a no-op when leading (no combo on the table)', () => {
    const controller = createController(makeConfig());
    const before = controller.getSnapshot().state;
    controller.pass();
    expect(controller.getSnapshot().state).toBe(before);
  });
});

describe('hint', () => {
  it('requestHint selects a legal opening combo containing the 3♠', () => {
    const controller = createController(makeConfig());
    controller.requestHint();
    const snap = controller.getSnapshot();

    expect(snap.hint).not.toBeNull();
    const hint = snap.hint ?? [];
    expect(hint.some((c) => sameCard(c, THREE_OF_SPADES))).toBe(true);
    expect(classifyCombo(hint)).not.toBeNull();
    expect(isLegalMove(snap.state, 0, { kind: 'play', cards: hint })).toBe(true);
    expect(snap.selectedCards).toEqual(sortCards(hint));
    expect(snap.selectionError).toBeNull();
  });

  it('reports "No hint available" when the human cannot beat the table', () => {
    const controller = createController(makeConfig());
    let sawNoHint = false;
    for (let i = 0; i < 2000 && !sawNoHint; i++) {
      const snap = controller.getSnapshot();
      if (snap.state.phase === 'gameEnd') break;
      if (snap.isHumanTurn) {
        controller.requestHint();
        const after = controller.getSnapshot();
        if (after.hint === null) {
          sawNoHint = true;
          expect(after.selectionError).toBe('No hint available — try passing');
          expect(after.selectedCards).toEqual([]);
          expect(after.state.trick.combo).not.toBeNull();
        } else {
          controller.playSelected();
        }
      } else {
        vi.advanceTimersByTime(1200);
      }
    }
    expect(sawNoHint).toBe(true);
  });
});

describe('toggle & selection validation', () => {
  it('flags a non-combo selection as "Not a valid combination"', () => {
    const controller = createController(makeConfig());
    controller.toggleCard(findCard(handOf(controller), 4, 'hearts'));
    controller.toggleCard(findCard(handOf(controller), 6, 'spades'));
    expect(controller.getSnapshot().selectionError).toBe('Not a valid combination');

    controller.playSelected();
    expect(controller.getSnapshot().state.trick.combo).toBeNull();
    expect(controller.getSnapshot().selectionError).toBe('Not a valid combination');
  });

  it('keeps the selection sorted and deselects on a second toggle', () => {
    const controller = createController(makeConfig());
    const six = findCard(handOf(controller), 6, 'spades');
    const three = findCard(handOf(controller), 3, 'spades');
    controller.toggleCard(six);
    controller.toggleCard(three);
    expect(controller.getSnapshot().selectedCards).toEqual([three, six].sort(compareCards));

    controller.toggleCard(six);
    expect(controller.getSnapshot().selectedCards).toEqual([three]);
    // Deselecting back to an empty selection clears the error.
    controller.toggleCard(three);
    expect(controller.getSnapshot().selectedCards).toEqual([]);
    expect(controller.getSnapshot().selectionError).toBeNull();
  });

  it('ignores cards that are not in the human hand', () => {
    const controller = createController(makeConfig());
    controller.toggleCard({ rank: 5, suit: 'spades' }); // 5♠ is not in seat 0's hand
    expect(controller.getSnapshot().selectedCards).toEqual([]);
    expect(controller.getSnapshot().selectionError).toBeNull();
  });

  it('ignores toggles when it is not the human turn', () => {
    const controller = createController(makeConfig());
    openWithThreeOfSpades(controller);
    controller.toggleCard(findCard(handOf(controller), 4, 'hearts'));
    expect(controller.getSnapshot().selectedCards).toEqual([]);
  });

  it('names the table combo when the selection does not beat it', () => {
    const controller = createController(makeConfig());
    openWithThreeOfSpades(controller);
    advanceToHumanTurn(controller);

    const table = controller.getSnapshot().state.trick.combo;
    if (table === null) throw new Error('expected a combo on the table');
    controller.toggleCard(findCard(handOf(controller), 3, 'hearts')); // single 3, below the table
    expect(controller.getSnapshot().selectionError).toBe(`Doesn't beat ${comboLabel(table)}`);

    // A single above the table top clears the error again (a 2 is rank 15).
    controller.toggleCard(findCard(handOf(controller), 3, 'hearts'));
    controller.toggleCard(findCard(handOf(controller), 15, 'spades'));
    expect(controller.getSnapshot().selectionError).toBeNull();
  });

  it('clearSelection resets selection, error and hint', () => {
    const controller = createController(makeConfig());
    controller.requestHint();
    expect(controller.getSnapshot().selectedCards.length).toBeGreaterThan(0);
    controller.clearSelection();
    const snap = controller.getSnapshot();
    expect(snap.selectedCards).toEqual([]);
    expect(snap.selectionError).toBeNull();
    expect(snap.hint).toBeNull();
  });
});

describe('sortHand', () => {
  it('sorts seat 0’s hand ascending and notifies subscribers', () => {
    const controller = createController(makeConfig());
    let calls = 0;
    controller.subscribe(() => {
      calls++;
    });
    controller.sortHand();
    expect(handOf(controller)).toEqual([...handOf(controller)].sort(compareCards));
    expect(calls).toBeGreaterThan(0);
  });
});

describe('rematch', () => {
  it('starts a fresh game led by the previous winner with isFirstRound false', () => {
    const controller = createController(makeConfig());
    const events: GameEvent[] = [];
    controller.onEvent((event) => events.push(event));
    driveToGameEnd(controller);
    expect(controller.getSnapshot().state.phase).toBe('gameEnd');

    const finished = controller.getSnapshot().state;
    const winnerSeat = finished.players.find((p) => p.finishPlace === 1)?.id;
    expect(winnerSeat).toBeDefined();

    let notified = 0;
    controller.subscribe(() => {
      notified++;
    });
    events.length = 0;
    controller.newGame();

    const snap = controller.getSnapshot();
    expect(snap.state.phase).toBe('playing');
    for (const player of snap.state.players) expect(player.hand).toHaveLength(13);
    expect(snap.state.currentSeat).toBe(winnerSeat);
    expect(snap.state.isFirstRound).toBe(false);
    expect(snap.state.openingPlayMade).toBe(false);
    expect(snap.state.trick.combo).toBeNull();
    expect(snap.state.seed).toBe(finished.seed + 1);
    expect(events).toContainEqual({ type: 'dealt' });
    expect(notified).toBeGreaterThan(0);

    // The winner is a bot here: it leads the rematch after its thinking delay.
    expect(snap.isHumanTurn).toBe(false);
    vi.advanceTimersByTime(1200);
    expect(events.some((e) => e.type === 'played' && 'seat' in e && e.seat === winnerSeat)).toBe(
      true,
    );
  });

  it('mid-game newGame starts a fresh first round led by the 3♠ holder', () => {
    const controller = createController(makeConfig());
    openWithThreeOfSpades(controller);
    vi.advanceTimersByTime(1200);

    const events: GameEvent[] = [];
    controller.onEvent((event) => events.push(event));
    controller.newGame({ seed: SEED });

    const snap = controller.getSnapshot();
    expect(snap.state.isFirstRound).toBe(true);
    expect(snap.state.currentSeat).toBe(0); // seat 0 holds the 3♠ with this seed
    expect(snap.isHumanTurn).toBe(true);
    for (const player of snap.state.players) expect(player.hand).toHaveLength(13);
    expect(events).toContainEqual({ type: 'dealt' });
  });
});

describe('full game', () => {
  it('plays to gameEnd with the full event stream and card conservation', () => {
    const controller = createController(makeConfig({ seed: SEED_HUMAN_WINS }));
    const events: GameEvent[] = [];
    controller.onEvent((event) => events.push(event));

    const steps = driveToGameEnd(controller);
    const state = controller.getSnapshot().state;
    expect(state.phase).toBe('gameEnd');
    expect(steps).toBeLessThan(2000);

    // Four placements, one per seat.
    const gameEnd = events.find((e) => e.type === 'gameEnd');
    expect(gameEnd).toBeDefined();
    const placements = gameEnd?.type === 'gameEnd' ? gameEnd.placements : [];
    expect(placements).toHaveLength(4);
    expect([...placements].sort()).toEqual([0, 1, 2, 3]);

    // The whole event vocabulary showed up.
    const types = new Set(events.map((e) => e.type));
    for (const type of ['played', 'passed', 'trickWon', 'playerOut', 'roundEnd', 'gameEnd']) {
      expect(types.has(type as GameEvent['type'])).toBe(true);
    }

    // With this seed the human goes out first; the bots keep playing without them.
    expect(state.players[0].finishPlace).toBe(1);
    const humanOutIndex = events.findIndex((e) => e.type === 'playerOut' && e.seat === 0);
    expect(humanOutIndex).toBeGreaterThanOrEqual(0);
    expect(
      events
        .slice(humanOutIndex + 1)
        .some((e) => e.type === 'played' && 'seat' in e && e.seat !== 0),
    ).toBe(true);

    // Card conservation: every card is either played or still in a hand.
    const keys = new Set<string>();
    for (const event of events) {
      if (event.type === 'played') {
        for (const card of event.combo.cards) keys.add(`${card.rank}:${card.suit}`);
      }
    }
    for (const player of state.players) {
      for (const card of player.hand) keys.add(`${card.rank}:${card.suit}`);
    }
    expect(keys.size).toBe(52);
  });
});
