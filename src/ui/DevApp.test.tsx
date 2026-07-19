/**
 * SSR smoke test: the whole table must render under react-dom/server
 * (node environment — no jsdom). Browser-only APIs (AudioContext,
 * localStorage, window listeners) are isolated behind effects and
 * environment guards, so renderToString must not throw.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { GameState } from '../engine/types';
import { DEFAULT_RULES } from '../engine/types';
import { applyInstantWin, createGame } from '../engine/state';
import type { ControllerSnapshot, GameController } from '../game/api';
import DevApp from './DevApp';

const html = renderToString(<DevApp />);

/** A fixed-state controller stub for rendering specific phases SSR-side. */
function stubController(state: GameState, matchScore: number[] = [0, 0, 0, 0]): GameController {
  const snapshot: ControllerSnapshot = {
    state,
    config: {
      playerName: 'You',
      botDifficulties: ['easy', 'easy', 'easy'],
      rules: { ...DEFAULT_RULES },
    },
    selectedCards: [],
    hint: null,
    selectionError: null,
    isHumanTurn: false,
    matchScore,
  };
  const noop = () => {};
  return {
    getSnapshot: () => snapshot,
    subscribe: () => noop,
    onEvent: () => noop,
    toggleCard: noop,
    clearSelection: noop,
    playSelected: noop,
    pass: noop,
    sortHand: noop,
    requestHint: noop,
    newGame: noop,
  };
}

describe('DevApp SSR smoke', () => {
  it('renders the table shell', () => {
    expect(html).toContain('data-testid="table"');
    expect(html).toContain('data-testid="play-area"');
    expect(html).toContain('data-testid="trick-label"');
    expect(html).toContain('data-testid="action-bar"');
  });

  it('renders the top bar with settings, rules and mute buttons', () => {
    expect(html).toContain('Thirteen');
    // React SSR separates adjacent text nodes with <!-- -->
    expect(html).toMatch(/Round (<!-- -->)?1/);
    expect(html).toContain('data-testid="mute-toggle"');
    expect(html).toContain('data-testid="rules-button"');
    expect(html).toContain('data-testid="settings-button"');
  });

  it('renders all four seats', () => {
    for (const seat of [1, 2, 3]) {
      expect(html).toContain(`data-testid="seat-${seat}"`);
    }
    expect(html).toContain('data-testid="player-hand"');
  });

  it('deals 13 face-up cards to the human', () => {
    expect(html.match(/data-testid="hand-card-/g)).toHaveLength(13);
  });

  it('deals 13 face-down backs to each opponent', () => {
    // Exactly "pcard pcard-back" (not the pcard-back-inner span) — 3 × 13.
    expect(html.match(/class="pcard pcard-back"/g)).toHaveLength(39);
  });

  it('renders the action buttons with snapshot-driven disabled states', () => {
    for (const label of ['Play', 'Pass', 'Sort', 'Hint']) {
      expect(html).toContain(`>${label}</button>`);
    }
    // Human leads with no selection: Play and Pass start disabled.
    expect(html).toMatch(/disabled=""[^>]*>Play<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>Pass<\/button>/);
  });

  it('shows the opening lead prompt', () => {
    expect(html).toContain('Your lead — play any combo');
  });
});

describe('DevApp instant win & match score', () => {
  it('shows the THẮNG TRẮNG fanfare and defers the summary on an instant win', () => {
    const { state } = applyInstantWin(createGame({ seed: 1 }), 2);
    const fanfareHtml = renderToString(<DevApp controller={stubController(state)} />);
    expect(fanfareHtml).toContain('data-testid="fanfare-instant-win"');
    expect(fanfareHtml).toContain('THẮNG TRẮNG!');
    expect(fanfareHtml).toContain('Bot 2');
    // The standings wait until the fanfare has played out.
    expect(fanfareHtml).not.toContain('data-testid="overlay-summary"');
  });

  it('shows the running match score in the round summary', () => {
    const base = createGame({ seed: 1 });
    const endState: GameState = {
      ...base,
      phase: 'gameEnd',
      players: base.players.map((p, i) => ({
        ...p,
        finished: i < 3,
        finishPlace: i < 3 ? i + 1 : null,
        hand: i < 3 ? [] : p.hand,
      })),
    };
    const summaryHtml = renderToString(
      <DevApp controller={stubController(endState, [3, 2, 1, 0])} />,
    );
    expect(summaryHtml).toContain('data-testid="overlay-summary"');
    expect(summaryHtml).toContain('data-testid="match-score"');
    // React SSR separates adjacent text nodes with <!-- -->
    expect(summaryHtml).toMatch(/3(<!-- -->)? pts/);
  });
});
