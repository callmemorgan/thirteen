/**
 * Splash (landing) screen shown on app load, before the table. Title over
 * the selected felt with a fanned card-backs flourish, and entries to
 * play, read the rules, or open the settings page. Themed with the same
 * CSS custom properties as the table so felt/card-back picks preview here.
 * SSR-safe: no browser APIs at render time.
 */
import { motion } from 'motion/react';
import type { RulesConfig } from '../../engine/types';
import { cardBackById, feltThemeById, themeCssVars } from '../themes';
import { RulesOverlay } from './Overlays';

const FAN_ROTATIONS = [-16, 0, 16];

export function SplashScreen({
  themeId,
  cardBackId,
  rules,
  rulesOpen,
  onPlay,
  onRules,
  onCloseRules,
  onSettings,
}: {
  themeId: string;
  cardBackId: string;
  rules: RulesConfig;
  rulesOpen: boolean;
  onPlay: () => void;
  onRules: () => void;
  onCloseRules: () => void;
  onSettings: () => void;
}) {
  const theme = feltThemeById(themeId);
  const cardBack = cardBackById(cardBackId);
  return (
    <div className="splash-root" style={themeCssVars(theme, cardBack)} data-testid="splash">
      <div className="splash-fan" aria-hidden="true">
        {FAN_ROTATIONS.map((deg, i) => (
          <motion.div
            key={deg}
            className="splash-fan-card pcard pcard-back"
            initial={{ opacity: 0, y: -70, rotate: deg * 2.4 }}
            animate={{ opacity: 1, y: 0, rotate: deg }}
            transition={{ type: 'spring', stiffness: 190, damping: 19, delay: 0.08 * i }}
          >
            <span className="pcard-back-inner" />
          </motion.div>
        ))}
      </div>
      <motion.h1
        className="splash-title"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.22 }}
      >
        Thirteen
      </motion.h1>
      <motion.p
        className="splash-subtitle"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.3 }}
      >
        Tiến Lén — first to shed all 13 cards wins
      </motion.p>
      <motion.div
        className="splash-buttons"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.38 }}
      >
        <button
          type="button"
          className="btn btn-primary splash-play"
          onClick={onPlay}
          data-testid="play-button"
        >
          Play
        </button>
        <button type="button" className="btn" onClick={onRules} data-testid="splash-rules-button">
          How to Play
        </button>
        <button
          type="button"
          className="btn"
          onClick={onSettings}
          data-testid="splash-settings-button"
        >
          Settings
        </button>
      </motion.div>
      {rulesOpen && <RulesOverlay rules={rules} onClose={onCloseRules} />}
    </div>
  );
}
