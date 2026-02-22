import { describe, it, expect, beforeEach } from "vitest";
import {
  createGameState, addPlayer, removePlayer, simulateTick,
} from "./game-simulation";
import { GameState, PlayerInput, ModLoadout } from "./types";

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
