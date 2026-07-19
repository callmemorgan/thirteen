/**
 * Visual QA: drives the game in a real browser (system Chrome, headless),
 * screenshots key states at desktop and mobile viewports, and fails on any
 * console/page errors. Requires the dev server (npm run dev) on :5173.
 *
 * Works against the real engine: waits for the human turn (a bot may hold
 * the 3♠ and lead), then plays via the Hint button so any deal is handled.
 *
 * Usage: node scripts/visual-qa.mjs
 */
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.QA_URL ?? 'http://localhost:5173';
const OUT = new URL('../qa/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// Drop stale screenshots from previous runs so qa/ reflects this run only.
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.png')) unlinkSync(`${OUT}${f}`);
}

const errors = [];

async function newPage(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  return { ctx, page };
}

const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });

/** Wait until it is the human's turn (the Hint button is enabled then). */
async function waitForHumanTurn(page) {
  await page.waitForFunction(
    () => {
      const buttons = [...document.querySelectorAll('.action-buttons button')];
      const hint = buttons.find((b) => b.textContent === 'Hint');
      return hint !== undefined && !hint.disabled;
    },
    { timeout: 30_000 },
  );
}

async function buttonEnabled(page, name, timeout = 1500) {
  try {
    await page.waitForFunction(
      (label) => {
        const buttons = [...document.querySelectorAll('.action-buttons button')];
        const btn = buttons.find((b) => b.textContent === label);
        return btn !== undefined && !btn.disabled;
      },
      name,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

/** Take a turn via Hint: play the suggestion when possible, else pass. */
async function takeHintedTurn(page) {
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.waitForTimeout(400);
  if (await buttonEnabled(page, 'Play')) {
    await page.getByRole('button', { name: 'Play' }).click();
    return 'played';
  }
  await page.getByRole('button', { name: 'Pass' }).click();
  return 'passed';
}

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}

// --- Desktop 1280x800 -------------------------------------------------------
{
  const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(900); // splash entrance animation
  await shot(page, '00-desktop-splash');

  await page.getByTestId('splash-settings-button').click();
  await page.waitForTimeout(300);
  await shot(page, '01-desktop-settings-page');
  await page.getByTestId('settings-back').click();
  await page.waitForTimeout(200);

  await page.getByTestId('play-button').click();
  await page.waitForTimeout(1600); // deal-in animation
  await shot(page, '02-desktop-deal');

  await waitForHumanTurn(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.waitForTimeout(400);
  await shot(page, '03-desktop-hinted');

  const outcome = await takeHintedTurn(page);
  await page.waitForTimeout(900);
  await shot(page, `04-desktop-${outcome}`);

  await page.waitForTimeout(6000); // let bots take turns
  await shot(page, '05-desktop-midgame');

  await page.getByTestId('settings-button').click();
  await page.waitForTimeout(300);
  await shot(page, '06-desktop-settings');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.getByTestId('rules-button').click();
  await page.waitForTimeout(300);
  await shot(page, '07-desktop-rules');
  await ctx.close();
}

// --- Mobile 390x844 portrait -------------------------------------------------
{
  const { ctx, page } = await newPage(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(900); // splash entrance animation
  await shot(page, '08-mobile-splash');

  await page.getByTestId('play-button').tap();
  await page.waitForTimeout(1600); // deal-in animation
  await shot(page, '09-mobile-deal');

  await waitForHumanTurn(page);
  await page.getByRole('button', { name: 'Hint' }).tap();
  await page.waitForTimeout(400);
  await shot(page, '10-mobile-hinted');
  await ctx.close();
}

await browser.close();

if (errors.length) {
  console.error(`CONSOLE/PAGE ERRORS (${errors.length}):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('Visual QA complete — screenshots in qa/');
