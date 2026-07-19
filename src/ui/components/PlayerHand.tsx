/**
 * The human player's hand: cards fanned with overlap, tap/click toggles
 * selection (CSS lift), hint highlight, staggered deal-in per round.
 * Transform layers: motion wrapper (deal-in) → .hand-card-fan (fan tilt)
 * → PlayingCard (selection lift), so they never clobber each other.
 */
import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { Card } from '../../engine/types';
import { cardKey, containsCard } from '../cards';
import { PlayingCard } from './PlayingCard';

export interface PlayerHandProps {
  hand: Card[];
  selectedCards: Card[];
  hint: Card[] | null;
  /** Bumped on every deal; re-runs the deal-in stagger. */
  dealId: number;
  disabled: boolean;
  onToggle: (card: Card) => void;
}

export function PlayerHand({ hand, selectedCards, hint, dealId, disabled, onToggle }: PlayerHandProps) {
  const mid = (hand.length - 1) / 2;
  return (
    <div
      className={`hand-cards${disabled ? ' hand-disabled' : ''}`}
      data-testid="player-hand"
      role="group"
      aria-label="Your hand"
    >
      {hand.map((card, i) => {
        const key = cardKey(card);
        const selected = containsCard(selectedCards, card);
        const hinted = hint !== null && containsCard(hint, card);
        return (
          <motion.div
            key={`${dealId}-${key}`}
            className="hand-card-slot"
            style={{ zIndex: i }}
            initial={{ opacity: 0, y: 90 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.045, type: 'spring', stiffness: 300, damping: 27 }}
          >
            <div className="hand-card-fan" style={{ '--i': i, '--mid': mid } as CSSProperties}>
              <PlayingCard
                card={card}
                selected={selected}
                hinted={hinted}
                onClick={disabled ? undefined : () => onToggle(card)}
                testId={`hand-card-${key}`}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
