import { useState } from 'react';
import { DEFAULT_RULES } from './engine/types';
import type { GameController, GameControllerConfig } from './game/api';
import { createController } from './game/controller';
import DevApp from './ui/DevApp';
import { SettingsScreen } from './ui/components/SettingsScreen';
import { SplashScreen } from './ui/components/SplashScreen';
import { loadGameConfig, saveGameConfig } from './ui/gameConfig';
import { useThemeSettings } from './ui/useThemeSettings';

/** Pin a deal for reproducible games/QA via ?seed=42 in the URL. */
function initialConfig(): GameControllerConfig {
  const seed = new URLSearchParams(window.location.search).get('seed');
  return {
    playerName: 'You',
    botDifficulties: ['medium', 'medium', 'medium'],
    rules: { ...DEFAULT_RULES },
    ...(seed !== null && seed !== '' ? { seed: Number(seed) } : {}),
  };
}

/** Game-config choices made on the splash settings page, applied on Play. */
type PendingConfig = Pick<GameControllerConfig, 'botDifficulties' | 'rules'>;

/**
 * Screen state machine: splash → (settings page | rules modal) → table.
 * The game controller is created lazily on Play so nothing runs behind
 * the splash; leaving the table snapshots the live config so in-game
 * difficulty/rule changes carry into the next game.
 * Difficulty and rule flags persist to localStorage (gameConfig.ts).
 */
export default function App() {
  const [screen, setScreen] = useState<'splash' | 'table'>('splash');
  const [splashView, setSplashView] = useState<'menu' | 'settings'>('menu');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [controller, setController] = useState<GameController | null>(null);
  const [pendingConfig, setPendingConfig] = useState<PendingConfig>(loadGameConfig);
  const themeSettings = useThemeSettings();

  const handleConfigChange = (partial: Partial<GameControllerConfig>) => {
    setPendingConfig((prev) => {
      const next = {
        botDifficulties: partial.botDifficulties ?? prev.botDifficulties,
        rules: partial.rules ?? prev.rules,
      };
      saveGameConfig(next);
      return next;
    });
  };

  const handlePlay = () => {
    setController(createController({ ...initialConfig(), ...pendingConfig }));
    setScreen('table');
  };

  const handleExitToMenu = () => {
    if (controller !== null) {
      const live = controller.getSnapshot().config;
      const next = { botDifficulties: live.botDifficulties, rules: live.rules };
      saveGameConfig(next);
      setPendingConfig(next);
    }
    setController(null);
    setScreen('splash');
    setSplashView('menu');
  };

  if (screen === 'table' && controller !== null) {
    return <DevApp controller={controller} onExitToMenu={handleExitToMenu} />;
  }

  if (splashView === 'settings') {
    return (
      <SettingsScreen
        themeId={themeSettings.themeId}
        cardBackId={themeSettings.cardBackId}
        muted={themeSettings.muted}
        config={{ ...initialConfig(), ...pendingConfig }}
        onThemeChange={themeSettings.setTheme}
        onCardBackChange={themeSettings.setCardBack}
        onMutedChange={themeSettings.setMuted}
        onConfigChange={handleConfigChange}
        onBack={() => setSplashView('menu')}
      />
    );
  }

  return (
    <SplashScreen
      themeId={themeSettings.themeId}
      cardBackId={themeSettings.cardBackId}
      rules={pendingConfig.rules}
      rulesOpen={rulesOpen}
      onPlay={handlePlay}
      onRules={() => setRulesOpen(true)}
      onCloseRules={() => setRulesOpen(false)}
      onSettings={() => setSplashView('settings')}
    />
  );
}
