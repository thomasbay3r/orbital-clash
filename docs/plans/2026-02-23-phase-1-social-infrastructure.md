# Phase 1: Social Infrastructure — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add guest/account system, friends, parties, chat, matchmaking, post-game screen, and kill-feed to Orbital Clash.

**Architecture:** Cloudflare Workers (stateless API) + D1 (persistent data) + KV (ephemeral presence/queue) + Durable Objects (GameRoom for real-time game + chat). Free-tier optimized: KV polling for presence instead of persistent WebSockets.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, KV, Durable Objects, Resend (email), Vite, Vitest, Playwright

---

## Task 1: D1 Schema Migration

Expand the database schema for accounts, guests, friends, and invites.

**Files:**
- Modify: `src/server/schema.sql`
- Modify: `wrangler.jsonc` (add KV binding)

**Step 1: Update schema.sql**

Replace the current `players` table and add new tables. The new schema must be backward-compatible — existing columns preserved, new columns added.

```sql
-- ===== ACCOUNTS =====

-- Rework players table: add email, rename for clarity
-- NOTE: SQLite doesn't support ALTER ADD COLUMN with constraints easily,
-- so we create new tables and migrate if needed.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  rank TEXT DEFAULT 'bronze',
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  eliminations INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  total_damage INTEGER DEFAULT 0,
  total_gravity_kills INTEGER DEFAULT 0,
  equipped_skin TEXT DEFAULT 'default',
  equipped_trail TEXT DEFAULT 'default',
  equipped_kill_effect TEXT DEFAULT 'default',
  equipped_title TEXT DEFAULT '',
  equipped_badge TEXT DEFAULT '',
  equipped_emotes TEXT DEFAULT '["gg","wow","nochmal","sorry"]'
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  display_name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  last_seen TEXT DEFAULT (datetime('now')),
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0
);

-- ===== SOCIAL =====

CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  friend_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(account_id, friend_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  from_id TEXT NOT NULL REFERENCES accounts(id),
  to_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'pending',
  UNIQUE(from_id, to_id)
);

-- ===== MATCH HISTORY (reworked) =====

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mode TEXT NOT NULL,
  map TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  duration_seconds INTEGER DEFAULT 0,
  winner_id TEXT
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL REFERENCES matches(id),
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  ship_class TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  eliminations INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  damage_dealt INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  gravity_kills INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);

-- ===== PROGRESSION =====

CREATE TABLE IF NOT EXISTS unlocked_cosmetics (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  cosmetic_id TEXT NOT NULL,
  cosmetic_type TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, cosmetic_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  challenge_type TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  target INTEGER NOT NULL,
  completed INTEGER DEFAULT 0,
  reward_xp INTEGER DEFAULT 0,
  reward_token TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recent_players (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  other_id TEXT NOT NULL REFERENCES accounts(id),
  last_played TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, other_id)
);
```

**Step 2: Add KV namespace to wrangler.jsonc**

Add KV binding for presence and matchmaking queue:

```jsonc
// Add to wrangler.jsonc under top-level:
"kv_namespaces": [
  { "binding": "KV", "id": "<will-be-created>" }
]
```

Create the KV namespace via CLI:
```bash
npx wrangler kv namespace create ORBITAL_KV
```
Then paste the returned ID into wrangler.jsonc.

**Step 3: Commit**
```
feat: expand D1 schema for social features + add KV binding
```

---

## Task 2: Shared Types Expansion

Add all new types needed for social features.

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add new types after existing types**

```typescript
// ===== Account & Auth Types =====

export interface Account {
  id: string;
  username: string;
  email: string;
  xp: number;
  level: number;
  rank: Rank;
  wins: number;
  losses: number;
  eliminations: number;
  totalGames: number;
  equippedSkin: string;
  equippedTrail: string;
  equippedKillEffect: string;
  equippedTitle: string;
  equippedBadge: string;
  equippedEmotes: string[];
}

export interface GuestSession {
  id: string;
  displayName: string;
  token: string;
  xp: number;
  level: number;
}

export interface AuthUser {
  type: 'account' | 'guest';
  id: string;
  displayName: string;
  level: number;
}

// ===== Social Types =====

export type PresenceStatus = 'online-menu' | 'online-ingame' | 'offline';

export interface FriendInfo {
  id: string;
  username: string;
  level: number;
  rank: Rank;
  presence: PresenceStatus;
  roomId?: string; // if in-game, room to join
  equippedTitle: string;
  equippedBadge: string;
}

export interface FriendRequest {
  id: string;
  fromId: string;
  fromUsername: string;
  toId: string;
  toUsername: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface PartyMember {
  id: string;
  displayName: string;
  level: number;
  ready: boolean;
  isLeader: boolean;
}

export interface PartyState {
  id: string;
  members: PartyMember[];
  leaderId: string;
  selectedMode: GameMode;
  selectedMap: MapId;
  chatMessages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface Invite {
  fromId: string;
  fromName: string;
  roomId?: string;
  partyId?: string;
  expiresAt: number;
}

// ===== Matchmaking Types =====

export interface QueueEntry {
  playerId: string;
  playerName: string;
  shipClass: ShipClass;
  mods: ModLoadout;
  controlMode: ControlMode;
  partyId?: string;
  joinedAt: number;
}

export interface MatchResult {
  matchId: string;
  mode: GameMode;
  map: MapId;
  duration: number;
  players: MatchPlayerResult[];
  winnerId: string | null;
}

export interface MatchPlayerResult {
  id: string;
  name: string;
  shipClass: ShipClass;
  score: number;
  eliminations: number;
  deaths: number;
  damageDealt: number;
  accuracy: number;
  gravityKills: number;
}

// ===== Kill Feed Types =====

export type KillType = 'normal' | 'gravity-well' | 'ricochet' | 'homing' | 'melee' | 'emp';

export interface KillEvent {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  killType: KillType;
  timestamp: number;
}

// ===== Post-Game Types =====

export interface PostGameData {
  matchResult: MatchResult;
  xpGained: number;
  newLevel: number | null;
  challengeProgress: { challengeId: string; progress: number; target: number; completed: boolean }[];
}
```

**Step 2: Extend ClientMessage and ServerMessage**

Add new message types to the existing union types:

```typescript
// Extend ClientMessage:
export type ClientMessage =
  | { type: "join"; name: string; shipClass: ShipClass; mods: ModLoadout; controlMode?: ControlMode }
  | { type: "input"; input: PlayerInput }
  | { type: "leave" }
  | { type: "chat"; text: string }
  | { type: "rematch-vote" };

// Extend ServerMessage:
export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "joined"; playerId: string }
  | { type: "countdown"; seconds: number }
  | { type: "game-over"; scores: Record<string, number>; winnerId: string | null }
  | { type: "kill"; event: KillEvent }
  | { type: "error"; message: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "post-game"; data: PostGameData }
  | { type: "rematch"; votes: number; needed: number };
```

**Step 3: Add kill tracking fields to GameState**

Extend GameState to track stats during the match:

```typescript
// Add to GameState interface:
export interface GameState {
  // ... existing fields ...
  killFeed: KillEvent[];
  playerStats: Record<string, {
    damageDealt: number;
    shotsFired: number;
    shotsHit: number;
    gravityKills: number;
  }>;
}
```

**Step 4: Commit**
```
feat: add social, matchmaking, and kill-feed types
```

---

## Task 3: Env Interface & Worker Bindings

Update the Worker environment interface and add utility functions.

**Files:**
- Modify: `src/server/index.ts` (Env interface, helpers)

**Step 1: Update Env interface**

```typescript
export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  DB: D1Database;
  KV: KVNamespace;
  RESEND_API_KEY: string; // secret, set via wrangler secret
  APP_URL: string; // e.g. https://orbital-clash.thomas-bay3r.workers.dev
}
```

**Step 2: Add email utility (Resend)**

Create new file `src/server/email.ts`:

```typescript
export async function sendPasswordResetEmail(
  env: { RESEND_API_KEY: string; APP_URL: string },
  email: string,
  resetToken: string,
): Promise<boolean> {
  const resetUrl = `${env.APP_URL}?reset=${resetToken}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Orbital Clash <noreply@orbital-clash.com>",
      to: [email],
      subject: "Passwort zuruecksetzen — Orbital Clash",
      html: `
        <h2>Passwort zuruecksetzen</h2>
        <p>Klicke auf den Link um dein Passwort zurueckzusetzen:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>Der Link ist 1 Stunde gueltig.</p>
        <p>Falls du das nicht angefordert hast, ignoriere diese E-Mail.</p>
      `,
    }),
  });

  return res.ok;
}
```

**Step 3: Add guest name generator**

Create new file `src/server/guest-names.ts`:

```typescript
const PREFIXES = [
  "Komet", "Nebula", "Pulsar", "Quasar", "Nova", "Meteor",
  "Stellar", "Astral", "Orbital", "Cosmic", "Solar", "Lunar",
  "Plasma", "Photon", "Neutron", "Zenith", "Vortex", "Eclipse",
];

export function generateGuestName(): string {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}_${number}`;
}
```

**Step 4: Commit**
```
feat: add Env bindings, Resend email helper, guest name generator
```

---

## Task 4: Auth API — Guest System

Implement guest auto-creation and token management.

**Files:**
- Modify: `src/server/index.ts` (add guest endpoints)

**Step 1: Add guest endpoints**

```typescript
// POST /api/auth/guest — Create or refresh guest session
// Returns: { token, displayName, id }
// If Authorization header has valid guest token, refresh last_seen and return existing
// Otherwise create new guest

// GET /api/auth/me — Return current user info (works for both guest and account)
// Authorization: Bearer <token>
// Returns: AuthUser { type, id, displayName, level }
```

Implementation:
- `POST /api/auth/guest`: Check for existing token in header. If valid guest token → refresh `last_seen`, return existing. If not → generate name, create UUID token, insert into `guest_sessions`, return.
- `GET /api/auth/me`: Parse token → try account auth first, then guest auth. Return `AuthUser`.
- Guest token format: plain UUID (no expiry — guests persist until localStorage cleared).

**Step 2: Commit**
```
feat: add guest session API endpoints
```

---

## Task 5: Auth API — Account Registration & Login Rework

Rework registration to require email + password + username. Add password reset.

**Files:**
- Modify: `src/server/index.ts` (rework register/login, add reset endpoints)

**Step 1: Rework registration endpoint**

`POST /api/auth/register`:
- Body: `{ email, username, password }`
- Validate: email format, username 3-20 chars alphanumeric+underscore, password 6+ chars
- Check unique email AND unique username in `accounts` table
- Hash password with existing PBKDF2 function
- Optional: if `guestToken` in body, migrate guest XP/level to new account
- Return: `{ token, id, username }`

**Step 2: Rework login endpoint**

`POST /api/auth/login`:
- Body: `{ email, password }` (login by email, not username)
- Look up account by email
- Verify password hash
- Return: `{ token, id, username }`

**Step 3: Add password reset endpoints**

`POST /api/auth/forgot-password`:
- Body: `{ email }`
- Look up account by email
- Generate reset token (UUID), expires in 1 hour
- Insert into `password_resets` table
- Send email via Resend
- Always return success (don't leak whether email exists)

`POST /api/auth/reset-password`:
- Body: `{ token, newPassword }`
- Look up token in `password_resets`, check not expired and not used
- Hash new password, update `accounts`
- Mark token as used
- Return success

**Step 4: Commit**
```
feat: rework auth for email+username, add password reset via Resend
```

---

## Task 6: Friends API

Server-side friend management.

**Files:**
- Modify: `src/server/index.ts` (add friend endpoints)

**Step 1: Add friend endpoints**

All require authenticated account (not guest).

```
GET    /api/friends              — List friends with presence info
GET    /api/friends/requests     — List pending friend requests (incoming + outgoing)
POST   /api/friends/request      — Send friend request { username }
POST   /api/friends/accept       — Accept request { requestId }
POST   /api/friends/reject       — Reject request { requestId }
DELETE /api/friends/:friendId    — Remove friend (both directions)
GET    /api/friends/search       — Search users by username { q }
GET    /api/friends/recent       — List recent players
```

**Key implementation details:**

`GET /api/friends`:
- Query `friends` table for account_id
- For each friend, query KV for presence: `KV.get(`presence:${friendId}`)`
- KV value format: `{ status: "online-menu" | "online-ingame", roomId?: string, timestamp: number }`
- If no KV entry or timestamp > 60s old → offline
- Return: `FriendInfo[]`

`POST /api/friends/request`:
- Look up target by username
- Check not already friends, no existing pending request
- Insert into `friend_requests`
- Return: `{ id, toUsername }`

`POST /api/friends/accept`:
- Verify request exists and is for current user
- Insert two rows into `friends` (bidirectional)
- Update request status to 'accepted'

`GET /api/friends/search`:
- `SELECT id, username, level, rank FROM accounts WHERE username LIKE ?%  LIMIT 10`
- Exclude self, mark existing friends/requests

**Step 2: Commit**
```
feat: add friends API (request, accept, reject, remove, search, recent)
```

---

## Task 7: Presence Heartbeat API

KV-based presence system.

**Files:**
- Modify: `src/server/index.ts` (add presence endpoint)

**Step 1: Add presence endpoint**

```
POST /api/presence — Update presence heartbeat
Authorization: Bearer <token>
Body: { status: "online-menu" | "online-ingame", roomId?: string }
```

Implementation:
- Authenticate user (account or guest)
- Write to KV: `KV.put(`presence:${userId}`, JSON.stringify({ status, roomId, timestamp: Date.now() }), { expirationTtl: 120 })`
- TTL 120s = auto-cleanup if client stops heartbeating
- Return: 200 OK

```
POST /api/presence/check — Check presence of specific users
Body: { userIds: string[] }
Returns: Record<string, { status, roomId? }>
```

For batch presence checks (friends list), the client sends a list of friend IDs and gets back all their statuses in one request.

**Step 2: Commit**
```
feat: add KV-based presence heartbeat system
```

---

## Task 8: Invite System

KV-based invites with 60s expiry.

**Files:**
- Modify: `src/server/index.ts`

**Step 1: Add invite endpoints**

```
POST /api/invites/send — Send game invite to friend
Body: { targetId, roomId }

GET  /api/invites — Get pending invites for current user

POST /api/invites/dismiss — Dismiss an invite
Body: { inviteId }
```

Implementation:
- `POST /api/invites/send`: Write to KV: `KV.put(`invite:${targetId}:${fromId}`, JSON.stringify({ fromId, fromName, roomId, expiresAt: Date.now() + 60000 }), { expirationTtl: 60 })`
- `GET /api/invites`: List KV keys with prefix `invite:${userId}:`, return non-expired invites
- `POST /api/invites/dismiss`: Delete KV key

**Step 2: Commit**
```
feat: add KV-based invite system with 60s expiry
```

---

## Task 9: Quick-Play Matchmaker

Stateless matchmaker using KV queue.

**Files:**
- Modify: `src/server/index.ts`

**Step 1: Add matchmaking endpoints**

```
POST /api/matchmaking/join — Join quick-play queue
Body: { shipClass, mods, controlMode, partyId? }
Returns: { status: "queued" | "matched", roomId? }

POST /api/matchmaking/leave — Leave queue

GET  /api/matchmaking/status — Check queue status
Returns: { status: "queued" | "matched" | "not-queued", roomId?, playersInQueue: number }
```

Implementation:
- **Join**: Write player to KV queue: `KV.put(`queue:${Date.now()}:${playerId}`, JSON.stringify(entry), { expirationTtl: 120 })`
- **Match check**: On each join, list all queue entries. If >= 4 players (or 2 for duel), create GameRoom, return roomId to all matched players. Write matched state: `KV.put(`matched:${playerId}`, roomId, { expirationTtl: 30 })`.
- **Status**: Check `matched:${playerId}` first (instant match found), then check queue entry exists.
- **Leave**: Delete queue entry.
- After 30s without match: `GET /api/matchmaking/status` returns `{ status: "matched", roomId }` with a bot-filled room (server creates room with bots).

**Step 2: Commit**
```
feat: add KV-based quick-play matchmaker
```

---

## Task 10: GameRoom Enhancements — Chat, Kill Events, Post-Game, Rematch

Extend the existing Durable Object for chat, kill tracking, and post-game flow.

**Files:**
- Modify: `src/server/game-room.ts`
- Modify: `src/shared/game-simulation.ts` (kill event tracking, stats)

**Step 1: Add chat handling to GameRoom**

In `webSocketMessage()`, handle new message type `chat`:
- Validate text length (1-200 chars)
- Broadcast `{ type: "chat", message: { id, senderId, senderName, text, timestamp } }` to all sessions

**Step 2: Add kill event tracking to game-simulation.ts**

In `killPlayer()` function: push `KillEvent` to `state.killFeed[]`:
- Determine kill type: check projectile source (ricochet mod, homing, gravity-well damage, EMP, melee distance)
- `state.killFeed.push({ killerId, killerName, victimId, victimName, killType, timestamp: state.tick })`

Add player stats tracking in `dealDamage()` and `fireProjectile()`:
- Initialize `state.playerStats[playerId]` in `addPlayer()`
- Track: `damageDealt`, `shotsFired`, `shotsHit`, `gravityKills`

**Step 3: Add kill event broadcast in GameRoom**

In `broadcastState()` or alongside it, broadcast new kill events since last broadcast:
- Track `lastKillFeedIndex` per broadcast
- Send `{ type: "kill", event }` for each new kill

**Step 4: Add post-game data generation**

In GameRoom's game-over handler:
- Collect `MatchPlayerResult[]` from gameState
- Calculate XP: base 50 + 10*kills + 20*win
- Generate `PostGameData` per player
- Broadcast `{ type: "post-game", data }` to each player (personalized)

**Step 5: Add rematch voting**

Handle `rematch-vote` message:
- Track votes per session
- When majority (>50%) votes, create new game with same settings
- Broadcast `{ type: "rematch", votes, needed }` on each vote
- When threshold met, restart game loop with fresh gameState

**Step 6: Commit**
```
feat: add chat, kill tracking, post-game data, and rematch to GameRoom
```

---

## Task 11: Game Simulation — Kill Feed & Stats Integration

Add kill-feed and stats tracking to the shared simulation.

**Files:**
- Modify: `src/shared/game-simulation.ts`
- Create: `src/shared/kill-feed.test.ts`

**Step 1: Write tests for kill feed**

```typescript
describe("Kill Feed", () => {
  it("should record kill event when player dies from projectile", () => {
    // Setup: create state, add 2 players, fire projectile, simulate until kill
    // Assert: state.killFeed has 1 entry with correct killer/victim
  });

  it("should detect gravity-well kill type", () => {
    // Setup: player dies from gravity well damage
    // Assert: killType === "gravity-well"
  });

  it("should track damage dealt in playerStats", () => {
    // Setup: player hits another, simulate
    // Assert: state.playerStats[shooter].damageDealt > 0
  });

  it("should track shots fired and hit", () => {
    // Setup: fire, hit target
    // Assert: shotsFired >= 1, shotsHit >= 1
  });
});
```

**Step 2: Implement kill feed in game-simulation.ts**

- Initialize `killFeed: []` and `playerStats: {}` in `createGameState()`
- Initialize per-player stats in `addPlayer()`: `{ damageDealt: 0, shotsFired: 0, shotsHit: 0, gravityKills: 0 }`
- In `killPlayer()`: determine kill type, push to `killFeed`
- In `dealDamage()`: increment `damageDealt` for attacker
- In projectile creation: increment `shotsFired`
- In projectile hit: increment `shotsHit`

**Step 3: Run tests**
```bash
npm test
```

**Step 4: Commit**
```
feat: add kill feed and player stats tracking to game simulation
```

---

## Task 12: Client — Auth Manager & API Client

Client-side auth management and API helper.

**Files:**
- Create: `src/client/network/api.ts`

**Step 1: Create API client**

```typescript
const API_BASE = ""; // same origin

export class ApiClient {
  private token: string | null = null;
  private userType: "guest" | "account" | null = null;

  constructor() {
    this.token = localStorage.getItem("auth_token");
    this.userType = localStorage.getItem("auth_type") as any;
  }

  get isLoggedIn(): boolean { return !!this.token; }
  get isGuest(): boolean { return this.userType === "guest"; }
  get isAccount(): boolean { return this.userType === "account"; }

  private async fetch(path: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...options.headers as any };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  // Auth
  async initGuest(): Promise<AuthUser> { ... }
  async register(email: string, username: string, password: string, guestToken?: string): Promise<void> { ... }
  async login(email: string, password: string): Promise<void> { ... }
  async forgotPassword(email: string): Promise<void> { ... }
  async resetPassword(token: string, newPassword: string): Promise<void> { ... }
  async getMe(): Promise<AuthUser> { ... }
  logout(): void { localStorage.removeItem("auth_token"); localStorage.removeItem("auth_type"); this.token = null; }

  // Friends
  async getFriends(): Promise<FriendInfo[]> { ... }
  async getFriendRequests(): Promise<FriendRequest[]> { ... }
  async sendFriendRequest(username: string): Promise<void> { ... }
  async acceptFriendRequest(requestId: string): Promise<void> { ... }
  async rejectFriendRequest(requestId: string): Promise<void> { ... }
  async removeFriend(friendId: string): Promise<void> { ... }
  async searchUsers(query: string): Promise<{ id: string; username: string; level: number }[]> { ... }
  async getRecentPlayers(): Promise<{ id: string; username: string; level: number }[]> { ... }

  // Presence
  async heartbeat(status: PresenceStatus, roomId?: string): Promise<void> { ... }
  async checkPresence(userIds: string[]): Promise<Record<string, { status: PresenceStatus; roomId?: string }>> { ... }

  // Invites
  async sendInvite(targetId: string, roomId: string): Promise<void> { ... }
  async getInvites(): Promise<Invite[]> { ... }
  async dismissInvite(inviteId: string): Promise<void> { ... }

  // Matchmaking
  async joinQueue(shipClass: ShipClass, mods: ModLoadout, controlMode: ControlMode): Promise<{ status: string; roomId?: string }> { ... }
  async leaveQueue(): Promise<void> { ... }
  async getQueueStatus(): Promise<{ status: string; roomId?: string; playersInQueue: number }> { ... }
}
```

**Step 2: Commit**
```
feat: add client API client with auth, friends, presence, matchmaking
```

---

## Task 13: Client — New Screen System & Navigation

Add new screens: login, register, friends, profile. Rework the screen flow.

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Expand Screen type and add new state**

```typescript
type Screen = "loading" | "menu" | "mod-select" | "settings" | "playing"
  | "online-lobby" | "friends" | "login" | "register" | "profile"
  | "post-game" | "matchmaking";
```

New screen flow:
```
loading (auto-init guest) → menu
menu: F = friends, P = profile, L = login/register
friends: add/remove/accept friends, see online status, invite/join
post-game: shown after game ends, stats + nochmal/menu buttons
matchmaking: "Suche Mitspieler..." waiting screen
```

**Step 2: Add ApiClient to Game constructor**

```typescript
private api: ApiClient;
private currentUser: AuthUser | null = null;
private friends: FriendInfo[] = [];
private friendRequests: FriendRequest[] = [];
private invites: Invite[] = [];
private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
private postGameData: PostGameData | null = null;
private killFeed: KillEvent[] = [];
private killFeedTimers: number[] = [];
private comboCounter = 0;
private comboTimer = 0;
private killStreak = 0;
```

Initialize in constructor:
```typescript
this.api = new ApiClient();
```

On start, auto-init guest if no token:
```typescript
async start() {
  this.screen = "loading";
  if (!this.api.isLoggedIn) {
    const user = await this.api.initGuest();
    this.currentUser = user;
  } else {
    this.currentUser = await this.api.getMe();
  }
  this.startHeartbeat();
  this.screen = "menu";
  // ... existing start logic
}
```

**Step 3: Add presence heartbeat**

```typescript
private startHeartbeat(): void {
  this.heartbeatInterval = setInterval(async () => {
    const status = this.screen === "playing" ? "online-ingame" : "online-menu";
    await this.api.heartbeat(status, this.activeRoomCode || undefined).catch(() => {});
  }, 30_000);
  // Initial heartbeat
  this.api.heartbeat("online-menu").catch(() => {});
}
```

**Step 4: Update _testState to include new fields**

```typescript
get _testState() {
  return {
    screen: this.screen,
    selectedShip: this.selectedShip,
    selectedMap: this.selectedMap,
    selectedMode: this.selectedMode,
    selectedControlMode: this.selectedControlMode,
    selectedDifficulty: this.selectedDifficulty,
    selectedBotCount: this.selectedBotCount,
    isOnline: this.isOnline,
    gameState: this.gameState,
    currentUser: this.currentUser,
    killFeed: this.killFeed,
    postGameData: this.postGameData,
  };
}
```

**Step 5: Commit**
```
feat: add new screens, API client integration, presence heartbeat
```

---

## Task 14: Client — Friends Screen UI

Draw the friends screen on Canvas.

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Add friends screen drawing**

New method `drawFriends()`:
- Title: "FREUNDE (X/Y Online)"
- List friends with online status indicator (green/gray dot)
- For each friend: name, level, status text, action buttons (Beitreten/Einladen)
- Bottom: [Freund suchen] [Anfragen (N)] [Zurueck]
- Search overlay: text input for username search
- Request list overlay: incoming requests with accept/reject

Keyboard controls:
- ArrowUp/Down: navigate friend list
- Enter: action on selected friend (join/invite)
- S: open search
- A: show requests
- Escape: back to menu

**Step 2: Add keyboard handling for friends screen**

In `handleKeyPress()` add `else if (this.screen === "friends")` block.

**Step 3: Add friends data loading**

When entering friends screen:
```typescript
private async loadFriends(): Promise<void> {
  if (!this.api.isAccount) return;
  this.friends = await this.api.getFriends();
  this.friendRequests = await this.api.getFriendRequests();
}
```

**Step 4: Commit**
```
feat: add friends screen with online status, invite, and search
```

---

## Task 15: Client — Login & Register Screens

Canvas-based auth screens.

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Add text input system**

Since this is canvas-based, we need a simple text input state:
```typescript
private textInputActive: string | null = null; // field name
private textInputValue: string = "";
private textInputCursor = 0;
private textInputPassword = false; // mask input
```

Handle keyboard input when textInputActive:
- Printable chars → append
- Backspace → delete
- Enter → submit
- Escape → cancel
- Tab → next field

**Step 2: Draw login screen**

`drawLogin()`:
- Title: "ANMELDEN"
- Fields: E-Mail, Passwort (masked)
- Buttons: [Anmelden] [Registrieren] [Passwort vergessen] [Zurueck als Gast]
- Error message display area

**Step 3: Draw register screen**

`drawRegister()`:
- Title: "KONTO ERSTELLEN"
- Fields: E-Mail, Benutzername, Passwort, Passwort wiederholen
- Validation hints (min lengths, format)
- Buttons: [Registrieren] [Zurueck]
- If migrating from guest: "Dein Fortschritt wird uebernommen!"

**Step 4: Draw profile screen**

`drawProfile()`:
- Username, Level, XP bar, Rank
- Stats: Wins, Losses, Eliminations, Total Games
- Buttons: [Abmelden] [Zurueck]
- If guest: prompt to register

**Step 5: Commit**
```
feat: add login, register, and profile screens
```

---

## Task 16: Client — Post-Game Screen

Show match results, stats, XP gain, and rematch option.

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Handle server post-game message**

In `handleServerMessage()`, handle `post-game`:
```typescript
case "post-game":
  this.postGameData = msg.data;
  break;
```

For local games, generate PostGameData from local gameState when game ends.

**Step 2: Draw post-game screen**

`drawPostGame()`:
- Title: "RUNDE VORBEI!" (or winner name for deathmatch)
- Scoreboard: ranked by score, showing kills/deaths per player
- Personal stats: Damage, Accuracy, Gravity-Well-Kills
- XP bar animation: current XP → new XP, level-up flash if applicable
- Buttons: [Nochmal!] [Hauptmenue] [Freund hinzufuegen]
- Rematch vote counter if multiplayer: "2/3 wollen nochmal"

**Step 3: Change game-over flow**

Instead of going directly to menu on Enter after game-over:
- Transition to `post-game` screen
- Show results for 2s minimum
- Then allow [Nochmal!] or [Hauptmenue]

For local games: generate PostGameData locally:
```typescript
private generateLocalPostGame(): PostGameData {
  // Collect stats from gameState, calculate XP
}
```

**Step 4: Commit**
```
feat: add post-game screen with stats, XP animation, and rematch
```

---

## Task 17: Client — Kill Feed HUD

Show kill events during gameplay.

**Files:**
- Modify: `src/client/game/game.ts` (state tracking)
- Modify: `src/client/rendering/renderer.ts` (drawing)

**Step 1: Track kill events from server and local simulation**

In `updateGame()` for local games:
- After `simulateTick()`, check if `gameState.killFeed` has new entries
- Copy new entries to `this.killFeed`, add display timer (5s)

For online games:
- Handle `{ type: "kill", event }` from server, add to `this.killFeed`

**Step 2: Add kill feed rendering to renderer**

In `Renderer.render()`, after HUD drawing:
```typescript
// Kill feed - top right, below room code
private drawKillFeed(ctx: CanvasRenderingContext2D, killFeed: KillEvent[], localPlayerId: string): void {
  const maxVisible = 5;
  const x = ctx.canvas.width - 20;
  let y = 80;

  for (let i = Math.max(0, killFeed.length - maxVisible); i < killFeed.length; i++) {
    const event = killFeed[i];
    const isLocal = event.killerId === localPlayerId || event.victimId === localPlayerId;

    ctx.font = "12px monospace";
    ctx.textAlign = "right";

    // Killer name (colored)
    ctx.fillStyle = isLocal ? "#ffaa00" : "#cccccc";
    const killText = this.getKillText(event);
    ctx.fillText(killText, x, y);
    y += 18;
  }
}

private getKillText(event: KillEvent): string {
  switch (event.killType) {
    case "gravity-well": return `${event.killerName} ⟶ ${event.victimName} [Gravity]`;
    case "ricochet": return `${event.killerName} ⟶ ${event.victimName} [Ricochet]`;
    case "homing": return `${event.killerName} ⟶ ${event.victimName} [Homing]`;
    case "melee": return `${event.killerName} ⟶ ${event.victimName} [Nahkampf]`;
    default: return `${event.killerName} ⟶ ${event.victimName}`;
  }
}
```

**Step 3: Add combo/killstreak tracking**

In Game class, when processing kill events where local player is killer:
```typescript
private processKillEvent(event: KillEvent): void {
  if (event.killerId !== this.localPlayerId) {
    this.comboCounter = 0;
    return;
  }

  this.killStreak++;
  this.comboTimer = 3; // 3s combo window
  this.comboCounter++;

  // Announce combos
  if (this.comboCounter === 2) this.showAnnouncement("Doppelkill!");
  if (this.comboCounter === 3) this.showAnnouncement("Triplekill!");
  if (this.killStreak === 3) this.showAnnouncement("Killstreak!");
  if (this.killStreak === 5) this.showAnnouncement("Unaufhaltsam!");
}
```

**Step 4: Add announcement overlay to renderer**

Center-screen text that fades out over 2s. Large font, bright color.

**Step 5: Commit**
```
feat: add kill feed HUD, combo counter, and killstreak announcements
```

---

## Task 18: Client — Matchmaking Screen & Quick-Play Flow

Add the matchmaking waiting screen and Quick-Play button.

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Add Quick-Play button to menu**

In `handleKeyPress()` for menu screen, add key `Space`:
- Enter matchmaking flow
- Call `api.joinQueue(ship, mods, controlMode)`
- Switch to `matchmaking` screen

**Step 2: Draw matchmaking screen**

`drawMatchmaking()`:
- Title: "SUCHE MITSPIELER..."
- Animated dots (cycling: . → .. → ...)
- Player count: "2/4 Spieler gefunden"
- Ship preview of current selection
- [Abbrechen] button (Escape)

**Step 3: Poll for match**

Every 2s, call `api.getQueueStatus()`:
- If `matched` → join room via WebSocket, switch to playing
- If `queued` → update player count display
- After 30s → server fills with bots, returns matched

**Step 4: Commit**
```
feat: add quick-play matchmaking screen with queue polling
```

---

## Task 19: Client — Chat System

In-game and lobby text chat.

**Files:**
- Modify: `src/client/game/game.ts`
- Modify: `src/client/rendering/renderer.ts`

**Step 1: Add chat state to Game**

```typescript
private chatOpen = false;
private chatInput = "";
private chatMessages: ChatMessage[] = [];
```

**Step 2: Handle T key to open chat**

In `handleKeyPress()` for playing/online-lobby screens:
- T → open chat (set chatOpen = true, capture keyboard to chatInput)
- Enter → send message via `connection.send({ type: "chat", text: chatInput })`
- Escape → close chat

**Step 3: Handle incoming chat messages**

In `handleServerMessage()`:
```typescript
case "chat":
  this.chatMessages.push(msg.message);
  if (this.chatMessages.length > 50) this.chatMessages.shift();
  break;
```

**Step 4: Draw chat overlay**

Bottom-left during gameplay:
- Last 5 messages visible (fade after 10s)
- When chat open: input field visible, all recent messages shown
- Semi-transparent background behind text

**Step 5: Commit**
```
feat: add in-game text chat with overlay display
```

---

## Task 20: Menu Updates — New Buttons & Navigation

Update the main menu for the new features.

**Files:**
- Modify: `src/client/game/game.ts`
- Modify: `src/client/rendering/renderer.ts`

**Step 1: Update menu rendering**

Add new buttons to the main menu:
- **Quick Play** (Space bar) — prominent, center
- **Lokales Spiel** (Enter) — existing, now labeled explicitly
- **Online** (M) — existing
- **Freunde** (F) — new, shows friend count online
- **Profil** (P) — new, shows username/level
- **Anmelden** (L) — shown only for guests

Display current user info in top-right corner:
- Username or guest name
- Level badge
- Online friends count

**Step 2: Update menu keyboard handling**

Add new key bindings:
- F → friends screen
- P → profile screen
- L → login screen (only for guests)
- Space → quick play

**Step 3: Add invite notification banner**

Poll invites every 10s. If pending invite exists, show banner:
"NebulaSurfer laedt dich ein! [Enter = Annehmen] [Esc = Ablehnen]"

**Step 4: Commit**
```
feat: update menu with quick-play, friends, profile, and invite banners
```

---

## Task 21: Integration Testing

Write comprehensive tests for the new features.

**Files:**
- Create: `src/shared/kill-feed.test.ts` (if not done in Task 11)
- Modify: `e2e/menu-flow.spec.ts`
- Modify: `e2e/gameplay.spec.ts`

**Step 1: Unit tests for kill feed and stats**

Test kill type detection, stats accumulation, kill feed entries.

**Step 2: E2E tests for new screens**

```typescript
// menu-flow.spec.ts additions:
test("F key opens friends screen (guest sees register prompt)", ...);
test("P key opens profile screen", ...);
test("Space key opens matchmaking (or shows error without server)", ...);
test("post-game screen shows after local game ends", ...);
test("kill feed appears during gameplay", ...);
```

**Step 3: E2E tests for post-game flow**

```typescript
// gameplay.spec.ts additions:
test("game over transitions to post-game screen", ...);
test("post-game shows player stats", ...);
test("nochmal button from post-game starts new game", ...);
test("menu button from post-game returns to menu", ...);
```

**Step 4: Run all tests**

```bash
npx tsc --noEmit && npm test && npm run test:e2e
```

**Step 5: Commit**
```
test: add E2E tests for social features, kill feed, post-game
```

---

## Task 22: Documentation Update

Update project documentation to reflect new features.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md` (if exists)
- Modify: `README.md`

**Step 1: Update CLAUDE.md**

- Add new API endpoints to documentation
- Update project structure with new files
- Add KV namespace to tech stack
- Update menu flow diagram
- Add new screen descriptions

**Step 2: Update README.md**

- Add Social Features section
- Update setup instructions (KV namespace, Resend API key)
- Add environment variables documentation

**Step 3: Commit**
```
docs: update documentation for Phase 1 social features
```

---

## Execution Order Summary

| Task | Component | Dependencies |
|------|-----------|-------------|
| 1 | D1 Schema + KV binding | None |
| 2 | Shared Types | None |
| 3 | Env + Email + Guest Names | Task 1 |
| 4 | Guest Auth API | Tasks 1-3 |
| 5 | Account Auth API (register, login, reset) | Tasks 1-4 |
| 6 | Friends API | Tasks 1-5 |
| 7 | Presence API | Tasks 1-3 |
| 8 | Invite System | Tasks 1-3, 7 |
| 9 | Matchmaker API | Tasks 1-3 |
| 10 | GameRoom Enhancements | Tasks 2 |
| 11 | Kill Feed + Stats (simulation) | Task 2 |
| 12 | Client API Client | Tasks 4-9 |
| 13 | Client Screens + Navigation | Task 12 |
| 14 | Friends Screen UI | Tasks 12-13 |
| 15 | Login/Register/Profile Screens | Tasks 12-13 |
| 16 | Post-Game Screen | Tasks 10-11, 13 |
| 17 | Kill Feed HUD | Task 11, 13 |
| 18 | Matchmaking Screen | Tasks 9, 13 |
| 19 | Chat System | Task 10, 13 |
| 20 | Menu Updates | Tasks 12-19 |
| 21 | Integration Testing | All above |
| 22 | Documentation | All above |
