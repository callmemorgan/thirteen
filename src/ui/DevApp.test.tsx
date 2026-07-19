/**
 * SSR smoke test: the whole table must render under react-dom/server
 * (node environment — no jsdom). Browser-only APIs (AudioContext,
 * localStorage, window listeners) are isolated behind effects and
 * environment guards, so renderToString must not throw.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import DevApp from './DevApp';

const html = renderToString(<DevApp />);

describe('DevApp SSR smoke', () => {
  it('renders the table shell', () => {
    expect(html).toContain('data-testid="table"');
    expect(html).toContain('data-testid="play-area"');
    expect(html).toContain('data-testid="trick-label"');
    expect(html).toContain('data-testid="action-bar"');
  });

  it('renders the top bar with settings, rules and mute buttons', () => {
    expect(html).toContain('Thirteen');
    // React SSR separates adjacent text nodes with <!-- -->
    expect(html).toMatch(/Round (<!-- -->)?1/);
    expect(html).toContain('data-testid="mute-toggle"');
    expect(html).toContain('data-testid="rules-button"');
    expect(html).toContain('data-testid="settings-button"');
  });

  it('renders all four seats', () => {
    for (const seat of [1, 2, 3]) {
      expect(html).toContain(`data-testid="seat-${seat}"`);
    }
    expect(html).toContain('data-testid="player-hand"');
  });

  it('deals 13 face-up cards to the human', () => {
    expect(html.match(/data-testid="hand-card-/g)).toHaveLength(13);
  });

  it('deals 13 face-down backs to each opponent', () => {
    // Exactly "pcard pcard-back" (not the pcard-back-inner span) — 3 × 13.
    expect(html.match(/class="pcard pcard-back"/g)).toHaveLength(39);
  });

  it('renders the action buttons with snapshot-driven disabled states', () => {
    for (const label of ['Play', 'Pass', 'Sort', 'Hint']) {
      expect(html).toContain(`>${label}</button>`);
    }
    // Human leads with no selection: Play and Pass start disabled.
    expect(html).toMatch(/disabled=""[^>]*>Play<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>Pass<\/button>/);
  });

  it('shows the opening lead prompt', () => {
    expect(html).toContain('Your lead — play any combo');
  });
});
