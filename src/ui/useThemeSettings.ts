/**
 * Shared theme / card-back / mute state for the table and the splash-flow
 * screens. Selections persist to localStorage (themes.ts, audio.ts). The
 * splash, settings page and table each mount fresh on navigation and
 * re-read storage, so separate hook instances never go stale.
 */
import { useState } from 'react';
import { sfx } from './audio';
import { loadCardBackId, loadThemeId, saveCardBackId, saveThemeId } from './themes';

export interface ThemeSettings {
  themeId: string;
  cardBackId: string;
  muted: boolean;
  setTheme: (id: string) => void;
  setCardBack: (id: string) => void;
  setMuted: (muted: boolean) => void;
}

export function useThemeSettings(): ThemeSettings {
  const [themeId, setThemeId] = useState(loadThemeId);
  const [cardBackId, setCardBackId] = useState(() => loadCardBackId(loadThemeId()));
  const [muted, setMutedState] = useState(() => sfx.isMuted());

  return {
    themeId,
    cardBackId,
    muted,
    setTheme(id: string) {
      setThemeId(id);
      saveThemeId(id);
    },
    setCardBack(id: string) {
      setCardBackId(id);
      saveCardBackId(id);
    },
    setMuted(next: boolean) {
      sfx.setMuted(next);
      setMutedState(next);
    },
  };
}
