/**
 * Theme system: felt themes + card-back designs, applied purely through CSS
 * custom properties set on the DevApp root element. Selection persists in
 * localStorage. All storage access is guarded so the module is SSR-safe.
 */
import type { CSSProperties } from 'react';

export interface FeltTheme {
  id: string;
  name: string;
  /** Radial felt gradient stops: centre highlight → table edge. */
  felt: { center: string; edge: string };
  /** Vignette / rail colour around the felt. */
  rail: string;
  /** Accent for turn glows, primary buttons, highlights. */
  accent: string;
  /** Readable text colour on top of `accent`. */
  onAccent: string;
  /** Default card-back design for this theme. */
  cardBackId: string;
}

export interface CardBackDesign {
  id: string;
  name: string;
  /** Base colour under the pattern. */
  base: string;
  /** Pure-CSS gradient pattern (multiple backgrounds allowed). */
  image: string;
  /** Frame line colour drawn over the pattern. */
  frame: string;
}

export const FELT_THEMES: readonly FeltTheme[] = [
  {
    id: 'classic-green',
    name: 'Classic Green',
    felt: { center: '#3f9c6f', edge: '#0e3d27' },
    rail: '#241407',
    accent: '#f2c14e',
    onAccent: '#221a05',
    cardBackId: 'lattice',
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Blue',
    felt: { center: '#3d6db4', edge: '#0a1c38' },
    rail: '#101318',
    accent: '#7dd3fc',
    onAccent: '#06222f',
    cardBackId: 'sashiko',
  },
  {
    id: 'bordeaux',
    name: 'Bordeaux',
    felt: { center: '#a85562', edge: '#3d0f1c' },
    rail: '#1c0b09',
    accent: '#ffd166',
    onAccent: '#2e1a00',
    cardBackId: 'ripple',
  },
];

export const CARD_BACKS: readonly CardBackDesign[] = [
  {
    id: 'lattice',
    name: 'Lattice',
    base: '#8e1f2f',
    image: [
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 1.5px, transparent 1.5px 7px)',
      'repeating-linear-gradient(-45deg, rgba(255,255,255,0.22) 0 1.5px, transparent 1.5px 7px)',
    ].join(', '),
    frame: 'rgba(255, 235, 200, 0.55)',
  },
  {
    id: 'sashiko',
    name: 'Sashiko',
    base: '#16355e',
    image: [
      'repeating-linear-gradient(0deg, transparent 0 6px, rgba(160,200,255,0.28) 6px 7px)',
      'repeating-linear-gradient(90deg, transparent 0 6px, rgba(160,200,255,0.28) 6px 7px)',
      'repeating-linear-gradient(45deg, transparent 0 8px, rgba(160,200,255,0.14) 8px 9px)',
    ].join(', '),
    frame: 'rgba(190, 220, 255, 0.5)',
  },
  {
    id: 'ripple',
    name: 'Ripple',
    base: '#3a2b63',
    image:
      'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.26) 0 1.5px, transparent 1.5px 6px)',
    frame: 'rgba(230, 215, 255, 0.5)',
  },
];

export function feltThemeById(id: string): FeltTheme {
  return FELT_THEMES.find((t) => t.id === id) ?? FELT_THEMES[0];
}

export function cardBackById(id: string): CardBackDesign {
  return CARD_BACKS.find((b) => b.id === id) ?? CARD_BACKS[0];
}

/** CSS custom properties consumed by styles.css (`.table-root`). */
export function themeCssVars(theme: FeltTheme, back: CardBackDesign): CSSProperties {
  return {
    '--felt-center': theme.felt.center,
    '--felt-edge': theme.felt.edge,
    '--rail': theme.rail,
    '--accent': theme.accent,
    '--on-accent': theme.onAccent,
    '--cardback-base': back.base,
    '--cardback-image': back.image,
    '--cardback-frame': back.frame,
  } as CSSProperties;
}

// ---------------------------------------------------------------------------
// Persistence (SSR-safe: every access is environment-guarded)
// ---------------------------------------------------------------------------

const THEME_KEY = 'thirteen.theme';
const CARD_BACK_KEY = 'thirteen.cardback';

function storageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / quota — theming still works for the session.
  }
}

export function loadThemeId(): string {
  return storageGet(THEME_KEY) ?? FELT_THEMES[0].id;
}

export function saveThemeId(id: string): void {
  storageSet(THEME_KEY, id);
}

export function loadCardBackId(themeId: string): string {
  return storageGet(CARD_BACK_KEY) ?? feltThemeById(themeId).cardBackId;
}

export function saveCardBackId(id: string): void {
  storageSet(CARD_BACK_KEY, id);
}
