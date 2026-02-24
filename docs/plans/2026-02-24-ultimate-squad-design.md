# Ultimate Squad Update — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Orbital Clash from a great arena game into the ultimate friend-group gaming experience with party management, tournaments, session tracking, and cinematic moments.

**Architecture:** All party/tournament state lives in a new `PartyRoom` Durable Object. Game rooms receive party context (mirror match settings, mutator roulette results) via config. Kill-cam uses a client-side ring buffer. Session leaderboard accumulates in the party DO across games.

**Tech Stack:** TypeScript, Cloudflare Workers + Durable Objects, D1, Canvas API, WebSocket

---

## Feature 1: Mirror Match

**What:** All players use identical loadout — same ship, same weapon mod, same ship mod, same passive mod. Pure skill, no excuses.

**Implementation:**
- New mutator `mirror-match` added to `MutatorId` type and `MUTATOR_CONFIGS`
- When active: game start overrides all players' loadouts with the host's selection (or random if enabled)
- In multiplayer: server enforces identical loadout from room config
- In local: player's loadout is copied to all bots
- Settings UI: toggleable like other mutators with [I] key
- Works standalone (no party system dependency)

**UX:** Player selects ship + mods normally, enables Mirror Match mutator, starts game → everyone gets same loadout. HUD shows "MIRROR MATCH" indicator.

---

## Feature 2: Party-System

**What:** Create a persistent party lobby, invite friends, play together across multiple games.

**Implementation:**
- New `PartyRoom` Durable Object (separate from `GameRoom`)
  - Stores: members, leader, chat, session stats, party settings
  - WebSocket connections for real-time member updates
  - Party persists across multiple game rounds
- API endpoints:
  - `POST /api/party/create` → returns partyId
  - `POST /api/party/:id/invite` → invite by userId
  - `WebSocket /api/party/:id/ws` → real-time party updates
- Party types already exist: `PartyState`, `PartyMember` (in types.ts)
- New screen: `party-lobby`
  - Shows all members with ready status
  - Leader controls: mode/map selection, start game, kick
  - Vote system: leader can enable voting for mode/map
  - Chat integrated
- Flow: Menu → Create/Join Party → Party Lobby → (Leader starts) → Game → Post-Game → Back to Party Lobby
- Party members auto-join the same game room when leader starts

**Member Limits:** 2-8 players per party.

---

## Feature 3: Session-Leaderboard

**What:** Live stats tracking across all games played in a party session. "Wer hat heute Abend dominiert?"

**Implementation:**
- Stats tracked in `PartyRoom` DO, accumulated across games:
  - Total Kills, Deaths, Wins, Damage Dealt
  - Best Kill Streak, Most Gravity Kills
  - Games Played, Win Rate %
- Displayed in party lobby between games
- Sortable by different stats
- Resets when party disbands (last member leaves)
- Post-game screen shows session standings alongside match results
- Fun "awards" at session end: "Kill-König", "Stirbt am meisten", "Scharfschütze" (best accuracy)

**Dependency:** Requires Party System (Feature 2).

---

## Feature 4: Mutator-Roulette

**What:** Before each round, a spinning wheel randomly selects 2-3 mutators. Optional ban phase.

**Implementation:**
- New pre-game phase: `mutator-roulette` screen (3-5 seconds)
- Animated wheel with all 10 mutators (9 existing + mirror-match)
- Wheel spins and lands on 2-3 random mutators
- Optional ban phase (party setting): each player votes to ban 1 mutator, majority wins
- Visual: spinning circle segments with mutator icons, dramatic slowdown, landing animation
- Sound: tick-tick-tick spinning sound, landing fanfare
- Works in party mode and solo (solo = just random selection, no bans)
- Integrates with game start flow: Party Lobby → Roulette → Game

**Dependency:** Works standalone but enhanced with Party System.

---

## Feature 5: Kill-Cam + Post-Game Highlights

### Kill-Cam (During Respawn)

**What:** When you die, a small overlay in the bottom-right shows the last 3 seconds before your death as a mini replay.

**Implementation:**
- Client-side ring buffer: stores last 180 frames (3s at 60fps) of all player positions, rotations, health, projectile positions
- On death: freeze the buffer, render it as a small (320×200) canvas overlay
- Overlay shows: killer highlighted in red, victim path, projectile trajectory, final hit
- Plays during existing 2.5s respawn invulnerability — no gameplay delay
- Press any key to dismiss early
- Simplified rendering: ships as triangles, projectiles as dots, gravity wells as circles, no particles

### Post-Game Highlights

**What:** Before the scoreboard, show "Top 3 Kills" of the match as animated stat cards.

**Implementation:**
- Kill scoring system: each kill gets a "impressiveness" score based on:
  - Distance (long-range = more points)
  - Kill type (gravity-well kill, ricochet = bonus)
  - Multi-kill within 2s (double, triple = bonus)
  - Low-health survival (killer had <20% HP = bonus)
- Top 3 kills displayed as cards with:
  - Killer → Victim names
  - Kill type icon
  - "Impressiveness" descriptor ("FERNSCHUSS!", "GRAVITY MASTER!", "DOPPELKILL!")
- 2s per card, total 6s highlight sequence
- Skip with Enter/Space

---

## Feature 6: Turnier-Modus ("Abend-Turnier")

**What:** 4-8 players, single-elimination bracket, best-of-3 per round. Eliminated players become spectators.

**Implementation:**
- New game flow: Party Lobby → "Turnier starten" → Bracket → Matches → Finale → Results
- Bracket logic (client-side, managed by party leader):
  - 4 players: 2 semis + 1 final (3 matches)
  - 5-6 players: 2-3 first round + 2 semis + 1 final
  - 7-8 players: 4 quarters + 2 semis + 1 final
  - Odd numbers: random bye (auto-advance)
  - Seeding: random or by session leaderboard rank
- Bracket screen: visual bracket display, current match highlighted
- Spectator mode:
  - Eliminated players join game room as spectators (new connection type)
  - Spectators see full game state but can't interact
  - Spectator HUD: player names, health bars, score
  - Free camera or follow a player (Tab to switch)
- Match flow: bracket selects 2 players → duel mode → best-of-3 → winner advances
- Tournament results screen:
  - Champion with gold animation
  - MVP stats (most kills, best accuracy across all tournament matches)
  - Temporary "Champion" badge shown in party until next tournament

**Dependency:** Requires Party System (Feature 2).

---

## Implementation Order

1. **Mirror Match** — Quick standalone mutator, no dependencies
2. **Party System** — Foundation for everything else
3. **Session Leaderboard** — Builds on party, relatively simple
4. **Mutator Roulette** — Fun standalone feature, enhanced by party
5. **Kill-Cam + Highlights** — Independent, client-side heavy
6. **Tournament Mode** — Most complex, needs party + spectator

---

## Screens & Navigation (Updated)

```
Menu → Create Party (N) / Join Party (J) → Party Lobby
  Party Lobby:
    - Member list with ready status
    - Leader: Choose mode/map, enable voting, start game
    - Session Leaderboard tab
    - "Turnier starten" button
    - Chat
  Start Game → [Mutator Roulette if enabled] → Game → Post-Game Highlights → Scoreboard → Party Lobby
  Start Tournament → Bracket Screen → Match → ... → Tournament Results → Party Lobby
```

---

## Data Flow

```
PartyRoom (Durable Object)
  ├── Members[] (WebSocket connections)
  ├── SessionStats{} (accumulated across games)
  ├── PartySettings (roulette on/off, mirror match, voting)
  ├── TournamentState (bracket, current match, results)
  └── Chat messages

GameRoom (existing Durable Object)
  ├── Receives party config (mutators, mirror loadout)
  ├── Reports match results back to PartyRoom
  └── Spectator connections (read-only state broadcast)
```
