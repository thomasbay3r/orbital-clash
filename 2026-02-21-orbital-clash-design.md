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

### Gravity Mechanic (Unique Selling Point)
- Each map contains 2-4 **gravity wells** (visualized as glowing vortexes)
- They attract everything: ships, projectiles, power-ups
- Tactical possibilities:
  - Curve shots around corners
  - Slingshot maneuvers for speed
  - Push enemies into gravity well centers (deals damage)
  - Gravity wells shift position/strength during matches

### Hit System
- Each ship has HP (health bar)
- At 0 HP: explosion + 3 second respawn
- Points awarded for eliminations and assists

---

## Ship Classes

| Class | HP | Speed | Primary Weapon | Special | Playstyle |
|-------|-----|-------|---------------|---------|-----------|
| **Viper** | Low | Very High | Fast dual shots | Phase Dash (brief invisibility + passes through obstacles) | Hit-and-run, flanking |
| **Titan** | Very High | Slow | Heavy single shots | Shield Bubble (absorbs damage for 3s) | Frontliner, control |
| **Specter** | Medium | High | Homing missiles (slow, slightly curving) | EMP Pulse (disables boost + special for nearby enemies) | Disruptor, anti-sniper |
| **Nova** | Medium | Medium | Spread shot (3 projectiles in fan pattern) | Gravity Bomb (places temporary mini gravity well) | Zone control, allrounder |

All ships available from the start. No pay-to-win mechanics.

---

## Mod System (Build Depth)

Each ship has **3 mod slots** configured before a match:

### Slot 1 - Weapon Mod
- **Piercing**: Projectiles pass through first enemy hit
- **Ricochet**: Projectiles bounce off arena walls
- **Gravity-Sync**: Projectiles are more strongly attracted by gravity wells (extreme curve shots)
- **Rapid Fire**: Higher fire rate, less damage per hit

### Slot 2 - Ship Mod
- **Afterburner**: Longer boost duration, slower regeneration
- **Hull Plating**: +25% HP, -15% speed
- **Drift Master**: Reduced drift resistance = faster direction changes
- **Gravity Anchor**: Less affected by gravity wells

### Slot 3 - Passive Mod
- **Scavenger**: Eliminated enemies drop HP pickups
- **Overcharge**: After 3 consecutive hits, next shot deals double damage
- **Ghost Trail**: Engine leaves a short trail that deals minor damage to enemies
- **Radar**: Shows enemies at map edges even when not visible

### Unlocking
- Mods unlock through XP/levels
- Each slot starts with one base mod
- Every mod has clear trade-offs (no strictly-better options)

---

## Game Modes

| Mode | Players | Duration | Description |
|------|---------|----------|-------------|
| **Deathmatch** | 2-6 | 2 min | Most kills wins |
| **King of the Asteroid** | 2-6 | 3 min | Hold a central point. Seconds on point = score. First to 60 wins |
| **Gravity Shift** | 2-4 | 2.5 min | Gravity wells move and change strength every 15 seconds. Chaos mode! |
| **Duel** | 1v1 | Best of 3 | Pure skill matches. Small arena, one gravity well |

---

## Maps

### 1. Nebula Station
- Medium size, symmetrical
- 2 gravity wells placed opposite each other
- Good for learning

### 2. Asteroid Belt
- Large, asteroids provide cover
- 3 gravity wells in triangle formation
- Tactical, favors positioning

### 3. The Singularity
- Small arena
- One massive central gravity well
- Everything pulled toward center
- Intense, close-quarters combat

---

## Progression System

### XP & Levels
- XP earned per match (win bonus, elimination bonus)
- Level-ups unlock: mods, skins, titles, explosion effects

### Rank System
- Bronze > Silver > Gold > Platinum > Diamond
- Based on win/loss ratio
- Displayed next to player name

### Cosmetic Unlocks
- Ship color variants and particle effects
- Titles ("Asteroid Hunter", "Gravity Master")
- Custom explosion effects on eliminations

---

## Matchmaking

- **Quick Queue**: Select mode, auto-matched by rank
- **Private Lobbies**: Create a room code, share with friends
- **Party System**: Group up with friends, queue together

---

## Technical Architecture

### Frontend
- **HTML5 Canvas** for rendering
- **TypeScript** for game logic
- Client-side prediction for smooth feel despite network latency
- Responsive design (desktop + tablet)

### Backend
- **Cloudflare Workers** for API endpoints (auth, matchmaking, stats)
- **Cloudflare Durable Objects** for game rooms (WebSocket-based real-time communication)
- **Cloudflare D1** (SQLite) for player accounts, progression, statistics
- **Cloudflare Pages** for hosting static frontend files

### Server Architecture
- Server is **authoritative**: physics and game logic run on server
- Client sends inputs, receives game state updates
- Prevents cheating in competitive environment

### Game Loop
- Server physics tick: 60 FPS
- Client input send rate: ~30/s
- Server state broadcast: ~20/s (client interpolates between updates)

### Accounts
- Simple registration: username + password (no email required for kids)
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

### Color Palette
- Background: Deep dark blue (#0a0e27)
- Viper: Cyan (#00f0ff)
- Titan: Orange (#ff6b00)
- Specter: Violet (#b44aff)
- Nova: Green (#00ff88)
- Gravity wells: Magenta (#ff0080) with transparency
- Projectiles: White glow with ship color accent

### Rendering Approach
- All graphics are programmatic (Canvas API) - no external image assets
- Particle system for engines, shots, explosions, gravity effects
- Glow effects via shadow blur
- Fast load times, modern stylish look

---

## Audio (Phase 2)

- Web Audio API for sound effects (shots, explosions, boost)
- Ambient background drone (space atmosphere)
- Generated programmatically or via free sound libraries

---

## Development Phases

### Phase 1: Core Engine
- Ship physics (movement, drift, rotation)
- Gravity well mechanics
- Projectile system with gravity interaction
- Single-player test arena

### Phase 2: Multiplayer
- Cloudflare Durable Objects WebSocket rooms
- Server-authoritative game loop
- Client-side prediction and interpolation
- Lobby system with room codes

### Phase 3: Content & Polish
- All 4 ship classes with unique weapons/specials
- Mod system with unlocking
- 4 game modes
- 3 maps
- Particle effects, glow, visual polish

### Phase 4: Progression & Meta
- Account system (registration, login)
- XP, levels, rank system
- Cosmetic unlocks
- Matchmaking by rank

### Phase 5: Audio & Final Polish
- Sound effects
- Ambient audio
- UI/UX polish
- Performance optimization
- Bug fixing and balancing
