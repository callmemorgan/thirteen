/**
 * SSR smoke test: the app boots to the splash screen (not the table), and
 * the splash must render under react-dom/server like the table does.
 * The interactive splash → table flow is covered by browser visual QA.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from './App';

const html = renderToString(<App />);

describe('App SSR smoke', () => {
  it('boots to the splash screen, not the table', () => {
    expect(html).toContain('data-testid="splash"');
    expect(html).not.toContain('data-testid="table"');
  });

  it('offers play, rules and settings entries', () => {
    expect(html).toContain('data-testid="play-button"');
    expect(html).toContain('data-testid="splash-rules-button"');
    expect(html).toContain('data-testid="splash-settings-button"');
  });

  it('shows the title and tagline', () => {
    expect(html).toContain('Thirteen');
    expect(html).toContain('Tiến Lén');
  });
});
