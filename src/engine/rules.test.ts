import { describe, expect, it } from 'vitest';
import type { Card, Combo, GameState, Move, Rank, Suit, TrickState } from './types';
import { DEFAULT_RULES } from './types';
import { compareCards, sameCard } from './cards';
import { beats, classifyCombo } from './combos';
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
    rules: { ...DEFAULT_RULES },
    seed: 0,
  };
}

function playCards(moves: Move[]): Card[][] {
  return moves.flatMap((move) => (move.kind === 'play' ? [move.cards] : []));
}

function keyOf(cards: Card[]): string {
  return cards
    .map((c) => `${c.rank}:${c.suit}`)
    .sort()
    .join('|');
}

describe('legalPlays: turn and phase gating', () => {
  it('returns no moves for a seat whose turn it is not', () => {
    const state = rig({ hands: [[s(7)], [h(8)], [c(9)], [d(10)]], currentSeat: 0 });
    expect(legalPlays(state, 1)).toEqual([]);
    expect(legalPlays(state, 2)).toEqual([]);
    expect(legalPlays(state, 3)).toEqual([]);
    expect(isLegalMove(state, 1, { kind: 'play', cards: [h(8)] })).toBe(false);
  });

  it('returns no moves for a finished seat', () => {
    const state = rig({
      hands: [[s(7)], [], [c(9)], [d(10)]],
      currentSeat: 1,
      finishedSeats: [1],
    });
    expect(legalPlays(state, 1)).toEqual([]);
  });

  it('returns no moves once the phase is not playing', () => {
    const state = rig({
      hands: [[s(7)], [h(8)], [c(9)], [d(10)]],
      currentSeat: 0,
      phase: 'gameEnd',
    });
    expect(legalPlays(state, 0)).toEqual([]);
    expect(isLegalMove(state, 0, { kind: 'play', cards: [s(7)] })).toBe(false);
  });
});

describe('legalPlays: leading enumeration', () => {
  it('offers no pass when leading', () => {
    const state = rig({ hands: [[s(7)], [h(8)], [c(9)], [d(10)]], currentSeat: 0 });
    const moves = legalPlays(state, 0);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.kind === 'play')).toBe(true);
    expect(isLegalMove(state, 0, { kind: 'pass' })).toBe(false);
  });

  it('enumerates singles, same-rank groups, and straights with every suit selection', () => {
    // Hand: 3♠ 3♥ 4♣ 4♦ 5♠.
    const state = rig({
      hands: [[s(3), h(3), c(4), d(4), s(5)], [c(6)], [d(7)], [h(8)]],
      currentSeat: 0,
    });
    const plays = playCards(legalPlays(state, 0));
    // 5 singles + 2 pairs + 4 straight variants (3♠/3♥ × 4♣/4♦ × 5♠).
    expect(plays).toHaveLength(11);
    const keys = plays.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('enumerates every subset of a four-of-a-kind', () => {
    const state = rig({
      hands: [[s(7), c(7), d(7), h(7), s(9)], [c(6)], [d(8)], [h(10)]],
      currentSeat: 0,
    });
    // 5 singles + 6 pairs + 4 triples + 1 quad.
    expect(playCards(legalPlays(state, 0))).toHaveLength(16);
  });

  it('enumerates pair-runs, including suit variants', () => {
    const even = rig({
      hands: [[s(3), h(3), c(4), d(4), s(5), h(5)], [c(6)], [d(7)], [h(8)]],
      currentSeat: 0,
    });
    const evenPlays = playCards(legalPlays(even, 0));
    // 6 singles + 3 pairs + 8 straight variants + 1 pair-run.
    expect(evenPlays).toHaveLength(18);
    expect(evenPlays.filter((cards) => cards.length === 6)).toHaveLength(1);

    // Three suits of the 3 give C(3,2) = 3 distinct 3-pair runs.
    const variants = rig({
      hands: [[s(3), c(3), h(3), c(4), d(4), s(5), h(5)], [c(6)], [d(7)], [h(8)]],
      currentSeat: 0,
    });
    const pairRuns = playCards(legalPlays(variants, 0)).filter((cards) => cards.length === 6);
    expect(pairRuns).toHaveLength(3);
  });
});

describe('legalPlays: following a combo', () => {
  it('offers only beating combos, plus pass', () => {
    const state = rig({
      hands: [[h(9)], [s(7), c(10), h(10), d(11)], [c(9)], [d(12)]],
      currentSeat: 1,
      trick: trickWith(comboOf([h(9)])),
    });
    const moves = legalPlays(state, 1);
    expect(moves.filter((move) => move.kind === 'pass')).toHaveLength(1);
    // Beating singles: 10♣, 10♥, J♦. The 7♠ loses; the pair of 10s is the wrong type.
    const plays = playCards(moves);
    expect(plays).toHaveLength(3);
    for (const cards of plays) {
      expect(beats(comboOf(cards), comboOf([h(9)]))).toBe(true);
    }
  });

  it('accepts an exact move regardless of card order', () => {
    const state = rig({ hands: [[s(7), h(7)], [h(8)], [c(9)], [d(10)]], currentSeat: 0 });
    expect(isLegalMove(state, 0, { kind: 'play', cards: [h(7), s(7)] })).toBe(true);
  });

  it('rejects combos not present in the hand', () => {
    const state = rig({ hands: [[s(7), h(7)], [h(8)], [c(9)], [d(10)]], currentSeat: 0 });
    expect(isLegalMove(state, 0, { kind: 'play', cards: [c(7)] })).toBe(false);
    expect(isLegalMove(state, 0, { kind: 'play', cards: [s(7), c(7)] })).toBe(false);
    expect(isLegalMove(state, 0, { kind: 'play', cards: [] })).toBe(false);
  });

  it('rejects unclassifiable card sets', () => {
    const state = rig({ hands: [[s(7), h(8)], [h(9)], [c(9)], [d(10)]], currentSeat: 0 });
    expect(isLegalMove(state, 0, { kind: 'play', cards: [s(7), h(8)] })).toBe(false);
  });
});

describe('legalPlays: first-round opening play', () => {
  it('only allows combos containing the 3♠', () => {
    const state = rig({
      hands: [[s(3), c(7), h(7)], [h(8)], [c(9)], [d(10)]],
      currentSeat: 0,
      isFirstRound: true,
      openingPlayMade: false,
    });
    const plays = playCards(legalPlays(state, 0));
    expect(plays.length).toBeGreaterThan(0);
    for (const cards of plays) {
      expect(cards.some((c) => sameCard(c, THREE_OF_SPADES))).toBe(true);
    }
    expect(isLegalMove(state, 0, { kind: 'play', cards: [s(3)] })).toBe(true);
    expect(isLegalMove(state, 0, { kind: 'play', cards: [h(7)] })).toBe(false);
    expect(isLegalMove(state, 0, { kind: 'play', cards: [c(7), h(7)] })).toBe(false);
    expect(isLegalMove(state, 0, { kind: 'pass' })).toBe(false);
  });

  it('imposes no 3♠ constraint once the opening play is made', () => {
    const state = rig({
      hands: [[s(3), h(7)], [h(8)], [c(9)], [d(10)]],
      currentSeat: 0,
      isFirstRound: true,
      openingPlayMade: true,
    });
    expect(isLegalMove(state, 0, { kind: 'play', cards: [h(7)] })).toBe(true);
  });

  it('imposes no 3♠ constraint on later rounds', () => {
    const state = rig({
      hands: [[s(3), h(7)], [h(8)], [c(9)], [d(10)]],
      currentSeat: 0,
      isFirstRound: false,
      openingPlayMade: false,
    });
    expect(isLegalMove(state, 0, { kind: 'play', cards: [h(7)] })).toBe(true);
  });
});

describe('legalPlays: chop matrix', () => {
  it('allows a quad and a 3-pair run on a single 2', () => {
    const quad = [s(9), c(9), d(9), h(9)];
    const state = rig({
      hands: [[s(15)], [...quad, c(12)], [c(4)], [d(5)]],
      currentSeat: 1,
      trick: trickWith(comboOf([s(15)])),
    });
    expect(isLegalMove(state, 1, { kind: 'play', cards: quad })).toBe(true);
    expect(playCards(legalPlays(state, 1)).map(keyOf)).toContain(keyOf(quad));

    const threePairRun = [s(3), h(3), c(4), h(4), d(5), h(5)];
    const runState = rig({
      hands: [[s(15)], threePairRun, [c(8)], [d(9)]],
      currentSeat: 1,
      trick: trickWith(comboOf([s(15)])),
    });
    expect(isLegalMove(runState, 1, { kind: 'play', cards: threePairRun })).toBe(true);
  });

  it('rejects a quad on a pair of 2s', () => {
    const quad = [s(9), c(9), d(9), h(9)];
    const state = rig({
      hands: [[s(15), h(15)], quad, [c(4)], [d(5)]],
      currentSeat: 1,
      trick: trickWith(comboOf([s(15), h(15)])),
    });
    expect(isLegalMove(state, 1, { kind: 'play', cards: quad })).toBe(false);
    expect(playCards(legalPlays(state, 1)).map(keyOf)).not.toContain(keyOf(quad));
    // Passing is still available.
    expect(isLegalMove(state, 1, { kind: 'pass' })).toBe(true);
  });

  it('allows a 4-pair run on any quad', () => {
    const fourPairRun = [s(3), h(3), c(4), h(4), d(5), h(5), s(6), h(6)];
    const state = rig({
      hands: [[s(14), c(14), d(14), h(14)], fourPairRun, [c(8)], [d(9)]],
      currentSeat: 1,
      trick: trickWith(comboOf([s(14), c(14), d(14), h(14)])),
    });
    expect(isLegalMove(state, 1, { kind: 'play', cards: fourPairRun })).toBe(true);
  });

  it('allows a 4-pair run on a 3-pair run, but not the reverse', () => {
    const threePairRun = [s(10), h(10), c(11), h(11), d(12), h(12)];
    const fourPairRun = [s(3), h(3), c(4), h(4), d(5), h(5), s(6), h(6)];
    const state = rig({
      hands: [threePairRun, fourPairRun, [c(8)], [d(9)]],
      currentSeat: 1,
      trick: trickWith(comboOf(threePairRun)),
    });
    expect(isLegalMove(state, 1, { kind: 'play', cards: fourPairRun })).toBe(true);

    const reversed = rig({
      hands: [fourPairRun, threePairRun, [c(8)], [d(9)]],
      currentSeat: 1,
      trick: trickWith(comboOf(fourPairRun)),
    });
    expect(isLegalMove(reversed, 1, { kind: 'play', cards: threePairRun })).toBe(false);
  });
});
