import { describe, it, expect } from "vitest";
import { generateGuestName } from "./guest-names";

describe("Guest Name Generator", () => {
  it("should return a string in format Prefix_NNNN", () => {
    const name = generateGuestName();
    expect(name).toMatch(/^[A-Z][a-z]+_\d{4}$/);
  });

  it("should generate 4-digit numbers (1000-9999)", () => {
    for (let i = 0; i < 50; i++) {
      const name = generateGuestName();
      const num = parseInt(name.split("_")[1], 10);
      expect(num).toBeGreaterThanOrEqual(1000);
      expect(num).toBeLessThan(10000);
    }
  });

  it("should use space-themed prefixes", () => {
    const validPrefixes = [
      "Komet", "Nebula", "Pulsar", "Quasar", "Nova", "Meteor",
      "Stellar", "Astral", "Orbital", "Cosmic", "Solar", "Lunar",
      "Plasma", "Photon", "Neutron", "Zenith", "Vortex", "Eclipse",
    ];
    for (let i = 0; i < 50; i++) {
      const name = generateGuestName();
      const prefix = name.split("_")[0];
      expect(validPrefixes).toContain(prefix);
    }
  });

  it("should generate different names (not always the same)", () => {
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      names.add(generateGuestName());
    }
    // With 18 prefixes * 9000 numbers, duplicates are extremely unlikely
    expect(names.size).toBeGreaterThan(10);
  });
});
