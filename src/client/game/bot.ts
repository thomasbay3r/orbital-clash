import { GameState, PlayerInput, PlayerState } from "../../shared/types";
import { sub, normalize, length, distance, angleDiff, vecFromAngle } from "../../shared/physics";

/** Simple AI bot for single-player mode */
export class Bot {
  private shootTimer = 0;
  private changeTargetTimer = 0;
  private currentTarget: string | null = null;
  private wanderAngle = Math.random() * Math.PI * 2;
  private specialTimer = 0;
  private difficulty: number; // 0-1, higher = smarter

  constructor(
    public readonly id: string,
    difficulty = 0.5,
  ) {
    this.difficulty = difficulty;
  }

  getInput(state: GameState): PlayerInput {
    const me = state.players[this.id];
    if (!me || !me.alive) {
      return this.emptyInput();
    }

    // Choose target
    this.changeTargetTimer -= 1 / 60;
    if (this.changeTargetTimer <= 0 || !this.currentTarget || !state.players[this.currentTarget]?.alive) {
      this.currentTarget = this.findTarget(state, me);
      this.changeTargetTimer = 2 + Math.random() * 3;
    }

    const target = this.currentTarget ? state.players[this.currentTarget] : null;

    let up = false, down = false, left = false, right = false;
    let shoot = false;
    let special = false;
    let aimAngle = me.rotation;
    let boost = false;

    if (target && target.alive) {
      const toTarget = sub(target.position, me.position);
      const dist = length(toTarget);
      const dirToTarget = normalize(toTarget);
      aimAngle = Math.atan2(dirToTarget.y, dirToTarget.x);

      // Movement: approach if far, circle if close
      if (dist > 400) {
        // Move toward target
        const moveDir = dirToTarget;
        if (moveDir.y < -0.3) up = true;
        if (moveDir.y > 0.3) down = true;
        if (moveDir.x < -0.3) left = true;
        if (moveDir.x > 0.3) right = true;
        if (dist > 600) boost = true;
      } else if (dist > 150) {
        // Circle strafe
        const perpAngle = aimAngle + Math.PI / 2;
        const perp = vecFromAngle(perpAngle);
        if (perp.y < -0.3) up = true;
        if (perp.y > 0.3) down = true;
        if (perp.x < -0.3) left = true;
        if (perp.x > 0.3) right = true;
      } else {
        // Too close, back away
        if (dirToTarget.y > 0.3) up = true;
        if (dirToTarget.y < -0.3) down = true;
        if (dirToTarget.x > 0.3) left = true;
        if (dirToTarget.x < -0.3) right = true;
      }

      // Shoot when roughly aimed (with difficulty-based accuracy)
      const aimError = Math.abs(angleDiff(me.rotation, aimAngle));
      const shootThreshold = 0.3 + (1 - this.difficulty) * 0.5;
      if (aimError < shootThreshold && dist < 600) {
        // Add some randomness to not shoot every frame
        this.shootTimer -= 1 / 60;
        if (this.shootTimer <= 0) {
          shoot = true;
          this.shootTimer = 0.1 + Math.random() * (1 - this.difficulty) * 0.3;
        }
      }

      // Use special when close enough
      this.specialTimer -= 1 / 60;
      if (this.specialTimer <= 0 && dist < 300 && me.specialCooldown <= 0) {
        special = Math.random() < this.difficulty;
        this.specialTimer = 2;
      }

      // Add slight aim inaccuracy
      aimAngle += (Math.random() - 0.5) * (1 - this.difficulty) * 0.4;
    } else {
      // Wander
      this.wanderAngle += (Math.random() - 0.5) * 0.1;
      const wanderDir = vecFromAngle(this.wanderAngle);
      if (wanderDir.y < -0.3) up = true;
      if (wanderDir.y > 0.3) down = true;
      if (wanderDir.x < -0.3) left = true;
      if (wanderDir.x > 0.3) right = true;
      aimAngle = this.wanderAngle;
    }

    // Avoid gravity wells
    for (const well of state.gravityWells) {
      const dist = distance(me.position, well.position);
      if (dist < well.radius * 0.5) {
        const away = normalize(sub(me.position, well.position));
        if (away.y < -0.3) up = true;
        if (away.y > 0.3) down = true;
        if (away.x < -0.3) left = true;
        if (away.x > 0.3) right = true;
        boost = true;
      }
    }

    // Avoid map edges
    const map = { width: 1600, height: 1200 }; // default
    const margin = 100;
    if (me.position.x < margin) right = true;
    if (me.position.x > map.width - margin) left = true;
    if (me.position.y < margin) down = true;
    if (me.position.y > map.height - margin) up = true;

    return { up, down, left, right, boost, shoot, special, aimAngle, tick: 0 };
  }

  private findTarget(state: GameState, me: PlayerState): string | null {
    let closest: string | null = null;
    let closestDist = Infinity;

    for (const player of Object.values(state.players)) {
      if (player.id === this.id || !player.alive) continue;
      const d = distance(me.position, player.position);
      if (d < closestDist) {
        closestDist = d;
        closest = player.id;
      }
    }

    return closest;
  }

  private emptyInput(): PlayerInput {
    return {
      up: false, down: false, left: false, right: false,
      boost: false, shoot: false, special: false,
      aimAngle: 0, tick: 0,
    };
  }
}
