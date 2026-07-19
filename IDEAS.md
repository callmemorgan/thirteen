# Ideas — post-v1 backlog

Everything that was cut, deferred, or never scoped for v1, grouped by theme.
Effort tags are rough: **S** small, **M** medium, **L** large.

## Gameplay & rules depth

- **Out-of-turn chops (chặt interrupts)** — jump in with a bomb even when it's not
  your turn. The engine already has the chop matrix; this adds interrupt timing and
  turn-resumption logic. **M** — high chaos/fun.
- **Chop bounties (chặt chồng)** — debt stacking when chops get re-chopped.
  Part of the gambling rule set. **M**
- **Full money settlement** — per-card payouts, cóng (frozen) penalty, thối 2 as a
  real settlement. (v1 has thối 2 as display-only points in the summary.) **M**
- **Northern-style rules** — stricter combo/suit conventions. **M**
- **More instant-win hands** — 6 pairs, 5 consecutive pairs, 3 triples, etc.
  (v1: four 2s + 12-card dragon only.) **S**
- **2- and 3-player games** — the engine is hardcoded to 4 seats. **M**
- **Multi-round matches** — no running match score across rounds; rematches
  increment the round counter and the previous winner leads. **S–M**

## Feel & UX polish

- **True FLIP animation** — cards currently glide from the seat edge, not from the
  exact tapped card. **S–M** — pure juice.
- **Instant-win fanfare** — the game just ends with the normal summary; no
  "THẮNG TRẮNG!" moment. **S**
- **Win/loss stats** — no record of your history against the bots. **S–M**
- **Per-seat bot personalities** — Settings applies one difficulty to all bots; the
  engine supports a mixed table, the UI doesn't expose it. **S**
- **Settings persistence** — theme/mute survive reloads; difficulty and rule flags
  don't. **S**
- **Onboarding/tutorial** — only the static rules modal; no guided first game. **M**
- **Keyboard & screen-reader depth** — buttons are focusable, but a full
  keyboard-only game is awkward and game events aren't announced. **M**

## AI ceiling

- **Search-based hard bot** — the hard bot evaluates its own hand exactly but
  doesn't model opponents' likely holdings (card counting / Monte Carlo).
  Beatable by a strong human. **L**

## Platform & engineering

- **Online multiplayer, accounts, leaderboards** — needs a server + websockets;
  v1 is client-only by design. **L**
- **PWA** — install to phone home screen, play offline. **S**
- **Deployment** — local only today; the build is fully static, so hosting is easy. **S**
- **CI** — nothing runs the test suite automatically (and the project only just
  became a git repo). **S**

## Accepted trade-offs (not actionable)

- Hand tap strips are 22–24px on phones — the geometric maximum for 13 cards.
- The 4th-place player's `finishPlace` stays `null` internally; the UI infers it.
- `src/engine/events.ts` was never created — nothing needed it.
