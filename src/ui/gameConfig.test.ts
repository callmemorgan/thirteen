import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RULES } from '../engine/types';
import type { PersistedGameConfig } from './gameConfig';
import { defaultGameConfig, loadGameConfig, saveGameConfig } from './gameConfig';

/** Minimal window stand-in with an in-memory localStorage. */
function fakeWindow(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    localStorage: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gameConfig persistence', () => {
  it('returns defaults when nothing is stored', () => {
    vi.stubGlobal('window', fakeWindow());
    expect(loadGameConfig()).toEqual(defaultGameConfig());
  });

  it('returns defaults without a window (SSR)', () => {
    expect(typeof window).toBe('undefined');
    expect(loadGameConfig()).toEqual(defaultGameConfig());
  });

  it('round-trips difficulty and rule flags', () => {
    vi.stubGlobal('window', fakeWindow());
    const config: PersistedGameConfig = {
      botDifficulties: ['hard', 'easy', 'medium'],
      rules: { instantWin: true, thoi2Scoring: true, passLockout: false },
    };
    saveGameConfig(config);
    expect(loadGameConfig()).toEqual(config);
  });

  it('falls back to defaults on corrupt JSON', () => {
    vi.stubGlobal('window', fakeWindow({ 'thirteen.gameConfig': '{not json' }));
    expect(loadGameConfig()).toEqual(defaultGameConfig());
  });

  it('drops invalid difficulties but keeps valid rule flags', () => {
    vi.stubGlobal(
      'window',
      fakeWindow({
        'thirteen.gameConfig': JSON.stringify({
          botDifficulties: ['hard', 'impossible', 'easy'],
          rules: { instantWin: true, thoi2Scoring: 'yes', unknownFlag: true },
        }),
      }),
    );
    expect(loadGameConfig()).toEqual({
      botDifficulties: ['medium', 'medium', 'medium'],
      rules: { ...DEFAULT_RULES, instantWin: true },
    });
  });
});
