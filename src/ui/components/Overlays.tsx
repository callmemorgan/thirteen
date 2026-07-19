/**
 * Modal overlays: RoundSummary/GameOver, Settings (theme + card-back picker,
 * mute), and a concise Rules reference. All are fixed-position, dismissible
 * (backdrop click, × button, Escape), and SSR-safe (no portals).
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Difficulty, GamePhase, PlayerState, RulesConfig } from '../../engine/types';
import { thoi2Penalty } from '../../engine/state';
import type { GameControllerConfig } from '../../game/api';
import { placeLabel } from '../cards';
import type { CardBackDesign, FeltTheme } from '../themes';
import { CARD_BACKS, FELT_THEMES } from '../themes';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function Modal({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="overlay-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        className="overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        initial={{ opacity: 0, y: 26, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="overlay-body">{children}</div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Round summary / game over
// ---------------------------------------------------------------------------

export function RoundSummaryOverlay({
  players,
  phase,
  rules,
  matchScore,
  onRematch,
  onClose,
}: {
  players: PlayerState[];
  phase: GamePhase;
  rules: RulesConfig;
  matchScore: number[];
  onRematch: () => void;
  onClose: () => void;
}) {
  const standings = [...players].sort((a, b) => (a.finishPlace ?? 4) - (b.finishPlace ?? 4));
  const matchStandings = [...players].sort((a, b) => matchScore[b.id] - matchScore[a.id]);
  return (
    <Modal title={phase === 'gameEnd' ? 'Game Over' : 'Round Over'} onClose={onClose} testId="overlay-summary">
      <ol className="standings">
        {standings.map((p) => {
          const penalty = rules.thoi2Scoring && p.hand.length > 0 ? thoi2Penalty(p.hand) : null;
          return (
            <li key={p.id} className={`standing${p.id === 0 ? ' standing-you' : ''}`}>
              <span className={`seat-badge seat-badge-${p.finishPlace ?? 4}`}>
                {placeLabel(p.finishPlace ?? 4)}
              </span>
              <span className="standing-name">{p.name}</span>
              {penalty !== null && penalty.points > 0 && (
                <span className="standing-penalty" title={penalty.items.join(', ')}>
                  −{penalty.points} pts
                </span>
              )}
              <span className="standing-left">
                {p.hand.length === 0 ? 'Out' : `${p.hand.length} left`}
              </span>
            </li>
          );
        })}
      </ol>
      <section className="match-score" data-testid="match-score">
        <h3>Match score</h3>
        <ol className="standings">
          {matchStandings.map((p) => (
            <li key={p.id} className={`standing${p.id === 0 ? ' standing-you' : ''}`}>
              <span className="standing-name">{p.name}</span>
              <span className="standing-score">{matchScore[p.id]} pts</span>
            </li>
          ))}
        </ol>
      </section>
      <div className="overlay-actions">
        <button type="button" className="btn btn-primary" onClick={onRematch}>
          Rematch
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Instant-win fanfare (THẮNG TRẮNG)
// ---------------------------------------------------------------------------

export function InstantWinFanfare({
  winnerName,
  onDismiss,
}: {
  winnerName: string;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      className="fanfare-backdrop"
      data-testid="fanfare-instant-win"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onDismiss}
    >
      <motion.div
        className="fanfare-burst"
        initial={{ opacity: 0, scale: 0.35, rotate: -7 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 1.5 }}
        transition={{ type: 'spring', stiffness: 240, damping: 17 }}
      >
        <div className="fanfare-title">THẮNG TRẮNG!</div>
        <div className="fanfare-sub">{winnerName} won on the deal — instant win!</div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface SettingsPanelProps {
  themeId: string;
  cardBackId: string;
  muted: boolean;
  config: GameControllerConfig;
  /** Footnote under the game-config sections (how/when changes apply). */
  configNote?: string;
  onThemeChange: (id: string) => void;
  onCardBackChange: (id: string) => void;
  onMutedChange: (muted: boolean) => void;
  onConfigChange: (partial: Partial<GameControllerConfig>) => void;
}

/** All settings sections, without modal chrome. Shared by the in-game
 *  SettingsOverlay modal and the splash-flow full-screen settings page. */
export function SettingsPanel({
  themeId,
  cardBackId,
  muted,
  config,
  configNote,
  onThemeChange,
  onCardBackChange,
  onMutedChange,
  onConfigChange,
}: SettingsPanelProps) {
  return (
    <>
      <section className="settings-section">
        <h3>Bot difficulty</h3>
        <div className="segmented">
          {DIFFICULTIES.map((level) => (
            <button
              key={level}
              type="button"
              className={`btn${config.botDifficulties[0] === level ? ' is-active' : ''}`}
              aria-pressed={config.botDifficulties[0] === level}
              onClick={() => onConfigChange({ botDifficulties: [level, level, level] })}
            >
              {level[0].toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section settings-row">
        <h3>Instant win (four 2s, dragon)</h3>
        <button
          type="button"
          className={`toggle${config.rules.instantWin ? ' is-on' : ''}`}
          role="switch"
          aria-checked={config.rules.instantWin}
          onClick={() =>
            onConfigChange({ rules: { ...config.rules, instantWin: !config.rules.instantWin } })
          }
        >
          <span className="toggle-knob" />
          <span className="toggle-label">{config.rules.instantWin ? 'On' : 'Off'}</span>
        </button>
      </section>
      <section className="settings-section settings-row">
        <h3>Thối 2 penalties</h3>
        <button
          type="button"
          className={`toggle${config.rules.thoi2Scoring ? ' is-on' : ''}`}
          role="switch"
          aria-checked={config.rules.thoi2Scoring}
          onClick={() =>
            onConfigChange({
              rules: { ...config.rules, thoi2Scoring: !config.rules.thoi2Scoring },
            })
          }
        >
          <span className="toggle-knob" />
          <span className="toggle-label">{config.rules.thoi2Scoring ? 'On' : 'Off'}</span>
        </button>
      </section>
      <section className="settings-section settings-row">
        <h3>Lock out after pass</h3>
        <button
          type="button"
          className={`toggle${config.rules.passLockout ? ' is-on' : ''}`}
          role="switch"
          aria-checked={config.rules.passLockout}
          onClick={() =>
            onConfigChange({
              rules: { ...config.rules, passLockout: !config.rules.passLockout },
            })
          }
        >
          <span className="toggle-knob" />
          <span className="toggle-label">{config.rules.passLockout ? 'On' : 'Off'}</span>
        </button>
      </section>
      {configNote !== undefined && <p className="settings-note">{configNote}</p>}
      <section className="settings-section">
        <h3>Table felt</h3>
        <div className="theme-grid">
          {FELT_THEMES.map((theme: FeltTheme) => (
            <button
              key={theme.id}
              type="button"
              className={`theme-swatch${theme.id === themeId ? ' is-active' : ''}`}
              onClick={() => onThemeChange(theme.id)}
              aria-pressed={theme.id === themeId}
            >
              <span
                className="theme-swatch-felt"
                style={{
                  background: `radial-gradient(circle at 50% 35%, ${theme.felt.center}, ${theme.felt.edge})`,
                }}
              >
                <span className="theme-swatch-dot" style={{ background: theme.accent }} />
              </span>
              <span className="theme-swatch-name">{theme.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h3>Card back</h3>
        <div className="theme-grid">
          {CARD_BACKS.map((back: CardBackDesign) => (
            <button
              key={back.id}
              type="button"
              className={`theme-swatch${back.id === cardBackId ? ' is-active' : ''}`}
              onClick={() => onCardBackChange(back.id)}
              aria-pressed={back.id === cardBackId}
            >
              <span
                className="theme-swatch-back"
                style={{ background: back.base, backgroundImage: back.image }}
              >
                <span className="theme-swatch-back-frame" style={{ borderColor: back.frame }} />
              </span>
              <span className="theme-swatch-name">{back.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section settings-row">
        <h3>Sound</h3>
        <button
          type="button"
          className={`toggle${muted ? '' : ' is-on'}`}
          role="switch"
          aria-checked={!muted}
          onClick={() => onMutedChange(!muted)}
        >
          <span className="toggle-knob" />
          <span className="toggle-label">{muted ? 'Off' : 'On'}</span>
        </button>
      </section>
    </>
  );
}

export function SettingsOverlay({
  onClose,
  ...panelProps
}: Omit<SettingsPanelProps, 'configNote'> & { onClose: () => void }) {
  return (
    <Modal title="Settings" onClose={onClose} testId="overlay-settings">
      <SettingsPanel
        {...panelProps}
        configNote="Difficulty and rule changes start a new game."
      />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function RulesOverlay({ rules, onClose }: { rules: RulesConfig; onClose: () => void }) {
  return (
    <Modal title="How to play Tiến Lén" onClose={onClose} testId="overlay-rules">
      <div className="rules">
        <section>
          <h3>Goal</h3>
          <p>Be the first to shed all 13 cards. Play continues for 2nd, 3rd and 4th place.</p>
        </section>
        <section>
          <h3>Card order</h3>
          <p>
            3 &lt; 4 &lt; … &lt; 10 &lt; J &lt; Q &lt; K &lt; A &lt; 2 (highest). On ties, suits
            rank <span className="rules-black">♠</span> &lt; <span className="rules-black">♣</span>{' '}
            &lt; <span className="rules-red">♦</span> &lt; <span className="rules-red">♥</span>.
          </p>
        </section>
        <section>
          <h3>Combos</h3>
          <ul>
            <li>Single, pair, triple, quad</li>
            <li>Straight — 3+ consecutive ranks, no 2s</li>
            <li>Pair-run — 3+ consecutive pairs, no 2s</li>
          </ul>
          <p>Beat a combo with the same type and length, but a higher top card.</p>
        </section>
        <section>
          <h3>Chops</h3>
          <ul>
            <li>A quad or 3-pair-run chops a single 2</li>
            <li>A 4-pair-run chops a 2, a pair of 2s, or a lower bomb</li>
          </ul>
        </section>
        <section>
          <h3>Flow</h3>
          <ul>
            <li>The 3♠ holder opens; the first play must include it</li>
            <li>On rematches the previous winner leads with any combo</li>
            {rules.passLockout ? (
              <li>Pass and you sit out the trick — you rejoin when someone sweeps and leads</li>
            ) : (
              <li>Pass to skip — you may jump back in later in the same trick</li>
            )}
            <li>When everyone else passes, the last player sweeps the trick and leads</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
