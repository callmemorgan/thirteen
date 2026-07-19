/**
 * Tests for the React binding (game/store.ts): renders under react-dom/server
 * (node environment — no jsdom), which exercises the getServerSnapshot path of
 * useSyncExternalStore, and checks the snapshot identity the hook relies on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DEFAULT_RULES } from '../engine/types';
import type { GameController } from './api';
import { createController } from './controller';
import { useControllerSnapshot } from './store';

function makeController(): GameController {
  return createController({
    playerName: 'You',
    botDifficulties: ['easy', 'easy', 'easy'],
    rules: { ...DEFAULT_RULES },
    seed: 3,
  });
}

function SnapshotProbe({ controller }: { controller: GameController }) {
  const snap = useControllerSnapshot(controller);
  return (
    <div data-testid="probe">
      <span data-testid="name">{snap.config.playerName}</span>
      <span data-testid="cards">{snap.state.players[0].hand.length}</span>
      <span data-testid="turn">{String(snap.isHumanTurn)}</span>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useControllerSnapshot', () => {
  it('renders the snapshot under SSR (getServerSnapshot path)', () => {
    const html = renderToString(<SnapshotProbe controller={makeController()} />);
    expect(html).toContain('data-testid="probe"');
    expect(html).toContain('>You</span>');
    expect(html).toContain('>13</span>');
    expect(html).toContain('>true</span>');
  });

  it('returns a stable snapshot reference until the controller changes', () => {
    const controller = makeController();
    const before = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(before);

    controller.toggleCard(before.state.players[0].hand[0]);
    const after = controller.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.selectedCards).toHaveLength(1);
  });
});
