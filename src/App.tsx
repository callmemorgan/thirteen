import { useState } from 'react';
import DevApp from './ui/DevApp';
import { createController } from './game/controller';
import { DEFAULT_RULES } from './engine/types';
import type { GameControllerConfig } from './game/api';

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

export default function App() {
  const [controller] = useState(() => createController(initialConfig()));
  return <DevApp controller={controller} />;
}
