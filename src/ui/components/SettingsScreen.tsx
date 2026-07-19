/**
 * Full-screen settings page, reached from the splash screen. Reuses
 * SettingsPanel (shared with the in-game settings modal) inside the same
 * panel chrome as the overlays, on a themed page. Back via the button or
 * Escape. SSR-safe: no browser APIs at render time.
 */
import { useEffect } from 'react';
import type { GameControllerConfig } from '../../game/api';
import { cardBackById, feltThemeById, themeCssVars } from '../themes';
import { SettingsPanel } from './Overlays';

export function SettingsScreen({
  themeId,
  cardBackId,
  muted,
  config,
  onThemeChange,
  onCardBackChange,
  onMutedChange,
  onConfigChange,
  onBack,
}: {
  themeId: string;
  cardBackId: string;
  muted: boolean;
  config: GameControllerConfig;
  onThemeChange: (id: string) => void;
  onCardBackChange: (id: string) => void;
  onMutedChange: (muted: boolean) => void;
  onConfigChange: (partial: Partial<GameControllerConfig>) => void;
  onBack: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const theme = feltThemeById(themeId);
  const cardBack = cardBackById(cardBackId);
  return (
    <div className="settings-page" style={themeCssVars(theme, cardBack)} data-testid="settings-page">
      <div className="overlay-panel settings-page-panel">
        <header className="overlay-head settings-page-head">
          <button
            type="button"
            className="icon-btn"
            onClick={onBack}
            aria-label="Back to menu"
            data-testid="settings-back"
          >
            ←
          </button>
          <h2>Settings</h2>
        </header>
        <div className="overlay-body">
          <SettingsPanel
            themeId={themeId}
            cardBackId={cardBackId}
            muted={muted}
            config={config}
            configNote="Applied to your next game."
            onThemeChange={onThemeChange}
            onCardBackChange={onCardBackChange}
            onMutedChange={onMutedChange}
            onConfigChange={onConfigChange}
          />
        </div>
      </div>
    </div>
  );
}
