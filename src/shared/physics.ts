import { Vec2, GravityWell } from "./types";
import { GRAVITY_CONSTANT, DRIFT_FRICTION } from "./constants";

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

/** Calculate gravity force from a gravity well on a position */
export function gravityForce(well: GravityWell, position: Vec2): Vec2 {
  const diff = sub(well.position, position);
  const dist = length(diff);
  if (dist < 1) return { x: 0, y: 0 };

  const forceMagnitude = (GRAVITY_CONSTANT * well.strength) / (dist * dist);
  const dir = normalize(diff);
  return scale(dir, forceMagnitude);
}

/** Apply all gravity wells to a velocity */
export function applyGravity(
  velocity: Vec2,
  position: Vec2,
  gravityWells: GravityWell[],
  dt: number,
): Vec2 {
  let totalForce: Vec2 = { x: 0, y: 0 };
  for (const well of gravityWells) {
    totalForce = add(totalForce, gravityForce(well, position));
  }
  return add(velocity, scale(totalForce, dt));
}

/** Apply drift friction to velocity */
export function applyFriction(velocity: Vec2): Vec2 {
  return scale(velocity, DRIFT_FRICTION);
}
