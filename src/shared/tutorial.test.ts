import { describe, it, expect } from "vitest";
import { TUTORIAL_SCREENS, TutorialScreenId } from "./constants";
import { de } from "./lang/de";
import { en } from "./lang/en";

describe("Tutorial Config Completeness", () => {
  const allIds: TutorialScreenId[] = [
    "game-config", "mod-select", "settings", "first-gameplay",
    "profile", "challenges", "cosmetics", "friends",
    "party-lobby", "emote-wheel", "scoreboard",
  ];

  it("should have a config for every TutorialScreenId", () => {
    for (const id of allIds) {
      const config = TUTORIAL_SCREENS.find((s) => s.id === id);
      expect(config).toBeDefined();
    }
  });

  it("should not have extra configs", () => {
    expect(TUTORIAL_SCREENS.length).toBe(allIds.length);
  });

  it("should have valid types", () => {
    for (const screen of TUTORIAL_SCREENS) {
      expect(["overlay", "banner"]).toContain(screen.type);
    }
  });

  it("overlays should have overlay translation keys", () => {
    const overlays = TUTORIAL_SCREENS.filter((s) => s.type === "overlay");
    const keyMap: Record<string, string> = {
      "game-config": "tutorial.overlay.gameConfig",
      "mod-select": "tutorial.overlay.modSelect",
      "settings": "tutorial.overlay.settings",
      "first-gameplay": "tutorial.overlay.firstGameplay",
    };
    for (const o of overlays) {
      const key = keyMap[o.id];
      expect(key).toBeDefined();
      expect((de as Record<string, string>)[key]).toBeDefined();
      expect((en as Record<string, string>)[key]).toBeDefined();
    }
  });

  it("banners should have banner translation keys", () => {
    const banners = TUTORIAL_SCREENS.filter((s) => s.type === "banner");
    const keyMap: Record<string, string> = {
      "profile": "tutorial.banner.profile",
      "challenges": "tutorial.banner.challenges",
      "cosmetics": "tutorial.banner.cosmetics",
      "friends": "tutorial.banner.friends",
      "party-lobby": "tutorial.banner.partyLobby",
      "emote-wheel": "tutorial.banner.emoteWheel",
      "scoreboard": "tutorial.banner.scoreboard",
    };
    for (const b of banners) {
      const key = keyMap[b.id];
      expect(key).toBeDefined();
      expect((de as Record<string, string>)[key]).toBeDefined();
      expect((en as Record<string, string>)[key]).toBeDefined();
    }
  });

  it("help screen should have all required translation keys", () => {
    const helpKeys = [
      "help.title", "help.controls.title", "help.controls.move",
      "help.controls.aim", "help.controls.shoot", "help.controls.special",
      "help.controls.boost", "help.controls.emote", "help.controls.chat",
      "help.ships.title", "help.ships.viper", "help.ships.titan",
      "help.ships.specter", "help.ships.nova",
      "help.modes.title", "help.modes.list",
      "help.mutators.title", "help.mutators.desc",
      "help.social.title", "help.social.desc",
      "help.resetTutorial", "help.tutorialReset", "help.back",
    ];
    for (const key of helpKeys) {
      expect((de as Record<string, string>)[key]).toBeDefined();
      expect((en as Record<string, string>)[key]).toBeDefined();
    }
  });
});
