/**
 * Persisted game-config choices (bot difficulty + optional rule flags) shared by
 * the splash settings page and the in-game settings. Mirrors the storage
 * discipline of themes.ts: localStorage behind SSR/private-mode guards, a fresh
 * read on every mount, and whitelist validation so a corrupt or stale entry
 * falls back to defaults instead of breaking the table.
 */
import type { Difficulty, RulesConfig } from '../engine/types';
import { DEFAULT_RULES } from '../engine/types';

export interface PersistedGameConfig {
  botDifficulties: [Difficulty, Difficulty, Difficulty];
  rules: RulesConfig;
}

const KEY = 'thirteen.gameConfig';

const DEFAULT_DIFFICULTIES: [Difficulty, Difficulty, Difficulty] = [
  'medium',
  'medium',
  'medium',
];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export function defaultGameConfig(): PersistedGameConfig {
  return { botDifficulties: [...DEFAULT_DIFFICULTIES], rules: { ...DEFAULT_RULES } };
}

export function loadGameConfig(): PersistedGameConfig {
  const fallback = defaultGameConfig();
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const { botDifficulties, rules } = parsed as Record<string, unknown>;

    const difficultiesValid =
      Array.isArray(botDifficulties) &&
      botDifficulties.length === 3 &&
      botDifficulties.every((d) => DIFFICULTIES.includes(d as Difficulty));

    // Whitelist known rule keys; non-boolean values fall back individually.
    const stored =
      typeof rules === 'object' && rules !== null
        ? (rules as Record<string, unknown>)
        : {};
    const validRules = Object.fromEntries(
      Object.keys(DEFAULT_RULES).map((key) => {
        const value = stored[key];
        return [key, typeof value === 'boolean' ? value : DEFAULT_RULES[key as keyof RulesConfig]];
      }),
    ) as unknown as RulesConfig;

    return {
      botDifficulties: difficultiesValid
        ? (botDifficulties as [Difficulty, Difficulty, Difficulty])
        : fallback.botDifficulties,
      rules: validRules,
    };
  } catch {
    return fallback;
  }
}

export function saveGameConfig(config: PersistedGameConfig): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Private mode / quota — settings still apply for the session.
  }
}
