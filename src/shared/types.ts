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

// ===== Map =====

export type MapId = "nebula-station" | "asteroid-belt" | "the-singularity";

export interface MapConfig {
  id: MapId;
  name: string;
  width: number;
  height: number;
  gravityWells: Omit<GravityWell, "isTemporary" | "lifetime">[];
  asteroids: Omit<Asteroid, "rotation" | "rotationSpeed">[];
  spawnPoints: Vec2[];
}

// ===== Game State =====

export type ControlMode = "absolute" | "ship-relative";

export type GameMode = "deathmatch" | "king-of-the-asteroid" | "gravity-shift" | "duel";

export interface GameState {
  tick: number;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  gravityWells: GravityWell[];
  asteroids: Asteroid[];
  pickups: Pickup[];
  particles: Particle[];
  timeRemaining: number; // seconds
  gameMode: GameMode;
  mapId: MapId;
  kothZone: KothZone | null;
  kothScores: Record<string, number>;
  gameOver: boolean;
  winnerId: string | null;
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
  | { type: "leave" };

export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "joined"; playerId: string }
  | { type: "countdown"; seconds: number }
  | { type: "game-over"; scores: Record<string, number>; winnerId: string | null }
  | { type: "kill"; killerId: string; victimId: string }
  | { type: "error"; message: string };

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
