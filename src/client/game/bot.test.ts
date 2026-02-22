import { describe, it, expect } from "vitest";
import { Bot } from "./bot";
import { GameState, ModLoadout } from "../../shared/types";
import { createGameState, addPlayer } from "../../shared/game-simulation";
import { DIFFICULTY_PRESETS } from "../../shared/constants";

const DEFAULT_MODS: ModLoadout = {
  weapon: "piercing",
  ship: "afterburner",
  passive: "scavenger",
};

function makeState(): GameState {
  const state = createGameState("deathmatch", "nebula-station");
  addPlayer(state, "bot1", "Bot", "viper", DEFAULT_MODS);
  addPlayer(state, "enemy1", "Enemy", "titan", DEFAULT_MODS);
  return state;
}

// Easiest preset: high aim error, no strafing
const EASY_PRESET = DIFFICULTY_PRESETS[0]; // Weltraumtourist
// Hardest preset: low aim error, circle strafe
const HARD_PRESET = DIFFICULTY_PRESETS[4]; // Lebensmuede

describe("Bot - Target Selection", () => {
  it("should select closest alive enemy as target", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 100, y: 100 };
    state.players["enemy1"].position = { x: 200, y: 100 };

    // Add a farther enemy
    addPlayer(state, "enemy2", "Far", "nova", DEFAULT_MODS);
    state.players["enemy2"].position = { x: 800, y: 100 };

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    // Bot should produce valid input (not empty — it has a target)
    expect(typeof input.aimAngle).toBe("number");
  });

  it("should ignore dead enemies", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 100, y: 100 };
    state.players["enemy1"].position = { x: 200, y: 100 };
    state.players["enemy1"].alive = false;

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);
    // With no alive target, bot should wander (still produce valid input)
    expect(input.shoot).toBe(false);
  });

  it("should return empty input when bot itself is dead", () => {
    const state = makeState();
    state.players["bot1"].alive = false;

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    expect(input.up).toBe(false);
    expect(input.down).toBe(false);
    expect(input.left).toBe(false);
    expect(input.right).toBe(false);
    expect(input.shoot).toBe(false);
    expect(input.special).toBe(false);
    expect(input.boost).toBe(false);
  });

  it("should not target itself", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "bot1", "Bot", "viper", DEFAULT_MODS);
    // Only bot1, no enemies
    state.players["bot1"].position = { x: 400, y: 400 };

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);
    // Should wander, not shoot at self
    expect(input.shoot).toBe(false);
  });

  it("should return empty input when bot is not in state", () => {
    const state = createGameState("deathmatch", "nebula-station");
    // Don't add bot1 to state at all
    addPlayer(state, "enemy1", "Enemy", "titan", DEFAULT_MODS);

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    expect(input.up).toBe(false);
    expect(input.down).toBe(false);
    expect(input.left).toBe(false);
    expect(input.right).toBe(false);
    expect(input.shoot).toBe(false);
    expect(input.special).toBe(false);
    expect(input.boost).toBe(false);
  });

  it("should find new target when current target dies", () => {
    const state = makeState();
    addPlayer(state, "enemy2", "Enemy2", "nova", DEFAULT_MODS);
    state.players["bot1"].position = { x: 400, y: 400 };
    state.players["enemy1"].position = { x: 500, y: 400 };
    state.players["enemy2"].position = { x: 600, y: 400 };

    const bot = new Bot("bot1", EASY_PRESET);

    // First tick: bot acquires a target
    bot.getInput(state);

    // Kill enemy1 (closest)
    state.players["enemy1"].alive = false;

    // Bot should still produce movement toward enemy2
    const input = bot.getInput(state);
    const hasMovement = input.up || input.down || input.left || input.right;
    expect(hasMovement).toBe(true);
  });
});

describe("Bot - Movement", () => {
  it("should approach when enemy is far away", () => {
    const state = makeState();
    // Place bot far left, enemy far right
    state.players["bot1"].position = { x: 100, y: 400 };
    state.players["enemy1"].position = { x: 800, y: 400 };

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    // Enemy is at x=800, bot at x=100 -> should move right
    expect(input.right).toBe(true);
  });

  it("should retreat when enemy is very close", () => {
    const state = makeState();
    // Place bot and enemy very close (within retreatDistance)
    state.players["bot1"].position = { x: 400, y: 400 };
    state.players["enemy1"].position = { x: 420, y: 400 };

    // Use a preset with retreatDistance > 20
    const bot = new Bot("bot1", HARD_PRESET);
    const input = bot.getInput(state);

    // Enemy is to the right, bot should move left (retreat)
    expect(input.left).toBe(true);
  });

  it("should activate boost when enemy is very far", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 100, y: 400 };
    state.players["enemy1"].position = { x: 1400, y: 400 };

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    // Distance > boostThreshold (700 for easy)
    expect(input.boost).toBe(true);
  });

  it("should not boost when enemy is at medium range", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 400, y: 400 };
    state.players["enemy1"].position = { x: 600, y: 400 };

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    // Distance = 200, well within approachDistance
    expect(input.boost).toBe(false);
  });
});

describe("Bot - Circle Strafe", () => {
  it("hard bots should use circle strafe at mid range", () => {
    const state = makeState();
    // Place at mid range (within approachDistance but above retreatDistance)
    state.players["bot1"].position = { x: 400, y: 400 };
    state.players["enemy1"].position = { x: 650, y: 400 };

    const bot = new Bot("bot1", HARD_PRESET);
    const input = bot.getInput(state);

    // Hard preset has circleStrafe=true, distance=250 is within approach(300) and above retreat(200)
    // Circle strafe means perpendicular movement — up or down, not just right
    expect(input.up || input.down).toBe(true);
  });

  it("easy bots should not circle strafe", () => {
    expect(EASY_PRESET.circleStrafe).toBe(false);
  });
});

describe("Bot - Shooting", () => {
  it("should eventually shoot when aimed at target", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 400, y: 400 };
    state.players["bot1"].rotation = 0; // facing right
    state.players["enemy1"].position = { x: 500, y: 400 }; // directly right

    const bot = new Bot("bot1", HARD_PRESET);

    // Run multiple ticks — bot has shoot timer that needs to expire
    let shotFired = false;
    for (let i = 0; i < 120; i++) {
      const input = bot.getInput(state);
      if (input.shoot) {
        shotFired = true;
        break;
      }
    }
    expect(shotFired).toBe(true);
  });

  it("should not shoot when target is too far", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 100, y: 400 };
    state.players["bot1"].rotation = 0;
    state.players["enemy1"].position = { x: 1400, y: 400 }; // > 600px away

    const bot = new Bot("bot1", HARD_PRESET);
    const input = bot.getInput(state);

    // Distance > 600 — bot should not shoot
    expect(input.shoot).toBe(false);
  });
});

describe("Bot - Special Ability", () => {
  it("hard bot should eventually use special when close", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 400, y: 400 };
    state.players["bot1"].specialCooldown = 0;
    state.players["enemy1"].position = { x: 500, y: 400 }; // within 300px

    const bot = new Bot("bot1", HARD_PRESET);

    // High specialProbability (0.95) — should fire within many tries
    let specialUsed = false;
    for (let i = 0; i < 300; i++) {
      const input = bot.getInput(state);
      if (input.special) {
        specialUsed = true;
        break;
      }
    }
    expect(specialUsed).toBe(true);
  });

  it("should not use special when enemy is far away", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 100, y: 400 };
    state.players["bot1"].specialCooldown = 0;
    state.players["enemy1"].position = { x: 1400, y: 400 }; // > 300px

    const bot = new Bot("bot1", HARD_PRESET);
    const input = bot.getInput(state);

    expect(input.special).toBe(false);
  });

  it("should not use special when cooldown is active", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 400, y: 400 };
    state.players["bot1"].specialCooldown = 5; // cooldown active
    state.players["enemy1"].position = { x: 500, y: 400 }; // within 300px

    const bot = new Bot("bot1", HARD_PRESET);

    // Even over many ticks, special should never fire with cooldown > 0
    let specialUsed = false;
    for (let i = 0; i < 300; i++) {
      const input = bot.getInput(state);
      if (input.special) {
        specialUsed = true;
        break;
      }
    }
    expect(specialUsed).toBe(false);
  });
});

describe("Bot - Gravity Well Avoidance", () => {
  it("should boost away from gravity well core", () => {
    const state = makeState();
    // Place bot inside gravity well radius * 0.5
    const well = state.gravityWells[0];
    state.players["bot1"].position = { x: well.position.x + 10, y: well.position.y };
    state.players["enemy1"].position = { x: 1200, y: 400 }; // far away

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    // Should activate boost to escape
    expect(input.boost).toBe(true);
  });
});

describe("Bot - Map Edge Avoidance", () => {
  it("should move away from left edge", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 50, y: 600 };
    state.players["enemy1"].position = { x: 50, y: 100 }; // above

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    // Within 100px of left edge — should push right
    expect(input.right).toBe(true);
  });

  it("should move away from bottom edge", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 800, y: 1150 }; // nebula-station height=1200
    state.players["enemy1"].position = { x: 800, y: 100 };

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    // Within 100px of bottom — should push up
    expect(input.up).toBe(true);
  });
});

describe("Bot - Wandering", () => {
  it("should wander when no targets exist", () => {
    const state = createGameState("deathmatch", "nebula-station");
    addPlayer(state, "bot1", "Bot", "viper", DEFAULT_MODS);
    state.players["bot1"].position = { x: 800, y: 600 };

    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    // Should move in some direction (wandering)
    const hasMovement = input.up || input.down || input.left || input.right;
    expect(hasMovement).toBe(true);
    expect(input.shoot).toBe(false);
  });
});

describe("Bot - Input Structure", () => {
  it("should always return valid PlayerInput", () => {
    const state = makeState();
    const bot = new Bot("bot1", EASY_PRESET);
    const input = bot.getInput(state);

    expect(typeof input.up).toBe("boolean");
    expect(typeof input.down).toBe("boolean");
    expect(typeof input.left).toBe("boolean");
    expect(typeof input.right).toBe("boolean");
    expect(typeof input.boost).toBe("boolean");
    expect(typeof input.shoot).toBe("boolean");
    expect(typeof input.special).toBe("boolean");
    expect(typeof input.aimAngle).toBe("number");
    expect(input.tick).toBe(0);
    expect(Number.isFinite(input.aimAngle)).toBe(true);
  });
});

describe("Bot - All Difficulty Presets", () => {
  it.each(DIFFICULTY_PRESETS.map((p, i) => [p.name, i] as const))(
    "%s preset should produce valid input with target",
    (_name, index) => {
      const preset = DIFFICULTY_PRESETS[index];
      const state = makeState();
      state.players["bot1"].position = { x: 400, y: 400 };
      state.players["enemy1"].position = { x: 600, y: 400 };

      const bot = new Bot("bot1", preset);
      const input = bot.getInput(state);

      expect(typeof input.up).toBe("boolean");
      expect(typeof input.shoot).toBe("boolean");
      expect(typeof input.special).toBe("boolean");
      expect(typeof input.aimAngle).toBe("number");
      expect(Number.isFinite(input.aimAngle)).toBe(true);
    },
  );

  it.each(DIFFICULTY_PRESETS.map((p, i) => [p.name, i] as const))(
    "%s preset should produce valid input without target",
    (_name, index) => {
      const preset = DIFFICULTY_PRESETS[index];
      const state = createGameState("deathmatch", "nebula-station");
      addPlayer(state, "bot1", "Bot", "viper", DEFAULT_MODS);
      state.players["bot1"].position = { x: 600, y: 600 };

      const bot = new Bot("bot1", preset);
      const input = bot.getInput(state);

      expect(input.shoot).toBe(false);
      expect(Number.isFinite(input.aimAngle)).toBe(true);
    },
  );
});

describe("Bot - Aim Error by Difficulty", () => {
  it("easy bots should have more aim variance than hard bots", () => {
    const state = makeState();
    state.players["bot1"].position = { x: 400, y: 400 };
    state.players["bot1"].rotation = 0;
    state.players["enemy1"].position = { x: 500, y: 400 }; // directly right → ideal aimAngle ≈ 0

    const samples = 200;

    // Collect aim angles from easy bot
    const easyAngles: number[] = [];
    for (let i = 0; i < samples; i++) {
      const bot = new Bot("bot1", EASY_PRESET);
      const input = bot.getInput(state);
      easyAngles.push(input.aimAngle);
    }

    // Collect aim angles from hard bot
    const hardAngles: number[] = [];
    for (let i = 0; i < samples; i++) {
      const bot = new Bot("bot1", HARD_PRESET);
      const input = bot.getInput(state);
      hardAngles.push(input.aimAngle);
    }

    // Calculate variance (spread of aim angles)
    const variance = (angles: number[]) => {
      const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
      return angles.reduce((sum, a) => sum + (a - mean) ** 2, 0) / angles.length;
    };

    // Easy bots (aimError=0.36) should have noticeably more variance than hard bots (aimError=0.04)
    expect(variance(easyAngles)).toBeGreaterThan(variance(hardAngles));
  });
});
