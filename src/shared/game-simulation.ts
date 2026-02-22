import {
  GameState, PlayerState, PlayerInput, Projectile, GravityWell,
  Particle, ShipClass, ModLoadout, GameMode, MapId, Vec2, KothZone, ControlMode,
} from "./types";
import {
  SHIP_CONFIGS, WEAPON_CONFIGS, SPECIAL_CONFIGS,
  DRIFT_FRICTION, BOOST_MULTIPLIER, BOOST_ENERGY_COST,
  ENERGY_REGEN_RATE, MAX_ENERGY, RESPAWN_TIME,
  GRAVITY_DAMAGE_RADIUS, GRAVITY_DAMAGE, MODE_DURATIONS,
  KOTH_WIN_SCORE, KOTH_ZONE_RADIUS, KOTH_CAPTURE_RATE,
  GRAVITY_SHIFT_INTERVAL,
} from "./constants";
import {
  add, sub, scale, length, normalize, distance, vecFromAngle,
  angleDiff, clamp, circleCircle,
  applyGravity, reflectVelocity,
} from "./physics";
import { MAPS } from "./maps";

let nextId = 0;
function genId(): string {
  return (nextId++).toString(36);
}

// ===== Create Initial State =====

export function createGameState(mode: GameMode, mapId: MapId): GameState {
  const map = MAPS[mapId];

  const gravityWells: GravityWell[] = map.gravityWells.map((gw) => ({
    ...gw,
    isTemporary: false,
    lifetime: Infinity,
  }));

  const asteroids = map.asteroids.map((a) => ({
    ...a,
    rotation: 0,
    rotationSpeed: (Math.random() - 0.5) * 0.5,
  }));

  const kothZone: KothZone | null =
    mode === "king-of-the-asteroid"
      ? {
          position: { x: map.width / 2, y: map.height / 2 },
          radius: KOTH_ZONE_RADIUS,
          owner: null,
          captureProgress: {},
        }
      : null;

  return {
    tick: 0,
    players: {},
    projectiles: [],
    gravityWells,
    asteroids,
    pickups: [],
    particles: [],
    timeRemaining: MODE_DURATIONS[mode] ?? 120,
    gameMode: mode,
    mapId,
    kothZone,
    kothScores: {},
    gameOver: false,
    winnerId: null,
  };
}

// ===== Add / Remove Players =====

export function addPlayer(
  state: GameState,
  id: string,
  name: string,
  shipClass: ShipClass,
  mods: ModLoadout,
  controlMode: ControlMode = "absolute",
): void {
  const config = SHIP_CONFIGS[shipClass];
  const map = MAPS[state.mapId];
  const spawnIndex = Object.keys(state.players).length % map.spawnPoints.length;
  const spawn = map.spawnPoints[spawnIndex];

  let maxHp = config.maxHp;
  let speed = config.speed;
  if (mods.ship === "hull-plating") {
    maxHp = Math.round(maxHp * 1.25);
    speed = Math.round(speed * 0.85);
  }

  state.players[id] = {
    id,
    name,
    shipClass,
    position: { ...spawn },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    hp: maxHp,
    maxHp,
    energy: MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    score: 0,
    eliminations: 0,
    deaths: 0,
    alive: true,
    respawnTimer: 0,
    shootCooldown: 0,
    specialCooldown: 0,
    specialActive: false,
    specialTimer: 0,
    boostActive: false,
    mods,
    consecutiveHits: 0,
    phaseActive: false,
    shieldActive: false,
    shieldHp: 0,
    controlMode,
  };
  state.kothScores[id] = 0;
}

export function removePlayer(state: GameState, id: string): void {
  delete state.players[id];
  delete state.kothScores[id];
}

// ===== Main Simulation Tick =====

export function simulateTick(
  state: GameState,
  inputs: Record<string, PlayerInput>,
  dt: number,
): void {
  if (state.gameOver) return;

  state.tick++;

  // Update timers
  state.timeRemaining -= dt;
  if (state.timeRemaining <= 0) {
    state.timeRemaining = 0;
    endGame(state);
    return;
  }

  // Gravity shift mode
  if (state.gameMode === "gravity-shift") {
    const shiftTick = Math.floor(state.timeRemaining / GRAVITY_SHIFT_INTERVAL);
    const prevShiftTick = Math.floor((state.timeRemaining + dt) / GRAVITY_SHIFT_INTERVAL);
    if (shiftTick !== prevShiftTick) {
      shiftGravityWells(state);
    }
  }

  // Update players
  for (const player of Object.values(state.players)) {
    const input = inputs[player.id];
    updatePlayer(state, player, input, dt);
  }

  // Update projectiles
  updateProjectiles(state, dt);

  // Update gravity wells (temporary ones)
  updateGravityWells(state, dt);

  // Update pickups
  updatePickups(state, dt);

  // Update asteroids
  for (const asteroid of state.asteroids) {
    asteroid.rotation += asteroid.rotationSpeed * dt;
  }

  // Update particles
  updateParticles(state, dt);

  // Check collisions
  checkProjectileCollisions(state);
  checkGravityWellDamage(state, dt);
  checkPickupCollisions(state);

  // King of the asteroid logic
  if (state.gameMode === "king-of-the-asteroid" && state.kothZone) {
    updateKoth(state, dt);
  }

  // Check win conditions
  if (state.gameMode === "duel") {
    checkDuelWin(state);
  }
}

// ===== Player Update =====

function updatePlayer(
  state: GameState,
  player: PlayerState,
  input: PlayerInput | undefined,
  dt: number,
): void {
  // Respawn timer
  if (!player.alive) {
    player.respawnTimer -= dt;
    if (player.respawnTimer <= 0) {
      respawnPlayer(state, player);
    }
    return;
  }

  // Cooldowns
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.specialCooldown = Math.max(0, player.specialCooldown - dt);

  // Special timer
  if (player.specialActive) {
    player.specialTimer -= dt;
    if (player.specialTimer <= 0) {
      player.specialActive = false;
      player.phaseActive = false;
      player.shieldActive = false;
    }
  }

  const config = SHIP_CONFIGS[player.shipClass];

  // Reset per-tick flags
  player.boostActive = false;

  // === Physics (always applied, regardless of input) ===

  // Friction
  let friction = DRIFT_FRICTION;
  if (player.mods.ship === "drift-master") friction = 0.99; // less friction = more drift
  player.velocity = scale(player.velocity, Math.pow(friction, dt * 60));

  // Gravity
  const gravityMultiplier = player.mods.ship === "gravity-anchor" ? 0.3 : 1.0;
  const gravityVel = applyGravity(
    { x: 0, y: 0 },
    player.position,
    state.gravityWells,
    dt,
  );
  player.velocity = add(player.velocity, scale(gravityVel, gravityMultiplier));

  // Energy regen (always happens when not boosting)
  if (!player.boostActive) {
    const regenRate = player.mods.ship === "afterburner"
      ? ENERGY_REGEN_RATE * 0.6
      : ENERGY_REGEN_RATE;
    player.energy = Math.min(player.maxEnergy, player.energy + regenRate * dt);
  }

  // === Input-dependent actions ===
  if (input) {
    const weaponConfig = WEAPON_CONFIGS[config.weaponType];
    const specialConfig = SPECIAL_CONFIGS[config.specialType];

    // Rotation toward aim (both modes auto-rotate toward mouse)
    const targetRotation = input.aimAngle;
    const rotDiff = angleDiff(player.rotation, targetRotation);
    const maxRot = config.rotationSpeed * dt;
    player.rotation += clamp(rotDiff, -maxRot, maxRot);

    // Movement - compute thrust direction based on control mode
    let thrustDir: Vec2 | null = null;

    if (player.controlMode === "ship-relative") {
      // Ship-relative: W/S = forward/back, A/D = strafe left/right
      const forward = vecFromAngle(player.rotation);
      const right = vecFromAngle(player.rotation + Math.PI / 2);
      let fx = 0;
      let fy = 0;
      if (input.up) { fx += forward.x; fy += forward.y; }
      if (input.down) { fx -= forward.x * 0.5; fy -= forward.y * 0.5; }
      if (input.left) { fx -= right.x; fy -= right.y; }
      if (input.right) { fx += right.x; fy += right.y; }
      if (fx !== 0 || fy !== 0) {
        thrustDir = normalize({ x: fx, y: fy });
      }
    } else {
      // Absolute: W=up, S=down, A=left, D=right (screen directions)
      let thrustX = 0;
      let thrustY = 0;
      if (input.up) thrustY -= 1;
      if (input.down) thrustY += 1;
      if (input.left) thrustX -= 1;
      if (input.right) thrustX += 1;
      if (thrustX !== 0 || thrustY !== 0) {
        thrustDir = normalize({ x: thrustX, y: thrustY });
      }
    }

    if (thrustDir) {
      let speed = config.speed;
      if (player.mods.ship === "drift-master") speed *= 1.1;

      // Boost
      player.boostActive = false;
      if (input.boost && player.energy > 0) {
        const boostDuration = player.mods.ship === "afterburner" ? 1.3 : 1.0;
        speed *= BOOST_MULTIPLIER * boostDuration;
        const costMultiplier = player.mods.ship === "afterburner" ? 0.7 : 1.0;
        player.energy -= BOOST_ENERGY_COST * costMultiplier * dt;
        player.boostActive = true;
      }

      const thrust = scale(thrustDir, speed * dt);
      player.velocity = add(player.velocity, thrust);

      // Spawn engine particles
      const backDir = vecFromAngle(player.rotation + Math.PI);
      spawnParticle(state, {
        position: add(player.position, scale(backDir, config.collisionRadius)),
        velocity: add(scale(backDir, 80 + Math.random() * 40), scale(player.velocity, 0.3)),
        color: config.color,
        size: 2 + Math.random() * 2,
        lifetime: 0.3 + Math.random() * 0.2,
        maxLifetime: 0.5,
        alpha: 0.8,
      });
    }

    // Shooting
    if (input.shoot && player.shootCooldown <= 0 && !player.phaseActive) {
    const fireRate = player.mods.weapon === "rapid-fire"
      ? weaponConfig.fireRate * 1.4
      : weaponConfig.fireRate;
    player.shootCooldown = 1 / fireRate;

    const damage = player.mods.weapon === "rapid-fire"
      ? weaponConfig.damage * 0.7
      : weaponConfig.damage;

    for (let i = 0; i < weaponConfig.projectileCount; i++) {
      let angle = player.rotation;
      if (weaponConfig.projectileCount > 1) {
        const offset = (i - (weaponConfig.projectileCount - 1) / 2) * weaponConfig.spreadAngle;
        angle += offset;
      }

      const dir = vecFromAngle(angle);
      const spawnPos = add(player.position, scale(dir, config.collisionRadius + 5));
      const vel = add(scale(dir, weaponConfig.speed), scale(player.velocity, 0.3));

      const proj: Projectile = {
        id: genId(),
        ownerId: player.id,
        position: spawnPos,
        velocity: vel,
        damage,
        lifetime: weaponConfig.projectileLifetime / 1000,
        radius: weaponConfig.projectileRadius,
        piercing: player.mods.weapon === "piercing",
        ricochet: player.mods.weapon === "ricochet",
        gravitySynced: player.mods.weapon === "gravity-sync",
        homing: weaponConfig.homing,
        homingStrength: weaponConfig.homingStrength,
        hitEntities: [],
      };
      state.projectiles.push(proj);
    }

    // Muzzle flash particles
    spawnMuzzleFlash(state, player.position, player.rotation, config.color);
  }

    // Special ability
    if (input.special && player.specialCooldown <= 0 && !player.specialActive) {
      activateSpecial(state, player, specialConfig, config);
    }
  } // end if (input)

  // === Position update (always applied) ===

  // Apply velocity
  player.position = add(player.position, scale(player.velocity, dt));

  // Arena bounds
  const map = MAPS[state.mapId];
  const bounced = reflectVelocity(
    player.position,
    player.velocity,
    config.collisionRadius,
    map.width,
    map.height,
  );
  player.position = bounced.pos;
  player.velocity = bounced.vel;

  // Asteroid collisions
  for (const asteroid of state.asteroids) {
    if (circleCircle(player.position, config.collisionRadius, asteroid.position, asteroid.radius)) {
      // Push player out
      const dir = normalize(sub(player.position, asteroid.position));
      const overlap = config.collisionRadius + asteroid.radius - distance(player.position, asteroid.position);
      player.position = add(player.position, scale(dir, overlap));
      // Bounce velocity
      const velDot = player.velocity.x * dir.x + player.velocity.y * dir.y;
      if (velDot < 0) {
        player.velocity = sub(player.velocity, scale(dir, velDot * 1.5));
      }
    }
  }

  // Ghost trail passive
  if (player.mods.passive === "ghost-trail" && player.alive) {
    if (state.tick % 3 === 0) {
      spawnParticle(state, {
        position: { ...player.position },
        velocity: { x: 0, y: 0 },
        color: config.color + "60",
        size: config.collisionRadius * 0.6,
        lifetime: 0.8,
        maxLifetime: 0.8,
        alpha: 0.3,
      });
    }
  }
}

function activateSpecial(
  state: GameState,
  player: PlayerState,
  specialConfig: typeof SPECIAL_CONFIGS[keyof typeof SPECIAL_CONFIGS],
  shipConfig: typeof SHIP_CONFIGS[keyof typeof SHIP_CONFIGS],
): void {
  player.specialCooldown = specialConfig.cooldown / 1000;
  player.specialActive = true;
  player.specialTimer = specialConfig.duration / 1000;

  switch (shipConfig.specialType) {
    case "phase-dash": {
      player.phaseActive = true;
      const dashDir = vecFromAngle(player.rotation);
      player.velocity = add(player.velocity, scale(dashDir, 500));
      // Spawn phase particles
      for (let i = 0; i < 10; i++) {
        spawnParticle(state, {
          position: add(player.position, {
            x: (Math.random() - 0.5) * 30,
            y: (Math.random() - 0.5) * 30,
          }),
          velocity: { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100 },
          color: shipConfig.color,
          size: 3 + Math.random() * 3,
          lifetime: 0.4,
          maxLifetime: 0.4,
          alpha: 0.7,
        });
      }
      break;
    }
    case "shield-bubble": {
      player.shieldActive = true;
      player.shieldHp = 80;
      break;
    }
    case "emp-pulse": {
      // Damage and disable nearby enemies
      for (const target of Object.values(state.players)) {
        if (target.id === player.id || !target.alive) continue;
        if (distance(player.position, target.position) < specialConfig.radius) {
          target.energy = 0;
          target.specialCooldown = Math.max(target.specialCooldown, 3);
          dealDamage(state, target, player, specialConfig.damage);
        }
      }
      // EMP visual ring
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        spawnParticle(state, {
          position: { ...player.position },
          velocity: scale(vecFromAngle(angle), specialConfig.radius * 2),
          color: "#ff44ff",
          size: 4,
          lifetime: 0.3,
          maxLifetime: 0.3,
          alpha: 0.9,
        });
      }
      break;
    }
    case "gravity-bomb": {
      // Place temporary gravity well
      const bombPos = add(
        player.position,
        scale(vecFromAngle(player.rotation), 100),
      );
      state.gravityWells.push({
        id: genId(),
        position: bombPos,
        strength: 1.5,
        radius: specialConfig.radius,
        isTemporary: true,
        lifetime: specialConfig.duration / 1000,
      });
      break;
    }
  }
}

function respawnPlayer(state: GameState, player: PlayerState): void {
  const map = MAPS[state.mapId];

  // Find furthest spawn from all alive players, or random spawn if all dead
  const alivePlayers = Object.values(state.players).filter(
    (p) => p.alive && p.id !== player.id,
  );

  let bestSpawn: typeof map.spawnPoints[0];
  if (alivePlayers.length === 0) {
    bestSpawn = map.spawnPoints[Math.floor(Math.random() * map.spawnPoints.length)];
  } else {
    bestSpawn = map.spawnPoints[0];
    let bestMinDist = 0;
    for (const spawn of map.spawnPoints) {
      let minDist = Infinity;
      for (const other of alivePlayers) {
        const d = distance(spawn, other.position);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestSpawn = spawn;
      }
    }
  }

  player.position = { ...bestSpawn };
  player.velocity = { x: 0, y: 0 };
  player.hp = player.maxHp;
  player.energy = player.maxEnergy;
  player.alive = true;
  player.consecutiveHits = 0;
  player.phaseActive = false;
  player.shieldActive = false;
  player.specialActive = false;
}

// ===== Projectile Update =====

function updateProjectiles(state: GameState, dt: number): void {
  const map = MAPS[state.mapId];

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    proj.lifetime -= dt;

    if (proj.lifetime <= 0) {
      state.projectiles.splice(i, 1);
      continue;
    }

    // Gravity
    const gravityMult = proj.gravitySynced ? 3.0 : 1.0;
    const gravVel = applyGravity({ x: 0, y: 0 }, proj.position, state.gravityWells, dt);
    proj.velocity = add(proj.velocity, scale(gravVel, gravityMult));

    // Homing
    if (proj.homing) {
      let closestEnemy: PlayerState | null = null;
      let closestDist = Infinity;
      for (const player of Object.values(state.players)) {
        if (player.id === proj.ownerId || !player.alive || player.phaseActive) continue;
        const d = distance(proj.position, player.position);
        if (d < closestDist && d < 400) {
          closestDist = d;
          closestEnemy = player;
        }
      }
      if (closestEnemy) {
        const toTarget = normalize(sub(closestEnemy.position, proj.position));
        const currentDir = normalize(proj.velocity);
        const speed = length(proj.velocity);
        const newDir = normalize(add(currentDir, scale(toTarget, proj.homingStrength * dt)));
        proj.velocity = scale(newDir, speed);
      }
    }

    // Move
    proj.position = add(proj.position, scale(proj.velocity, dt));

    // Arena bounds
    if (proj.ricochet) {
      const bounced = reflectVelocity(proj.position, proj.velocity, proj.radius, map.width, map.height);
      proj.position = bounced.pos;
      proj.velocity = bounced.vel;
    } else if (
      proj.position.x < 0 || proj.position.x > map.width ||
      proj.position.y < 0 || proj.position.y > map.height
    ) {
      state.projectiles.splice(i, 1);
      continue;
    }

    // Asteroid collisions
    for (const asteroid of state.asteroids) {
      if (circleCircle(proj.position, proj.radius, asteroid.position, asteroid.radius)) {
        if (proj.ricochet) {
          const dir = normalize(sub(proj.position, asteroid.position));
          const velDot = proj.velocity.x * dir.x + proj.velocity.y * dir.y;
          proj.velocity = sub(proj.velocity, scale(dir, velDot * 2));
          proj.position = add(asteroid.position, scale(dir, asteroid.radius + proj.radius + 1));
        } else {
          spawnHitParticles(state, proj.position, "#aabbcc", 4);
          state.projectiles.splice(i, 1);
          break;
        }
      }
    }
  }
}

// ===== Collision Detection =====

function checkProjectileCollisions(state: GameState): void {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    let shouldRemove = false;

    for (const player of Object.values(state.players)) {
      if (player.id === proj.ownerId) continue;
      if (!player.alive || player.phaseActive) continue;
      if (proj.piercing && proj.hitEntities.includes(player.id)) continue;

      const shipConfig = SHIP_CONFIGS[player.shipClass];
      if (circleCircle(proj.position, proj.radius, player.position, shipConfig.collisionRadius)) {
        // Shield check
        if (player.shieldActive && player.shieldHp > 0) {
          player.shieldHp -= proj.damage;
          if (player.shieldHp <= 0) {
            player.shieldActive = false;
            player.specialActive = false;
          }
          spawnHitParticles(state, proj.position, "#44aaff", 6);
        } else {
          const owner = state.players[proj.ownerId];
          dealDamage(state, player, owner, proj.damage);

          // Overcharge tracking
          if (owner && owner.mods.passive === "overcharge") {
            owner.consecutiveHits++;
          }
        }

        if (proj.piercing) {
          proj.hitEntities.push(player.id);
        } else {
          shouldRemove = true;
        }
        break;
      }
    }

    if (shouldRemove) {
      spawnHitParticles(state, proj.position, "#ffffff", 5);
      state.projectiles.splice(i, 1);
    }
  }
}

function dealDamage(
  state: GameState,
  target: PlayerState,
  attacker: PlayerState | undefined,
  damage: number,
): void {
  // Overcharge bonus
  if (attacker && attacker.mods.passive === "overcharge" && attacker.consecutiveHits >= 3) {
    damage *= 2;
    attacker.consecutiveHits = 0;
  }

  target.hp -= damage;
  spawnHitParticles(state, target.position, SHIP_CONFIGS[target.shipClass].color, 8);

  if (target.hp <= 0) {
    killPlayer(state, target, attacker);
  }
}

function killPlayer(
  state: GameState,
  victim: PlayerState,
  killer: PlayerState | undefined,
): void {
  victim.alive = false;
  victim.hp = 0;
  victim.respawnTimer = RESPAWN_TIME;
  victim.deaths++;
  victim.consecutiveHits = 0;
  victim.phaseActive = false;
  victim.shieldActive = false;
  victim.specialActive = false;

  if (killer && killer.id !== victim.id) {
    killer.score += 1;
    killer.eliminations++;

    // Scavenger passive - drop health pickup
    if (killer.mods.passive === "scavenger") {
      state.pickups.push({
        id: genId(),
        position: { ...victim.position },
        type: "health",
        value: 30,
        lifetime: 8,
      });
    }
  }

  // Explosion particles
  spawnExplosion(state, victim.position, SHIP_CONFIGS[victim.shipClass].color);
}

function checkGravityWellDamage(state: GameState, dt: number): void {
  for (const well of state.gravityWells) {
    for (const player of Object.values(state.players)) {
      if (!player.alive || player.phaseActive) continue;
      if (distance(player.position, well.position) < GRAVITY_DAMAGE_RADIUS) {
        player.hp -= GRAVITY_DAMAGE * dt;
        if (player.hp <= 0) {
          killPlayer(state, player, undefined);
        }
      }
    }
  }
}

function checkPickupCollisions(state: GameState): void {
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pickup = state.pickups[i];
    for (const player of Object.values(state.players)) {
      if (!player.alive) continue;
      const config = SHIP_CONFIGS[player.shipClass];
      if (circleCircle(player.position, config.collisionRadius, pickup.position, 12)) {
        if (pickup.type === "health") {
          player.hp = Math.min(player.maxHp, player.hp + pickup.value);
        }
        spawnHitParticles(state, pickup.position, "#44ff88", 6);
        state.pickups.splice(i, 1);
        break;
      }
    }
  }
}

// ===== Gravity Well Updates =====

function updateGravityWells(state: GameState, dt: number): void {
  for (let i = state.gravityWells.length - 1; i >= 0; i--) {
    const well = state.gravityWells[i];
    if (well.isTemporary) {
      well.lifetime -= dt;
      if (well.lifetime <= 0) {
        state.gravityWells.splice(i, 1);
      }
    }
  }
}

function updatePickups(state: GameState, dt: number): void {
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    state.pickups[i].lifetime -= dt;
    if (state.pickups[i].lifetime <= 0) {
      state.pickups.splice(i, 1);
    }
  }
}

function shiftGravityWells(state: GameState): void {
  const map = MAPS[state.mapId];
  for (const well of state.gravityWells) {
    if (well.isTemporary) continue;
    well.position = {
      x: 100 + Math.random() * (map.width - 200),
      y: 100 + Math.random() * (map.height - 200),
    };
    well.strength = 0.5 + Math.random() * 1.5;
  }
}

// ===== Game Mode Logic =====

function updateKoth(state: GameState, dt: number): void {
  const zone = state.kothZone!;
  zone.owner = null;

  const playersInZone: string[] = [];
  for (const player of Object.values(state.players)) {
    if (!player.alive) continue;
    if (distance(player.position, zone.position) < zone.radius) {
      playersInZone.push(player.id);
    }
  }

  // Only one player in zone = they own it
  if (playersInZone.length === 1) {
    const ownerId = playersInZone[0];
    zone.owner = ownerId;
    state.kothScores[ownerId] = (state.kothScores[ownerId] || 0) + KOTH_CAPTURE_RATE * dt;

    if (state.kothScores[ownerId] >= KOTH_WIN_SCORE) {
      state.winnerId = ownerId;
      endGame(state);
    }
  }
}

function checkDuelWin(state: GameState): void {
  const players = Object.values(state.players);
  if (players.length !== 2) return;

  // Best of 3: first to 2 kills
  for (const player of players) {
    if (player.eliminations >= 2) {
      state.winnerId = player.id;
      endGame(state);
      return;
    }
  }
}

function endGame(state: GameState): void {
  state.gameOver = true;

  if (!state.winnerId) {
    // Determine winner by score
    let bestScore = -1;
    let bestId: string | null = null;
    for (const player of Object.values(state.players)) {
      const score = state.gameMode === "king-of-the-asteroid"
        ? (state.kothScores[player.id] || 0)
        : player.score;
      if (score > bestScore) {
        bestScore = score;
        bestId = player.id;
      }
    }
    state.winnerId = bestId;
  }
}

// ===== Particle Helpers =====

function spawnParticle(state: GameState, p: Particle): void {
  if (state.particles.length > 500) return; // cap particles
  state.particles.push(p);
}

function updateParticles(state: GameState, dt: number): void {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.lifetime -= dt;
    if (p.lifetime <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    p.position = add(p.position, scale(p.velocity, dt));
    p.alpha = (p.lifetime / p.maxLifetime) * 0.8;
    p.size *= 0.98;
  }
}

function spawnHitParticles(state: GameState, pos: Vec2, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    spawnParticle(state, {
      position: { ...pos },
      velocity: {
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
      },
      color,
      size: 2 + Math.random() * 3,
      lifetime: 0.3 + Math.random() * 0.2,
      maxLifetime: 0.5,
      alpha: 1,
    });
  }
}

function spawnMuzzleFlash(state: GameState, pos: Vec2, rotation: number, color: string): void {
  const dir = vecFromAngle(rotation);
  for (let i = 0; i < 4; i++) {
    spawnParticle(state, {
      position: add(pos, scale(dir, 20)),
      velocity: add(scale(dir, 150 + Math.random() * 100), {
        x: (Math.random() - 0.5) * 60,
        y: (Math.random() - 0.5) * 60,
      }),
      color,
      size: 2 + Math.random() * 2,
      lifetime: 0.1 + Math.random() * 0.1,
      maxLifetime: 0.2,
      alpha: 1,
    });
  }
}

function spawnExplosion(state: GameState, pos: Vec2, color: string): void {
  for (let i = 0; i < 25; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 250;
    spawnParticle(state, {
      position: { ...pos },
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      color: i < 15 ? color : "#ffffff",
      size: 3 + Math.random() * 5,
      lifetime: 0.4 + Math.random() * 0.6,
      maxLifetime: 1.0,
      alpha: 1,
    });
  }
}
