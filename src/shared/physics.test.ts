import { describe, it, expect } from "vitest";
import {
  add, sub, scale, length, normalize, distance, rotate, vec2,
  angleDiff, clamp, lerp, vecFromAngle, circleCircle,
  circleContainsPoint, gravityForce, applyGravity, reflectVelocity,
  clampPosition, generateAsteroidVertices, lerpVec2,
} from "./physics";
import { GravityWell } from "./types";

describe("Vector Math", () => {
  it("should add vectors", () => {
    const result = add({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(result).toEqual({ x: 4, y: 6 });
  });

  it("should subtract vectors", () => {
    const result = sub({ x: 5, y: 7 }, { x: 3, y: 2 });
    expect(result).toEqual({ x: 2, y: 5 });
  });

  it("should scale vectors", () => {
    const result = scale({ x: 3, y: 4 }, 2);
    expect(result).toEqual({ x: 6, y: 8 });
  });

  it("should calculate vector length", () => {
    expect(length({ x: 3, y: 4 })).toBe(5);
    expect(length({ x: 0, y: 0 })).toBe(0);
  });

  it("should normalize vectors", () => {
    const result = normalize({ x: 3, y: 4 });
    expect(result.x).toBeCloseTo(0.6);
    expect(result.y).toBeCloseTo(0.8);
  });

  it("should normalize zero vector to zero", () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("should calculate distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("should rotate vectors", () => {
    const result = rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(1);
  });

  it("should create vec2", () => {
    expect(vec2(5, 10)).toEqual({ x: 5, y: 10 });
  });

  it("should interpolate numbers", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it("should interpolate vectors", () => {
    const result = lerpVec2({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5);
    expect(result).toEqual({ x: 5, y: 10 });
  });

  it("should clamp values", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("should create vector from angle", () => {
    const result = vecFromAngle(0);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(0);

    const result90 = vecFromAngle(Math.PI / 2);
    expect(result90.x).toBeCloseTo(0);
    expect(result90.y).toBeCloseTo(1);
  });

  it("should calculate angle differences correctly", () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDiff(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    // Wrapping around
    expect(angleDiff(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2, 4);
  });
});

describe("Collision Detection", () => {
  it("should detect circle-circle collision", () => {
    expect(circleCircle({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10)).toBe(true);
    expect(circleCircle({ x: 0, y: 0 }, 10, { x: 25, y: 0 }, 10)).toBe(false);
  });

  it("should detect exact touching as no collision", () => {
    // At exactly 20 apart with radii 10, distance^2 === (r1+r2)^2, so not <
    expect(circleCircle({ x: 0, y: 0 }, 10, { x: 20, y: 0 }, 10)).toBe(false);
  });

  it("should detect circle contains point", () => {
    expect(circleContainsPoint({ x: 0, y: 0 }, 10, { x: 5, y: 0 })).toBe(true);
    expect(circleContainsPoint({ x: 0, y: 0 }, 10, { x: 15, y: 0 })).toBe(false);
  });
});

describe("Gravity", () => {
  const well: GravityWell = {
    id: "test",
    position: { x: 100, y: 100 },
    strength: 1,
    radius: 150,
    isTemporary: false,
    lifetime: Infinity,
  };

  it("should attract toward gravity well", () => {
    const force = gravityForce(well, { x: 200, y: 100 });
    expect(force.x).toBeLessThan(0); // pulling left toward well
    expect(Math.abs(force.y)).toBeLessThan(0.001); // no vertical force
  });

  it("should have stronger force when closer", () => {
    const forceClose = gravityForce(well, { x: 130, y: 100 });
    const forceFar = gravityForce(well, { x: 300, y: 100 });
    expect(Math.abs(forceClose.x)).toBeGreaterThan(Math.abs(forceFar.x));
  });

  it("should return zero force at well center", () => {
    const force = gravityForce(well, { x: 100, y: 100 });
    expect(force).toEqual({ x: 0, y: 0 });
  });

  it("should apply gravity to velocity over time", () => {
    const vel = { x: 0, y: 0 };
    const pos = { x: 200, y: 100 };
    const result = applyGravity(vel, pos, [well], 0.016);
    expect(result.x).toBeLessThan(0); // accelerating toward well
  });
});

describe("Arena Bounds", () => {
  it("should reflect velocity off walls", () => {
    const result = reflectVelocity({ x: -5, y: 50 }, { x: -100, y: 50 }, 10, 800, 600);
    expect(result.pos.x).toBe(10); // clamped to radius
    expect(result.vel.x).toBeGreaterThan(0); // reflected
  });

  it("should clamp position within bounds", () => {
    const result = clampPosition({ x: -5, y: 605 }, 10, 800, 600);
    expect(result.x).toBe(10);
    expect(result.y).toBe(590);
  });
});

describe("Asteroid Generation", () => {
  it("should generate asteroid vertices", () => {
    const vertices = generateAsteroidVertices(40, 1);
    expect(vertices.length).toBeGreaterThanOrEqual(8);
    expect(vertices.length).toBeLessThanOrEqual(12);

    // All vertices should be within radius bounds
    for (const v of vertices) {
      const dist = length(v);
      expect(dist).toBeLessThanOrEqual(40 * 1.1);
      expect(dist).toBeGreaterThanOrEqual(40 * 0.6);
    }
  });

  it("should produce consistent results for same seed", () => {
    const v1 = generateAsteroidVertices(40, 42);
    const v2 = generateAsteroidVertices(40, 42);
    expect(v1).toEqual(v2);
  });
});
