/**
 * Centre of the table: the combo currently to beat, who played it, and a
 * chop flash. Played combos glide in from the seat that played them; when the
 * trick is won the combo sweeps out toward the winner (always the combo's
 * leader in Tien Len). Transform/opacity only.
 */
import { motion, AnimatePresence } from 'motion/react';
import type { CSSProperties } from 'react';
import type { PlayerState, TrickState } from '../../engine/types';
import { cardKey, comboKey, comboLabel, seatVector } from '../cards';
import { PlayingCard } from './PlayingCard';

export interface PlayAreaProps {
  trick: TrickState;
  players: PlayerState[];
  /** Non-zero while the chop flash is showing; each chop bumps the id. */
  chopId: number;
}

export function PlayArea({ trick, players, chopId }: PlayAreaProps) {
  const { combo, leaderSeat } = trick;
  const leaderName = players[leaderSeat]?.name ?? '';
  const vector = seatVector(leaderSeat);

  const label = combo
    ? `${leaderName} · ${comboLabel(combo)}`
    : leaderSeat === 0
      ? 'Your lead — play any combo'
      : `${leaderName} leads…`;

  return (
    <div className="play-area" data-testid="play-area">
      <div className="table-stage">
        <AnimatePresence>
          {combo && (
            <motion.div
              key={comboKey(combo, leaderSeat)}
              className="table-combo"
              initial={{ x: vector.x * 190, y: vector.y * 150, opacity: 0, scale: 0.85 }}
              animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              exit={{ x: vector.x * 280, y: vector.y * 220, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}
            >
              {combo.cards.map((card, i) => (
                <div
                  key={cardKey(card)}
                  className="table-card"
                  style={{ '--i': i, '--mid': (combo.cards.length - 1) / 2 } as CSSProperties}
                >
                  <PlayingCard card={card} />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {chopId > 0 && (
            <motion.div
              key={chopId}
              className="chop-flash"
              initial={{ opacity: 0, scale: 0.4, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: -8 }}
              exit={{ opacity: 0, scale: 1.3 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            >
              Chop!
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="trick-label" data-testid="trick-label">
        {label}
      </div>
    </div>
  );
}
