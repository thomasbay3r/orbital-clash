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
  "mirror-match": { id: "mirror-match", name: "Mirror Match", description: "Alle spielen mit gleichem Loadout" },
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
  uiDim: "#8888aa",
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

// ===== Cosmetics =====

import {
  SkinConfig, TrailConfig, ExplosionEffect, EmoteConfig, BadgeConfig, TitleConfig,
  ChallengeConfig, AchievementConfig,
} from "./types";

export const SKIN_CONFIGS: SkinConfig[] = [
  // Viper skins
  { id: "viper-default", name: "Standard", shipClass: "viper", color: "#00f0ff", trailColor: "#00f0ff", unlockLevel: 1 },
  { id: "viper-neon", name: "Neon Viper", shipClass: "viper", color: "#ff00ff", trailColor: "#ff44ff", unlockLevel: 5 },
  { id: "viper-ghost", name: "Geisterviper", shipClass: "viper", color: "#aaddff", trailColor: "#ffffff", unlockLevel: 10 },
  { id: "viper-inferno", name: "Inferno", shipClass: "viper", color: "#ff4400", trailColor: "#ff8800", unlockLevel: 20 },
  { id: "viper-ice", name: "Eiskalt", shipClass: "viper", color: "#88ddff", trailColor: "#aaeeff", unlockLevel: 30 },
  { id: "viper-gold", name: "Gold", shipClass: "viper", color: "#ffd700", trailColor: "#ffee44", unlockLevel: 40 },
  // Titan skins
  { id: "titan-default", name: "Standard", shipClass: "titan", color: "#ff6b00", trailColor: "#ff6b00", unlockLevel: 1 },
  { id: "titan-iron", name: "Eisenpanzer", shipClass: "titan", color: "#8899aa", trailColor: "#aabbcc", unlockLevel: 5 },
  { id: "titan-lava", name: "Lavapanzer", shipClass: "titan", color: "#ff2200", trailColor: "#ff4400", unlockLevel: 10 },
  { id: "titan-forest", name: "Waldwache", shipClass: "titan", color: "#44aa44", trailColor: "#66cc66", unlockLevel: 20 },
  { id: "titan-crystal", name: "Kristall", shipClass: "titan", color: "#cc88ff", trailColor: "#dd99ff", unlockLevel: 30 },
  { id: "titan-gold", name: "Gold", shipClass: "titan", color: "#ffd700", trailColor: "#ffee44", unlockLevel: 40 },
  // Specter skins
  { id: "specter-default", name: "Standard", shipClass: "specter", color: "#b44aff", trailColor: "#b44aff", unlockLevel: 1 },
  { id: "specter-shadow", name: "Schatten", shipClass: "specter", color: "#444488", trailColor: "#666699", unlockLevel: 5 },
  { id: "specter-plasma", name: "Plasma", shipClass: "specter", color: "#44ffaa", trailColor: "#66ffcc", unlockLevel: 10 },
  { id: "specter-void", name: "Void", shipClass: "specter", color: "#220044", trailColor: "#440088", unlockLevel: 20 },
  { id: "specter-electric", name: "Elektrisch", shipClass: "specter", color: "#ffff00", trailColor: "#ffff44", unlockLevel: 30 },
  { id: "specter-gold", name: "Gold", shipClass: "specter", color: "#ffd700", trailColor: "#ffee44", unlockLevel: 40 },
  // Nova skins
  { id: "nova-default", name: "Standard", shipClass: "nova", color: "#00ff88", trailColor: "#00ff88", unlockLevel: 1 },
  { id: "nova-solar", name: "Solar", shipClass: "nova", color: "#ffaa00", trailColor: "#ffcc44", unlockLevel: 5 },
  { id: "nova-nebula", name: "Nebula", shipClass: "nova", color: "#ff66aa", trailColor: "#ff88cc", unlockLevel: 10 },
  { id: "nova-arctic", name: "Arktis", shipClass: "nova", color: "#00ccff", trailColor: "#44ddff", unlockLevel: 20 },
  { id: "nova-cosmic", name: "Kosmisch", shipClass: "nova", color: "#9944ff", trailColor: "#bb66ff", unlockLevel: 30 },
  { id: "nova-gold", name: "Gold", shipClass: "nova", color: "#ffd700", trailColor: "#ffee44", unlockLevel: 40 },
];

export const TRAIL_CONFIGS: TrailConfig[] = [
  { id: "default", name: "Standard", color: "#ffffff", particleCount: 3, lifetime: 300, unlockLevel: 1 },
  { id: "flame", name: "Flamme", color: "#ff4400", particleCount: 5, lifetime: 400, unlockLevel: 3 },
  { id: "rainbow", name: "Regenbogen", color: "#ff00ff", particleCount: 4, lifetime: 500, unlockLevel: 8 },
  { id: "smoke", name: "Rauch", color: "#888888", particleCount: 6, lifetime: 600, unlockLevel: 12 },
  { id: "stars", name: "Sterne", color: "#ffdd44", particleCount: 3, lifetime: 350, unlockLevel: 18 },
  { id: "pixel", name: "Pixel", color: "#44ff44", particleCount: 4, lifetime: 250, unlockLevel: 25 },
  { id: "lightning", name: "Blitz", color: "#4488ff", particleCount: 3, lifetime: 200, unlockLevel: 35 },
  { id: "gravity-wave", name: "Gravitationswelle", color: "#ff0088", particleCount: 5, lifetime: 450, unlockLevel: 0 }, // Achievement reward
];

export const KILL_EFFECT_CONFIGS: ExplosionEffect[] = [
  { id: "default", name: "Standard", colors: ["#ff4444", "#ff8800", "#ffcc00"], unlockLevel: 1 },
  { id: "pixel-dissolve", name: "Pixel-Aufloesung", colors: ["#44ff44", "#88ff88", "#ccffcc"], unlockLevel: 8 },
  { id: "black-hole", name: "Mini-Schwarzes-Loch", colors: ["#440088", "#880044", "#000000"], unlockLevel: 15 },
  { id: "confetti", name: "Konfetti", colors: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"], unlockLevel: 22 },
  { id: "ice-shards", name: "Eissherben", colors: ["#88ddff", "#aaeeff", "#ffffff"], unlockLevel: 30 },
  { id: "electro-burst", name: "Elektro-Burst", colors: ["#4488ff", "#88aaff", "#ffffff"], unlockLevel: 38 },
  { id: "flames", name: "Flammen", colors: ["#ff2200", "#ff6600", "#ffaa00"], unlockLevel: 0 }, // Achievement reward
];

export const EMOTE_CONFIGS: EmoteConfig[] = [
  { id: "gg", text: "GG!", unlockLevel: 1 },
  { id: "wow", text: "Wow!", unlockLevel: 1 },
  { id: "nice", text: "Nice!", unlockLevel: 3 },
  { id: "oops", text: "Oops!", unlockLevel: 5 },
  { id: "bye", text: "Tschuess!", unlockLevel: 8 },
  { id: "rage", text: "AAARGH!", unlockLevel: 12 },
  { id: "taunt", text: "Komm her!", unlockLevel: 18 },
  { id: "juggle-bomb", text: "Bombe jonglieren!", unlockLevel: 0 }, // Achievement reward
];

export const TITLE_CONFIGS: TitleConfig[] = [
  { id: "rekrut", name: "Rekrut", unlockLevel: 0 }, // Achievement
  { id: "pilot", name: "Pilot", unlockLevel: 3 },
  { id: "jaeger", name: "Jaeger", unlockLevel: 8 },
  { id: "kommandant", name: "Kommandant", unlockLevel: 15 },
  { id: "admiral", name: "Admiral", unlockLevel: 25 },
  { id: "legende", name: "Legende", unlockLevel: 40 },
  { id: "weltraumtourist", name: "Weltraumtourist", unlockLevel: 0 }, // Achievement
  { id: "veteran", name: "Veteran", unlockLevel: 0 }, // Achievement
];

export const BADGE_CONFIGS: BadgeConfig[] = [
  { id: "star", name: "Stern", icon: "*", unlockLevel: 2 },
  { id: "shield", name: "Schild", icon: "+", unlockLevel: 6 },
  { id: "crown", name: "Krone", icon: "^", unlockLevel: 15 },
  { id: "diamond", name: "Diamant", icon: "<>", unlockLevel: 30 },
  { id: "party-crown", name: "Party-Krone", icon: "~^~", unlockLevel: 0 }, // Achievement
  { id: "toolbox", name: "Werkzeugkasten", icon: "[=]", unlockLevel: 0 }, // Achievement
  { id: "animated-veteran", name: "Veteran (animiert)", icon: "***", unlockLevel: 0 }, // Achievement
];

// ===== Challenges =====

export const DAILY_CHALLENGE_POOL: ChallengeConfig[] = [
  // Easy
  { id: "d-play-3", name: "Uebungsrunde", description: "Spiele 3 Runden", type: "play-games", target: 3, xpReward: 50, difficulty: "easy", period: "daily" },
  { id: "d-kills-5", name: "Erste Beute", description: "Erziele 5 Kills", type: "get-kills", target: 5, xpReward: 50, difficulty: "easy", period: "daily" },
  { id: "d-special-3", name: "Spezialtraining", description: "Nutze 3x deine Spezialfaehigkeit", type: "use-special", target: 3, xpReward: 50, difficulty: "easy", period: "daily" },
  { id: "d-damage-500", name: "Schadenspflicht", description: "Verursache 500 Schaden", type: "damage-dealt", target: 500, xpReward: 50, difficulty: "easy", period: "daily" },
  // Medium
  { id: "d-kills-10", name: "Jagdsaison", description: "Erziele 10 Kills", type: "get-kills", target: 10, xpReward: 100, difficulty: "medium", period: "daily" },
  { id: "d-win-2", name: "Doppelsieg", description: "Gewinne 2 Runden", type: "win-games", target: 2, xpReward: 100, difficulty: "medium", period: "daily" },
  { id: "d-play-5", name: "Marathonspieler", description: "Spiele 5 Runden", type: "play-games", target: 5, xpReward: 100, difficulty: "medium", period: "daily" },
  // Hard
  { id: "d-no-death", name: "Perfektionist", description: "Gewinne ohne zu sterben", type: "no-death-win", target: 1, xpReward: 200, difficulty: "hard", period: "daily" },
  { id: "d-gravity-3", name: "Gravitationsmeister", description: "3 Gravity-Well-Kills", type: "gravity-kills", target: 3, xpReward: 200, difficulty: "hard", period: "daily" },
];

export const WEEKLY_CHALLENGE_POOL: ChallengeConfig[] = [
  { id: "w-variety", name: "Vielseitig", description: "Spiele jeden Modus 1x", type: "mode-variety", target: 8, xpReward: 500, difficulty: "medium", period: "weekly" },
  { id: "w-gravity-5", name: "Schwerkraftexperte", description: "5 Gravity-Well-Kills", type: "gravity-kills", target: 5, xpReward: 500, difficulty: "medium", period: "weekly" },
  { id: "w-wins-10", name: "Siegesserie", description: "10 Runden gewonnen", type: "win-games", target: 10, xpReward: 1000, difficulty: "hard", period: "weekly" },
  { id: "w-kills-50", name: "Grosswildjagd", description: "50 Kills", type: "get-kills", target: 50, xpReward: 500, difficulty: "medium", period: "weekly" },
  { id: "w-play-20", name: "Ausdauer", description: "20 Runden gespielt", type: "play-games", target: 20, xpReward: 500, difficulty: "easy", period: "weekly" },
];

// ===== Achievements =====

export const ACHIEVEMENT_CONFIGS: AchievementConfig[] = [
  { id: "first-game", name: "Erster Kontakt", description: "Spiele dein erstes Spiel", condition: "1 Spiel gespielt", reward: "Titel: Rekrut", rewardType: "title", rewardId: "rekrut" },
  { id: "gravity-surfer", name: "Gravity Surfer", description: "10 Gravity-Well-Kills", condition: "10 Gravity-Kills", reward: "Trail: Gravitationswelle", rewardType: "trail", rewardId: "gravity-wave" },
  { id: "viper-master", name: "Viper-Meister", description: "100 Kills mit Viper", condition: "100 Viper-Kills", reward: "Skin: Neon Viper", rewardType: "skin", rewardId: "viper-neon" },
  { id: "party-animal", name: "Party-Tier", description: "50 Spiele mit Freunden", condition: "50 Multiplayer-Spiele", reward: "Badge: Party-Krone", rewardType: "badge", rewardId: "party-crown" },
  { id: "unstoppable", name: "Unaufhaltsam", description: "5 Kills ohne Tod", condition: "5-Kill-Streak", reward: "Kill-Effekt: Flammen", rewardType: "kill-effect", rewardId: "flames" },
  { id: "cartographer", name: "Kartograph", description: "Jede Map gespielt", condition: "Alle 6 Maps", reward: "Titel: Weltraumtourist", rewardType: "title", rewardId: "weltraumtourist" },
  { id: "mod-collector", name: "Mod-Sammler", description: "Jede Mod-Kombo probiert", condition: "Alle Mod-Kombos", reward: "Badge: Werkzeugkasten", rewardType: "badge", rewardId: "toolbox" },
  { id: "survival-hero", name: "Survival-Held", description: "Welle 20 in Survival", condition: "Welle 20 erreicht", reward: "Skin: Kampfnarben", rewardType: "skin", rewardId: "titan-lava" },
  { id: "hot-potato-pro", name: "Hot-Potato-Pro", description: "10x Hot Potato gewonnen", condition: "10 Hot-Potato-Siege", reward: "Emote: Bombe jonglieren", rewardType: "emote", rewardId: "juggle-bomb" },
  { id: "veteran", name: "Veteran", description: "Erreiche Level 25", condition: "Level 25", reward: "Titel: Veteran + Animated Badge", rewardType: "title", rewardId: "veteran" },
];

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

// ===== Tutorial =====
export type TutorialScreenId =
  | "game-config" | "mod-select" | "settings" | "first-gameplay"
  | "profile" | "challenges" | "cosmetics" | "friends"
  | "party-lobby" | "emote-wheel" | "scoreboard";

export const TUTORIAL_SCREENS: { id: TutorialScreenId; type: "overlay" | "banner" }[] = [
  { id: "game-config", type: "overlay" },
  { id: "mod-select", type: "overlay" },
  { id: "settings", type: "overlay" },
  { id: "first-gameplay", type: "overlay" },
  { id: "profile", type: "banner" },
  { id: "challenges", type: "banner" },
  { id: "cosmetics", type: "banner" },
  { id: "friends", type: "banner" },
  { id: "party-lobby", type: "banner" },
  { id: "emote-wheel", type: "banner" },
  { id: "scoreboard", type: "banner" },
];
