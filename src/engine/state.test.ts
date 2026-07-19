import { describe, expect, it } from 'vitest';
import type { Card, Combo, GameEvent, GameState, Move, Rank, RulesConfig, Suit, TrickState } from './types';
import { DEFAULT_RULES } from './types';
import { compareCards, sameCard } from './cards';
import { classifyCombo } from './combos';
import { applyMove, createGame } from './state';
import { isLegalMove, legalPlays } from './rules';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });
const s = (rank: Rank) => card(rank, 'spades');
const c = (rank: Rank) => card(rank, 'clubs');
const d = (rank: Rank) => card(rank, 'diamonds');
const h = (rank: Rank) => card(rank, 'hearts');

const THREE_OF_SPADES = s(3);

function comboOf(cards: Card[]): Combo {
  const combo = classifyCombo(cards);
  if (combo === null) throw new Error('test setup error: cards do not form a legal combo');
  return combo;
}

function trickWith(combo: Combo): TrickState {
  return { combo, leaderSeat: 0, passedSeats: [] };
}

interface RigOptions {
  hands: Card[][];
  currentSeat?: number;
  trick?: TrickState;
  isFirstRound?: boolean;
  openingPlayMade?: boolean;
  finishedSeats?: number[];
  phase?: GameState['phase'];
  rules?: Partial<RulesConfig>;
}

/** Build a rigged state; hands are sorted for the PlayerState contract. */
function rig(options: RigOptions): GameState {
  const finishedSeats = options.finishedSeats ?? [];
  const currentSeat = options.currentSeat ?? 0;
  return {
    phase: options.phase ?? 'playing',
    round: 1,
    players: options.hands.map((hand, seat) => ({
      id: seat,
      name: `P${seat}`,
      isBot: true,
      difficulty: 'medium',
      hand: [...hand].sort(compareCards),
      finished: finishedSeats.includes(seat),
      finishPlace: finishedSeats.includes(seat) ? finishedSeats.indexOf(seat) + 1 : null,
    })),
    currentSeat,
    trick: options.trick ?? { combo: null, leaderSeat: currentSeat, passedSeats: [] },
    isFirstRound: options.isFirstRound ?? false,
    openingPlayMade: options.openingPlayMade ?? true,
    rules: { ...DEFAULT_RULES, ...options.rules },
    seed: 0,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('createGame', () => {
  it('deals 13 unique, sorted cards to each of 4 players', () => {
    const state = createGame({ seed: 42 });
    expect(state.players).toHaveLength(4);
    const all: Card[] = [];
    for (const player of state.players) {
      expect(player.hand).toHaveLength(13);
      expect(player.hand).toEqual([...player.hand].sort(compareCards));
      all.push(...player.hand);
    }
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => `${c.rank}:${c.suit}`)).size).toBe(52);
  });

  it('is deterministic for the same seed', () => {
    const a = createGame({ seed: 7 });
    const b = createGame({ seed: 7 });
    expect(a.players.map((p) => p.hand)).toEqual(b.players.map((p) => p.hand));
    expect(a.currentSeat).toBe(b.currentSeat);
    expect(a.seed).toBe(7);
    // The default game uses seed 0.
    expect(createGame().seed).toBe(0);
  });

  it('deals different hands for different seeds', () => {
    const a = createGame({ seed: 1 });
    const b = createGame({ seed: 2 });
    expect(a.players.map((p) => p.hand)).not.toEqual(b.players.map((p) => p.hand));
  });

  it('lets the 3♠ holder lead a first round, starting in phase playing', () => {
    const state = createGame({ seed: 99 });
    const holder = state.players.findIndex((p) =>
      p.hand.some((c) => sameCard(c, THREE_OF_SPADES)),
    );
    expect(holder).toBeGreaterThanOrEqual(0);
    expect(state.currentSeat).toBe(holder);
    expect(state.trick).toEqual({ combo: null, leaderSeat: holder, passedSeats: [] });
    expect(state.phase).toBe('playing');
    expect(state.round).toBe(1);
    expect(state.isFirstRound).toBe(true);
    expect(state.openingPlayMade).toBe(false);
  });

  it('honors startingSeat when isFirstRound is false', () => {
    const state = createGame({ seed: 5, isFirstRound: false, startingSeat: 2 });
    expect(state.currentSeat).toBe(2);
    expect(state.trick.leaderSeat).toBe(2);
    expect(state.isFirstRound).toBe(false);
  });

  it('applies default names and difficulties', () => {
    const state = createGame({ seed: 1 });
    expect(state.players.map((p) => p.name)).toEqual(['You', 'Bot 1', 'Bot 2', 'Bot 3']);
    expect(state.players.map((p) => p.difficulty)).toEqual([null, 'medium', 'medium', 'medium']);
    expect(state.players.map((p) => p.isBot)).toEqual([false, true, true, true]);
    expect(state.rules).toEqual(DEFAULT_RULES);
  });

  it('merges rule overrides over the defaults and honors custom names', () => {
    const state = createGame({
      seed: 1,
      rules: { instantWin: true },
      playerNames: ['A', 'B', 'C', 'D'],
      botDifficulties: ['easy', null, 'hard', 'medium'],
    });
    expect(state.rules).toEqual({ instantWin: true, thoi2Scoring: false, passLockout: true });
    expect(state.players.map((p) => p.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(state.players.map((p) => p.difficulty)).toEqual(['easy', null, 'hard', 'medium']);
  });
});

describe('applyMove: opening play of a first round', () => {
  it('enforces the 3♠ on the first play, then lifts the constraint', () => {
    const state = createGame({ seed: 123 });
    const seat = state.currentSeat;
    const moves = legalPlays(state, seat);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move.kind).toBe('play');
      if (move.kind === 'play') {
        expect(move.cards.some((c) => sameCard(c, THREE_OF_SPADES))).toBe(true);
      }
    }

    const result = applyMove(state, { kind: 'play', cards: [s(3)] });
    expect(result.events).toEqual([{ type: 'played', seat, combo: comboOf([s(3)]), chop: false }]);
    expect(result.state.openingPlayMade).toBe(true);
    expect(result.state.players[seat].hand).toHaveLength(12);
    expect(result.state.trick).toEqual({ combo: comboOf([s(3)]), leaderSeat: seat, passedSeats: [] });
  });
});

describe('applyMove: pass and re-entry', () => {
  it('keeps the combo on a pass, clears passes on a play, and allows re-entry', () => {
    const state = rig({
      hands: [
        [s(7), s(9)],
        [h(8), d(10)],
        [h(7), c(11)],
        [c(8), d(12)],
      ],
      currentSeat: 0,
      rules: { passLockout: false },
    });

    // Seat 0 leads the 7♠.
    let result = applyMove(state, { kind: 'play', cards: [s(7)] });
    expect(result.events).toEqual([{ type: 'played', seat: 0, combo: comboOf([s(7)]), chop: false }]);
    expect(result.state.trick.leaderSeat).toBe(0);
    expect(result.state.currentSeat).toBe(1);

    // Seat 1 passes: the combo and its leader stay as they were.
    result = applyMove(result.state, { kind: 'pass' });
    expect(result.events).toEqual([{ type: 'passed', seat: 1 }]);
    expect(result.state.trick.combo).toEqual(comboOf([s(7)]));
    expect(result.state.trick.leaderSeat).toBe(0);
    expect(result.state.trick.passedSeats).toEqual([1]);
    expect(result.state.currentSeat).toBe(2);

    // Seat 2 beats with the 7♥: passes against the old combo are cleared.
    result = applyMove(result.state, { kind: 'play', cards: [h(7)] });
    expect(result.state.trick.combo).toEqual(comboOf([h(7)]));
    expect(result.state.trick.leaderSeat).toBe(2);
    expect(result.state.trick.passedSeats).toEqual([]);
    expect(result.state.currentSeat).toBe(3);

    // Seats 3 and 0 pass; the trick stays open because seat 1 has not passed on 7♥.
    result = applyMove(result.state, { kind: 'pass' });
    result = applyMove(result.state, { kind: 'pass' });
    expect(result.events).toEqual([{ type: 'passed', seat: 0 }]);
    expect(result.state.trick.combo).toEqual(comboOf([h(7)]));
    expect(result.state.trick.passedSeats).toEqual([3, 0]);

    // Seat 1, an earlier passer, may now legally contest the higher combo.
    expect(result.state.currentSeat).toBe(1);
    expect(isLegalMove(result.state, 1, { kind: 'play', cards: [h(8)] })).toBe(true);
    expect(isLegalMove(result.state, 1, { kind: 'pass' })).toBe(true);
  });
});

describe('applyMove: pass lockout (default rules)', () => {
  it('locks passers out until the trick ends, then frees them', () => {
    const state = rig({
      hands: [
        [c(4), s(4), s(7), h(13)],
        [d(12)],
        [h(7), s(10)],
        [c(8), d(9)],
      ],
      currentSeat: 0,
    });

    // Seat 0 leads the 7♠; seat 1 passes; seats 2, 3 and 0 keep topping the combo.
    let result = applyMove(state, { kind: 'play', cards: [s(7)] });
    result = applyMove(result.state, { kind: 'pass' });
    expect(result.state.trick.passedSeats).toEqual([1]);

    for (const cards of [[h(7)], [c(8)], [h(13)]]) {
      result = applyMove(result.state, { kind: 'play', cards });
      // Lockout: seat 1's pass stands against each new, higher combo.
      expect(result.state.trick.passedSeats).toEqual([1]);
    }

    // Seat 1's turn with the trick still open: locked out — pass is the only move.
    expect(result.state.currentSeat).toBe(1);
    expect(legalPlays(result.state, 1)).toEqual([{ kind: 'pass' }]);
    expect(isLegalMove(result.state, 1, { kind: 'play', cards: [d(12)] })).toBe(false);

    // Seat 1 passes (recorded once), then seats 2 and 3 pass: the trick closes.
    result = applyMove(result.state, { kind: 'pass' });
    expect(result.state.trick.passedSeats).toEqual([1]);
    result = applyMove(result.state, { kind: 'pass' });
    result = applyMove(result.state, { kind: 'pass' });
    expect(result.events).toEqual([
      { type: 'passed', seat: 3 },
      { type: 'trickWon', seat: 0 },
    ]);
    expect(result.state.trick).toEqual({ combo: null, leaderSeat: 0, passedSeats: [] });

    // Seat 0 leads the next trick; seat 1 may contest it again.
    result = applyMove(result.state, { kind: 'play', cards: [s(4)] });
    expect(result.state.currentSeat).toBe(1);
    expect(isLegalMove(result.state, 1, { kind: 'play', cards: [d(12)] })).toBe(true);
  });
});

describe('applyMove: trick completion', () => {
  it('closes the trick after three passes and lets the leader lead again', () => {
    const state = rig({
      hands: [[s(7), s(9)], [c(8)], [d(9)], [h(10)]],
      currentSeat: 0,
    });
    let result = applyMove(state, { kind: 'play', cards: [s(7)] });
    result = applyMove(result.state, { kind: 'pass' });
    result = applyMove(result.state, { kind: 'pass' });
    expect(result.events).toEqual([{ type: 'passed', seat: 2 }]);
    expect(result.state.currentSeat).toBe(3);

    result = applyMove(result.state, { kind: 'pass' });
    expect(result.events).toEqual([
      { type: 'passed', seat: 3 },
      { type: 'trickWon', seat: 0 },
    ]);
    expect(result.state.trick).toEqual({ combo: null, leaderSeat: 0, passedSeats: [] });
    expect(result.state.currentSeat).toBe(0);
  });

  it('passes the lead to the next active seat when the winner went out', () => {
    const state = rig({
      hands: [[s(7), h(7)], [c(8)], [d(9)], [h(10)]],
      currentSeat: 0,
    });
    // Seat 0 leads a pair — its last cards.
    let result = applyMove(state, { kind: 'play', cards: [s(7), h(7)] });
    expect(result.events).toEqual([
      { type: 'played', seat: 0, combo: comboOf([s(7), h(7)]), chop: false },
      { type: 'playerOut', seat: 0, place: 1 },
    ]);
    expect(result.state.players[0].finished).toBe(true);
    expect(result.state.players[0].finishPlace).toBe(1);
    expect(result.state.currentSeat).toBe(1);

    result = applyMove(result.state, { kind: 'pass' });
    result = applyMove(result.state, { kind: 'pass' });
    result = applyMove(result.state, { kind: 'pass' });
    expect(result.events).toEqual([
      { type: 'passed', seat: 3 },
      { type: 'trickWon', seat: 0 },
    ]);
    // Seat 0 is out, so seat 1 inherits the lead.
    expect(result.state.trick).toEqual({ combo: null, leaderSeat: 1, passedSeats: [] });
    expect(result.state.currentSeat).toBe(1);
  });
});

describe('applyMove: finishing and game end', () => {
  it('awards finish places in order and skips finished seats in rotation', () => {
    const state = rig({
      hands: [[s(7)], [], [c(8)], [d(9)]],
      currentSeat: 0,
      finishedSeats: [1],
    });
    const result = applyMove(state, { kind: 'play', cards: [s(7)] });
    expect(result.events).toEqual([
      { type: 'played', seat: 0, combo: comboOf([s(7)]), chop: false },
      { type: 'playerOut', seat: 0, place: 2 },
    ]);
    expect(result.state.players[0].finished).toBe(true);
    expect(result.state.players[0].finishPlace).toBe(2);
    expect(result.state.phase).toBe('playing');
    // Seat 1 is already out, so the turn jumps to seat 2.
    expect(result.state.currentSeat).toBe(2);
  });

  it('ends the game when the third player goes out', () => {
    const state = rig({
      hands: [[s(9)], [], [], [d(6), h(11)]],
      currentSeat: 0,
      finishedSeats: [1, 2],
    });
    const result = applyMove(state, { kind: 'play', cards: [s(9)] });
    const placements = [1, 2, 0, 3];
    expect(result.events).toEqual([
      { type: 'played', seat: 0, combo: comboOf([s(9)]), chop: false },
      { type: 'playerOut', seat: 0, place: 3 },
      { type: 'roundEnd', placements },
      { type: 'gameEnd', placements },
    ]);
    expect(result.state.phase).toBe('gameEnd');
    expect(result.state.players[0].finishPlace).toBe(3);
    // The last remaining seat takes 4th without ever "finishing".
    expect(result.state.players[3].finished).toBe(false);
    expect(result.state.players[3].finishPlace).toBeNull();
    expect(result.state.currentSeat).toBe(3);
  });

  it('rejects any move once the game has ended', () => {
    const state = rig({
      hands: [[s(9)], [], [], [d(6), h(11)]],
      currentSeat: 0,
      finishedSeats: [1, 2],
    });
    const end = applyMove(state, { kind: 'play', cards: [s(9)] });
    expect(() => applyMove(end.state, { kind: 'pass' })).toThrow(Error);
    expect(() => applyMove(end.state, { kind: 'play', cards: [d(6)] })).toThrow(Error);
  });
});

describe('applyMove: chop flag', () => {
  it('is true for a chop win and false for a same-type win or a lead', () => {
    // Quad over a single 2: a chop.
    const chopState = rig({
      hands: [[s(15)], [s(9), c(9), d(9), h(9), c(12)], [c(4)], [d(5)]],
      currentSeat: 1,
      trick: trickWith(comboOf([s(15)])),
    });
    const chop = applyMove(chopState, { kind: 'play', cards: [s(9), c(9), d(9), h(9)] });
    expect(chop.events[0]).toMatchObject({ type: 'played', seat: 1, chop: true });

    // 4-pair run over a 3-pair run: same type but different length — still a chop.
    const runChopState = rig({
      hands: [
        [s(10), h(10), c(11), h(11), d(12), h(12)],
        [s(3), h(3), c(4), h(4), d(5), h(5), s(6), h(6), c(13)],
        [c(8)],
        [d(9)],
      ],
      currentSeat: 1,
      trick: trickWith(comboOf([s(10), h(10), c(11), h(11), d(12), h(12)])),
    });
    const runChop = applyMove(runChopState, {
      kind: 'play',
      cards: [s(3), h(3), c(4), h(4), d(5), h(5), s(6), h(6)],
    });
    expect(runChop.events[0]).toMatchObject({ type: 'played', seat: 1, chop: true });

    // Higher single over a single: same type and length — not a chop.
    const beatState = rig({
      hands: [[s(7)], [h(7)], [c(4)], [d(5)]],
      currentSeat: 1,
      trick: trickWith(comboOf([s(7)])),
    });
    const beat = applyMove(beatState, { kind: 'play', cards: [h(7)] });
    expect(beat.events[0]).toMatchObject({ type: 'played', seat: 1, chop: false });
  });
});

describe('applyMove: illegal moves throw', () => {
  it('throws for cards not in the current hand (including out-of-turn plays)', () => {
    const state = rig({ hands: [[s(7)], [h(8)], [c(9)], [d(10)]], currentSeat: 0 });
    // h(8) belongs to seat 1, so playing it now is out of turn / not in hand.
    expect(() => applyMove(state, { kind: 'play', cards: [h(8)] })).toThrow(Error);
    expect(() => applyMove(state, { kind: 'play', cards: [s(7), h(7)] })).toThrow(Error);
    expect(isLegalMove(state, 1, { kind: 'play', cards: [h(8)] })).toBe(false);
  });

  it('throws for a combo that does not beat the table', () => {
    const state = rig({
      hands: [[h(9)], [s(7), h(10)], [c(9)], [d(10)]],
      currentSeat: 1,
      trick: trickWith(comboOf([h(9)])),
    });
    expect(() => applyMove(state, { kind: 'play', cards: [s(7)] })).toThrow(Error);
    expect(() => applyMove(state, { kind: 'pass' })).not.toThrow();
  });

  it('throws for a pass while leading', () => {
    const state = rig({ hands: [[s(7)], [h(8)], [c(9)], [d(10)]], currentSeat: 0 });
    expect(() => applyMove(state, { kind: 'pass' })).toThrow(Error);
  });

  it('throws for unclassifiable card sets', () => {
    const state = rig({ hands: [[s(7), h(8)], [h(9)], [c(9)], [d(10)]], currentSeat: 0 });
    expect(() => applyMove(state, { kind: 'play', cards: [s(7), h(8)] })).toThrow(Error);
  });
});

describe('applyMove: immutability', () => {
  it('never mutates the input state, on plays or passes', () => {
    const state = rig({ hands: [[s(7), s(9)], [h(8)], [c(9)], [d(10)]], currentSeat: 0 });
    deepFreeze(state);
    const play = applyMove(state, { kind: 'play', cards: [s(7)] });
    expect(play.state).not.toBe(state);
    expect(play.state.players[0].hand).toEqual([s(9)]);
    expect(state.players[0].hand).toEqual([s(7), s(9)]);
    expect(state.trick.combo).toBeNull();

    deepFreeze(play.state);
    const pass = applyMove(play.state, { kind: 'pass' });
    expect(pass.state.trick.passedSeats).toEqual([1]);
    expect(play.state.trick.passedSeats).toEqual([]);
  });
});

describe('scripted full game', () => {
  function playOutGame(seed: number): void {
    let state = createGame({ seed });
    const initialHands = state.players.map((p) => [...p.hand]);
    const playedBySeat: Card[][] = state.players.map(() => []);
    let lastEvents: GameEvent[] = [];
    let steps = 0;

    while (state.phase === 'playing' && steps < 1000) {
      const seat = state.currentSeat;
      // The turn always belongs to an active seat with at least one legal move.
      expect(state.players[seat].finished).toBe(false);
      const moves = legalPlays(state, seat);
      expect(moves.length).toBeGreaterThan(0);

      // Policy: pass on every third step when allowed, otherwise play low.
      let move: Move | undefined;
      if (steps % 3 === 2) move = moves.find((m) => m.kind === 'pass');
      move ??= moves.find((m) => m.kind === 'play') ?? moves[0];

      const handBefore = state.players[seat].hand.length;
      const result = applyMove(state, move);
      lastEvents = result.events;

      for (const event of result.events) {
        if (event.type === 'played' || event.type === 'passed') {
          expect(event.seat).toBe(seat);
        }
      }
      if (move.kind === 'play') {
        playedBySeat[seat].push(...move.cards);
        // Exactly the played cards left the hand.
        expect(result.state.players[seat].hand.length).toBe(handBefore - move.cards.length);
      }

      state = result.state;
      steps++;
    }

    expect(steps).toBeLessThan(1000);
    expect(state.phase).toBe('gameEnd');
    expect(state.players.filter((p) => p.finished)).toHaveLength(3);

    // Card conservation per seat: initial hand === remaining hand + played cards.
    for (let seat = 0; seat < 4; seat++) {
      const actual = [...state.players[seat].hand, ...playedBySeat[seat]].sort(compareCards);
      expect(actual).toEqual([...initialHands[seat]].sort(compareCards));
    }
    const allCards = [...state.players.flatMap((p) => p.hand), ...playedBySeat.flat()];
    expect(allCards).toHaveLength(52);
    expect(new Set(allCards.map((c) => `${c.rank}:${c.suit}`)).size).toBe(52);

    // The terminal gameEnd event ranks every seat exactly once.
    const gameEnd = lastEvents.find((event) => event.type === 'gameEnd');
    expect(gameEnd).toBeDefined();
    if (gameEnd && gameEnd.type === 'gameEnd') {
      expect([...gameEnd.placements].sort()).toEqual([0, 1, 2, 3]);
    }
  }

  it.each([20260719, 42, 7])('plays out to gameEnd with invariants (seed %i)', (seed) => {
    playOutGame(seed);
  });
});
