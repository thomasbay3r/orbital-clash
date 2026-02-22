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
      game.ts            # Main game orchestrator (menus, lobby, settings, play)
      input.ts           # Keyboard/mouse input handler
      bot.ts             # AI bot with difficulty presets
    rendering/
      renderer.ts        # Full Canvas renderer (ships, HUD, particles, invulnerability)
    audio/
      audio-manager.ts   # Programmatic sound effects
    network/
      connection.ts      # WebSocket client for multiplayer
  server/
    index.ts             # Worker entry: API routes, auth, matchmaking
    game-room.ts         # Durable Object: real-time game room
    schema.sql           # D1 database schema
  shared/
    types.ts             # All TypeScript types
    constants.ts         # Game config (ships, weapons, specials, mods, difficulty presets)
    physics.ts           # Vector math, gravity, collision detection
    maps.ts              # Map definitions (3 maps)
    game-simulation.ts   # Core game simulation engine (shared client/server)
    physics.test.ts      # Physics tests
    game-simulation.test.ts  # Simulation tests
    mods.test.ts         # Mod/mode/map tests
e2e/
  helpers.ts             # E2E test utilities (getTestState, waitForScreen)
  menu-flow.spec.ts      # Menu navigation E2E tests (16 tests)
  gameplay.spec.ts       # Gameplay E2E tests (11 tests)
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
- **4 game modes**: Deathmatch, Duel, King of the Asteroid, Gravity Shift
- **3 maps**: Nebula Station, Asteroid Belt, The Singularity
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

### Accounts & Progression
- PBKDF2 password hashing, token-based auth
- XP, levels, ranks (bronze through diamond)
- Mod/cosmetic unlock system via D1 database

## Menu Flow
```
Menu (ship, map, mode) → Mod-Select (weapon, ship, passive, control mode)
  → Settings (difficulty, bot count) → Local Game
  → Online Lobby (create/join room) → Multiplayer Game
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

## Key Design Decisions
- Server-authoritative: physics run on server, client sends inputs only
- All graphics are programmatic (Canvas API) — no external image assets
- All audio is programmatic (Web Audio API) — no external sound files
- Gravity wells are the core mechanic differentiating gameplay
- Physics always applies to all players regardless of input (gravity, friction, bounds)
- UI language is German
- Game design document: `2026-02-21-orbital-clash-design.md`
