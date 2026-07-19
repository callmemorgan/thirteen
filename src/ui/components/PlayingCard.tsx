/**
 * Pure-CSS playing card. Face: rank + suit corners and a large centre mark
 * (red for ♦/♥). Back: the active card-back design from the theme system.
 * Size is driven by the `--cw` custom property set by the parent context
 * (hand / table / mini fan) — the component itself is context-agnostic.
 */
import type { CSSProperties } from 'react';
import type { Card } from '../../engine/types';
import { isRedSuit, rankLabel, SUIT_GLYPH } from '../cards';

export interface PlayingCardProps {
  /** Omit (or set faceDown) to render the card back. */
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  hinted?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

export function PlayingCard({
  card,
  faceDown = false,
  selected = false,
  hinted = false,
  onClick,
  className,
  style,
  testId,
}: PlayingCardProps) {
  const cls = ['pcard', className].filter(Boolean).join(' ');

  if (faceDown || !card) {
    return (
      <div className={`${cls} pcard-back`} style={style} data-testid={testId} aria-hidden="true">
        <span className="pcard-back-inner" />
      </div>
    );
  }

  const label = rankLabel(card.rank);
  const glyph = SUIT_GLYPH[card.suit];
  const faceCls = [
    cls,
    'pcard-face',
    isRedSuit(card.suit) ? 'pcard-red' : 'pcard-black',
    label.length > 1 ? 'pcard-wide' : '',
    selected ? 'pcard-selected' : '',
    hinted ? 'pcard-hinted' : '',
    onClick ? 'pcard-button' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const corners = (
    <>
      <span className="pcard-corner pcard-corner-tl">
        <b>{label}</b>
        <i>{glyph}</i>
      </span>
      <span className="pcard-centre">
        <b>{label}</b>
        <i>{glyph}</i>
      </span>
      <span className="pcard-corner pcard-corner-br">
        <b>{label}</b>
        <i>{glyph}</i>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={faceCls}
        style={style}
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`${label} of ${card.suit}`}
        data-testid={testId}
      >
        {corners}
      </button>
    );
  }
  return (
    <div className={faceCls} style={style} data-testid={testId}>
      {corners}
    </div>
  );
}
