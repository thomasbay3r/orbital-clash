import { describe, it, expect } from "vitest";
import {
  SKIN_CONFIGS, TRAIL_CONFIGS, KILL_EFFECT_CONFIGS,
  EMOTE_CONFIGS, TITLE_CONFIGS, BADGE_CONFIGS,
  DAILY_CHALLENGE_POOL, WEEKLY_CHALLENGE_POOL,
  ACHIEVEMENT_CONFIGS, SHIP_CONFIGS, MAX_LEVEL,
} from "./constants";
import { ShipClass } from "./types";

describe("Skin Configs", () => {
  it("should have at least 4 skins per ship class", () => {
    const shipClasses: ShipClass[] = ["viper", "titan", "specter", "nova"];
    for (const sc of shipClasses) {
      const skins = SKIN_CONFIGS.filter((s) => s.shipClass === sc);
      expect(skins.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("should have unique skin IDs", () => {
    const ids = SKIN_CONFIGS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have valid ship classes", () => {
    for (const skin of SKIN_CONFIGS) {
      expect(SHIP_CONFIGS[skin.shipClass]).toBeDefined();
    }
  });

  it("should have a default skin (level 1) for each ship class", () => {
    const shipClasses: ShipClass[] = ["viper", "titan", "specter", "nova"];
    for (const sc of shipClasses) {
      const defaults = SKIN_CONFIGS.filter((s) => s.shipClass === sc && s.unlockLevel === 1);
      expect(defaults.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("should have valid unlock levels (0 or 1-50)", () => {
    for (const skin of SKIN_CONFIGS) {
      expect(skin.unlockLevel).toBeGreaterThanOrEqual(0);
      expect(skin.unlockLevel).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  it("should have valid color strings", () => {
    for (const skin of SKIN_CONFIGS) {
      expect(skin.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(skin.trailColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("Trail Configs", () => {
  it("should have unique trail IDs", () => {
    const ids = TRAIL_CONFIGS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have a default trail", () => {
    const defaults = TRAIL_CONFIGS.filter((t) => t.id === "default");
    expect(defaults.length).toBe(1);
  });

  it("should have valid particle counts (> 0)", () => {
    for (const trail of TRAIL_CONFIGS) {
      expect(trail.particleCount).toBeGreaterThan(0);
    }
  });

  it("should have valid lifetimes (> 0)", () => {
    for (const trail of TRAIL_CONFIGS) {
      expect(trail.lifetime).toBeGreaterThan(0);
    }
  });
});

describe("Kill Effect Configs", () => {
  it("should have unique effect IDs", () => {
    const ids = KILL_EFFECT_CONFIGS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have a default effect", () => {
    const defaults = KILL_EFFECT_CONFIGS.filter((e) => e.id === "default");
    expect(defaults.length).toBe(1);
  });

  it("should have at least 2 colors each", () => {
    for (const effect of KILL_EFFECT_CONFIGS) {
      expect(effect.colors.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Emote Configs", () => {
  it("should have unique emote IDs", () => {
    const ids = EMOTE_CONFIGS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have non-empty text", () => {
    for (const emote of EMOTE_CONFIGS) {
      expect(emote.text.length).toBeGreaterThan(0);
    }
  });
});

describe("Title Configs", () => {
  it("should have unique title IDs", () => {
    const ids = TITLE_CONFIGS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have non-empty names", () => {
    for (const title of TITLE_CONFIGS) {
      expect(title.name.length).toBeGreaterThan(0);
    }
  });
});

describe("Badge Configs", () => {
  it("should have unique badge IDs", () => {
    const ids = BADGE_CONFIGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have non-empty icons", () => {
    for (const badge of BADGE_CONFIGS) {
      expect(badge.icon.length).toBeGreaterThan(0);
    }
  });
});

describe("Daily Challenge Pool", () => {
  it("should have unique challenge IDs", () => {
    const ids = DAILY_CHALLENGE_POOL.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should all have period=daily", () => {
    for (const c of DAILY_CHALLENGE_POOL) {
      expect(c.period).toBe("daily");
    }
  });

  it("should have positive targets", () => {
    for (const c of DAILY_CHALLENGE_POOL) {
      expect(c.target).toBeGreaterThan(0);
    }
  });

  it("should have positive XP rewards", () => {
    for (const c of DAILY_CHALLENGE_POOL) {
      expect(c.xpReward).toBeGreaterThan(0);
    }
  });

  it("should have valid difficulty levels", () => {
    for (const c of DAILY_CHALLENGE_POOL) {
      expect(["easy", "medium", "hard"]).toContain(c.difficulty);
    }
  });

  it("should have at least 3 challenges (enough for daily rotation)", () => {
    expect(DAILY_CHALLENGE_POOL.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Weekly Challenge Pool", () => {
  it("should have unique challenge IDs", () => {
    const ids = WEEKLY_CHALLENGE_POOL.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should all have period=weekly", () => {
    for (const c of WEEKLY_CHALLENGE_POOL) {
      expect(c.period).toBe("weekly");
    }
  });

  it("should have higher XP rewards than daily challenges on average", () => {
    const avgDailyXp = DAILY_CHALLENGE_POOL.reduce((s, c) => s + c.xpReward, 0) / DAILY_CHALLENGE_POOL.length;
    const avgWeeklyXp = WEEKLY_CHALLENGE_POOL.reduce((s, c) => s + c.xpReward, 0) / WEEKLY_CHALLENGE_POOL.length;
    expect(avgWeeklyXp).toBeGreaterThan(avgDailyXp);
  });

  it("should have at least 3 challenges (enough for weekly rotation)", () => {
    expect(WEEKLY_CHALLENGE_POOL.length).toBeGreaterThanOrEqual(3);
  });

  it("should not overlap IDs with daily pool", () => {
    const dailyIds = new Set(DAILY_CHALLENGE_POOL.map((c) => c.id));
    for (const c of WEEKLY_CHALLENGE_POOL) {
      expect(dailyIds.has(c.id)).toBe(false);
    }
  });
});

describe("Achievement Configs", () => {
  it("should have unique achievement IDs", () => {
    const ids = ACHIEVEMENT_CONFIGS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have non-empty descriptions", () => {
    for (const a of ACHIEVEMENT_CONFIGS) {
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it("should have valid reward types", () => {
    const validTypes = ["title", "skin", "trail", "badge", "kill-effect", "emote"];
    for (const a of ACHIEVEMENT_CONFIGS) {
      expect(validTypes).toContain(a.rewardType);
    }
  });

  it("should reference existing reward IDs", () => {
    const allIds = new Set([
      ...SKIN_CONFIGS.map((s) => s.id),
      ...TRAIL_CONFIGS.map((t) => t.id),
      ...KILL_EFFECT_CONFIGS.map((e) => e.id),
      ...EMOTE_CONFIGS.map((e) => e.id),
      ...TITLE_CONFIGS.map((t) => t.id),
      ...BADGE_CONFIGS.map((b) => b.id),
    ]);
    for (const a of ACHIEVEMENT_CONFIGS) {
      expect(allIds.has(a.rewardId)).toBe(true);
    }
  });

  it("should have non-empty reward descriptions", () => {
    for (const a of ACHIEVEMENT_CONFIGS) {
      expect(a.reward.length).toBeGreaterThan(0);
    }
  });
});
