// ===== Core Types =====

export interface Vec2 {
  x: number;
  y: number;
}

// ===== Ship Classes =====

export type ShipClass = "viper" | "titan" | "specter" | "nova";

export interface ShipClassConfig {
  name: string;
  maxHp: number;
  speed: number;
  rotationSpeed: number;
  color: string;
  weaponType: WeaponType;
  specialType: SpecialType;
  collisionRadius: number;
}

// ===== Weapons =====

export type WeaponType = "dual-shot" | "heavy-shot" | "homing-missile" | "spread-shot";
export type SpecialType = "phase-dash" | "shield-bubble" | "emp-pulse" | "gravity-bomb";

export interface WeaponConfig {
  damage: number;
  speed: number;
  fireRate: number; // shots per second
  projectileCount: number;
  spreadAngle: number; // radians, for spread weapons
  projectileRadius: number;
  projectileLifetime: number; // ms
  homing: boolean;
  homingStrength: number;
}

export interface SpecialConfig {
  cooldown: number; // ms
  duration: number; // ms
  radius: number;
  damage: number;
}

// ===== Mods =====

export type WeaponMod = "piercing" | "ricochet" | "gravity-sync" | "rapid-fire";
export type ShipMod = "afterburner" | "hull-plating" | "drift-master" | "gravity-anchor";
export type PassiveMod = "scavenger" | "overcharge" | "ghost-trail" | "radar";

export interface ModLoadout {
  weapon: WeaponMod;
  ship: ShipMod;
  passive: PassiveMod;
}

// ===== Game Entities =====

export interface PlayerState {
  id: string;
  name: string;
  shipClass: ShipClass;
  position: Vec2;
  velocity: Vec2;
  rotation: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  score: number;
  eliminations: number;
  deaths: number;
  alive: boolean;
  respawnTimer: number;
  shootCooldown: number;
  specialCooldown: number;
  specialActive: boolean;
  specialTimer: number;
  boostActive: boolean;
  mods: ModLoadout;
  // Passive mod state
  consecutiveHits: number; // for overcharge
  // Phase dash state
  phaseActive: boolean;
  // Shield bubble state
  shieldActive: boolean;
  shieldHp: number;
  controlMode: ControlMode;
  // Respawn invulnerability
  invulnerable: boolean;
  invulnerabilityTimer: number;
}

export interface Projectile {
  id: string;
  ownerId: string;
  position: Vec2;
  velocity: Vec2;
  damage: number;
  lifetime: number;
  radius: number;
  piercing: boolean;
  ricochet: boolean;
  gravitySynced: boolean;
  homing: boolean;
  homingStrength: number;
  hitEntities: string[]; // for piercing - track what we've hit
}

export interface GravityWell {
  id: string;
  position: Vec2;
  strength: number;
  radius: number;
  isTemporary: boolean;
  lifetime: number;
}

export interface Asteroid {
  id: string;
  position: Vec2;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  vertices: Vec2[]; // polygon shape
}

export interface Pickup {
  id: string;
  position: Vec2;
  type: "health";
  value: number;
  lifetime: number;
}

export interface KothZone {
  position: Vec2;
  radius: number;
  owner: string | null;
  captureProgress: Record<string, number>;
}

// ===== Particle Effects =====

export interface Particle {
  position: Vec2;
  velocity: Vec2;
  color: string;
  size: number;
  lifetime: number;
  maxLifetime: number;
  alpha: number;
}

// ===== Capture the Core =====

export interface CoreState {
  position: Vec2;
  carrierId: string | null;
  droppedTimer: number; // cooldown before pickup after drop
  atBase: boolean;
}

// ===== Map =====

export type MapId = "nebula-station" | "asteroid-belt" | "the-singularity"
  | "black-hole" | "wormhole-station" | "debris-field";

export interface Portal {
  id: string;
  position: Vec2;
  radius: number;
  linkedPortalId: string;
  color: string;
}

export interface MapConfig {
  id: MapId;
  name: string;
  width: number;
  height: number;
  gravityWells: Omit<GravityWell, "isTemporary" | "lifetime">[];
  asteroids: Omit<Asteroid, "rotation" | "rotationSpeed">[];
  spawnPoints: Vec2[];
  portals?: Portal[];
  destructibleAsteroids?: boolean;
}

// ===== Game State =====

export type ControlMode = "absolute" | "ship-relative";

export type GameMode = "deathmatch" | "king-of-the-asteroid" | "gravity-shift" | "duel"
  | "asteroid-tag" | "survival-wave" | "hot-potato" | "capture-the-core";

// ===== Mutators =====

export type MutatorId = "hypergravity" | "zero-g" | "big-head" | "ricochet-arena"
  | "glass-cannon" | "mystery-loadout" | "fog-of-war" | "speed-demon" | "friendly-fire"
  | "mirror-match";

export interface MutatorConfig {
  id: MutatorId;
  name: string;
  description: string;
}

// ===== Map Events =====

export type MapEventId = "asteroid-rain" | "gravity-surge" | "power-core" | "shield-bubble" | "emp-storm";

export interface MapEvent {
  id: MapEventId;
  name: string;
  duration: number; // seconds
  timer: number; // countdown
  active: boolean;
}

// ===== Kill Feed Types =====

export type KillType = "normal" | "gravity-well" | "ricochet" | "homing" | "melee" | "emp";

export interface KillEvent {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  killType: KillType;
  timestamp: number;
}

export interface GameState {
  tick: number;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  gravityWells: GravityWell[];
  asteroids: Asteroid[];
  pickups: Pickup[];
  particles: Particle[];
  portals: Portal[];
  timeRemaining: number; // seconds
  gameMode: GameMode;
  mapId: MapId;
  kothZone: KothZone | null;
  kothScores: Record<string, number>;
  gameOver: boolean;
  winnerId: string | null;
  winnerTeam: string | null;
  killFeed: KillEvent[];
  playerStats: Record<string, {
    damageDealt: number;
    shotsFired: number;
    shotsHit: number;
    gravityKills: number;
  }>;
  // Mutators
  mutators: MutatorId[];
  // Map events
  mapEvents: MapEvent[];
  nextEventTimer: number;
  // Asteroid Tag state
  tagItPlayerId: string | null;
  // Survival Wave state
  waveNumber: number;
  waveEnemiesRemaining: number;
  sharedLives: number;
  wavePause: boolean;
  wavePauseTimer: number;
  // Hot Potato state
  potatoCarrierId: string | null;
  potatoTimer: number;
  // Capture the Core state
  teams: Record<string, string>; // playerId → "red" | "blue"
  cores: { red: CoreState; blue: CoreState };
  captureScores: { red: number; blue: number };
}

// ===== Input / Network =====

export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
  shoot: boolean;
  special: boolean;
  aimAngle: number;
  tick: number;
}

// ===== Network Messages =====

export type ClientMessage =
  | { type: "join"; name: string; shipClass: ShipClass; mods: ModLoadout; controlMode?: ControlMode }
  | { type: "input"; input: PlayerInput }
  | { type: "leave" }
  | { type: "chat"; text: string }
  | { type: "emote"; text: string }
  | { type: "rematch-vote" };

export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "joined"; playerId: string }
  | { type: "countdown"; seconds: number }
  | { type: "game-over"; scores: Record<string, number>; winnerId: string | null }
  | { type: "kill"; event: KillEvent }
  | { type: "error"; message: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "emote"; playerId: string; text: string }
  | { type: "post-game"; data: PostGameData }
  | { type: "rematch"; votes: number; needed: number };

// ===== Progression =====

export type Rank = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface PlayerProfile {
  id: string;
  username: string;
  xp: number;
  level: number;
  rank: Rank;
  wins: number;
  losses: number;
  eliminations: number;
  unlockedMods: string[];
  unlockedCosmetics: string[];
  selectedSkin: Record<ShipClass, string>;
}

// ===== Cosmetics =====

export interface SkinConfig {
  id: string;
  name: string;
  shipClass: ShipClass;
  color: string;
  trailColor: string;
  unlockLevel: number;
}

export interface TitleConfig {
  id: string;
  name: string;
  unlockLevel: number;
}

export interface ExplosionEffect {
  id: string;
  name: string;
  colors: string[];
  unlockLevel: number;
}

export interface TrailConfig {
  id: string;
  name: string;
  color: string;
  particleCount: number;
  lifetime: number;
  unlockLevel: number;
}

export interface EmoteConfig {
  id: string;
  text: string;
  unlockLevel: number;
}

export interface BadgeConfig {
  id: string;
  name: string;
  icon: string; // emoji or text symbol
  unlockLevel: number;
}

// ===== Challenges & Achievements =====

export type ChallengeType = "play-games" | "get-kills" | "win-games" | "gravity-kills"
  | "mode-variety" | "use-special" | "no-death-win" | "damage-dealt";

export interface ChallengeConfig {
  id: string;
  name: string;
  description: string;
  type: ChallengeType;
  target: number;
  xpReward: number;
  difficulty: "easy" | "medium" | "hard";
  period: "daily" | "weekly";
}

export interface ChallengeProgress {
  challengeId: string;
  progress: number;
  target: number;
  completed: boolean;
}

export interface AchievementConfig {
  id: string;
  name: string;
  description: string;
  condition: string; // Human-readable
  reward: string; // Description of reward
  rewardType: "title" | "skin" | "trail" | "badge" | "kill-effect" | "emote";
  rewardId: string;
}

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
  type: "account" | "guest";
  id: string;
  displayName: string;
  level: number;
  xp: number;
}

// ===== Social Types =====

export type PresenceStatus = "online-menu" | "online-ingame" | "offline";

export interface FriendInfo {
  id: string;
  username: string;
  level: number;
  rank: Rank;
  presence: PresenceStatus;
  roomId?: string;
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
  status: "pending" | "accepted" | "rejected";
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

// ===== Post-Game Types =====

export interface PostGameData {
  matchResult: MatchResult;
  xpGained: number;
  newLevel: number | null;
  challengeProgress: { challengeId: string; progress: number; target: number; completed: boolean }[];
}
