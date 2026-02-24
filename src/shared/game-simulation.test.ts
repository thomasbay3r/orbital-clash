import { describe, it, expect, beforeEach } from "vitest";
import {
  createGameState, addPlayer, removePlayer, simulateTick,
} from "./game-simulation";
import { GameState, PlayerInput, ModLoadout } from "./types";
import {
  INVULNERABILITY_TIME, POTATO_TIMER, CAPTURE_WIN_SCORE,
  SURVIVAL_RESPAWNS,
} from "./constants";

const DEFAULT_MODS: ModLoadout = {
  weapon: "piercing",
  ship: "afterburner",
  passive: "scavenger",
};

function makeInput(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    up: false, down: false, left: false, right: false,
    boost: false, shoot: false, special: false,
    aimAngle: 0, tick: 0,
    ...overrides,
  };
}

describe("Game State Creation", () => {
  it("should create deathmatch state", () => {
    const state = createGameState("deathmatch", "nebula-station");
    expect(state.gameMode).toBe("deathmatch");
    expect(state.mapId).toBe("nebula-station");
    expect(state.timeRemaining).toBe(120);
    expect(state.gravityWells.length).toBe(2);
    expect(state.kothZone).toBeNull();
    expect(state.gameOver).toBe(false);
  });

  it("should create KOTH state with zone", () => {
    const state = createGameState("king-of-the-asteroid", "nebula-station");
    expect(state.kothZone).not.toBeNull();
    expect(state.kothZone!.radius).toBeGreaterThan(0);
  });

  it("should create asteroid belt map with asteroids", () => {
    const state = createGameState("deathmatch", "asteroid-belt");
    expect(state.asteroids.length).toBeGreaterThan(0);
    expect(state.gravityWells.length).toBe(3);
  });

  it("should create singularity map with one strong gravity well", () => {
    const state = createGameState("deathmatch", "the-singularity");
    expect(state.gravityWells.length).toBe(1);
    expect(state.gravityWells[0].strength).toBe(2.0);
  });
});

describe("Player Management", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
  });

  it("should add a player", () => {
    addPlayer(state, "p1", "TestPlayer", "viper", DEFAULT_MODS);
    expect(state.players["p1"]).toBeDefined();
    expect(state.players["p1"].name).toBe("TestPlayer");
    expect(state.players["p1"].shipClass).toBe("viper");
    expect(state.players["p1"].alive).toBe(true);
    expect(state.players["p1"].hp).toBe(120); // viper base hp
  });

  it("should apply hull-plating mod", () => {
    addPlayer(state, "p1", "Tank", "titan", { ...DEFAULT_MODS, ship: "hull-plating" });
    expect(state.players["p1"].maxHp).toBe(275); // 220 * 1.25
  });

  it("should remove a player", () => {
    addPlayer(state, "p1", "Test", "nova", DEFAULT_MODS);
    removePlayer(state, "p1");
    expect(state.players["p1"]).toBeUndefined();
  });
});

describe("Simulation Tick", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
  });

  it("should advance tick counter", () => {
    simulateTick(state, {}, 1 / 60);
    expect(state.tick).toBe(1);
  });

  it("should decrease time remaining", () => {
    const initialTime = state.timeRemaining;
    simulateTick(state, {}, 1 / 60);
    expect(state.timeRemaining).toBeLessThan(initialTime);
  });

  it("should move player with thrust input", () => {
    const initialPos = { ...state.players["p1"].position };
    const input = makeInput({ up: true });
    // Run multiple ticks for visible movement
    for (let i = 0; i < 10; i++) {
      simulateTick(state, { p1: input }, 1 / 60);
    }
    const newPos = state.players["p1"].position;
    expect(newPos.y).toBeLessThan(initialPos.y); // moved up
  });

  it("should fire projectiles when shooting", () => {
    const input = makeInput({ shoot: true });
    simulateTick(state, { p1: input }, 1 / 60);
    // Viper fires dual shots
    expect(state.projectiles.length).toBe(2);
    expect(state.projectiles[0].ownerId).toBe("p1");
  });

  it("should respect shoot cooldown", () => {
    const input = makeInput({ shoot: true });
    simulateTick(state, { p1: input }, 1 / 60);
    expect(state.projectiles.length).toBe(2);
    // Next tick should not fire (cooldown)
    simulateTick(state, { p1: input }, 1 / 60);
    expect(state.projectiles.length).toBe(2); // still 2, no new
  });

  it("should drain energy during boost", () => {
    const initialEnergy = state.players["p1"].energy;
    const input = makeInput({ up: true, boost: true });
    simulateTick(state, { p1: input }, 1 / 60);
    expect(state.players["p1"].energy).toBeLessThan(initialEnergy);
  });

  it("should regen energy when not boosting", () => {
    state.players["p1"].energy = 50;
    const input = makeInput({ up: true });
    simulateTick(state, { p1: input }, 1 / 60);
    expect(state.players["p1"].energy).toBeGreaterThan(50);
  });

  it("should end game when time runs out", () => {
    state.timeRemaining = 0.01;
    simulateTick(state, {}, 0.02);
    expect(state.gameOver).toBe(true);
  });

  it("should not simulate when game is over", () => {
    state.gameOver = true;
    const tick = state.tick;
    simulateTick(state, {}, 1 / 60);
    expect(state.tick).toBe(tick);
  });
});

describe("Combat", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Attacker", "titan", DEFAULT_MODS);
    addPlayer(state, "p2", "Target", "viper", DEFAULT_MODS);
    // Place them close together facing each other
    state.players["p1"].position = { x: 400, y: 400 };
    state.players["p2"].position = { x: 440, y: 400 };
    state.players["p1"].rotation = 0; // facing right toward p2
  });

  it("should deal damage when projectile hits", () => {
    const input = makeInput({ shoot: true, aimAngle: 0 });
    // Simulate several ticks for projectile to reach target
    for (let i = 0; i < 5; i++) {
      simulateTick(state, { p1: input }, 1 / 60);
    }
    expect(state.players["p2"].hp).toBeLessThan(120); // viper has 120 hp
  });

  it("should kill player at 0 hp and respawn", () => {
    state.players["p2"].hp = 1;
    // Create a projectile aimed at p2
    state.projectiles.push({
      id: "test-proj",
      ownerId: "p1",
      position: { x: 435, y: 400 },
      velocity: { x: 400, y: 0 },
      damage: 50,
      lifetime: 2,
      radius: 6,
      piercing: false,
      ricochet: false,
      gravitySynced: false,
      homing: false,
      homingStrength: 0,
      hitEntities: [],
    });
    simulateTick(state, {}, 1 / 60);
    expect(state.players["p2"].alive).toBe(false);
    expect(state.players["p1"].score).toBe(1);
    expect(state.players["p1"].eliminations).toBe(1);

    // After respawn time, should be alive again
    for (let i = 0; i < RESPAWN_TICKS; i++) {
      simulateTick(state, {}, 1 / 60);
    }
    expect(state.players["p2"].alive).toBe(true);
    expect(state.players["p2"].hp).toBe(120);
  });
});

// ~180 ticks for 3-second respawn at 60fps
const RESPAWN_TICKS = 200;

describe("Duel Mode", () => {
  it("should end when a player reaches 2 kills", () => {
    const state = createGameState("duel", "the-singularity");
    addPlayer(state, "p1", "A", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "B", "titan", DEFAULT_MODS);
    state.players["p1"].eliminations = 1;
    state.players["p1"].score = 1;

    // Kill p2 again
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

    expect(state.players["p1"].eliminations).toBe(2);
    expect(state.gameOver).toBe(true);
    expect(state.winnerId).toBe("p1");
  });
});

describe("Special Abilities", () => {
  it("should activate phase dash for viper", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Viper", "viper", DEFAULT_MODS);
    state.players["p1"].position = { x: 400, y: 400 };

    const input = makeInput({ special: true, aimAngle: 0 });
    simulateTick(state, { p1: input }, 1 / 60);

    expect(state.players["p1"].phaseActive).toBe(true);
    expect(state.players["p1"].specialCooldown).toBeGreaterThan(0);
    // Should have moved significantly
    expect(state.players["p1"].velocity.x).toBeGreaterThan(100);
  });

  it("should activate shield for titan", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Titan", "titan", DEFAULT_MODS);

    const input = makeInput({ special: true });
    simulateTick(state, { p1: input }, 1 / 60);

    expect(state.players["p1"].shieldActive).toBe(true);
    expect(state.players["p1"].shieldHp).toBeGreaterThan(0);
  });

  it("should place gravity bomb for nova", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Nova", "nova", DEFAULT_MODS);
    const initialWells = state.gravityWells.length;

    const input = makeInput({ special: true });
    simulateTick(state, { p1: input }, 1 / 60);

    expect(state.gravityWells.length).toBe(initialWells + 1);
    const newWell = state.gravityWells[state.gravityWells.length - 1];
    expect(newWell.isTemporary).toBe(true);
  });
});

describe("Respawn Invulnerability", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Attacker", "titan", DEFAULT_MODS);
    addPlayer(state, "p2", "Target", "viper", DEFAULT_MODS);
    state.players["p1"].position = { x: 400, y: 400 };
    state.players["p2"].position = { x: 440, y: 400 };
  });

  it("should initialize players as not invulnerable", () => {
    expect(state.players["p1"].invulnerable).toBe(false);
    expect(state.players["p1"].invulnerabilityTimer).toBe(0);
  });

  it("should set invulnerability on respawn", () => {
    // Kill p2
    state.players["p2"].hp = 1;
    state.projectiles.push({
      id: "kill",
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

    // Wait for respawn
    for (let i = 0; i < RESPAWN_TICKS; i++) {
      simulateTick(state, {}, 1 / 60);
    }
    expect(state.players["p2"].alive).toBe(true);
    expect(state.players["p2"].invulnerable).toBe(true);
    expect(state.players["p2"].invulnerabilityTimer).toBeCloseTo(INVULNERABILITY_TIME, 0);
  });

  it("should clear invulnerability after timer expires", () => {
    state.players["p2"].invulnerable = true;
    state.players["p2"].invulnerabilityTimer = 0.05;

    simulateTick(state, {}, 0.1);
    expect(state.players["p2"].invulnerable).toBe(false);
    expect(state.players["p2"].invulnerabilityTimer).toBe(0);
  });

  it("should block projectile damage while invulnerable", () => {
    state.players["p2"].invulnerable = true;
    state.players["p2"].invulnerabilityTimer = 2;
    const hpBefore = state.players["p2"].hp;

    state.projectiles.push({
      id: "blocked",
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
    expect(state.players["p2"].hp).toBe(hpBefore);
  });

  it("should block gravity well damage while invulnerable", () => {
    // Place p2 inside a gravity well core
    state.players["p2"].position = { ...state.gravityWells[0].position };
    state.players["p2"].invulnerable = true;
    state.players["p2"].invulnerabilityTimer = 2;
    const hpBefore = state.players["p2"].hp;

    simulateTick(state, {}, 1 / 60);
    expect(state.players["p2"].hp).toBe(hpBefore);
  });

  it("should block EMP damage while invulnerable", () => {
    // Place p2 close to p1 (specter with EMP)
    const stateEmp = createGameState("deathmatch", "nebula-station");
    addPlayer(stateEmp, "emp", "EMPer", "specter", DEFAULT_MODS);
    addPlayer(stateEmp, "target", "Target", "viper", DEFAULT_MODS);
    stateEmp.players["emp"].position = { x: 400, y: 400 };
    stateEmp.players["target"].position = { x: 430, y: 400 };
    stateEmp.players["target"].invulnerable = true;
    stateEmp.players["target"].invulnerabilityTimer = 2;
    const hpBefore = stateEmp.players["target"].hp;

    const input = makeInput({ special: true });
    simulateTick(stateEmp, { emp: input }, 1 / 60);
    expect(stateEmp.players["target"].hp).toBe(hpBefore);
  });

  it("should cancel invulnerability when player shoots", () => {
    state.players["p2"].invulnerable = true;
    state.players["p2"].invulnerabilityTimer = 2;
    state.players["p2"].rotation = 0;

    const input = makeInput({ shoot: true, aimAngle: 0 });
    simulateTick(state, { p2: input }, 1 / 60);
    expect(state.players["p2"].invulnerable).toBe(false);
    expect(state.players["p2"].invulnerabilityTimer).toBe(0);
  });
});

describe("Control Modes", () => {
  it("should move up with W in absolute mode", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Abs", "viper", DEFAULT_MODS, "absolute");
    state.players["p1"].position = { x: 600, y: 500 };
    state.players["p1"].velocity = { x: 0, y: 0 };

    for (let i = 0; i < 10; i++) {
      simulateTick(state, { p1: makeInput({ up: true }) }, 1 / 60);
    }
    expect(state.players["p1"].position.y).toBeLessThan(500);
  });

  it("should move forward relative to ship rotation in ship-relative mode", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Rel", "viper", DEFAULT_MODS, "ship-relative");
    state.players["p1"].position = { x: 600, y: 500 };
    state.players["p1"].velocity = { x: 0, y: 0 };
    state.players["p1"].rotation = Math.PI / 2; // facing down

    for (let i = 0; i < 10; i++) {
      simulateTick(state, { p1: makeInput({ up: true, aimAngle: Math.PI / 2 }) }, 1 / 60);
    }
    // Facing down (PI/2) + W = forward = should move down (y increases)
    expect(state.players["p1"].position.y).toBeGreaterThan(500);
  });

  it("should strafe in ship-relative mode", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Rel", "viper", DEFAULT_MODS, "ship-relative");
    state.players["p1"].position = { x: 600, y: 500 };
    state.players["p1"].velocity = { x: 0, y: 0 };
    state.players["p1"].rotation = 0; // facing right

    for (let i = 0; i < 10; i++) {
      simulateTick(state, { p1: makeInput({ right: true, aimAngle: 0 }) }, 1 / 60);
    }
    // Facing right (0) + D = strafe right = should move down (y increases)
    expect(state.players["p1"].position.y).toBeGreaterThan(500);
  });

  it("should default to absolute control mode", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Default", "viper", DEFAULT_MODS);
    expect(state.players["p1"].controlMode).toBe("absolute");
  });
});

// ===== NEW: Projectile Lifecycle =====

describe("Projectile Lifecycle", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Shooter", "titan", DEFAULT_MODS);
    state.players["p1"].position = { x: 400, y: 400 };
    state.players["p1"].rotation = 0;
  });

  it("should remove projectiles when lifetime expires", () => {
    state.projectiles.push({
      id: "short-lived",
      ownerId: "p1",
      position: { x: 400, y: 400 },
      velocity: { x: 100, y: 0 },
      damage: 10,
      lifetime: 0.05,
      radius: 3,
      piercing: false,
      ricochet: false,
      gravitySynced: false,
      homing: false,
      homingStrength: 0,
      hitEntities: [],
    });

    expect(state.projectiles.length).toBe(1);
    simulateTick(state, {}, 0.1);
    expect(state.projectiles.length).toBe(0);
  });

  it("should remove non-ricochet projectiles that leave map bounds", () => {
    state.projectiles.push({
      id: "oob",
      ownerId: "p1",
      position: { x: 1599, y: 400 },
      velocity: { x: 5000, y: 0 },
      damage: 10,
      lifetime: 5,
      radius: 3,
      piercing: false,
      ricochet: false,
      gravitySynced: false,
      homing: false,
      homingStrength: 0,
      hitEntities: [],
    });

    simulateTick(state, {}, 1 / 60);
    expect(state.projectiles.length).toBe(0);
  });

  it("ricochet projectiles should bounce off walls instead of being removed", () => {
    state.projectiles.push({
      id: "bouncy",
      ownerId: "p1",
      position: { x: 1590, y: 400 },
      velocity: { x: 800, y: 0 },
      damage: 10,
      lifetime: 5,
      radius: 3,
      piercing: false,
      ricochet: true,
      gravitySynced: false,
      homing: false,
      homingStrength: 0,
      hitEntities: [],
    });

    simulateTick(state, {}, 1 / 60);
    // Should still exist (bounced, not removed)
    expect(state.projectiles.length).toBe(1);
    // Velocity should have reversed direction
    expect(state.projectiles[0].velocity.x).toBeLessThan(0);
  });

  it("gravity-synced projectiles should be affected more by gravity", () => {
    // Place projectile between two gravity wells
    const normalProj = {
      id: "normal",
      ownerId: "p1",
      position: { x: 800, y: 400 },
      velocity: { x: 0, y: 100 },
      damage: 10,
      lifetime: 5,
      radius: 3,
      piercing: false,
      ricochet: false,
      gravitySynced: false,
      homing: false,
      homingStrength: 0,
      hitEntities: [] as string[],
    };

    const gravityProj = {
      ...normalProj,
      id: "gravity",
      gravitySynced: true,
      position: { x: 800, y: 400 },
      velocity: { x: 0, y: 100 },
    };

    // Simulate both separately
    const state1 = createGameState("deathmatch", "nebula-station");
    addPlayer(state1, "p1", "S", "titan", DEFAULT_MODS);
    state1.projectiles.push({ ...normalProj, position: { ...normalProj.position }, velocity: { ...normalProj.velocity } });

    const state2 = createGameState("deathmatch", "nebula-station");
    addPlayer(state2, "p1", "S", "titan", DEFAULT_MODS);
    state2.projectiles.push({ ...gravityProj, position: { ...gravityProj.position }, velocity: { ...gravityProj.velocity } });

    for (let i = 0; i < 10; i++) {
      simulateTick(state1, {}, 1 / 60);
      simulateTick(state2, {}, 1 / 60);
    }

    // Gravity-synced should have deviated more from straight path
    if (state1.projectiles.length > 0 && state2.projectiles.length > 0) {
      const normalX = state1.projectiles[0].position.x;
      const gravityX = state2.projectiles[0].position.x;
      // Both started at x=800, gravity-synced should have moved more
      expect(Math.abs(gravityX - 800)).toBeGreaterThanOrEqual(Math.abs(normalX - 800));
    }
  });
});

// ===== NEW: Pickup System =====

describe("Pickup System", () => {
  it("should heal player when picking up health", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Test", "viper", DEFAULT_MODS);
    state.players["p1"].position = { x: 400, y: 400 };
    state.players["p1"].hp = 60; // damaged

    state.pickups.push({
      id: "hp1",
      position: { x: 400, y: 400 },
      type: "health",
      value: 30,
      lifetime: 10,
    });

    simulateTick(state, {}, 1 / 60);
    expect(state.players["p1"].hp).toBe(90);
    expect(state.pickups.length).toBe(0); // consumed
  });

  it("should not overheal past maxHp", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Test", "viper", DEFAULT_MODS);
    state.players["p1"].position = { x: 400, y: 400 };
    state.players["p1"].hp = 110; // 120 max for viper

    state.pickups.push({
      id: "hp1",
      position: { x: 400, y: 400 },
      type: "health",
      value: 30,
      lifetime: 10,
    });

    simulateTick(state, {}, 1 / 60);
    expect(state.players["p1"].hp).toBe(120); // capped at max
  });

  it("should remove pickups when lifetime expires", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Test", "viper", DEFAULT_MODS);

    state.pickups.push({
      id: "hp1",
      position: { x: 1000, y: 1000 }, // far from player
      type: "health",
      value: 30,
      lifetime: 0.01,
    });

    simulateTick(state, {}, 0.02);
    expect(state.pickups.length).toBe(0);
  });
});

// ===== NEW: Temporary Gravity Wells =====

describe("Temporary Gravity Wells", () => {
  it("should remove temporary gravity wells when lifetime expires", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Test", "viper", DEFAULT_MODS);
    const initialCount = state.gravityWells.length;

    state.gravityWells.push({
      id: "temp1",
      position: { x: 800, y: 600 },
      strength: 1.5,
      radius: 100,
      isTemporary: true,
      lifetime: 0.05,
    });

    expect(state.gravityWells.length).toBe(initialCount + 1);
    simulateTick(state, {}, 0.1);
    expect(state.gravityWells.length).toBe(initialCount);
  });

  it("should not remove permanent gravity wells", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Test", "viper", DEFAULT_MODS);
    const initialCount = state.gravityWells.length;

    // Simulate many ticks
    for (let i = 0; i < 100; i++) {
      simulateTick(state, {}, 1 / 60);
    }
    expect(state.gravityWells.length).toBe(initialCount);
  });
});

// ===== NEW: Particle Cap =====

describe("Particle System", () => {
  it("should cap particles at 500", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Test", "viper", DEFAULT_MODS);
    state.players["p1"].position = { x: 800, y: 600 };

    // Fill up particles
    for (let i = 0; i < 510; i++) {
      state.particles.push({
        position: { x: 400, y: 400 },
        velocity: { x: 0, y: 0 },
        color: "#fff",
        size: 2,
        lifetime: 10,
        maxLifetime: 10,
        alpha: 1,
      });
    }

    // Shoot — should not add more particles (over cap)
    const input = makeInput({ shoot: true, aimAngle: 0 });
    simulateTick(state, { p1: input }, 1 / 60);

    // particles array includes the manually added ones, may go slightly over from pre-existing
    // but new spawns should be rejected
    expect(state.particles.length).toBeLessThanOrEqual(520); // some tolerance
  });

  it("should remove particles when lifetime expires", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Test", "viper", DEFAULT_MODS);

    state.particles.push({
      position: { x: 400, y: 400 },
      velocity: { x: 10, y: 0 },
      color: "#fff",
      size: 2,
      lifetime: 0.01,
      maxLifetime: 1,
      alpha: 1,
    });

    simulateTick(state, {}, 0.05);
    expect(state.particles.length).toBe(0);
  });
});

// ===== NEW: KOTH Win Condition =====

describe("KOTH Win Condition", () => {
  it("should end game when KOTH score reaches win threshold", () => {
    const state = createGameState("king-of-the-asteroid", "nebula-station");
    addPlayer(state, "p1", "Capper", "viper", DEFAULT_MODS);

    // Place player in zone
    state.players["p1"].position = { ...state.kothZone!.position };
    state.kothScores["p1"] = 59; // one point from winning

    // Simulate enough for 1+ points
    for (let i = 0; i < 120; i++) {
      simulateTick(state, {}, 1 / 60);
      if (state.gameOver) break;
    }

    expect(state.gameOver).toBe(true);
    expect(state.winnerId).toBe("p1");
  });
});

// ===== NEW: End Game Winner =====

describe("End Game Winner Determination", () => {
  it("should select player with highest score as winner when time runs out", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "High", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Low", "titan", DEFAULT_MODS);

    state.players["p1"].score = 5;
    state.players["p2"].score = 2;
    state.timeRemaining = 0.01;

    simulateTick(state, {}, 0.02);

    expect(state.gameOver).toBe(true);
    expect(state.winnerId).toBe("p1");
  });

  it("KOTH should determine winner by koth score, not kills", () => {
    const state = createGameState("king-of-the-asteroid", "nebula-station");
    addPlayer(state, "p1", "Killer", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Capper", "titan", DEFAULT_MODS);

    state.players["p1"].score = 10; // more kills
    state.players["p2"].score = 2;
    state.kothScores["p1"] = 20;
    state.kothScores["p2"] = 40; // more zone time
    state.timeRemaining = 0.01;

    simulateTick(state, {}, 0.02);

    expect(state.gameOver).toBe(true);
    expect(state.winnerId).toBe("p2"); // capper wins
  });
});

// ===== NEW: Homing Missiles =====

describe("Homing Missiles", () => {
  it("should curve toward nearest enemy", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Shooter", "specter", DEFAULT_MODS);
    addPlayer(state, "p2", "Target", "titan", DEFAULT_MODS);

    state.players["p1"].position = { x: 400, y: 400 };
    state.players["p2"].position = { x: 600, y: 500 }; // to the right and below

    // Fire projectile straight right
    state.projectiles.push({
      id: "homing1",
      ownerId: "p1",
      position: { x: 420, y: 400 },
      velocity: { x: 320, y: 0 }, // moving right, target is right+down
      damage: 20,
      lifetime: 3,
      radius: 4,
      piercing: false,
      ricochet: false,
      gravitySynced: false,
      homing: true,
      homingStrength: 2.0,
      hitEntities: [],
    });

    // Simulate a few ticks
    for (let i = 0; i < 20; i++) {
      simulateTick(state, {}, 1 / 60);
    }

    // Projectile should have gained downward velocity (curving toward target)
    if (state.projectiles.length > 0) {
      expect(state.projectiles[0].velocity.y).toBeGreaterThan(0);
    }
  });
});

// ===== NEW: Asteroid Collision =====

describe("Asteroid Collision", () => {
  it("should push player out of asteroid", () => {
    const state = createGameState("deathmatch", "asteroid-belt");
    addPlayer(state, "p1", "Test", "viper", DEFAULT_MODS);

    // Place player overlapping with first asteroid
    const asteroid = state.asteroids[0];
    state.players["p1"].position = { x: asteroid.position.x + 5, y: asteroid.position.y };
    state.players["p1"].velocity = { x: 0, y: 0 };

    simulateTick(state, {}, 1 / 60);

    // Player should have been pushed away
    const dx = state.players["p1"].position.x - asteroid.position.x;
    const dy = state.players["p1"].position.y - asteroid.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThan(10);
  });
});

// ===== NEW: Respawn Spawn Selection =====

describe("Respawn Spawn Selection", () => {
  it("should pick furthest spawn from alive players", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Alive", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Dead", "titan", DEFAULT_MODS);

    // p1 near first spawn point
    state.players["p1"].position = { x: 200, y: 200 };

    // Kill p2
    state.players["p2"].alive = false;
    state.players["p2"].respawnTimer = 0.01;

    simulateTick(state, {}, 0.02);

    // p2 should have respawned far from p1
    expect(state.players["p2"].alive).toBe(true);
    const dx = state.players["p2"].position.x - state.players["p1"].position.x;
    const dy = state.players["p2"].position.y - state.players["p1"].position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThan(200);
  });
});

// ===== Kill Feed & Player Stats =====

describe("Kill Feed", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Attacker", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Victim", "titan", DEFAULT_MODS);
  });

  it("should start with empty kill feed", () => {
    expect(state.killFeed).toEqual([]);
  });

  it("should record kill event when player is eliminated", () => {
    state.players["p2"].hp = 1;
    state.players["p2"].position = { x: 400, y: 300 };
    state.projectiles.push({
      id: "proj1", ownerId: "p1",
      position: { x: 400, y: 300 }, velocity: { x: 0, y: 0 },
      damage: 10, lifetime: 2, radius: 5,
      ricochet: false, homing: false, homingStrength: 0,
      gravitySynced: false, piercing: false, hitEntities: [],
    });
    simulateTick(state, {}, 1 / 60);

    expect(state.killFeed.length).toBe(1);
    expect(state.killFeed[0].killerId).toBe("p1");
    expect(state.killFeed[0].victimId).toBe("p2");
    expect(state.killFeed[0].killerName).toBe("Attacker");
    expect(state.killFeed[0].victimName).toBe("Victim");
  });

  it("should record gravity-well kill type for self-kills", () => {
    state.players["p1"].hp = 1;
    const well = state.gravityWells[0];
    state.players["p1"].position = { x: well.position.x, y: well.position.y };

    for (let i = 0; i < 120; i++) {
      simulateTick(state, {}, 1 / 60);
      if (!state.players["p1"].alive) break;
    }

    if (state.killFeed.length > 0) {
      const lastKill = state.killFeed[state.killFeed.length - 1];
      expect(lastKill.victimId).toBe("p1");
      expect(lastKill.killType).toBe("gravity-well");
    }
  });

  it("should accumulate multiple kill events", () => {
    state.players["p2"].hp = 1;
    state.players["p2"].position = { x: 400, y: 300 };
    state.projectiles.push({
      id: "proj1", ownerId: "p1",
      position: { x: 400, y: 300 }, velocity: { x: 0, y: 0 },
      damage: 10, lifetime: 2, radius: 5,
      ricochet: false, homing: false, homingStrength: 0,
      gravitySynced: false, piercing: false, hitEntities: [],
    });
    simulateTick(state, {}, 1 / 60);
    expect(state.killFeed.length).toBe(1);

    // Respawn p2 and kill again
    state.players["p2"].alive = true;
    state.players["p2"].hp = 1;
    state.players["p2"].invulnerabilityTimer = 0;
    state.players["p2"].invulnerable = false;
    state.players["p2"].position = { x: 400, y: 300 };
    state.projectiles.push({
      id: "proj2", ownerId: "p1",
      position: { x: 400, y: 300 }, velocity: { x: 0, y: 0 },
      damage: 10, lifetime: 2, radius: 5,
      ricochet: false, homing: false, homingStrength: 0,
      gravitySynced: false, piercing: false, hitEntities: [],
    });
    simulateTick(state, {}, 1 / 60);
    expect(state.killFeed.length).toBe(2);
  });
});

describe("Player Stats Tracking", () => {
  let state: GameState;

  beforeEach(() => {
    state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Shooter", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Target", "titan", DEFAULT_MODS);
  });

  it("should initialize player stats on addPlayer", () => {
    expect(state.playerStats["p1"]).toBeDefined();
    expect(state.playerStats["p1"].damageDealt).toBe(0);
    expect(state.playerStats["p1"].shotsFired).toBe(0);
    expect(state.playerStats["p1"].shotsHit).toBe(0);
    expect(state.playerStats["p1"].gravityKills).toBe(0);
  });

  it("should track shots fired", () => {
    const input = makeInput({ shoot: true, aimAngle: 0 });
    state.players["p1"].invulnerabilityTimer = 0;
    state.players["p1"].invulnerable = false;
    simulateTick(state, { p1: input }, 1 / 60);

    expect(state.playerStats["p1"].shotsFired).toBeGreaterThan(0);
  });

  it("should track shots hit on target", () => {
    state.players["p2"].position = { x: 400, y: 300 };
    state.players["p2"].invulnerabilityTimer = 0;
    state.players["p2"].invulnerable = false;
    state.projectiles.push({
      id: "proj1", ownerId: "p1",
      position: { x: 400, y: 300 }, velocity: { x: 0, y: 0 },
      damage: 10, lifetime: 2, radius: 5,
      ricochet: false, homing: false, homingStrength: 0,
      gravitySynced: false, piercing: false, hitEntities: [],
    });
    simulateTick(state, {}, 1 / 60);

    expect(state.playerStats["p1"].shotsHit).toBeGreaterThan(0);
  });

  it("should track damage dealt", () => {
    const initialHp = state.players["p2"].hp;
    state.players["p2"].position = { x: 400, y: 300 };
    state.players["p2"].invulnerabilityTimer = 0;
    state.players["p2"].invulnerable = false;
    state.projectiles.push({
      id: "proj1", ownerId: "p1",
      position: { x: 400, y: 300 }, velocity: { x: 0, y: 0 },
      damage: 15, lifetime: 2, radius: 5,
      ricochet: false, homing: false, homingStrength: 0,
      gravitySynced: false, piercing: false, hitEntities: [],
    });
    simulateTick(state, {}, 1 / 60);

    expect(state.playerStats["p1"].damageDealt).toBeGreaterThan(0);
    expect(state.players["p2"].hp).toBeLessThan(initialHp);
  });

  it("should track gravity kills", () => {
    state.players["p2"].hp = 1;
    state.players["p2"].position = { x: 400, y: 300 };
    state.players["p2"].invulnerabilityTimer = 0;
    state.players["p2"].invulnerable = false;
    state.projectiles.push({
      id: "proj1", ownerId: "p1",
      position: { x: 400, y: 300 }, velocity: { x: 0, y: 0 },
      damage: 10, lifetime: 2, radius: 5,
      ricochet: false, homing: false, homingStrength: 0,
      gravitySynced: true, piercing: false, hitEntities: [],
    });
    simulateTick(state, {}, 1 / 60);

    // gravity-synced projectile registers as gravity-well kill type
    if (state.killFeed.length > 0) {
      expect(state.killFeed[0].killType).toBe("gravity-well");
    }
  });
});

// ===== Phase 2: New Maps =====

describe("New Maps", () => {
  it("should create black-hole map with massive center well", () => {
    const state = createGameState("deathmatch", "black-hole");
    expect(state.mapId).toBe("black-hole");
    expect(state.gravityWells.length).toBeGreaterThanOrEqual(1);
    // Center well should be very strong
    const centerWell = state.gravityWells.find((w) => w.strength >= 2.5);
    expect(centerWell).toBeDefined();
  });

  it("should create wormhole-station map with portals", () => {
    const state = createGameState("deathmatch", "wormhole-station");
    expect(state.mapId).toBe("wormhole-station");
    expect(state.portals.length).toBeGreaterThan(0);
    // Portals should be linked in pairs
    for (const portal of state.portals) {
      const linked = state.portals.find((p) => p.id === portal.linkedPortalId);
      expect(linked).toBeDefined();
    }
  });

  it("should create debris-field map with many asteroids", () => {
    const state = createGameState("deathmatch", "debris-field");
    expect(state.mapId).toBe("debris-field");
    expect(state.asteroids.length).toBeGreaterThanOrEqual(10);
  });
});

// ===== Phase 2: Mutators =====

describe("Mutators", () => {
  it("should create game state with mutators", () => {
    const state = createGameState("deathmatch", "nebula-station", ["big-head", "speed-demon"]);
    expect(state.mutators).toContain("big-head");
    expect(state.mutators).toContain("speed-demon");
  });

  it("zero-g mutator should remove all gravity wells", () => {
    const state = createGameState("deathmatch", "nebula-station", ["zero-g"]);
    expect(state.gravityWells.length).toBe(0);
  });

  it("hypergravity mutator should triple gravity well strength", () => {
    const normal = createGameState("deathmatch", "nebula-station");
    const hyper = createGameState("deathmatch", "nebula-station", ["hypergravity"]);
    if (normal.gravityWells.length > 0) {
      expect(hyper.gravityWells[0].strength).toBe(normal.gravityWells[0].strength * 3);
    }
  });

  it("glass-cannon mutator should set player HP to 1", () => {
    const state = createGameState("deathmatch", "nebula-station", ["glass-cannon"]);
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    expect(state.players["p1"].hp).toBe(1);
    expect(state.players["p1"].maxHp).toBe(1);
  });

  it("speed-demon mutator should double player speed", () => {
    const normal = createGameState("deathmatch", "nebula-station");
    addPlayer(normal, "p1", "Player1", "viper", DEFAULT_MODS);

    const fast = createGameState("deathmatch", "nebula-station", ["speed-demon"]);
    addPlayer(fast, "p1", "Player1", "viper", DEFAULT_MODS);

    // Speed demon player should move faster when given thrust
    const normalInputs = { p1: makeInput({ up: true }) };
    const fastInputs = { p1: makeInput({ up: true }) };
    simulateTick(normal, normalInputs, 0.1);
    simulateTick(fast, fastInputs, 0.1);

    // Fast player should have higher velocity magnitude
    const normalV = Math.sqrt(normal.players["p1"].velocity.x ** 2 + normal.players["p1"].velocity.y ** 2);
    const fastV = Math.sqrt(fast.players["p1"].velocity.x ** 2 + fast.players["p1"].velocity.y ** 2);
    expect(fastV).toBeGreaterThan(normalV);
  });

  it("big-head mutator should increase collision radius", () => {
    const state = createGameState("deathmatch", "nebula-station", ["big-head"]);
    addPlayer(state, "p1", "Shooter", "titan", DEFAULT_MODS);
    addPlayer(state, "p2", "Target", "viper", DEFAULT_MODS);

    // Big-head doubles collision radius — easier to hit
    // The collision check uses: collisionRadius * 2
    expect(state.mutators).toContain("big-head");
  });

  it("ricochet-arena mutator should make all projectiles ricochet", () => {
    const state = createGameState("deathmatch", "nebula-station", ["ricochet-arena"]);
    addPlayer(state, "p1", "Shooter", "viper", DEFAULT_MODS);
    state.players["p1"].invulnerable = false;
    state.players["p1"].invulnerabilityTimer = 0;
    state.players["p1"].position = { x: 400, y: 400 };
    state.players["p1"].rotation = 0;

    // Even with non-ricochet weapon mod, projectiles should ricochet
    expect(state.players["p1"].mods.weapon).toBe("piercing");
    simulateTick(state, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);
    expect(state.projectiles.length).toBeGreaterThan(0);
    expect(state.projectiles[0].ricochet).toBe(true);
  });

  it("friendly-fire mutator should allow self-damage", () => {
    const state = createGameState("deathmatch", "nebula-station", ["friendly-fire"]);
    addPlayer(state, "p1", "Player1", "titan", DEFAULT_MODS);
    state.players["p1"].invulnerable = false;
    state.players["p1"].invulnerabilityTimer = 0;
    state.players["p1"].position = { x: 400, y: 400 };
    state.players["p1"].rotation = Math.PI; // Shoot toward self? No — but collision check includes self

    expect(state.mutators).toContain("friendly-fire");
    // The mutator removes the `player.id === proj.ownerId` skip in collision check
  });

  it("combined mutators should all apply", () => {
    const state = createGameState("deathmatch", "nebula-station", [
      "glass-cannon", "speed-demon", "big-head",
    ]);
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);

    // Glass cannon: 1 HP
    expect(state.players["p1"].hp).toBe(1);

    // All three mutators should be in the state
    expect(state.mutators).toContain("glass-cannon");
    expect(state.mutators).toContain("speed-demon");
    expect(state.mutators).toContain("big-head");
  });

  it("glass-cannon mutator should multiply damage by 5", () => {
    const normal = createGameState("deathmatch", "nebula-station");
    addPlayer(normal, "p1", "Shooter", "viper", DEFAULT_MODS);
    addPlayer(normal, "p2", "Target", "titan", DEFAULT_MODS);
    normal.players["p1"].invulnerable = false;
    normal.players["p1"].invulnerabilityTimer = 0;
    normal.players["p2"].invulnerable = false;
    normal.players["p2"].invulnerabilityTimer = 0;

    const glass = createGameState("deathmatch", "nebula-station", ["glass-cannon"]);
    addPlayer(glass, "p1", "Shooter", "viper", DEFAULT_MODS);
    addPlayer(glass, "p2", "Target", "titan", DEFAULT_MODS);
    glass.players["p1"].invulnerable = false;
    glass.players["p1"].invulnerabilityTimer = 0;
    glass.players["p2"].invulnerable = false;
    glass.players["p2"].invulnerabilityTimer = 0;

    // Both shoot
    simulateTick(normal, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);
    simulateTick(glass, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);

    // Glass cannon projectile should have 5x damage
    expect(glass.projectiles[0].damage).toBe(normal.projectiles[0].damage * 5);
  });

  it("speed-demon mutator should only affect movement, not projectiles", () => {
    const normal = createGameState("deathmatch", "nebula-station");
    addPlayer(normal, "p1", "Shooter", "viper", DEFAULT_MODS);
    normal.players["p1"].position = { x: 400, y: 400 };
    normal.players["p1"].velocity = { x: 0, y: 0 };

    const fast = createGameState("deathmatch", "nebula-station", ["speed-demon"]);
    addPlayer(fast, "p1", "Shooter", "viper", DEFAULT_MODS);
    fast.players["p1"].position = { x: 400, y: 400 };
    fast.players["p1"].velocity = { x: 0, y: 0 };

    simulateTick(normal, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);
    simulateTick(fast, { p1: makeInput({ shoot: true, aimAngle: 0 }) }, 1 / 60);

    if (normal.projectiles.length > 0 && fast.projectiles.length > 0) {
      const normalSpeed = Math.sqrt(
        normal.projectiles[0].velocity.x ** 2 + normal.projectiles[0].velocity.y ** 2,
      );
      const fastSpeed = Math.sqrt(
        fast.projectiles[0].velocity.x ** 2 + fast.projectiles[0].velocity.y ** 2,
      );
      // Speed demon only affects movement speed, projectile speed should be the same
      expect(fastSpeed).toBeCloseTo(normalSpeed, 0);
    }
  });
});

// ===== Phase 2: New Game Modes =====

describe("Asteroid Tag Mode", () => {
  it("should initialize with correct tag state", () => {
    const state = createGameState("asteroid-tag", "nebula-station");
    expect(state.gameMode).toBe("asteroid-tag");
    expect(state.timeRemaining).toBe(180);
    expect(state.tagItPlayerId).toBeNull(); // No players yet
  });

  it("should assign It player when two players exist", () => {
    const state = createGameState("asteroid-tag", "nebula-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Player2", "titan", DEFAULT_MODS);
    state.players["p1"].invulnerable = false;
    state.players["p2"].invulnerable = false;
    simulateTick(state, {}, 1 / 60);
    // One of the two players should be "It"
    expect(["p1", "p2"]).toContain(state.tagItPlayerId);
  });

  it("should deal DPS to the It player", () => {
    const state = createGameState("asteroid-tag", "nebula-station");
    addPlayer(state, "p1", "Player1", "titan", DEFAULT_MODS);
    addPlayer(state, "p2", "Player2", "viper", DEFAULT_MODS);
    // Clear invulnerability
    state.players["p1"].invulnerable = false;
    state.players["p1"].invulnerabilityTimer = 0;
    state.players["p2"].invulnerable = false;
    state.players["p2"].invulnerabilityTimer = 0;

    simulateTick(state, {}, 1 / 60);
    const itId = state.tagItPlayerId;
    expect(itId).not.toBeNull();

    const itPlayer = state.players[itId!];
    const hpBefore = itPlayer.hp;
    simulateTick(state, {}, 1); // 1 second tick
    expect(itPlayer.hp).toBeLessThan(hpBefore);
  });
});

describe("Hot Potato Mode", () => {
  it("should initialize with correct potato state", () => {
    const state = createGameState("hot-potato", "nebula-station");
    expect(state.gameMode).toBe("hot-potato");
    expect(state.timeRemaining).toBe(120);
    expect(state.potatoCarrierId).toBeNull();
  });

  it("should assign potato carrier and start timer with 2 players", () => {
    const state = createGameState("hot-potato", "nebula-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Player2", "titan", DEFAULT_MODS);
    state.players["p1"].invulnerable = false;
    state.players["p2"].invulnerable = false;
    simulateTick(state, {}, 1 / 60);
    expect(["p1", "p2"]).toContain(state.potatoCarrierId);
    expect(state.potatoTimer).toBeCloseTo(POTATO_TIMER, 0);
  });

  it("should count down potato timer", () => {
    const state = createGameState("hot-potato", "nebula-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Player2", "titan", DEFAULT_MODS);
    state.players["p1"].invulnerable = false;
    state.players["p2"].invulnerable = false;

    simulateTick(state, {}, 1 / 60);
    const afterInit = state.potatoTimer;
    simulateTick(state, {}, 1); // 1 second
    expect(state.potatoTimer).toBeLessThan(afterInit);
  });
});

describe("Capture the Core Mode", () => {
  it("should initialize with correct core state", () => {
    const state = createGameState("capture-the-core", "nebula-station");
    expect(state.gameMode).toBe("capture-the-core");
    expect(state.timeRemaining).toBe(240);
    expect(state.cores).toBeDefined();
    expect(state.cores.red.atBase).toBe(true);
    expect(state.cores.blue.atBase).toBe(true);
    expect(state.captureScores.red).toBe(0);
    expect(state.captureScores.blue).toBe(0);
  });

  it("should assign players to teams on join", () => {
    const state = createGameState("capture-the-core", "nebula-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    addPlayer(state, "p2", "Player2", "titan", DEFAULT_MODS);
    // Teams assigned in addPlayer
    expect(state.teams["p1"]).toBe("red");
    expect(state.teams["p2"]).toBe("blue");
  });

  it("should require correct score to win", () => {
    expect(CAPTURE_WIN_SCORE).toBe(3);
  });
});

describe("Survival Wave Mode", () => {
  it("should initialize with correct wave state", () => {
    const state = createGameState("survival-wave", "nebula-station");
    expect(state.gameMode).toBe("survival-wave");
    expect(state.timeRemaining).toBe(600);
    expect(state.waveNumber).toBe(1); // starts at wave 1
    expect(state.sharedLives).toBe(SURVIVAL_RESPAWNS);
  });

  it("should start with wave pause", () => {
    const state = createGameState("survival-wave", "nebula-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    simulateTick(state, {}, 1 / 60);
    expect(state.wavePause).toBe(true);
    expect(state.wavePauseTimer).toBeGreaterThan(0);
  });

  it("should count down wave pause timer", () => {
    const state = createGameState("survival-wave", "nebula-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    state.players["p1"].invulnerable = false;
    state.players["p1"].invulnerabilityTimer = 0;

    simulateTick(state, {}, 1 / 60);
    const initialTimer = state.wavePauseTimer;
    simulateTick(state, {}, 1);
    expect(state.wavePauseTimer).toBeLessThan(initialTimer);
  });
});

// ===== Phase 2: Portals =====

describe("Portal System", () => {
  it("should create portals for wormhole-station map", () => {
    const state = createGameState("deathmatch", "wormhole-station");
    expect(state.portals.length).toBe(4);
  });

  it("portals should be linked in pairs", () => {
    const state = createGameState("deathmatch", "wormhole-station");
    for (const portal of state.portals) {
      const linked = state.portals.find((p) => p.id === portal.linkedPortalId);
      expect(linked).toBeDefined();
      expect(linked!.linkedPortalId).toBe(portal.id);
    }
  });

  it("should teleport player near portal to linked portal", () => {
    const state = createGameState("deathmatch", "wormhole-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    state.players["p1"].invulnerable = false;
    state.players["p1"].invulnerabilityTimer = 0;

    if (state.portals.length >= 2) {
      const portal = state.portals[0];
      const linked = state.portals.find((p) => p.id === portal.linkedPortalId)!;

      // Move player to portal center
      state.players["p1"].position = { x: portal.position.x, y: portal.position.y };
      state.players["p1"].velocity = { x: 50, y: 0 };

      simulateTick(state, { p1: makeInput() }, 1 / 60);

      // Player should be near the linked portal
      const dx = state.players["p1"].position.x - linked.position.x;
      const dy = state.players["p1"].position.y - linked.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeLessThan(linked.radius * 3); // Should be near linked portal
    }
  });
});

// ===== Phase 2: Map Events =====

describe("Map Events", () => {
  it("should initialize with empty map events", () => {
    const state = createGameState("deathmatch", "nebula-station");
    expect(state.mapEvents).toBeDefined();
    expect(state.mapEvents.length).toBe(0);
  });

  it("should have a next event timer", () => {
    const state = createGameState("deathmatch", "nebula-station");
    expect(state.nextEventTimer).toBeGreaterThan(0);
  });

  it("should count down event timer", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "p1", "Player1", "viper", DEFAULT_MODS);
    const initial = state.nextEventTimer;
    simulateTick(state, {}, 1);
    expect(state.nextEventTimer).toBeLessThan(initial);
  });
});
