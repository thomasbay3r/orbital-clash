# Orbital Clash - Game Design Document

## Overview

**Orbital Clash** is a top-down multiplayer space arena game running in the browser. Players pilot customizable spaceships in fast 2-3 minute matches, using gravity wells to curve shots, slingshot around the arena, and outmaneuver opponents.

**Target audience:** Kids 11-13 who enjoy Brawl Stars, Clash Royale, Minecraft, Roblox
**Platform:** Web browser (HTML5 Canvas)
**Scope:** Multi-week project

---

## Core Gameplay

### Controls (Mouse + Keyboard)
- **WASD** = Thrust in direction (ships drift in space - no instant stopping)
- **Mouse** = Aim (ship rotates toward cursor)
- **Left click** = Primary weapon (ship-dependent)
- **Right click / Space** = Special ability (cooldown-based)
- **Shift** = Boost (short speed burst, limited energy that regenerates)

### Control Modes
- **Standard (WASD)**: WASD = absolute direction, Mouse = aim
- **Ship-Relative**: W/S = forward/back, A/D = strafe left/right, Mouse = aim

### Gravity Mechanic (Unique Selling Point)
- Each map contains 1-3 **gravity wells** (visualized as glowing vortexes)
- They attract everything: ships, projectiles, power-ups
- Tactical possibilities:
  - Curve shots around corners
  - Slingshot maneuvers for speed
  - Push enemies into gravity well centers (deals damage)
  - Gravity wells shift position/strength during matches (Gravity Shift mode)

### Hit System
- Each ship has HP (health bar visible above ship)
- At 0 HP: explosion + 3 second respawn
- 2.5 seconds of respawn invulnerability (cancelled by shooting)
- Points awarded for eliminations

---

## Ship Classes

| Class | HP | Speed | Primary Weapon | Special | Playstyle |
|-------|-----|-------|---------------|---------|-----------|
| **Viper** | 120 | 280 | Fast dual shots | Phase Dash (brief invisibility + passes through obstacles) | Hit-and-run, flanking |
| **Titan** | 220 | 150 | Heavy single shots | Shield Bubble (absorbs damage for 3s) | Frontliner, control |
| **Specter** | 150 | 240 | Homing missiles (slow, slightly curving) | EMP Pulse (disables boost + special for nearby enemies) | Disruptor, anti-sniper |
| **Nova** | 150 | 200 | Spread shot (3 projectiles in fan pattern) | Gravity Bomb (places temporary mini gravity well) | Zone control, allrounder |

All ships available from the start. No pay-to-win mechanics.

---

## Mod System (Build Depth)

Each ship has **3 mod slots** configured before a match:

### Slot 1 - Weapon Mod
- **Piercing**: Projectiles pass through first enemy hit
- **Ricochet**: Projectiles bounce off arena walls
- **Gravity-Sync**: Projectiles are more strongly attracted by gravity wells (extreme curve shots)
- **Rapid Fire**: +40% fire rate, -30% damage per hit

### Slot 2 - Ship Mod
- **Afterburner**: Longer boost duration, slower regeneration
- **Hull Plating**: +25% HP, -15% speed
- **Drift Master**: Reduced friction, faster turns
- **Gravity Anchor**: Less affected by gravity wells (30% gravity effect)

### Slot 3 - Passive Mod
- **Scavenger**: Eliminated enemies drop HP pickups
- **Overcharge**: After 3 consecutive hits, next shot deals double damage
- **Ghost Trail**: Engine leaves a short trail that damages enemies
- **Radar**: Shows enemies at map edges even when not visible

### Unlocking
- Mods unlock through XP/levels (level 1-7)
- Each slot starts with base mods available
- Every mod has clear trade-offs (no strictly-better options)

---

## Game Modes

| Mode | Players | Duration | Description |
|------|---------|----------|-------------|
| **Deathmatch** | 2-6 | 2 min | Most kills wins |
| **King of the Asteroid** | 2-6 | 3 min | Hold a central point. Seconds on point = score. First to 60 wins |
| **Gravity Shift** | 2-4 | 2.5 min | Gravity wells move and change strength every 15 seconds. Chaos mode! |
| **Duel** | 1v1 | Best of 3 (first to 2 kills) | Pure skill matches. Small arena, one gravity well |

---

## Maps

### 1. Nebula Station
- Medium size (1200x1000), symmetrical
- 2 gravity wells placed opposite each other
- Good for learning

### 2. Asteroid Belt
- Large (1600x1200), asteroids provide cover
- 3 gravity wells in triangle formation
- Tactical, favors positioning

### 3. The Singularity
- Small arena (1200x1200)
- One massive central gravity well (strength 2.0)
- Everything pulled toward center
- Intense, close-quarters combat

---

## Bot System

### Difficulty Presets (5 Levels)

| # | Name | Description | Difficulty |
|---|------|-------------|-----------|
| 1 | Weltraumtourist | "Weiss kaum, wo oben ist" | 10% |
| 2 | Raumkadett | "Hat die Ausbildung fast bestanden" | 30% |
| 3 | Kopfgeldjaeger | "Nichts Persoenliches" | 50% (default) |
| 4 | Planetenbrecher | "Macht ganze Welten platt" | 75% |
| 5 | Lebensmuede | "Gnade? Nie gehoert" | 95% |

Presets control: aim error, shoot delay, shoot threshold, special usage probability, circle strafing behavior, approach/retreat distances, and boost usage.

Bot count is configurable (1-3) in local games. Duel mode always uses 1 bot.

---

## Progression System

### XP & Levels
- XP earned per match: 25 base + 50 per kill + 100 per win
- 200 XP per level, max level 50
- Level-ups unlock: mods, skins, titles

### Rank System
- Bronze (0) > Silver (5) > Gold (15) > Platinum (30) > Diamond (45)
- Based on player level
- Displayed next to player name

---

## Matchmaking

- **Private Lobbies**: Create a room code, share with friends (implemented)
- Room code displayed in lobby and during gameplay with copy-to-clipboard
- **Quick Queue**: Select mode, auto-matched by rank (planned)
- **Party System**: Group up with friends, queue together (planned)

---

## Technical Architecture

### Frontend
- **HTML5 Canvas** for rendering (all programmatic, no external assets)
- **TypeScript** for game logic
- **Vite** for build tooling
- Client-side prediction for local player movement
- Server reconciliation (30% blend toward server position)
- Remote player interpolation (lerp toward server positions)

### Backend
- **Cloudflare Workers** for API endpoints (auth, matchmaking, stats)
- **Cloudflare Durable Objects** for game rooms (WebSocket-based real-time communication)
- **Cloudflare D1** (SQLite) for player accounts, progression, statistics
- Static assets served via Workers `assets` binding

### Server Architecture
- Server is **authoritative**: physics and game logic run on server
- Client sends inputs, receives game state updates
- Prevents cheating in competitive environment

### Game Loop
- Server physics tick: 60 Hz
- Client input send rate: 30/s
- Server state broadcast: 20/s (client predicts between updates)

### Accounts
- Simple registration: username + password (no email required for kids)
- PBKDF2 password hashing, token-based auth
- Stores: level, XP, unlocked mods/skins, rank, statistics

---

## Visual Style: "Neon Space"

### Aesthetic
- Dark space background with subtle stars
- Ships: clean geometric shapes (triangles, polygons) with glowing neon outlines
- Each ship class has a signature color
- Gravity wells: pulsating, semi-transparent vortexes with particle effects
- Projectiles: glowing streaks with trails
- Explosions: particle fireworks in destroyed ship's color
- Invulnerability: blinking transparency + pulsing glow ring

### Color Palette
- Background: Deep dark blue (#0a0e27)
- Viper: Cyan (#00f0ff)
- Titan: Orange (#ff6b00)
- Specter: Violet (#b44aff)
- Nova: Green (#00ff88)
- Gravity wells: Magenta (#ff0080) with transparency
- Projectiles: White glow with ship color accent

### UI Language
- German (menus, settings, HUD, lobby)

---

## Audio

- Web Audio API for sound effects (shots, explosions, hits)
- All sounds generated programmatically (no external files)
- Triggered by game events: projectile count increase, HP decrease, death

---

## Implementation Status

### Completed
- Phase 1: Core engine (physics, gravity, projectiles, single-player with bots)
- Phase 2: Multiplayer (Durable Objects, WebSocket, client-side prediction, lobby with room codes)
- Phase 3: Content (4 ships, 12 mods, 4 modes, 3 maps, particle effects)
- Partial Phase 4: Account system (registration, login, D1 database)
- Audio: Programmatic sound effects
- Bot difficulty system (5 presets, configurable bot count)
- Respawn invulnerability (2.5s, visual feedback)
- Settings screen (difficulty, bot count selection)
- Copy-to-clipboard for room codes
- Control mode selection (standard / ship-relative)
- E2E tests with Playwright (27 tests: menu flow + gameplay)
- Unit tests with Vitest (82 tests: physics, simulation, mods, invulnerability, control modes)

### Planned
- Quick queue matchmaking
- Party system
- Cosmetic unlocks and progression UI
- Leaderboard display
- Performance optimization and balancing
