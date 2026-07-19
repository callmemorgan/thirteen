import type {
  Card,
  Difficulty,
  GameEvent,
  GameState,
  Move,
  PlayerState,
  Rank,
  RulesConfig,
} from './types';
import { DEFAULT_RULES, RANKS, RANK_TWO } from './types';
import { cardLabel, createDeck, sameCard, sortCards } from './cards';
import { createRng, shuffled } from './rng';
import { classifyCombo } from './combos';
import { isLegalMove } from './rules';

export interface GameConfig {
  /** Display names by seat index; defaults to ['You', 'Bot 1', 'Bot 2', 'Bot 3']. */
  playerNames?: string[];
  /** Bot difficulty by seat index; null marks the human seat. Default: human at seat 0. */
  botDifficulties?: (Difficulty | null)[];
  rules?: Partial<RulesConfig>;
  seed?: number;
  /**
   * Seat that leads the round. When omitted on a first round, the 3♠ holder leads.
   * Used by the controller for rematches (previous winner leads, isFirstRound: false).
   */
  startingSeat?: number;
  /** Default true. When true, the 3♠ holder leads and must include it in the first play. */
  isFirstRound?: boolean;
}

const SEAT_COUNT = 4;

const DEFAULT_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3'];
const DEFAULT_DIFFICULTIES: (Difficulty | null)[] = [null, 'medium', 'medium', 'medium'];

/** The 3 of spades — its holder leads a first round. */
const THREE_OF_SPADES: Card = { rank: 3, suit: 'spades' };

function cardKey(card: Card): string {
  return `${card.rank}:${card.suit}`;
}

/** Next non-finished seat in rotation order 0→1→2→3→0 after `from`. */
function nextActiveSeat(players: PlayerState[], from: number): number {
  for (let step = 1; step <= players.length; step++) {
    const seat = (from + step) % players.length;
    if (!players[seat].finished) return seat;
  }
  return from;
}

/**
 * Create a fresh game: shuffled deal (seeded), 13 cards per player, phase 'playing',
 * leader determined per config. Events are NOT emitted here (see controller).
 */
export function createGame(config: GameConfig = {}): GameState {
  const seed = config.seed ?? 0;
  const rng = createRng(seed);
  const deck = shuffled(createDeck(), rng);

  // Round-robin deal: deck[0]→seat 0, deck[1]→seat 1, ... deck[4]→seat 0, ...
  const hands: Card[][] = Array.from({ length: SEAT_COUNT }, () => []);
  deck.forEach((card, index) => {
    hands[index % SEAT_COUNT].push(card);
  });

  const players: PlayerState[] = hands.map((hand, seat) => {
    // An explicit null marks a human seat; only fall back when the entry is absent.
    const configured = config.botDifficulties?.[seat];
    const difficulty = configured === undefined ? DEFAULT_DIFFICULTIES[seat] : configured;
    return {
      id: seat,
      name: config.playerNames?.[seat] ?? DEFAULT_NAMES[seat],
      isBot: difficulty !== null,
      difficulty,
      hand: sortCards(hand),
      finished: false,
      finishPlace: null,
    };
  });

  const isFirstRound = config.isFirstRound ?? true;
  let leader: number;
  if (config.startingSeat !== undefined) {
    leader = config.startingSeat;
  } else if (isFirstRound) {
    leader = players.findIndex((player) =>
      player.hand.some((card) => sameCard(card, THREE_OF_SPADES)),
    );
  } else {
    leader = 0;
  }

  return {
    phase: 'playing',
    round: 1,
    players,
    currentSeat: leader,
    trick: { combo: null, leaderSeat: leader, passedSeats: [] },
    isFirstRound,
    openingPlayMade: false,
    rules: { ...DEFAULT_RULES, ...config.rules },
    seed,
  };
}

/**
 * Apply a legal move and return the next state plus transient events for UI/SFX.
 * Throws on an illegal move. Handles: turn rotation (skipping finished players),
 * pass/re-entry, trick completion (trickWon), player finishes (playerOut), and
 * round end when three players are out (roundEnd + gameEnd).
 */
export function applyMove(
  state: GameState,
  move: Move,
): { state: GameState; events: GameEvent[] } {
  const seat = state.currentSeat;
  if (!isLegalMove(state, seat, move)) {
    throw new Error(`Illegal move by seat ${seat}`);
  }
  if (move.kind === 'pass') {
    return applyPass(state, seat);
  }
  return applyPlay(state, seat, move.cards);
}

function applyPass(state: GameState, seat: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [{ type: 'passed', seat }];
  // Under pass lockout an already-passed seat passes again every turn — record it once.
  const passedSeats = state.trick.passedSeats.includes(seat)
    ? state.trick.passedSeats
    : [...state.trick.passedSeats, seat];

  // The trick closes once every active seat except the leader has passed. When the
  // leader has gone out mid-trick, they are no longer active, so every active seat
  // must have passed.
  const leaderSeat = state.trick.leaderSeat;
  const trickClosed = state.players
    .filter((player) => !player.finished)
    .every((player) => player.id === leaderSeat || passedSeats.includes(player.id));

  if (!trickClosed) {
    return {
      state: {
        ...state,
        currentSeat: nextActiveSeat(state.players, seat),
        trick: { ...state.trick, passedSeats },
      },
      events,
    };
  }

  events.push({ type: 'trickWon', seat: leaderSeat });
  // If the winner went out, the lead passes to the next active seat after them.
  const nextLeader = state.players[leaderSeat].finished
    ? nextActiveSeat(state.players, leaderSeat)
    : leaderSeat;
  return {
    state: {
      ...state,
      currentSeat: nextLeader,
      trick: { combo: null, leaderSeat: nextLeader, passedSeats: [] },
    },
    events,
  };
}

function applyPlay(
  state: GameState,
  seat: number,
  cards: Card[],
): { state: GameState; events: GameEvent[] } {
  const combo = classifyCombo(cards);
  if (combo === null) {
    // Unreachable: isLegalMove already rejected unclassifiable plays.
    throw new Error(`Illegal move by seat ${seat}: cards do not form a combo`);
  }

  // A win by anything other than "same type, same length, higher top" came via the
  // chop matrix (bomb on a 2-combo, 4-pair run over a bomb or a 3-pair run).
  const target = state.trick.combo;
  const chop = target !== null && (combo.type !== target.type || combo.length !== target.length);

  const playedKeys = new Set(cards.map(cardKey));
  // Finish place of this seat if it goes out now: finishes before it, plus one.
  const place = state.players.filter((player) => player.finished).length + 1;

  const players = state.players.map((player) => {
    if (player.id !== seat) return player;
    const hand = player.hand.filter((card) => !playedKeys.has(cardKey(card)));
    return {
      ...player,
      hand,
      finished: hand.length === 0,
      finishPlace: hand.length === 0 ? place : player.finishPlace,
    };
  });
  const wentOut = players[seat].finished;

  const events: GameEvent[] = [{ type: 'played', seat, combo, chop }];
  if (wentOut) events.push({ type: 'playerOut', seat, place });

  // A play always replaces the table combo. Under re-entry rules the passes
  // against the old combo are cleared; under pass lockout they stand — a
  // passer is out until someone sweeps and leads a fresh trick.
  const nextState: GameState = {
    ...state,
    players,
    trick: {
      combo,
      leaderSeat: seat,
      passedSeats: state.rules.passLockout ? state.trick.passedSeats : [],
    },
    openingPlayMade: true,
  };

  if (wentOut && place === 3) {
    // Third finisher ends the round: the last remaining seat takes 4th place.
    const placements = [...players]
      .sort((a, b) => (a.finishPlace ?? 4) - (b.finishPlace ?? 4))
      .map((player) => player.id);
    events.push({ type: 'roundEnd', placements }, { type: 'gameEnd', placements });
    const remaining = players.find((player) => !player.finished);
    return {
      state: {
        ...nextState,
        phase: 'gameEnd',
        currentSeat: remaining === undefined ? seat : remaining.id,
      },
      events,
    };
  }

  return {
    state: { ...nextState, currentSeat: nextActiveSeat(players, seat) },
    events,
  };
}

// ---------------------------------------------------------------------------
// Optional rule flags (RulesConfig.instantWin / RulesConfig.thoi2Scoring)
// ---------------------------------------------------------------------------

const FACE_RANK_NAME: Partial<Record<Rank, string>> = {
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: '2',
};

function rankName(rank: Rank): string {
  return FACE_RANK_NAME[rank] ?? String(rank);
}

/**
 * Instant-win check (rules.instantWin): a hand wins on the deal when it holds
 * all four 2s or a 12-card "dragon" straight (one card of every rank 3..A).
 * Returns the winning seat, or null. Checked in seat order.
 */
export function instantWinSeat(hands: Card[][]): number | null {
  for (let seat = 0; seat < hands.length; seat++) {
    const hand = hands[seat];
    const ranks = new Set(hand.map((card) => card.rank));
    const fourTwos = hand.filter((card) => card.rank === RANK_TWO).length === 4;
    const dragon = RANKS.filter((rank) => rank !== RANK_TWO).every((rank) => ranks.has(rank));
    if (fourTwos || dragon) return seat;
  }
  return null;
}

/**
 * Terminal state for an instant win on the deal: the winner takes 1st place;
 * the remaining seats place 2nd–4th in seat order after the winner.
 */
export function applyInstantWin(
  state: GameState,
  winnerSeat: number,
): { state: GameState; events: GameEvent[] } {
  const placements = [0, 1, 2, 3].map((offset) => (winnerSeat + offset) % SEAT_COUNT);
  const players: PlayerState[] = state.players.map((player) => ({
    ...player,
    finished: true,
    finishPlace: placements.indexOf(player.id) + 1,
  }));
  return {
    state: { ...state, players, phase: 'gameEnd', currentSeat: winnerSeat },
    events: [
      { type: 'playerOut', seat: winnerSeat, place: 1 },
      { type: 'roundEnd', placements },
      { type: 'gameEnd', placements },
    ],
  };
}

export interface Thoi2Penalty {
  points: number;
  items: string[];
}

/**
 * Penalty points for cards left in hand when a round ends (rules.thoi2Scoring):
 * leftover 2s cost 1 (♠/♣) or 2 (♦/♥); a leftover quad costs 4; a leftover
 * pair-run costs 1 per pair. Quad ranks are excluded from pair-run detection
 * (they are already penalized as quads).
 */
export function thoi2Penalty(hand: Card[]): Thoi2Penalty {
  const items: string[] = [];
  let points = 0;

  const byRank = new Map<Rank, Card[]>();
  for (const card of hand) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }

  for (const card of hand) {
    if (card.rank !== RANK_TWO) continue;
    const red = card.suit === 'diamonds' || card.suit === 'hearts';
    points += red ? 2 : 1;
    items.push(`${cardLabel(card)} left`);
  }

  const quadRanks = new Set<Rank>();
  for (const [rank, group] of byRank) {
    if (group.length === 4) {
      quadRanks.add(rank);
      points += 4;
      items.push(`quad of ${rankName(rank)}s`);
    }
  }

  const pairRanks = [...byRank.entries()]
    .filter(([rank, group]) => group.length >= 2 && rank !== RANK_TWO && !quadRanks.has(rank))
    .map(([rank]) => rank)
    .sort((a, b) => a - b);
  let run: Rank[] = [];
  const flushRun = () => {
    if (run.length >= 3) {
      points += run.length;
      items.push(`${run.length}-pair run left`);
    }
    run = [];
  };
  for (const rank of pairRanks) {
    if (run.length > 0 && rank !== run[run.length - 1] + 1) flushRun();
    run.push(rank);
  }
  flushRun();

  return { points, items };
}
