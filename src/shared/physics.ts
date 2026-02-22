import { Vec2, GravityWell } from "./types";
import { GRAVITY_CONSTANT } from "./constants";

// ===== Vector Math =====

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

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

export function lengthSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

export function distanceSq(a: Vec2, b: Vec2): number {
  return lengthSq(sub(a, b));
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function rotate(v: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function angleFromVec(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

export function vecFromAngle(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function angleDiff(a: number, b: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

// ===== Gravity =====

export function gravityForce(well: GravityWell, position: Vec2): Vec2 {
  const diff = sub(well.position, position);
  const dist = length(diff);
  if (dist < 5) return { x: 0, y: 0 };

  const maxForce = GRAVITY_CONSTANT * well.strength * 2;
  const forceMagnitude = Math.min(
    (GRAVITY_CONSTANT * well.strength) / (dist * dist),
    maxForce,
  );
  const dir = normalize(diff);
  return scale(dir, forceMagnitude);
}

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

// ===== Collision Detection =====

export function circleCircle(
  p1: Vec2, r1: number,
  p2: Vec2, r2: number,
): boolean {
  return distanceSq(p1, p2) < (r1 + r2) * (r1 + r2);
}

export function circleContainsPoint(center: Vec2, radius: number, point: Vec2): boolean {
  return distanceSq(center, point) < radius * radius;
}

export function pointInRect(point: Vec2, x: number, y: number, w: number, h: number): boolean {
  return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
}

/** Check collision between a circle and a convex polygon (asteroid) */
export function circlePolygon(
  circlePos: Vec2,
  circleRadius: number,
  polyVertices: Vec2[],
  polyPos: Vec2,
): boolean {
  // Translate circle to polygon space
  const localCircle = sub(circlePos, polyPos);

  // Check if circle center is inside polygon
  if (pointInConvexPolygon(localCircle, polyVertices)) return true;

  // Check if circle intersects any edge
  for (let i = 0; i < polyVertices.length; i++) {
    const j = (i + 1) % polyVertices.length;
    const closest = closestPointOnSegment(localCircle, polyVertices[i], polyVertices[j]);
    if (distanceSq(localCircle, closest) < circleRadius * circleRadius) return true;
  }

  return false;
}

function pointInConvexPolygon(point: Vec2, vertices: Vec2[]): boolean {
  let positive = 0;
  let negative = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    const d = cross2D(sub(vertices[j], vertices[i]), sub(point, vertices[i]));
    if (d > 0) positive++;
    else if (d < 0) negative++;
    if (positive > 0 && negative > 0) return false;
  }
  return true;
}

function cross2D(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const lenSq = lengthSq(ab);
  if (lenSq === 0) return a; // degenerate edge: a === b
  const ap = sub(p, a);
  let t = dot(ap, ab) / lenSq;
  t = clamp(t, 0, 1);
  return add(a, scale(ab, t));
}

// ===== Arena Bounds =====

export function wrapPosition(pos: Vec2, width: number, height: number): Vec2 {
  let { x, y } = pos;
  if (x < 0) x += width;
  if (x > width) x -= width;
  if (y < 0) y += height;
  if (y > height) y -= height;
  return { x, y };
}

export function clampPosition(pos: Vec2, radius: number, width: number, height: number): Vec2 {
  return {
    x: clamp(pos.x, radius, width - radius),
    y: clamp(pos.y, radius, height - radius),
  };
}

export function reflectVelocity(
  pos: Vec2,
  vel: Vec2,
  radius: number,
  width: number,
  height: number,
): { pos: Vec2; vel: Vec2 } {
  let { x, y } = pos;
  let vx = vel.x;
  let vy = vel.y;

  if (x - radius < 0) { x = radius; vx = Math.abs(vx) * 0.7; }
  if (x + radius > width) { x = width - radius; vx = -Math.abs(vx) * 0.7; }
  if (y - radius < 0) { y = radius; vy = Math.abs(vy) * 0.7; }
  if (y + radius > height) { y = height - radius; vy = -Math.abs(vy) * 0.7; }

  return { pos: { x, y }, vel: { x: vx, y: vy } };
}

// ===== Generate Asteroid Vertices =====

export function generateAsteroidVertices(radius: number, seed: number): Vec2[] {
  const vertices: Vec2[] = [];
  const numVertices = 8 + Math.floor(seededRandom(seed) * 4);
  for (let i = 0; i < numVertices; i++) {
    const angle = (i / numVertices) * Math.PI * 2;
    const r = radius * (0.7 + seededRandom(seed + i + 1) * 0.3);
    vertices.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return vertices;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}
