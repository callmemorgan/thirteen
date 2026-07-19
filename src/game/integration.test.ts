/**
 * Integration tests: the whole engine stack (state machine + AI + controller)
 * working together, plus the deferred statistical check from the AI wave.
 */
import { describe, expect, it } from 'vitest';
import { chooseMove } from '../engine/ai';
import { applyMove, createGame, instantWinSeat, sweepTrick } from '../engine/state';
import type { Difficulty, GameState } from '../engine/types';
import { createController } from './controller';

/** Simulate a full all-bot game; returns seats in finish order (1st first). */
function simulate(seed: number, difficulties: Difficulty[]): number[] {
  let state: GameState = createGame({ seed, botDifficulties: difficulties });
  let guard = 0;
  while (state.phase === 'playing' || state.phase === 'trickWon') {
    if (++guard > 2000) throw new Error(`game ${seed} did not terminate`);
    if (state.phase === 'trickWon') {
      state = sweepTrick(state).state;
      continue;
    }
    const seat = state.currentSeat;
    state = applyMove(state, chooseMove(state, seat, difficulties[seat])).state;
  }
  return [...state.players]
    .sort((a, b) => (a.finishPlace ?? 4) - (b.finishPlace ?? 4))
    .map((p) => p.id);
}

describe('integration: AI strength', () => {
  it(
    'hard wins first place well above chance against easy bots',
    { timeout: 120_000 },
    () => {
      const GAMES = 60;
      let hardFirst = 0;
      for (let seed = 1; seed <= GAMES; seed++) {
        if (simulate(seed, ['hard', 'easy', 'easy', 'easy'])[0] === 0) hardFirst++;
      }
      const rate = hardFirst / GAMES;
      console.log(`hard first-place rate over ${GAMES} games: ${(rate * 100).toFixed(1)}%`);
      // Chance is 25%; a competent hard bot should clear this comfortably.
      expect(rate).toBeGreaterThan(0.35);
    },
  );
});

describe('integration: instant win through the controller', () => {
  it('ends the game on the deal when the flag is on', () => {
    let seed = -1;
    for (let s = 1; s < 10_000; s++) {
      const probe = createGame({ seed: s });
      if (instantWinSeat(probe.players.map((p) => p.hand)) !== null) {
        seed = s;
        break;
      }
    }
    expect(seed, 'expected an instant-win seed within 10k deals').toBeGreaterThan(0);

    const controller = createController({
      playerName: 'You',
      botDifficulties: ['easy', 'easy', 'easy'],
      rules: { instantWin: true, thoi2Scoring: false, passLockout: true },
      seed,
    });
    const { state } = controller.getSnapshot();
    expect(state.phase).toBe('gameEnd');
    expect(state.players.filter((p) => p.finishPlace === 1)).toHaveLength(1);
  });

  it('plays normally with the flag on when no instant win is dealt', () => {
    const controller = createController({
      playerName: 'You',
      botDifficulties: ['easy', 'easy', 'easy'],
      rules: { instantWin: true, thoi2Scoring: false, passLockout: true },
      seed: 1,
    });
    expect(controller.getSnapshot().state.phase).toBe('playing');
  });
});
