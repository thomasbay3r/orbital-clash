# Orbital Clash

Top-down multiplayer space arena game with gravity mechanics, running in the browser.

## Tech Stack
- **Frontend**: TypeScript + HTML5 Canvas + Vite
- **Backend**: Cloudflare Workers + Durable Objects (game rooms) + D1 (database)
- **Testing**: Vitest (unit) + Playwright (E2E)
- **Audio**: Programmatic Web Audio API (no external assets)
- **Deployment**: `https://orbital-clash.thomas-bay3r.workers.dev`

## Project Structure
```
src/
  client/
    main.ts              # Entry point
    game/
      game.ts            # Main game orchestrator (menus, lobby, social, play)
      input.ts           # Keyboard/mouse input handler
      bot.ts             # AI bot with difficulty presets
    rendering/
      renderer.ts        # Full Canvas renderer (ships, HUD, particles, invulnerability)
    audio/
      audio-manager.ts   # Programmatic sound effects
    network/
      api.ts             # REST API client (auth, friends, presence, matchmaking)
      connection.ts      # WebSocket client for multiplayer
  server/
    index.ts             # Worker entry: API routes, auth, friends, matchmaking
    game-room.ts         # Durable Object: real-time game room (chat, kill feed, rematch)
    schema.sql           # D1 database schema (accounts, friends, matches, etc.)
    email.ts             # Resend API helper for password reset emails
    guest-names.ts       # Space-themed guest name generator
  shared/
    types.ts             # All TypeScript types (game, social, auth)
    constants.ts         # Game config (ships, weapons, specials, mods, difficulty presets)
    physics.ts           # Vector math, gravity, collision detection
    maps.ts              # Map definitions (6 maps: 3 original + black-hole, wormhole-station, debris-field)
    game-simulation.ts   # Core game simulation engine (shared client/server)
    physics.test.ts      # Physics tests
    game-simulation.test.ts  # Simulation tests (85 tests)
    mods.test.ts         # Mod/mode/map tests
  server/
    guest-names.test.ts  # Guest name generator tests
e2e/
  helpers.ts             # E2E test utilities (getTestState, waitForScreen)
  menu-flow.spec.ts      # Menu navigation E2E tests (20 tests)
  gameplay.spec.ts       # Gameplay E2E tests (16 tests)
  social-screens.spec.ts # Social screen navigation E2E tests (9 tests)
public/
  index.html             # HTML entry point with canvas
```

## Commands
- `npm run dev:client` — Start Vite dev server (client)
- `npm run dev:server` — Start wrangler dev (Workers)
- `npm run build` — Build client for production
- `npm run deploy` — Deploy Workers to Cloudflare
- `npm run typecheck` — Run TypeScript type checking
- `npm test` — Run unit tests with Vitest
- `npm run test:e2e` — Run E2E tests with Playwright (Chromium, port 4173)

## Architecture

### Shared Game Simulation
The core game loop (`game-simulation.ts`) is shared between client and server.
- Client uses it for local single-player with bots
- Server uses it for authoritative multiplayer simulation
- `simulateTick(state, inputs, dt)` is the main entry point

### Physics System
- Gravity wells attract players and projectiles
- Ships have drift-based movement (thrust + friction)
- Arena bounds use velocity reflection (bounce off walls)
- Circle-circle collision detection

### Game Content
- **4 ship classes**: Viper (speed), Titan (tank), Specter (disruptor), Nova (zone control)
- **4 weapon types**: Dual-Shot, Heavy-Shot, Homing-Missile, Spread-Shot
- **4 special abilities**: Phase Dash, Shield Bubble, EMP Pulse, Gravity Bomb
- **12 mods**: 4 weapon, 4 ship, 4 passive — each modifies gameplay
- **8 game modes**: Deathmatch, Duel, King of the Asteroid, Gravity Shift, Asteroid Tag, Hot Potato, Capture the Core, Survival Wave
- **6 maps**: Nebula Station, Asteroid Belt, The Singularity, Black Hole, Wormhole Station, Debris Field
- **9 mutators**: Hypergravity, Zero-G, Big Head, Ricochet Arena, Glass Cannon, Mystery Loadout, Fog of War, Speed Demon, Friendly Fire
- **5 map events**: Asteroid Rain, Gravity Surge, Power Core, Shield Bubble, EMP Storm
- **2 control modes**: Standard (WASD absolute), Ship-Relative (W/S forward/back, A/D strafe)

### Bot System
- 5 difficulty presets (Weltraumtourist through Lebensmuede)
- Preset-driven AI: aim error, shoot delay, shoot threshold, special probability, circle strafing
- Configurable bot count (1-3) in settings screen before local game

### Respawn Invulnerability
- 2.5s invulnerability after respawn
- Blocks all damage (projectiles, gravity wells, EMP)
- Cancelled when player fires
- Visual: blinking transparency + pulsing glow ring

### Multiplayer
- WebSocket via Durable Objects (game rooms with room codes)
- Server runs simulation at 60Hz, broadcasts state at 20Hz
- Client-side prediction: local player movement simulated locally for instant feedback
- Server reconciliation: soft-correct predicted position toward server (30% blend)
- Remote player interpolation: lerp toward server positions for smooth movement
- Room code display in lobby and HUD with copy-to-clipboard
- Room create/join via REST API, game via WebSocket

### Accounts & Auth
- Dual auth: guest sessions (auto-created) + full accounts (email/username/password)
- PBKDF2 password hashing, token-based auth (base64 JSON + SHA-256 hash, 7-day expiry)
- Password reset via Resend email API
- Guest-to-account migration preserves progress
- XP, levels, ranks (bronze through diamond)

### Social Features
- **Friends**: Add/remove, search by username, recent players, online presence
- **Presence**: KV-based polling (120s TTL heartbeat, 30s client interval)
- **Invites**: KV-based with 60s expiry, in-game banner notifications
- **Chat**: In-game chat overlay (T to open), 200 char limit, broadcast via GameRoom DO
- **Kill Feed**: Real-time HUD with kill types (normal, ricochet, homing, gravity-well, emp)
- **Combo/Killstreak**: Client-side tracking with announcements (Doppelkill, Triplekill, etc.)
- **Post-Game**: Scoreboard with stats, XP gained, rematch voting (majority threshold)
- **Matchmaking**: Stateless queue via KV, 30s bot-fill timeout

### KV Namespaces
- `KV` binding for presence, matchmaking queue, and invites

## Menu Flow
```
Menu (ship, map, mode) → Mod-Select (weapon, ship, passive, control mode)
  → Settings (difficulty, bot count) → Local Game
  → Online Lobby (create/join room) → Multiplayer Game
Additional screens (from menu):
  F → Friends (account only)  |  P → Profile  |  L → Login/Register
  Space → Quick Play (matchmaking)
Post-game: Scoreboard → Enter=Rematch  |  Esc=Menu
```

## Testing Rules

### Before committing
1. Run `npx tsc --noEmit` — must pass with zero errors
2. Run `npm test` — all unit tests must pass
3. Run `npm run test:e2e` — all Playwright E2E tests must pass

### When to write/update tests
- **Unit tests** (`src/shared/*.test.ts`): When changing game simulation, physics, constants, types, or mods
  - Test new game mechanics (damage, invulnerability, movement, collisions)
  - Test config consistency (ship→weapon→special mappings, valid ranges)
  - Test difficulty presets and balance changes
- **E2E tests** (`e2e/*.spec.ts`): When changing UI flow, menus, screens, or user-facing behavior
  - Menu navigation and screen transitions
  - Settings (difficulty, bot count, control mode)
  - Gameplay startup and state verification
  - Use `getTestState(page)` helper to read game state (canvas-based, no DOM queries)
  - Use keyboard events for interaction (Enter, Escape, 1-4, Q/E, arrows, etc.)

### E2E test patterns
- Game exposes `window.__game._testState` for Playwright inspection
- `waitForGameReady(page)` before each test
- `waitForScreen(page, "screen-name")` for navigation assertions
- Playwright uses port 4173 (avoid 3000-3001, those are Docker)

## Deployment

- `npm run deploy` deploys to Cloudflare Workers
- Auto-deploy hook: runs automatically after every `git push` (via `.claude/hooks/deploy-after-push.js`)
- Always deploy after pushing changes that affect the client or server

## Browser-Testing (Playwright)

Two Playwright integrations are available:

**Playwright MCP Plugin** (visual audits via `browser_*` tools):

| Command | When | What |
|---------|------|------|
| `/visual-testing` | After feature implementation, before PR | Full audit: all views, responsive, console, network, a11y |
| `/visual-review <url>` | Quick check during development | Desktop + mobile screenshot, console errors |
| `/smoke-test <url>` | After small changes | Click all buttons/links, check for errors |

**playwright-skill** (custom script automation, plugin: lackeyjb):
- Auto-triggers when writing/running Playwright scripts
- Best-practice locators (`getByRole`, `getByText`), proper wait strategies
- For: complex user flows, E2E test generation, multi-step interactions
- **ALWAYS use `headless: true`** — no visible browser popup

- Default URL: `http://localhost:4173` (Vite dev server)
- Before PR: All critical issues from `/visual-testing` must be fixed
- Screenshots are saved as PNGs in the working directory

## Development Workflow

This project uses the following automated workflow. Do NOT skip steps.

### For new features / changes:
1. **Brainstorming** — describe what you want to build. The `brainstorming` skill triggers automatically to explore requirements and design approaches.
2. **Planning** — after design approval, the `writing-plans` skill creates a step-by-step implementation plan.
3. **Implementation** — `subagent-driven-development` or `executing-plans` works through the plan. During implementation:
   - `test-driven-development` writes tests before code (automatic)
   - `systematic-debugging` activates on unexpected behavior (automatic)
   - `requesting-code-review` reviews after each task (automatic)
   - `verification-before-completion` requires evidence before claims (automatic)
4. **QA Audit** — before creating a PR, the `qa-audit` skill runs automatically: visual testing, security review, test coverage gaps, documentation completeness. Complements (does not replace) `verification-before-completion`.
5. **Branch completion** — `finishing-a-development-branch` presents merge/PR options.

### For small bugfixes:
1. `systematic-debugging` → find root cause
2. `test-driven-development` → write failing test, then fix
3. `qa-audit` → verify nothing else broke
4. Commit

### Rules:
- NEVER skip qa-audit before a PR.
- NEVER claim work is done without evidence (verification-before-completion enforces this).
- ALL new logic code MUST have tests (commit hooks warn if missing).

Workflow guide: `docs/workflow-guide.html`

## Documentation Maintenance

**Before EVERY commit, check and update as needed. Not as a batch at the end, but per commit.**

| File | Update when ... |
|------|----------------|
| `README.md` | Project structure, features, setup, or usage changes |
| `CLAUDE.md` | Workflows, conventions, or rules change |
| `AGENTS.md` | Workflows, conventions, or rules change (keep in sync with CLAUDE.md) |

Inconsistent documentation = quality defect equivalent to a failing test.

### MCP Server: context7

Configured in `.mcp.json` (repo root). Provides live documentation at session start.

## Claude Code Automations

### Hooks (`.claude/settings.json`)

| Hook | Type | Effect |
|------|------|--------|
| Deploy after push | PostToolUse (Bash) | Auto-deploys to Cloudflare after `git push` |
| JS Syntax-Check | PostToolUse (Edit/Write) | Runs `node --check` after JS file changes |
| .env/Lock protection | PreToolUse (Edit/Write) | Blocks changes to `.env*` and `package-lock.json` |
| Commit checklist | PreToolUse (Bash) | Warns if src/ files staged without tests, or no .md files in commit |

### Subagents (`.claude/agents/`)

| Agent | File | When to use |
|-------|------|-------------|
| Test Writer | `test-writer.md` | When adding/changing simulation, physics, or constants in `src/shared/` |
| Security Reviewer | `security-reviewer.md` | When changing Worker, auth, D1 queries, or WebSocket handling |

Subagents are not auto-invoked. Call via Task tool when needed.

### CI (`.github/workflows/tests.yml`)

Runs automatically on push to `main` and on PRs:
1. **Typecheck** (`npx tsc --noEmit`) — must pass
2. **Unit tests** (`npm test`) — must pass (runs after typecheck)
3. **E2E tests** (`npm run test:e2e`) — must pass (runs after unit tests)

Failed Playwright reports are uploaded as artifacts (7 days retention).

## Key Design Decisions
- Server-authoritative: physics run on server, client sends inputs only
- All graphics are programmatic (Canvas API) — no external image assets
- All audio is programmatic (Web Audio API) — no external sound files
- Gravity wells are the core mechanic differentiating gameplay
- Physics always applies to all players regardless of input (gravity, friction, bounds)
- UI language is German
- Game design document: `2026-02-21-orbital-clash-design.md`
