/**
 * Mock GameController for UI development.
 *
 * Lets the entire UI be built and exercised before the real engine exists.
 * The UI must code against the GameController interface (src/game/api.ts) only —
 * never against mock internals.
 *
 * Intentional mock-only simplifications (the REAL rules live in src/engine/):
 * - naive combo classification (no chop logic, no suit tiebreaks for bots),
 * - passing removes you from the current trick (no re-entry),
 * - bots play the lowest beating combo of the same shape, and occasionally
 *   pass at random.
 */
import type { Card, Combo, GameEvent, GameState, Suit } from '../engine/types';
import { DEFAULT_RULES, RANKS, SUITS } from '../engine/types';
import type {
  ControllerSnapshot,
  GameController,
  GameControllerConfig,
} from '../game/api';

const BOT_DELAY_MS = 900;

/** The winning combo stays on the table this long before the trick is swept. */
const TRICK_SWEEP_MS = 1300;

// ---------------------------------------------------------------------------
// Local helpers (self-contained: engine modules are stubs at this stage)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) for (const suit of SUITS) deck.push({ rank, suit });
  return deck;
}

const SUIT_STRENGTH: Record<Suit, number> = { spades: 0, clubs: 1, diamonds: 2, hearts: 3 };

function cmpCards(a: Card, b: Card): number {
  return a.rank - b.rank || SUIT_STRENGTH[a.suit] - SUIT_STRENGTH[b.suit];
}

function sorted(cards: Card[]): Card[] {
  return [...cards].sort(cmpCards);
}

function isThreeOfSpades(card: Card): boolean {
  return card.rank === 3 && card.suit === 'spades';
}

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };

function labelCard(card: Card): string {
  return `${RANK_LABEL[card.rank] ?? card.rank}${{ spades: '♠', clubs: '♣', diamonds: '♦', hearts: '♥' }[card.suit]}`;
}

/** Naive classification — mock only, no chop logic. */
function naiveClassify(cards: Card[]): Combo | null {
  if (cards.length === 0) return null;
  const s = sorted(cards);
  const top = s[s.length - 1];
  const base = { cards: s, top, length: s.length };
  if (s.length === 1) return { type: 'single', ...base };
  if (s.every((c) => c.rank === s[0].rank)) {
    if (s.length === 2) return { type: 'pair', ...base };
    if (s.length === 3) return { type: 'triple', ...base };
    if (s.length === 4) return { type: 'quad', ...base };
    return null;
  }
  if (s.length >= 3 && !s.some((c) => c.rank === 15)) {
    let consecutive = true;
    for (let i = 1; i < s.length; i++) if (s[i].rank !== s[i - 1].rank + 1) consecutive = false;
    if (consecutive) return { type: 'straight', ...base };
  }
  if (s.length >= 6 && s.length % 2 === 0 && !s.some((c) => c.rank === 15)) {
    let ok = true;
    for (let i = 0; i < s.length; i += 2) {
      if (s[i].rank !== s[i + 1].rank) ok = false;
      if (i > 0 && s[i].rank !== s[i - 2].rank + 1) ok = false;
    }
    if (ok) return { type: 'pair-run', ...base };
  }
  return null;
}

function naiveBeats(challenger: Combo, target: Combo): boolean {
  return (
    challenger.type === target.type &&
    challenger.length === target.length &&
    cmpCards(challenger.top, target.top) > 0
  );
}

// ---------------------------------------------------------------------------
// Naive bot helpers (mock only)
// ---------------------------------------------------------------------------

function groupByRank(hand: Card[]): Map<number, Card[]> {
  const byRank = new Map<number, Card[]>();
  for (const card of hand) {
    byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card]);
  }
  return byRank;
}

/** Lowest same-rank combo of `size` strictly above `minRank`. */
function findSameRankCombo(hand: Card[], size: number, minRank: number): Card[] | null {
  const byRank = groupByRank(hand);
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    if (rank <= minRank) continue;
    const group = byRank.get(rank)!;
    if (group.length >= size) return group.slice(0, size);
  }
  return null;
}

/** Lowest straight of `length` whose top rank is strictly above `minTop`. */
function findStraight(hand: Card[], length: number, minTop: number): Card[] | null {
  const byRank = groupByRank(hand);
  const ranks = [...byRank.keys()].filter((r) => r !== 15).sort((a, b) => a - b);
  outer: for (let start = 0; start + length <= ranks.length; start++) {
    const run = ranks.slice(start, start + length);
    for (let i = 1; i < length; i++) if (run[i] !== run[i - 1] + 1) continue outer;
    if (run[length - 1] <= minTop) continue;
    return run.map((r) => byRank.get(r)![0]);
  }
  return null;
}

/** Lowest pair-run of `length` cards whose top rank is strictly above `minTop`. */
function findPairRun(hand: Card[], length: number, minTop: number): Card[] | null {
  const pairs = length / 2;
  const byRank = groupByRank(hand);
  const ranks = [...byRank.keys()]
    .filter((r) => r !== 15 && byRank.get(r)!.length >= 2)
    .sort((a, b) => a - b);
  outer: for (let start = 0; start + pairs <= ranks.length; start++) {
    const run = ranks.slice(start, start + pairs);
    for (let i = 1; i < pairs; i++) if (run[i] !== run[i - 1] + 1) continue outer;
    if (run[pairs - 1] <= minTop) continue;
    return run.flatMap((r) => byRank.get(r)!.slice(0, 2));
  }
  return null;
}

/** Lowest combo of the same shape that beats `target` — no suit tiebreaks. */
function naiveFindBeat(hand: Card[], target: Combo): Card[] | null {
  switch (target.type) {
    case 'single': {
      const card = hand.find((hc) => cmpCards(hc, target.top) > 0);
      return card ? [card] : null;
    }
    case 'pair':
      return findSameRankCombo(hand, 2, target.top.rank);
    case 'triple':
      return findSameRankCombo(hand, 3, target.top.rank);
    case 'quad':
      return findSameRankCombo(hand, 4, target.top.rank);
    case 'straight':
      return findStraight(hand, target.length, target.top.rank);
    case 'pair-run':
      return findPairRun(hand, target.length, target.top.rank);
  }
}

/** Occasionally lead a low pair instead of the lowest single, for variety. */
function naiveLead(hand: Card[]): Card[] {
  if (hand.length >= 2 && Math.random() < 0.2) {
    const byRank = groupByRank(hand);
    for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
      const group = byRank.get(rank)!;
      if (rank !== 15 && group.length >= 2) return group.slice(0, 2);
    }
  }
  return [hand[0]];
}

function labelCombo(combo: Combo): string {
  const r = RANK_LABEL[combo.top.rank] ?? combo.top.rank;
  switch (combo.type) {
    case 'single':
      return labelCard(combo.top);
    case 'pair':
      return `pair of ${r}s`;
    case 'triple':
      return `three ${r}s`;
    case 'quad':
      return `four ${r}s`;
    case 'straight':
      return `straight to ${r}`;
    case 'pair-run':
      return `${combo.length / 2}-pair run`;
  }
}

// ---------------------------------------------------------------------------
// Mock controller
// ---------------------------------------------------------------------------

class MockController implements GameController {
  private config: GameControllerConfig;
  private snapshot: ControllerSnapshot;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: GameEvent) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Running match score per seat (3/2/1/0 by finish place), kept across rematches. */
  private matchScore: number[] = [0, 0, 0, 0];

  constructor(config: GameControllerConfig) {
    this.config = config;
    this.snapshot = this.dealSnapshot();
    this.maybeScheduleBot();
  }

  getSnapshot(): ControllerSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onEvent(listener: (event: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  toggleCard(card: Card): void {
    if (!this.snapshot.isHumanTurn) return;
    const hand = this.snapshot.state.players[0].hand;
    if (!hand.some((hc) => sameCard(hc, card))) return;
    const selected = this.snapshot.selectedCards.some((sc) => sameCard(sc, card))
      ? this.snapshot.selectedCards.filter((sc) => !sameCard(sc, card))
      : [...this.snapshot.selectedCards, card];
    this.setSnapshot({
      selectedCards: sorted(selected),
      selectionError: this.validateSelection(selected),
      hint: null,
    });
  }

  clearSelection(): void {
    this.setSnapshot({ selectedCards: [], selectionError: null, hint: null });
  }

  playSelected(): void {
    if (!this.snapshot.isHumanTurn) return;
    const error = this.validateSelection(this.snapshot.selectedCards);
    const combo = naiveClassify(this.snapshot.selectedCards);
    if (error || !combo) {
      this.setSnapshot({ selectionError: error ?? 'Not a valid combination' });
      return;
    }
    this.applyPlay(0, combo);
  }

  pass(): void {
    if (!this.snapshot.isHumanTurn || this.snapshot.state.trick.combo === null) return;
    this.applyPass(0);
  }

  sortHand(): void {
    const state = this.snapshot.state;
    const players = state.players.map((p, i) =>
      i === 0 ? { ...p, hand: sorted(p.hand) } : p,
    );
    this.setSnapshot({ state: { ...state, players } });
  }

  requestHint(): void {
    if (!this.snapshot.isHumanTurn) return;
    const { state } = this.snapshot;
    const hand = state.players[0].hand;
    const target = state.trick.combo;
    let hint: Card[] | null = null;
    if (target === null || target.type === 'single') {
      const card = hand.find((hc) => target === null || cmpCards(hc, target.top) > 0);
      hint = card ? [card] : null;
    }
    this.setSnapshot({
      hint,
      selectedCards: hint ?? [],
      selectionError: hint ? null : 'No hint available — try passing',
    });
  }

  newGame(config?: Partial<GameControllerConfig>): void {
    this.config = { ...this.config, ...config, rules: { ...this.config.rules, ...config?.rules } };
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.snapshot = this.dealSnapshot();
    this.notify();
    this.emit({ type: 'dealt' });
    this.maybeScheduleBot();
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private dealSnapshot(): ControllerSnapshot {
    const seed = this.config.seed ?? 42;
    const rng = mulberry32(seed);
    const deck = buildDeck();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const hands: Card[][] = [[], [], [], []];
    deck.forEach((card, i) => hands[i % 4].push(card));
    // The 3♠ always lands in seat 0's hand so the human leads the mock game.
    for (let s = 1; s < 4; s++) {
      const idx = hands[s].findIndex(isThreeOfSpades);
      if (idx >= 0) {
        [hands[s][idx], hands[0][0]] = [hands[0][0], hands[s][idx]];
        break;
      }
    }
    const names = [this.config.playerName, 'Bot 1', 'Bot 2', 'Bot 3'];
    const players = hands.map((hand, i) => ({
      id: i,
      name: names[i],
      isBot: i !== 0,
      difficulty: i === 0 ? null : this.config.botDifficulties[i - 1],
      hand: sorted(hand),
      finished: false,
      finishPlace: null,
    }));
    const state: GameState = {
      phase: 'playing',
      round: 1,
      players,
      currentSeat: 0,
      trick: { combo: null, leaderSeat: 0, passedSeats: [] },
      isFirstRound: true,
      openingPlayMade: false,
      instantWinner: null,
      rules: this.config.rules,
      seed,
    };
    return {
      state,
      config: this.config,
      selectedCards: [],
      hint: null,
      selectionError: null,
      isHumanTurn: true,
      matchScore: [...this.matchScore],
    };
  }

  private validateSelection(selected: Card[]): string | null {
    if (selected.length === 0) return null;
    const combo = naiveClassify(selected);
    if (!combo) return 'Not a valid combination';
    const target = this.snapshot.state.trick.combo;
    if (target && !naiveBeats(combo, target)) return `Doesn't beat ${labelCombo(target)}`;
    if (
      this.snapshot.state.isFirstRound &&
      !this.snapshot.state.openingPlayMade &&
      !selected.some(isThreeOfSpades)
    ) {
      return 'Opening play must include the 3♠';
    }
    return null;
  }

  private applyPlay(seat: number, combo: Combo): void {
    const state = this.snapshot.state;
    const events: GameEvent[] = [{ type: 'played', seat, combo, chop: false }];
    const players = state.players.map((p, i) =>
      i === seat
        ? { ...p, hand: p.hand.filter((hc) => !combo.cards.some((cc) => sameCard(cc, hc))) }
        : p,
    );
    let next: GameState = {
      ...state,
      players,
      openingPlayMade: true,
      trick: { combo, leaderSeat: seat, passedSeats: state.trick.passedSeats },
    };

    if (players[seat].hand.length === 0 && !players[seat].finished) {
      const place = players.filter((p) => p.finished).length + 1;
      next = {
        ...next,
        players: next.players.map((p, i) => (i === seat ? { ...p, finished: true, finishPlace: place } : p)),
      };
      events.push({ type: 'playerOut', seat, place });
    }
    next = this.advanceTurn(next, events);
    if (next.phase === 'gameEnd') this.accrueScore(next);
    this.setSnapshot({
      state: next,
      selectedCards: [],
      selectionError: null,
      hint: null,
      isHumanTurn: next.phase === 'playing' && next.currentSeat === 0,
      matchScore: [...this.matchScore],
    });
    events.forEach((e) => this.emit(e));
    this.scheduleNext(next);
  }

  private applyPass(seat: number): void {
    const state = this.snapshot.state;
    const events: GameEvent[] = [{ type: 'passed', seat }];
    const next = this.advanceTurn(
      {
        ...state,
        trick: { ...state.trick, passedSeats: [...state.trick.passedSeats, seat] },
      },
      events,
    );
    if (next.phase === 'gameEnd') this.accrueScore(next);
    this.setSnapshot({
      state: next,
      selectedCards: [],
      selectionError: null,
      hint: null,
      isHumanTurn: next.phase === 'playing' && next.currentSeat === 0,
      matchScore: [...this.matchScore],
    });
    events.forEach((e) => this.emit(e));
    this.scheduleNext(next);
  }

  /** Rotate to the next active seat; resolve trick completion and round end. */
  private advanceTurn(state: GameState, events: GameEvent[]): GameState {
    if (state.phase !== 'playing') return state;

    const finishedCount = state.players.filter((p) => p.finished).length;
    if (finishedCount >= 3) {
      const placements = [...state.players]
        .sort((a, b) => (a.finishPlace ?? 4) - (b.finishPlace ?? 4))
        .map((p) => p.id);
      events.push({ type: 'roundEnd', placements }, { type: 'gameEnd', placements });
      return { ...state, phase: 'gameEnd' };
    }

    const active = state.players.filter((p) => !p.finished).map((p) => p.id);
    const { trick } = state;

    if (
      trick.combo !== null &&
      active.filter((s) => s !== trick.leaderSeat).every((s) => trick.passedSeats.includes(s))
    ) {
      // Trick complete: leader wins it and leads the next one (or the next active
      // seat does, if the leader just went out). The combo stays on the table
      // until the controller sweeps it (mirrors the engine's phase 'trickWon').
      let lead = trick.leaderSeat;
      if (state.players[lead].finished) {
        lead = active[(active.indexOf(lead) + 1) % active.length] ?? active[0];
      }
      events.push({ type: 'trickWon', seat: trick.leaderSeat });
      return { ...state, phase: 'trickWon', currentSeat: lead };
    }

    // Under pass lockout, seats that passed this trick are skipped in the rotation.
    const lockedOut = state.rules.passLockout ? trick.passedSeats : [];
    const order = [0, 1, 2, 3];
    let seat = state.currentSeat;
    do {
      seat = order[(seat + 1) % 4];
    } while (!active.includes(seat) || lockedOut.includes(seat));
    return { ...state, currentSeat: seat };
  }

  /** Add finish-place points (3/2/1/0 for 1st–4th) at gameEnd; mirrors the real controller. */
  private accrueScore(state: GameState): void {
    if (state.phase !== 'gameEnd') return;
    for (const player of state.players) this.matchScore[player.id] += 4 - (player.finishPlace ?? 4);
  }

  private doBotTurn(): void {
    const { state } = this.snapshot;
    if (state.phase !== 'playing') return;
    const seat = state.currentSeat;
    const player = state.players[seat];
    if (!player.isBot || player.finished) return;

    const target = state.trick.combo;
    // Mock bots: lead (sometimes a pair); contest same-shape combos; rare pass.
    if (target !== null && Math.random() < 0.1) {
      this.applyPass(seat);
      return;
    }
    if (target === null) {
      this.applyPlay(seat, naiveClassify(naiveLead(player.hand))!);
      return;
    }
    const beat = naiveFindBeat(player.hand, target);
    if (beat) {
      this.applyPlay(seat, naiveClassify(beat)!);
      return;
    }
    this.applyPass(seat);
  }

  /** After a transition: sweep a decided trick after a beat, else schedule bots. */
  private scheduleNext(state: GameState): void {
    if (state.phase !== 'trickWon') {
      this.maybeScheduleBot();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      const swept: GameState = {
        ...this.snapshot.state,
        phase: 'playing',
        trick: { combo: null, leaderSeat: this.snapshot.state.currentSeat, passedSeats: [] },
      };
      this.setSnapshot({ state: swept, isHumanTurn: swept.currentSeat === 0 });
      this.maybeScheduleBot();
    }, TRICK_SWEEP_MS);
  }

  private maybeScheduleBot(): void {
    const { state } = this.snapshot;
    if (state.phase !== 'playing') return;
    const current = state.players[state.currentSeat];
    if (!current.isBot || current.finished) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.doBotTurn();
      },
      BOT_DELAY_MS + Math.random() * 500,
    );
  }

  private setSnapshot(partial: Partial<ControllerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private emit(event: GameEvent): void {
    this.eventListeners.forEach((l) => l(event));
  }
}

export function createMockController(config?: Partial<GameControllerConfig>): GameController {
  return new MockController({
    playerName: 'You',
    botDifficulties: ['medium', 'medium', 'medium'],
    rules: { ...DEFAULT_RULES },
    ...config,
  });
}
