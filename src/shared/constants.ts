import { ShipClassConfig, WeaponConfig, SpecialConfig, ShipClass, WeaponType, SpecialType } from "./types";

// ===== Physics =====
export const TICK_RATE = 60;
export const TICK_DURATION = 1000 / TICK_RATE;
export const CLIENT_SEND_RATE = 30;
export const SERVER_BROADCAST_RATE = 20;

// ===== Player Defaults =====
export const MAX_ENERGY = 100;
export const ENERGY_REGEN_RATE = 20; // per second
export const BOOST_ENERGY_COST = 35; // per second
export const BOOST_MULTIPLIER = 1.8;
export const DRIFT_FRICTION = 0.97;
export const RESPAWN_TIME = 3; // seconds
export const INVULNERABILITY_TIME = 2.5; // seconds after respawn

// ===== Gravity =====
export const GRAVITY_CONSTANT = 80000;
export const GRAVITY_DAMAGE_RADIUS = 40;
export const GRAVITY_DAMAGE = 30; // per second when inside core

// ===== Game Mode Durations (seconds) =====
export const MODE_DURATIONS: Record<string, number> = {
  deathmatch: 120,
  "king-of-the-asteroid": 180,
  "gravity-shift": 150,
  duel: 90,
  "asteroid-tag": 180,
  "survival-wave": 600, // 10 min max
  "hot-potato": 120,
  "capture-the-core": 240,
};

export const KOTH_WIN_SCORE = 60;
export const KOTH_ZONE_RADIUS = 120;
export const KOTH_CAPTURE_RATE = 1; // points per second

export const GRAVITY_SHIFT_INTERVAL = 15; // seconds

// ===== New Mode Constants =====
export const TAG_DPS = 5; // damage per second for "It" player
export const POTATO_TIMER = 8; // seconds before bomb explodes
export const CAPTURE_WIN_SCORE = 3; // captures to win
export const CORE_DROP_COOLDOWN = 5; // seconds before dropped core can be picked up
export const CORE_CARRIER_SPEED_MULT = 0.6; // speed reduction for core carrier
export const CORE_CARRIER_SIZE_MULT = 1.5; // hitbox increase for core carrier
export const WAVE_PAUSE_DURATION = 5; // seconds between waves
export const SURVIVAL_RESPAWNS = 10; // shared lives for survival mode

// ===== Mutator Configs =====
import { MutatorConfig } from "./types";

export const MUTATOR_CONFIGS: Record<string, MutatorConfig> = {
  hypergravity: { id: "hypergravity", name: "Hypergravity", description: "Gravity Wells 3x staerker" },
  "zero-g": { id: "zero-g", name: "Zero-G", description: "Keine Gravity Wells" },
  "big-head": { id: "big-head", name: "Big Head", description: "Hitboxen 2x groesser" },
  "ricochet-arena": { id: "ricochet-arena", name: "Ricochet Arena", description: "Alle Projektile bouncen" },
  "glass-cannon": { id: "glass-cannon", name: "Glass Cannon", description: "1 HP, 5x Damage" },
  "mystery-loadout": { id: "mystery-loadout", name: "Mystery Loadout", description: "Zufaellige Mods alle 30s" },
  "fog-of-war": { id: "fog-of-war", name: "Fog of War", description: "Sichtweite 300px" },
  "speed-demon": { id: "speed-demon", name: "Speed Demon", description: "Alle Schiffe 2x schneller" },
  "friendly-fire": { id: "friendly-fire", name: "Friendly Fire", description: "Eigene Projektile treffen dich" },
};

// ===== Ship Configurations =====
export const SHIP_CONFIGS: Record<ShipClass, ShipClassConfig> = {
  viper: {
    name: "Viper",
    maxHp: 120,
    speed: 280,
    rotationSpeed: 5.5,
    color: "#00f0ff",
    weaponType: "dual-shot",
    specialType: "phase-dash",
    collisionRadius: 14,
  },
  titan: {
    name: "Titan",
    maxHp: 220,
    speed: 150,
    rotationSpeed: 3.0,
    color: "#ff6b00",
    weaponType: "heavy-shot",
    specialType: "shield-bubble",
    collisionRadius: 20,
  },
  specter: {
    name: "Specter",
    maxHp: 150,
    speed: 240,
    rotationSpeed: 4.5,
    color: "#b44aff",
    weaponType: "homing-missile",
    specialType: "emp-pulse",
    collisionRadius: 16,
  },
  nova: {
    name: "Nova",
    maxHp: 150,
    speed: 200,
    rotationSpeed: 4.0,
    color: "#00ff88",
    weaponType: "spread-shot",
    specialType: "gravity-bomb",
    collisionRadius: 16,
  },
};

// ===== Weapon Configurations =====
export const WEAPON_CONFIGS: Record<WeaponType, WeaponConfig> = {
  "dual-shot": {
    damage: 12,
    speed: 550,
    fireRate: 5, // fast
    projectileCount: 2,
    spreadAngle: 0.08,
    projectileRadius: 3,
    projectileLifetime: 1500,
    homing: false,
    homingStrength: 0,
  },
  "heavy-shot": {
    damage: 35,
    speed: 400,
    fireRate: 1.8,
    projectileCount: 1,
    spreadAngle: 0,
    projectileRadius: 6,
    projectileLifetime: 2000,
    homing: false,
    homingStrength: 0,
  },
  "homing-missile": {
    damage: 20,
    speed: 320,
    fireRate: 2.5,
    projectileCount: 1,
    spreadAngle: 0,
    projectileRadius: 4,
    projectileLifetime: 3000,
    homing: true,
    homingStrength: 2.0,
  },
  "spread-shot": {
    damage: 10,
    speed: 480,
    fireRate: 3,
    projectileCount: 3,
    spreadAngle: 0.3,
    projectileRadius: 3,
    projectileLifetime: 1200,
    homing: false,
    homingStrength: 0,
  },
};

// ===== Special Ability Configurations =====
export const SPECIAL_CONFIGS: Record<SpecialType, SpecialConfig> = {
  "phase-dash": {
    cooldown: 6000,
    duration: 600,
    radius: 0,
    damage: 0,
  },
  "shield-bubble": {
    cooldown: 10000,
    duration: 3000,
    radius: 50,
    damage: 0,
  },
  "emp-pulse": {
    cooldown: 8000,
    duration: 200,
    radius: 180,
    damage: 10,
  },
  "gravity-bomb": {
    cooldown: 9000,
    duration: 5000,
    radius: 100,
    damage: 0,
  },
};

// ===== Colors =====
export const COLORS = {
  background: "#0a0e27",
  backgroundStars: "#1a1e47",
  viper: "#00f0ff",
  titan: "#ff6b00",
  specter: "#b44aff",
  nova: "#00ff88",
  gravityWell: "#ff0080",
  gravityWellCore: "#ff40a0",
  projectile: "#ffffff",
  ui: "#e0e0ff",
  uiDim: "#606080",
  hpBar: "#00ff44",
  hpBarDamage: "#ff4444",
  energyBar: "#4488ff",
  shieldColor: "#44aaff",
  empColor: "#ff44ff",
  asteroid: "#556677",
  asteroidOutline: "#889aab",
  kothZone: "#ffdd00",
  pickup: "#44ff88",
} as const;

// ===== Progression =====
export const XP_PER_KILL = 50;
export const XP_PER_ASSIST = 20;
export const XP_PER_WIN = 100;
export const XP_PER_MATCH = 25;
export const XP_PER_LEVEL = 200;
export const MAX_LEVEL = 50;

export const RANK_THRESHOLDS = {
  bronze: 0,
  silver: 5,
  gold: 15,
  platinum: 30,
  diamond: 45,
} as const;

// ===== Mod Unlock Levels =====
export const MOD_UNLOCK_LEVELS: Record<string, number> = {
  // Weapon mods
  piercing: 1,
  ricochet: 3,
  "gravity-sync": 6,
  "rapid-fire": 1,
  // Ship mods
  afterburner: 1,
  "hull-plating": 2,
  "drift-master": 5,
  "gravity-anchor": 4,
  // Passive mods
  scavenger: 1,
  overcharge: 4,
  "ghost-trail": 7,
  radar: 3,
};

// ===== Bot Difficulty Presets =====

export interface BotDifficultyPreset {
  id: string;
  name: string;
  description: string;
  difficulty: number;
  aimError: number;
  shootDelay: number;
  shootThreshold: number;
  specialProbability: number;
  circleStrafe: boolean;
  approachDistance: number;
  retreatDistance: number;
  boostThreshold: number;
}

export const DIFFICULTY_PRESETS: BotDifficultyPreset[] = [
  {
    id: "weltraumtourist",
    name: "Weltraumtourist",
    description: "Weiss kaum, wo oben ist",
    difficulty: 0.1,
    aimError: 0.36,
    shootDelay: 0.37,
    shootThreshold: 0.75,
    specialProbability: 0.1,
    circleStrafe: false,
    approachDistance: 500,
    retreatDistance: 100,
    boostThreshold: 700,
  },
  {
    id: "raumkadett",
    name: "Raumkadett",
    description: "Hat die Ausbildung fast bestanden",
    difficulty: 0.3,
    aimError: 0.28,
    shootDelay: 0.31,
    shootThreshold: 0.65,
    specialProbability: 0.3,
    circleStrafe: false,
    approachDistance: 450,
    retreatDistance: 120,
    boostThreshold: 650,
  },
  {
    id: "kopfgeldjaeger",
    name: "Kopfgeldjaeger",
    description: "Nichts Persoenliches",
    difficulty: 0.5,
    aimError: 0.20,
    shootDelay: 0.25,
    shootThreshold: 0.55,
    specialProbability: 0.5,
    circleStrafe: true,
    approachDistance: 400,
    retreatDistance: 150,
    boostThreshold: 600,
  },
  {
    id: "planetenbrecher",
    name: "Planetenbrecher",
    description: "Macht ganze Welten platt",
    difficulty: 0.75,
    aimError: 0.10,
    shootDelay: 0.175,
    shootThreshold: 0.425,
    specialProbability: 0.75,
    circleStrafe: true,
    approachDistance: 350,
    retreatDistance: 180,
    boostThreshold: 500,
  },
  {
    id: "lebensmuede",
    name: "Lebensmuede",
    description: "Gnade? Nie gehoert",
    difficulty: 0.95,
    aimError: 0.02,
    shootDelay: 0.115,
    shootThreshold: 0.325,
    specialProbability: 0.95,
    circleStrafe: true,
    approachDistance: 300,
    retreatDistance: 200,
    boostThreshold: 400,
  },
];

export const DEFAULT_DIFFICULTY_INDEX = 2;
