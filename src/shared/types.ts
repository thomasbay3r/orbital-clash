// ===== Ship Classes =====

export type ShipClass = "viper" | "titan" | "specter" | "nova";

export interface ShipConfig {
  class: ShipClass;
  hp: number;
  maxHp: number;
  speed: number;
  rotationSpeed: number;
  color: string;
}

export const SHIP_CONFIGS: Record<ShipClass, Omit<ShipConfig, "hp">> = {
  viper: { class: "viper", maxHp: 80, speed: 280, rotationSpeed: 5, color: "#00f0ff" },
  titan: { class: "titan", maxHp: 160, speed: 150, rotationSpeed: 3, color: "#ff6b00" },
  specter: { class: "specter", maxHp: 110, speed: 240, rotationSpeed: 4.2, color: "#b44aff" },
  nova: { class: "nova", maxHp: 110, speed: 200, rotationSpeed: 4, color: "#00ff88" },
};

// ===== Mods =====

export type WeaponMod = "piercing" | "ricochet" | "gravity-sync" | "rapid-fire";
export type ShipMod = "afterburner" | "hull-plating" | "drift-master" | "gravity-anchor";
export type PassiveMod = "scavenger" | "overcharge" | "ghost-trail" | "radar";

export interface ModLoadout {
  weapon: WeaponMod;
  ship: ShipMod;
  passive: PassiveMod;
}

// ===== Game State =====

export interface Vec2 {
  x: number;
  y: number;
}

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
  score: number;
  alive: boolean;
}

export interface Projectile {
  id: string;
  ownerId: string;
  position: Vec2;
  velocity: Vec2;
  damage: number;
  lifetime: number;
}

export interface GravityWell {
  id: string;
  position: Vec2;
  strength: number;
  radius: number;
}

export interface GameState {
  tick: number;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  gravityWells: GravityWell[];
  timeRemaining: number;
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

export type GameMode = "deathmatch" | "king-of-the-asteroid" | "gravity-shift" | "duel";

// ===== Network Messages =====

export type ClientMessage =
  | { type: "join"; name: string; shipClass: ShipClass }
  | { type: "input"; input: PlayerInput }
  | { type: "leave" };

export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "joined"; playerId: string }
  | { type: "countdown"; seconds: number }
  | { type: "game-over"; scores: Record<string, number> }
  | { type: "error"; message: string };
