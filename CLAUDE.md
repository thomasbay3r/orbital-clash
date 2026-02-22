# Orbital Clash

Top-down multiplayer space arena game with gravity mechanics, running in the browser.

## Tech Stack
- **Frontend**: TypeScript + HTML5 Canvas + Vite
- **Backend**: Cloudflare Workers + Durable Objects (game rooms) + D1 (database)
- **Testing**: Vitest (61 tests across 3 test files)
- **Audio**: Programmatic Web Audio API (no external assets)

## Project Structure
```
src/
  client/
    main.ts              # Entry point
    game/
      game.ts            # Main game orchestrator (menu, lobby, play)
      input.ts           # Keyboard/mouse input handler
      bot.ts             # AI bot for single-player
    rendering/
      renderer.ts        # Full Canvas renderer (ships, HUD, particles)
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
    constants.ts         # Game config (ships, weapons, specials, mods)
    physics.ts           # Vector math, gravity, collision detection
    maps.ts              # Map definitions (3 maps)
    game-simulation.ts   # Core game simulation engine (shared client/server)
    physics.test.ts      # Physics tests (25 tests)
    game-simulation.test.ts  # Simulation tests (22 tests)
    mods.test.ts         # Mod/mode/map tests (14 tests)
public/
  index.html             # HTML entry point with canvas
```

## Commands
- `npm run dev:client` - Start Vite dev server (client)
- `npm run dev:server` - Start wrangler dev (Workers)
- `npm run build` - Build client for production
- `npm run deploy` - Deploy Workers to Cloudflare
- `npm run typecheck` - Run TypeScript type checking
- `npm test` - Run all tests with Vitest

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
- Circle-circle and circle-polygon collision detection

### Game Content
- **4 ship classes**: Viper (speed), Titan (tank), Specter (disruptor), Nova (zone control)
- **4 weapon types**: Pulse Cannon, Plasma Bolts, Phase Beam, Gravity Orbs
- **4 special abilities**: Phase Dash, Shield Bubble, EMP Pulse, Gravity Bomb
- **12 mods**: 4 weapon, 4 ship, 4 passive - each modifies gameplay
- **4 game modes**: Deathmatch, Duel, King of the Asteroid, Gravity Shift
- **3 maps**: Nebula Station, Asteroid Belt, The Singularity

### Multiplayer
- WebSocket via Durable Objects (game rooms)
- Server runs simulation at 60Hz, broadcasts state at 20Hz
- Room create/join via REST API, game via WebSocket

### Accounts & Progression
- PBKDF2 password hashing, token-based auth
- XP, levels, ranks (bronze through diamond)
- Mod/cosmetic unlock system via D1 database

## Key Design Decisions
- Server-authoritative: physics run on server, client sends inputs only
- All graphics are programmatic (Canvas API) - no external image assets
- All audio is programmatic (Web Audio API) - no external sound files
- Gravity wells are the core mechanic differentiating gameplay
- Physics always applies to all players regardless of input (gravity, friction, bounds)
- Game design document: `2026-02-21-orbital-clash-design.md`
