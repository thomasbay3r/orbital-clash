import { describe, it, expect } from "vitest";
import { MAPS } from "./maps";
import { MapId } from "./types";

const MAP_IDS = Object.keys(MAPS) as MapId[];

describe("Map Validation", () => {
  it("should have at least 1 map defined", () => {
    expect(MAP_IDS.length).toBeGreaterThan(0);
  });

  for (const mapId of MAP_IDS) {
    describe(`Map: ${mapId}`, () => {
      const map = MAPS[mapId];

      it("should have valid dimensions", () => {
        expect(map.width).toBeGreaterThan(0);
        expect(map.height).toBeGreaterThan(0);
      });

      it("should have matching id", () => {
        expect(map.id).toBe(mapId);
      });

      it("should have a non-empty name", () => {
        expect(map.name.length).toBeGreaterThan(0);
      });

      it("should have at least 2 spawn points (minimum for duel)", () => {
        expect(map.spawnPoints.length).toBeGreaterThanOrEqual(2);
      });

      it("should have all spawn points within map bounds", () => {
        for (const spawn of map.spawnPoints) {
          expect(spawn.x).toBeGreaterThan(0);
          expect(spawn.x).toBeLessThan(map.width);
          expect(spawn.y).toBeGreaterThan(0);
          expect(spawn.y).toBeLessThan(map.height);
        }
      });

      it("should have at least 1 gravity well", () => {
        expect(map.gravityWells.length).toBeGreaterThanOrEqual(1);
      });

      it("should have all gravity wells within map bounds", () => {
        for (const well of map.gravityWells) {
          expect(well.position.x).toBeGreaterThan(0);
          expect(well.position.x).toBeLessThan(map.width);
          expect(well.position.y).toBeGreaterThan(0);
          expect(well.position.y).toBeLessThan(map.height);
        }
      });

      it("should have positive gravity well properties", () => {
        for (const well of map.gravityWells) {
          expect(well.radius).toBeGreaterThan(0);
          expect(well.strength).toBeGreaterThan(0);
        }
      });

      it("should have gravity wells that fit within map bounds", () => {
        for (const well of map.gravityWells) {
          expect(well.position.x - well.radius).toBeGreaterThanOrEqual(-50); // small tolerance
          expect(well.position.x + well.radius).toBeLessThanOrEqual(map.width + 50);
          expect(well.position.y - well.radius).toBeGreaterThanOrEqual(-50);
          expect(well.position.y + well.radius).toBeLessThanOrEqual(map.height + 50);
        }
      });

      it("should have unique gravity well ids", () => {
        const ids = map.gravityWells.map((w) => w.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      if (map.asteroids.length > 0) {
        it("should have all asteroids within map bounds", () => {
          for (const asteroid of map.asteroids) {
            expect(asteroid.position.x).toBeGreaterThan(0);
            expect(asteroid.position.x).toBeLessThan(map.width);
            expect(asteroid.position.y).toBeGreaterThan(0);
            expect(asteroid.position.y).toBeLessThan(map.height);
          }
        });

        it("should have positive asteroid radii", () => {
          for (const asteroid of map.asteroids) {
            expect(asteroid.radius).toBeGreaterThan(0);
          }
        });

        it("should have unique asteroid ids", () => {
          const ids = map.asteroids.map((a) => a.id);
          expect(new Set(ids).size).toBe(ids.length);
        });

        it("should have asteroids with valid polygon vertices", () => {
          for (const asteroid of map.asteroids) {
            expect(asteroid.vertices.length).toBeGreaterThanOrEqual(6);
            for (const v of asteroid.vertices) {
              expect(Number.isFinite(v.x)).toBe(true);
              expect(Number.isFinite(v.y)).toBe(true);
            }
          }
        });
      }
    });
  }
});

describe("Map Consistency", () => {
  it("spawn points should not be too close together", () => {
    for (const mapId of MAP_IDS) {
      const map = MAPS[mapId];
      for (let i = 0; i < map.spawnPoints.length; i++) {
        for (let j = i + 1; j < map.spawnPoints.length; j++) {
          const dx = map.spawnPoints[i].x - map.spawnPoints[j].x;
          const dy = map.spawnPoints[i].y - map.spawnPoints[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Spawn points should be at least 100px apart
          expect(dist).toBeGreaterThan(100);
        }
      }
    }
  });

  it("no spawn point should be inside a gravity well core", () => {
    for (const mapId of MAP_IDS) {
      const map = MAPS[mapId];
      for (const spawn of map.spawnPoints) {
        for (const well of map.gravityWells) {
          const dx = spawn.x - well.position.x;
          const dy = spawn.y - well.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Spawn should be outside gravity well damage radius (40px core)
          expect(dist).toBeGreaterThan(40);
        }
      }
    }
  });
});
