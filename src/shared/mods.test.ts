import { describe, it, expect, beforeEach } from "vitest";
import {
  createGameState, addPlayer, simulateTick,
} from "./game-simulation";
import { GameState, PlayerInput, ModLoadout } from "./types";
import {
  DIFFICULTY_PRESETS, DEFAULT_DIFFICULTY_INDEX,
  SHIP_CONFIGS, WEAPON_CONFIGS, SPECIAL_CONFIGS,
  INVULNERABILITY_TIME, RESPAWN_TIME,
} from "./constants";

function makeInput(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    up: false, down: false, left: false, right: false,
    boost: false, shoot: false, special: false,
    aimAngle: 0, tick: 0,
    ...overrides,
  };
}

describe("Weapon Mods", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
  });

  it("piercing projectiles should pass through first enemy", () => {
    const mods: ModLoadout = { weapon: "piercing", ship: "afterburner", passive: "scavenger" };
    addPlayer(state, "p1", "Shooter", "titan", mods);
    addPlayer(state, "p2", "Target1", "viper", { weapon: "piercing", ship: "afterburner", passive: "scavenger" });
    addPlayer(state, "p3", "Target2", "viper", { weapon: "piercing", ship: "afterburner", passive: "scavenger" });

    // Line them up
    state.players["p1"].position = { x: 100, y: 400 };
    state.players["p2"].position = { x: 150, y: 400 };
    state.players["p3"].position = { x: 200, y: 400 };
    state.players["p1"].rotation = 0;

    // Shoot
    simulateTick(state, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);
    expect(state.projectiles.length).toBeGreaterThan(0);
    expect(state.projectiles[0].piercing).toBe(true);
  });

  it("ricochet projectiles should bounce off walls", () => {
    const mods: ModLoadout = { weapon: "ricochet", ship: "afterburner", passive: "scavenger" };
    addPlayer(state, "p1", "Shooter", "titan", mods);
    state.players["p1"].position = { x: 100, y: 400 };

    simulateTick(state, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);
    expect(state.projectiles[0].ricochet).toBe(true);
  });

  it("gravity-sync projectiles should have enhanced gravity effect", () => {
    const mods: ModLoadout = { weapon: "gravity-sync", ship: "afterburner", passive: "scavenger" };
    addPlayer(state, "p1", "Shooter", "nova", mods);
    state.players["p1"].position = { x: 400, y: 400 };

    simulateTick(state, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);
    const proj = state.projectiles[0];
    expect(proj.gravitySynced).toBe(true);
  });

  it("rapid-fire should increase fire rate but decrease damage", () => {
    const mods: ModLoadout = { weapon: "rapid-fire", ship: "afterburner", passive: "scavenger" };
    addPlayer(state, "p1", "Shooter", "titan", mods);
    state.players["p1"].position = { x: 400, y: 400 };

    simulateTick(state, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);
    const proj = state.projectiles[0];
    // Rapid fire reduces damage by 30% (damage * 0.7)
    expect(proj.damage).toBeLessThan(35); // titan base is 35
    expect(proj.damage).toBeCloseTo(35 * 0.7, 0);
  });
});

describe("Ship Mods", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
  });

  it("hull-plating should increase HP and decrease speed", () => {
    addPlayer(state, "p1", "Tank", "viper", {
      weapon: "piercing", ship: "hull-plating", passive: "scavenger",
    });
    expect(state.players["p1"].maxHp).toBe(150); // 120 * 1.25
    // Speed reduction is applied during movement, not stored
  });

  it("afterburner should allow longer boost with slower regen", () => {
    addPlayer(state, "p1", "Booster", "viper", {
      weapon: "piercing", ship: "afterburner", passive: "scavenger",
    });
    state.players["p1"].energy = 50;
    // Boost with afterburner
    simulateTick(state, { p1: makeInput({ up: true, boost: true }) }, 1 / 60);
    expect(state.players["p1"].energy).toBeLessThan(50); // energy consumed

    // Reset
    state.players["p1"].energy = 50;
    // Don't boost, check regen
    simulateTick(state, { p1: makeInput({ up: true }) }, 1 / 60);
    expect(state.players["p1"].energy).toBeGreaterThan(50); // should regen
  });

  it("gravity-anchor should reduce gravity effect", () => {
    addPlayer(state, "anchored", "Anchor", "viper", {
      weapon: "piercing", ship: "gravity-anchor", passive: "scavenger",
    });
    addPlayer(state, "normal", "Normal", "viper", {
      weapon: "piercing", ship: "afterburner", passive: "scavenger",
    });

    // Place both at same position near gravity well
    const nearWell = { x: state.gravityWells[0].position.x + 100, y: state.gravityWells[0].position.y };
    state.players["anchored"].position = { ...nearWell };
    state.players["normal"].position = { ...nearWell };
    state.players["anchored"].velocity = { x: 0, y: 0 };
    state.players["normal"].velocity = { x: 0, y: 0 };

    // Simulate several ticks
    for (let i = 0; i < 10; i++) {
      simulateTick(state, {}, 1 / 60);
    }

    // Gravity-anchored should have moved less
    const anchoredDist = Math.abs(state.players["anchored"].position.x - nearWell.x);
    const normalDist = Math.abs(state.players["normal"].position.x - nearWell.x);
    expect(anchoredDist).toBeLessThan(normalDist);
  });
});

describe("Passive Mods", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
  });

  it("scavenger should drop health pickup on kill", () => {
    addPlayer(state, "p1", "Killer", "titan", {
      weapon: "piercing", ship: "afterburner", passive: "scavenger",
    });
    addPlayer(state, "p2", "Victim", "viper", {
      weapon: "piercing", ship: "afterburner", passive: "scavenger",
    });

    state.players["p2"].hp = 1;
    state.projectiles.push({
      id: "kill-shot",
      ownerId: "p1",
      position: { ...state.players["p2"].position },
      velocity: { x: 0, y: 0 },
      damage: 50,
      lifetime: 2,
      radius: 100,
      piercing: false,
      ricochet: false,
      gravitySynced: false,
      homing: false,
      homingStrength: 0,
      hitEntities: [],
    });

    simulateTick(state, {}, 1 / 60);
    expect(state.players["p2"].alive).toBe(false);
    expect(state.pickups.length).toBeGreaterThan(0);
    expect(state.pickups[0].type).toBe("health");
  });

  it("overcharge should double damage after 3 consecutive hits", () => {
    addPlayer(state, "p1", "Charger", "titan", {
      weapon: "piercing", ship: "afterburner", passive: "overcharge",
    });
    addPlayer(state, "p2", "Target", "titan", {
      weapon: "piercing", ship: "afterburner", passive: "scavenger",
    });

    // Simulate 3 hits manually
    state.players["p1"].consecutiveHits = 3;
    const initialHp = state.players["p2"].hp;

    state.projectiles.push({
      id: "charged-shot",
      ownerId: "p1",
      position: { ...state.players["p2"].position },
      velocity: { x: 0, y: 0 },
      damage: 20,
      lifetime: 2,
      radius: 100,
      piercing: false,
      ricochet: false,
      gravitySynced: false,
      homing: false,
      homingStrength: 0,
      hitEntities: [],
    });

    simulateTick(state, {}, 1 / 60);
    // Should deal 40 damage (20 * 2) from overcharge
    expect(state.players["p2"].hp).toBe(initialHp - 40);
    expect(state.players["p1"].consecutiveHits).toBe(1); // reset to 0 then incremented by hit
  });
});

describe("King of the Asteroid Mode", () => {
  it("should track KOTH scores for player in zone", () => {
    const state = createGameState("king-of-the-asteroid", "nebula-station");
    addPlayer(state, "p1", "Capper", "viper", {
      weapon: "piercing", ship: "afterburner", passive: "scavenger",
    });

    // Move player to zone center
    state.players["p1"].position = { ...state.kothZone!.position };

    for (let i = 0; i < 60; i++) {
      simulateTick(state, {}, 1 / 60);
    }

    expect(state.kothScores["p1"]).toBeGreaterThan(0);
  });

  it("should not award points when multiple players in zone", () => {
    const state = createGameState("king-of-the-asteroid", "nebula-station");
    addPlayer(state, "p1", "A", "viper", { weapon: "piercing", ship: "afterburner", passive: "scavenger" });
    addPlayer(state, "p2", "B", "titan", { weapon: "piercing", ship: "afterburner", passive: "scavenger" });

    state.players["p1"].position = { ...state.kothZone!.position };
    state.players["p2"].position = { ...state.kothZone!.position };

    for (let i = 0; i < 60; i++) {
      simulateTick(state, {}, 1 / 60);
    }

    expect(state.kothScores["p1"]).toBe(0);
    expect(state.kothScores["p2"]).toBe(0);
  });
});

describe("Gravity Shift Mode", () => {
  it("gravity wells should shift positions", () => {
    const state = createGameState("gravity-shift", "nebula-station");
    addPlayer(state, "p1", "A", "viper", { weapon: "piercing", ship: "afterburner", passive: "scavenger" });

    const initialPositions = state.gravityWells.map((w) => ({ ...w.position }));

    // Simulate enough time for a gravity shift (15 second intervals)
    // We need to cross a 15-second boundary
    state.timeRemaining = 135.1; // just above a shift boundary
    simulateTick(state, {}, 0.2); // crosses the 135 boundary

    // Positions should have changed
    const newPositions = state.gravityWells.map((w) => ({ ...w.position }));
    const changed = newPositions.some((p, i) =>
      p.x !== initialPositions[i].x || p.y !== initialPositions[i].y,
    );
    expect(changed).toBe(true);
  });
});

describe("Map-specific Tests", () => {
  it("asteroid belt should have asteroid collision", () => {
    const state = createGameState("deathmatch", "asteroid-belt");
    expect(state.asteroids.length).toBeGreaterThan(0);

    addPlayer(state, "p1", "Pilot", "viper", {
      weapon: "piercing", ship: "afterburner", passive: "scavenger",
    });

    // Place player slightly overlapping with asteroid (not exactly at center)
    state.players["p1"].position = { x: state.asteroids[0].position.x + 5, y: state.asteroids[0].position.y };
    state.players["p1"].velocity = { x: 0, y: 0 };

    simulateTick(state, {}, 1 / 60);

    // Player should be pushed out of asteroid
    const dist = Math.sqrt(
      (state.players["p1"].position.x - state.asteroids[0].position.x) ** 2 +
      (state.players["p1"].position.y - state.asteroids[0].position.y) ** 2,
    );
    expect(dist).toBeGreaterThan(0);
  });

  it("singularity should have strong central gravity", () => {
    const state = createGameState("deathmatch", "the-singularity");
    addPlayer(state, "p1", "Test", "viper", {
      weapon: "piercing", ship: "afterburner", passive: "scavenger",
    });

    state.players["p1"].position = { x: 700, y: 600 };
    state.players["p1"].velocity = { x: 0, y: 0 };

    for (let i = 0; i < 30; i++) {
      simulateTick(state, {}, 1 / 60);
    }

    // Should be pulled toward center (600, 600)
    expect(state.players["p1"].position.x).toBeLessThan(700);
  });
});

describe("Difficulty Presets", () => {
  it("should have exactly 5 presets", () => {
    expect(DIFFICULTY_PRESETS.length).toBe(5);
  });

  it("should have valid default difficulty index", () => {
    expect(DEFAULT_DIFFICULTY_INDEX).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_DIFFICULTY_INDEX).toBeLessThan(DIFFICULTY_PRESETS.length);
  });

  it("should have difficulty values in ascending order", () => {
    for (let i = 1; i < DIFFICULTY_PRESETS.length; i++) {
      expect(DIFFICULTY_PRESETS[i].difficulty).toBeGreaterThan(
        DIFFICULTY_PRESETS[i - 1].difficulty,
      );
    }
  });

  it("should have aim error values in descending order (harder = less error)", () => {
    for (let i = 1; i < DIFFICULTY_PRESETS.length; i++) {
      expect(DIFFICULTY_PRESETS[i].aimError).toBeLessThan(
        DIFFICULTY_PRESETS[i - 1].aimError,
      );
    }
  });

  it("should have shoot delay in descending order (harder = faster shooting)", () => {
    for (let i = 1; i < DIFFICULTY_PRESETS.length; i++) {
      expect(DIFFICULTY_PRESETS[i].shootDelay).toBeLessThan(
        DIFFICULTY_PRESETS[i - 1].shootDelay,
      );
    }
  });

  it("presets should have unique ids and names", () => {
    const ids = DIFFICULTY_PRESETS.map((p) => p.id);
    const names = DIFFICULTY_PRESETS.map((p) => p.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all presets should have valid numeric ranges", () => {
    for (const preset of DIFFICULTY_PRESETS) {
      expect(preset.difficulty).toBeGreaterThanOrEqual(0);
      expect(preset.difficulty).toBeLessThanOrEqual(1);
      expect(preset.aimError).toBeGreaterThanOrEqual(0);
      expect(preset.shootDelay).toBeGreaterThan(0);
      expect(preset.shootThreshold).toBeGreaterThan(0);
      expect(preset.specialProbability).toBeGreaterThanOrEqual(0);
      expect(preset.specialProbability).toBeLessThanOrEqual(1);
      expect(preset.approachDistance).toBeGreaterThan(0);
      expect(preset.retreatDistance).toBeGreaterThan(0);
      expect(preset.boostThreshold).toBeGreaterThan(0);
    }
  });
});

describe("Ship/Weapon/Special Config Consistency", () => {
  it("all ship classes should have matching weapon and special configs", () => {
    for (const [, config] of Object.entries(SHIP_CONFIGS)) {
      expect(WEAPON_CONFIGS[config.weaponType]).toBeDefined();
      expect(SPECIAL_CONFIGS[config.specialType]).toBeDefined();
      expect(config.maxHp).toBeGreaterThan(0);
      expect(config.speed).toBeGreaterThan(0);
      expect(config.collisionRadius).toBeGreaterThan(0);
    }
  });

  it("all weapon configs should have valid values", () => {
    for (const [, config] of Object.entries(WEAPON_CONFIGS)) {
      expect(config.damage).toBeGreaterThan(0);
      expect(config.speed).toBeGreaterThan(0);
      expect(config.fireRate).toBeGreaterThan(0);
      expect(config.projectileCount).toBeGreaterThanOrEqual(1);
      expect(config.projectileRadius).toBeGreaterThan(0);
      expect(config.projectileLifetime).toBeGreaterThan(0);
    }
  });

  it("game constants should have sensible values", () => {
    expect(INVULNERABILITY_TIME).toBeGreaterThan(0);
    expect(INVULNERABILITY_TIME).toBeLessThanOrEqual(5);
    expect(RESPAWN_TIME).toBeGreaterThan(0);
    expect(RESPAWN_TIME).toBeLessThanOrEqual(10);
  });
});
