/**
 * Thirteen — Tien Len table UI.
 *
 * Composition root: owns the mock GameController, binds it to React via
 * useSyncExternalStore (hooks.ts), maps transient GameEvents to animations
 * and synthesized SFX (audio.ts), and applies the persisted theme
 * (themes.ts) as CSS custom properties on the root element.
 *
 * Browser-only APIs (AudioContext, localStorage, window listeners) live
 * behind effects or environment guards so the tree renders under
 * react-dom/server.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Card } from '../engine/types';
import type { GameController, GameControllerConfig } from '../game/api';
import { sfx } from './audio';
import { placeLabel } from './cards';
import { useControllerSnapshot, useGameEvents } from './hooks';
import { createMockController } from './mocks';
import {
  cardBackById,
  feltThemeById,
  loadCardBackId,
  loadThemeId,
  saveCardBackId,
  saveThemeId,
  themeCssVars,
} from './themes';
import { ActionBar } from './components/ActionBar';
import { OpponentSeat } from './components/OpponentSeat';
import { PlayerHand } from './components/PlayerHand';
import { PlayArea } from './components/PlayArea';
import { RoundSummaryOverlay, RulesOverlay, SettingsOverlay } from './components/Overlays';
import './styles.css';

type OverlayId = 'settings' | 'rules' | null;

const GEAR_PATH =
  'M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61' +
  'l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41' +
  'h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87' +
  'C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58' +
  'c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54' +
  'c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96' +
  'c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6' +
  's1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z';

const SOUND_ON_PATH =
  'M3,9v6h4l5,5V4L7,9H3z M16.5,12c0-1.77-1.02-3.29-2.5-4.03v8.05C15.48,15.29,16.5,13.77,16.5,12z ' +
  'M14,3.23v2.06c2.89,0.86,5,3.54,5,6.71s-2.11,5.85-5,6.71v2.06c4.01-0.91,7-4.49,7-8.77S18.01,4.14,14,3.23z';

const SOUND_OFF_PATH =
  'M16.5,12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45,2.45C16.46,12.43,16.5,12.22,16.5,12z ' +
  'M19,12c0,0.94-0.21,1.82-0.54,2.64l1.51,1.51C20.63,14.91,21,13.5,21,12c0-4.28-2.99-7.86-7-8.77v2.06' +
  'C16.89,6.15,19,8.83,19,12z M4.27,3L3,4.27L7.73,9H3v6h4l5,5v-6.73l4.25,4.25c-0.67,0.52-1.42,0.93-2.25,1.18v2.06' +
  'c1.38-0.31,2.63-0.95,3.69-1.81L19.73,21L21,19.73l-9-9L4.27,3z M12,4L9.91,6.09L12,8.18V4z';

/** Seat 1 renders left, seat 2 top, seat 3 right (counterclockwise play). */
const SEAT_POSITION: Record<number, string> = {
  1: 'seat-left',
  2: 'seat-top',
  3: 'seat-right',
};

export default function DevApp({ controller: injected }: { controller?: GameController } = {}) {
  // The production app (src/App.tsx) injects the real engine controller;
  // standalone UI development falls back to the mock.
  const [controller] = useState(() => injected ?? createMockController());
  const snapshot = useControllerSnapshot(controller);
  const { state, selectedCards, hint, selectionError, isHumanTurn } = snapshot;

  const [themeId, setThemeId] = useState(loadThemeId);
  const [cardBackId, setCardBackId] = useState(() => loadCardBackId(loadThemeId()));
  const [muted, setMuted] = useState(() => sfx.isMuted());
  const [dealId, setDealId] = useState(0);
  const [chopId, setChopId] = useState(0);
  const [overlay, setOverlay] = useState<OverlayId>(null);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const chopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autoplay policy: create/resume the AudioContext on the first gesture.
  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(
    () => () => {
      if (chopTimer.current !== null) clearTimeout(chopTimer.current);
    },
    [],
  );

  // GameEvents → animations (deal stagger, chop flash) and SFX.
  useGameEvents(controller, (event) => {
    switch (event.type) {
      case 'dealt':
        setDealId((id) => id + 1);
        setSummaryDismissed(false);
        sfx.play('deal');
        break;
      case 'played':
        sfx.play(event.chop ? 'chop' : 'play');
        if (event.chop) {
          setChopId((id) => id + 1);
          if (chopTimer.current !== null) clearTimeout(chopTimer.current);
          chopTimer.current = setTimeout(() => setChopId(0), 950);
        }
        break;
      case 'passed':
        sfx.play('pass');
        break;
      case 'trickWon':
        sfx.play('sweep');
        break;
      case 'playerOut':
        sfx.play('out');
        break;
      case 'roundEnd':
      case 'gameEnd':
        sfx.play('win');
        break;
    }
  });

  const theme = feltThemeById(themeId);
  const cardBack = cardBackById(cardBackId);
  const { trick, players, phase, currentSeat } = state;
  const human = players[0];
  const roundOver = phase === 'roundEnd' || phase === 'gameEnd';

  const handleToggle = (card: Card) => {
    sfx.play('select');
    controller.toggleCard(card);
  };

  const handleThemeChange = (id: string) => {
    setThemeId(id);
    saveThemeId(id);
  };

  const handleCardBackChange = (id: string) => {
    setCardBackId(id);
    saveCardBackId(id);
  };

  const handleMutedChange = (next: boolean) => {
    sfx.setMuted(next);
    setMuted(next);
  };

  const handleRematch = () => {
    setSummaryDismissed(false);
    controller.newGame();
  };

  // Difficulty / optional-rule changes start a fresh game with the new config.
  const handleConfigChange = (partial: Partial<GameControllerConfig>) => {
    setSummaryDismissed(false);
    controller.newGame(partial);
  };

  return (
    <div className="table-root" style={themeCssVars(theme, cardBack)} data-testid="table">
      <header className="topbar">
        <div className="brand">
          Thirteen
          <span className="round-chip">Round {state.round}</span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            aria-pressed={muted}
            onClick={() => handleMutedChange(!muted)}
            data-testid="mute-toggle"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={muted ? SOUND_OFF_PATH : SOUND_ON_PATH} />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Rules"
            onClick={() => setOverlay('rules')}
            data-testid="rules-button"
          >
            <b>?</b>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Settings"
            onClick={() => setOverlay('settings')}
            data-testid="settings-button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={GEAR_PATH} />
            </svg>
          </button>
        </div>
      </header>

      {[1, 2, 3].map((seat) => (
        <OpponentSeat
          key={seat}
          player={players[seat]}
          isActive={phase === 'playing' && currentSeat === seat}
          hasPassed={trick.combo !== null && trick.passedSeats.includes(seat)}
          dealId={dealId}
          className={SEAT_POSITION[seat]}
        />
      ))}

      <PlayArea trick={trick} players={players} chopId={chopId} />

      <div className="player-zone">
        <div className={`seat-plate player-plate${isHumanTurn ? ' seat-active' : ''}`}>
          <span className="seat-glow" aria-hidden="true" />
          {human.finishPlace !== null && (
            <span className={`seat-badge seat-badge-${human.finishPlace}`}>
              {placeLabel(human.finishPlace)}
            </span>
          )}
          <span className="seat-name">{human.name}</span>
          <span className="seat-count">{human.hand.length}</span>
          <AnimatePresence>
            {trick.combo !== null && trick.passedSeats.includes(0) && (
              <motion.span
                key="pass"
                className="pass-chip"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.18 }}
              >
                Pass
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <PlayerHand
          hand={human.hand}
          selectedCards={selectedCards}
          hint={hint}
          dealId={dealId}
          disabled={!isHumanTurn}
          onToggle={handleToggle}
        />

        <ActionBar
          canPlay={isHumanTurn && selectedCards.length > 0 && selectionError === null}
          canPass={isHumanTurn && trick.combo !== null && !roundOver}
          canHint={isHumanTurn}
          error={isHumanTurn ? selectionError : null}
          onPlay={() => controller.playSelected()}
          onPass={() => controller.pass()}
          onSort={() => controller.sortHand()}
          onHint={() => controller.requestHint()}
        />
      </div>

      <AnimatePresence>
        {roundOver && !summaryDismissed && (
          <RoundSummaryOverlay
            key="summary"
            players={players}
            phase={phase}
            rules={state.rules}
            onRematch={handleRematch}
            onClose={() => setSummaryDismissed(true)}
          />
        )}
        {overlay === 'settings' && (
          <SettingsOverlay
            key="settings"
            themeId={themeId}
            cardBackId={cardBackId}
            muted={muted}
            config={snapshot.config}
            onThemeChange={handleThemeChange}
            onCardBackChange={handleCardBackChange}
            onMutedChange={handleMutedChange}
            onConfigChange={handleConfigChange}
            onClose={() => setOverlay(null)}
          />
        )}
        {overlay === 'rules' && <RulesOverlay key="rules" onClose={() => setOverlay(null)} />}
      </AnimatePresence>
    </div>
  );
}
