/**
 * One bot seat: face-down mini fan of card backs, name + card count,
 * turn-highlight glow, pass chip, and finish-place badge.
 * Position (left/top/right) comes from the parent via `className`.
 */
import { motion, AnimatePresence } from 'motion/react';
import type { CSSProperties } from 'react';
import type { PlayerState } from '../../engine/types';
import { placeLabel } from '../cards';
import { PlayingCard } from './PlayingCard';

export interface OpponentSeatProps {
  player: PlayerState;
  isActive: boolean;
  hasPassed: boolean;
  /** Bumped on every deal; re-runs the deal-in stagger. */
  dealId: number;
  className?: string;
}

const MAX_FAN_SLOTS = 13;

export function OpponentSeat({ player, isActive, hasPassed, dealId, className }: OpponentSeatProps) {
  const count = player.hand.length;
  const seatCls = [
    'seat',
    isActive ? 'seat-active' : '',
    player.finished ? 'seat-out' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={seatCls} data-testid={`seat-${player.id}`}>
      <div className="seat-fan" style={{ '--fan-slots': MAX_FAN_SLOTS } as CSSProperties}>
        {Array.from({ length: count }, (_, i) => (
          <motion.div
            key={`${dealId}-${i}`}
            className="seat-fan-card"
            style={{ '--fan-i': i, '--fan-mid': (count - 1) / 2 } as CSSProperties}
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.035, type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div className="seat-fan-tilt">
              <PlayingCard faceDown />
            </div>
          </motion.div>
        ))}
      </div>
      <div className="seat-plate">
        <span className="seat-glow" aria-hidden="true" />
        {player.finishPlace !== null && (
          <span className={`seat-badge seat-badge-${player.finishPlace}`}>
            {placeLabel(player.finishPlace)}
          </span>
        )}
        <span className="seat-name">{player.name}</span>
        <span className="seat-count" aria-label={`${count} cards`}>
          {count}
        </span>
        <AnimatePresence>
          {hasPassed && (
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
    </div>
  );
}
