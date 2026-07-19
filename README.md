# Thirteen — Tien Len

A polished, mobile-friendly web version of **Tiến Lên** ("Thirteen"), the Vietnamese
shedding card game. Human + 3 AI opponents, fully client-side — no server, no accounts.

## Play

```bash
npm install
npm run dev        # → http://localhost:5173
```

Pin a reproducible deal with a seed: `http://localhost:5173/?seed=42`.

## Rules (casual style)

- 4 players, 13 cards each. Rank order `3 < … < A < 2`; suit tiebreak `♠ < ♣ < ♦ < ♥`.
- Combos: single, pair, triple, quad, straight (3+ consecutive, no 2s),
  pair-run (3+ consecutive pairs, no 2s).
- Chops: a quad or 3-pair-run beats a single 2; a 4-pair-run beats a pair of 2s,
  a quad, or a 3-pair-run.
- First round: the 3♠ holder leads and must include it. Rematch winner leads.
- Pass and you sit out the trick; it ends when the other three pass, and you rejoin
  on the next lead. (Southern-style re-entry after passing is a Settings option.)
- Optional flags in Settings: instant win (four 2s / 12-card dragon straight) and
  thối 2 penalties (points for leftover 2s and bombs shown in the summary).

## Features

- Three bot difficulties (Settings): easy, medium, hard — the hard bot evaluates
  exact minimum-turns hand decompositions and manages control cards (2s/bombs).
- Smooth `motion` animations: deal-in, hand→table glide, trick sweep, chop flash.
- Instant-win fanfare: with the instant-win rule on, a winning deal triggers a
  full-screen THẮNG TRẮNG celebration before the summary.
- Running match score across rematches (3/2/1/0 points by finish place), shown
  in the round summary.
- Synthesized WebAudio SFX (no audio assets), with a persisted mute toggle.
- Cosmetics: 3 felt themes × 3 card-back designs, persisted to localStorage —
  as are bot difficulty and the optional rule flags.
- Mobile-first responsive layout, touch-friendly fanned hand, safe-area aware.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check + production build |
| `npm test` | Vitest suite (engine, controller, integration, UI SSR) |
| `npm run lint` | oxlint |
| `npm run format` | Prettier |
| `node scripts/visual-qa.mjs` | Headless-Chrome screenshot QA (needs dev server) |

## Architecture

Strictly layered, framework-agnostic engine ↔ controller ↔ React UI:

```
src/
  engine/    Pure TS game logic, deterministic (seeded RNG), fully unit-tested:
             types (contracts), cards, rng, combos, rules, state, ai/{enumerate,evaluate,policies}
  game/      api (GameController contract), controller (engine wiring, bot scheduling,
             trick-sweep timing), store (React binding), integration tests
             (incl. hard-vs-easy win-rate)
  ui/        DevApp (composition root), components/, themes, audio, styles,
             mocks (mock controller for UI development)
  App.tsx    Production entry: injects the real controller into DevApp
```

The UI codes against the `GameController` interface only, so it runs on either the
real engine controller or the built-in mock (`src/ui/mocks.ts`).

Turn flow: moves apply synchronously through `applyMove`. When a trick is decided,
the engine enters a brief `trickWon` phase with the winning combo left on the
table (no moves are legal); the controller sweeps it via `sweepTrick` after ~1.3 s
so the winning play stays visible before the next lead.

Instant win: with the rule on, a winning deal ends the game immediately —
the engine records `instantWinner` in state and emits an `instantWin` event, and
the UI plays the THẮNG TRẮNG fanfare before the summary appears.

Match score: the controller (not the per-round engine state) keeps a running
total across rematches — 3/2/1/0 points by finish place, accrued each time a
round reaches `gameEnd` and exposed as `snapshot.matchScore`.

Visual QA screenshots land in `qa/` (git-ignored).

## License

[MIT](LICENSE) © Morgan Allen
