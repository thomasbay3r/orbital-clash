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
};

export const KOTH_WIN_SCORE = 60;
export const KOTH_ZONE_RADIUS = 120;
export const KOTH_CAPTURE_RATE = 1; // points per second

export const GRAVITY_SHIFT_INTERVAL = 15; // seconds

// ===== Ship Configurations =====
export const SHIP_CONFIGS: Record<ShipClass, ShipClassConfig> = {
  viper: {
    name: "Viper",
    maxHp: 80,
    speed: 280,
    rotationSpeed: 5.5,
    color: "#00f0ff",
    weaponType: "dual-shot",
    specialType: "phase-dash",
    collisionRadius: 14,
  },
  titan: {
    name: "Titan",
    maxHp: 160,
    speed: 150,
    rotationSpeed: 3.0,
    color: "#ff6b00",
    weaponType: "heavy-shot",
    specialType: "shield-bubble",
    collisionRadius: 20,
  },
  specter: {
    name: "Specter",
    maxHp: 110,
    speed: 240,
    rotationSpeed: 4.5,
    color: "#b44aff",
    weaponType: "homing-missile",
    specialType: "emp-pulse",
    collisionRadius: 16,
  },
  nova: {
    name: "Nova",
    maxHp: 110,
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
