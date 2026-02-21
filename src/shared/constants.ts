// Physics
export const TICK_RATE = 60;
export const TICK_DURATION = 1000 / TICK_RATE;
export const CLIENT_SEND_RATE = 30;
export const SERVER_BROADCAST_RATE = 20;

// Arena
export const ARENA_WIDTH = 1600;
export const ARENA_HEIGHT = 1200;

// Player
export const MAX_ENERGY = 100;
export const ENERGY_REGEN_RATE = 15; // per second
export const BOOST_ENERGY_COST = 40; // per second
export const BOOST_MULTIPLIER = 1.8;
export const DRIFT_FRICTION = 0.98;
export const RESPAWN_TIME = 3000; // ms

// Projectiles
export const PROJECTILE_SPEED = 500;
export const PROJECTILE_LIFETIME = 2000; // ms
export const SHOOT_COOLDOWN = 250; // ms

// Gravity
export const GRAVITY_CONSTANT = 50000;
export const GRAVITY_DAMAGE_RADIUS = 30;
export const GRAVITY_DAMAGE_PER_TICK = 2;

// Colors
export const COLORS = {
  background: "#0a0e27",
  viper: "#00f0ff",
  titan: "#ff6b00",
  specter: "#b44aff",
  nova: "#00ff88",
  gravityWell: "#ff0080",
  projectile: "#ffffff",
  ui: "#e0e0ff",
} as const;
