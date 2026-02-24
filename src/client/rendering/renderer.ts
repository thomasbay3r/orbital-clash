import {
  GameState, PlayerState, Projectile, GravityWell,
  Asteroid, Particle, Pickup, Vec2, KothZone, Portal,
} from "../../shared/types";
import {
  SHIP_CONFIGS, COLORS, KOTH_WIN_SCORE, SPECIAL_CONFIGS,
  POTATO_TIMER, CAPTURE_WIN_SCORE,
} from "../../shared/constants";
import { sub, length, normalize, scale, add } from "../../shared/physics";
import { MAPS } from "../../shared/maps";
import { t } from "../../shared/i18n";

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface ClickableRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private starField: Vec2[] = [];
  private time = 0;
  private clickRegions: ClickableRegion[] = [];
  accountButtonLabel: string | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;
    this.generateStarField();
  }

  hitTest(mx: number, my: number): string | null {
    for (const region of this.clickRegions) {
      if (mx >= region.x && mx <= region.x + region.width &&
          my >= region.y && my <= region.y + region.height) {
        return region.id;
      }
    }
    return null;
  }

  getClickRegions(): ClickableRegion[] {
    return this.clickRegions;
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  private generateStarField(): void {
    this.starField = [];
    for (let i = 0; i < 200; i++) {
      this.starField.push({
        x: Math.random() * 4000 - 1000,
        y: Math.random() * 3000 - 750,
      });
    }
  }

  render(state: GameState, localPlayerId: string, dt: number, roomCode?: string, copiedFeedback = 0,
    extras?: { slowmo?: boolean; emotes?: Record<string, { text: string; timer: number }> }): void {
    this.time += dt;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    const localPlayer = state.players[localPlayerId];
    if (localPlayer) {
      this.updateCamera(localPlayer, state);
    } else {
      // Spectator mode: follow first alive player (e.g. tournament bot-vs-bot)
      const firstPlayer = Object.values(state.players).find((p) => p.alive) ?? Object.values(state.players)[0];
      if (firstPlayer) this.updateCamera(firstPlayer, state);
    }

    // Slowmo zoom effect (brief zoom-in on game end)
    const slowmoZoom = extras?.slowmo ? 1.05 : 1;

    this.ctx.save();
    this.clear();

    // Apply camera transform
    this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.scale(this.camera.zoom * slowmoZoom, this.camera.zoom * slowmoZoom);
    this.ctx.translate(-this.camera.x, -this.camera.y);

    this.drawStarField();
    this.drawArenaGrid(state);
    this.drawArenaBounds(state);
    this.drawGravityWells(state.gravityWells);
    this.drawAsteroids(state.asteroids);
    this.drawPickups(state.pickups);
    this.drawPortals(state.portals);
    this.drawKothZone(state.kothZone);
    this.drawCores(state);
    this.drawProjectiles(state.projectiles);
    this.drawParticles(state.particles);
    this.drawPlayers(state, localPlayerId);

    // Draw emotes above players (in world space)
    if (extras?.emotes) {
      this.drawEmotes(state, extras.emotes);
    }

    this.ctx.restore();

    // Fog-of-war overlay (mutator)
    if (state.mutators.includes("fog-of-war") && localPlayer?.alive) {
      this.drawFogOfWar(localPlayer);
    }

    // HUD is drawn in screen space
    if (localPlayer) {
      this.drawHUD(state, localPlayer, roomCode, copiedFeedback);
    }

    // Mode-specific HUD overlays
    if (localPlayer) {
      this.drawModeHUD(state, localPlayer);
    }

    // Map event announcements
    this.drawMapEventOverlay(state);

    if (state.gameOver) {
      this.drawGameOver(state);
    }
  }

  private updateCamera(player: PlayerState, _state: GameState): void {
    const targetX = player.position.x;
    const targetY = player.position.y;

    // Smooth camera follow
    this.camera.x += (targetX - this.camera.x) * 0.1;
    this.camera.y += (targetY - this.camera.y) * 0.1;

    // Zoom based on speed
    const speed = length(player.velocity);
    const targetZoom = Math.max(0.7, 1.0 - speed / 1500);
    this.camera.zoom += (targetZoom - this.camera.zoom) * 0.05;
  }

  private clear(): void {
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawStarField(): void {
    this.ctx.fillStyle = "#ffffff";
    for (const star of this.starField) {
      const parallax = 0.3;
      const sx = star.x - this.camera.x * parallax;
      const sy = star.y - this.camera.y * parallax;
      const size = 1 + Math.sin(this.time * 2 + star.x) * 0.5;
      const alpha = 0.3 + Math.sin(this.time + star.y) * 0.2;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillRect(sx, sy, size, size);
    }
    this.ctx.globalAlpha = 1;
  }

  private drawArenaGrid(state: GameState): void {
    const map = MAPS[state.mapId];
    this.ctx.strokeStyle = "#151935";
    this.ctx.lineWidth = 1;
    const gridSize = 100;
    for (let x = 0; x <= map.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, map.height);
      this.ctx.stroke();
    }
    for (let y = 0; y <= map.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(map.width, y);
      this.ctx.stroke();
    }
  }

  private drawArenaBounds(state: GameState): void {
    const map = MAPS[state.mapId];
    this.ctx.strokeStyle = "#334";
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = COLORS.gravityWell;
    this.ctx.shadowBlur = 10;
    this.ctx.strokeRect(0, 0, map.width, map.height);
    this.ctx.shadowBlur = 0;
  }

  private drawGravityWells(wells: GravityWell[]): void {
    for (const well of wells) {
      const pulse = 1 + Math.sin(this.time * 3 + Number(well.id.replace(/\D/g, "") || 0)) * 0.15;
      const r = well.radius * pulse;

      // Outer glow
      const gradient = this.ctx.createRadialGradient(
        well.position.x, well.position.y, 0,
        well.position.x, well.position.y, r,
      );
      gradient.addColorStop(0, COLORS.gravityWellCore + "50");
      gradient.addColorStop(0.3, COLORS.gravityWell + "30");
      gradient.addColorStop(0.7, COLORS.gravityWell + "10");
      gradient.addColorStop(1, COLORS.gravityWell + "00");

      this.ctx.beginPath();
      this.ctx.arc(well.position.x, well.position.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();

      // Core glow
      this.ctx.shadowColor = COLORS.gravityWell;
      this.ctx.shadowBlur = 20 * well.strength;
      this.ctx.beginPath();
      this.ctx.arc(well.position.x, well.position.y, 8 * well.strength, 0, Math.PI * 2);
      this.ctx.fillStyle = COLORS.gravityWellCore;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      // Rotating ring particles
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + this.time * 2 * well.strength;
        const ringR = r * 0.5;
        const px = well.position.x + Math.cos(angle) * ringR;
        const py = well.position.y + Math.sin(angle) * ringR;
        this.ctx.beginPath();
        this.ctx.arc(px, py, 2, 0, Math.PI * 2);
        this.ctx.fillStyle = COLORS.gravityWell + "80";
        this.ctx.fill();
      }

      // Temporary well indicator
      if (well.isTemporary) {
        this.ctx.strokeStyle = COLORS.gravityWell + "60";
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.arc(well.position.x, well.position.y, r, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }
  }

  private drawAsteroids(asteroids: Asteroid[]): void {
    for (const asteroid of asteroids) {
      this.ctx.save();
      this.ctx.translate(asteroid.position.x, asteroid.position.y);
      this.ctx.rotate(asteroid.rotation);

      this.ctx.beginPath();
      if (asteroid.vertices.length > 0) {
        this.ctx.moveTo(asteroid.vertices[0].x, asteroid.vertices[0].y);
        for (let i = 1; i < asteroid.vertices.length; i++) {
          this.ctx.lineTo(asteroid.vertices[i].x, asteroid.vertices[i].y);
        }
        this.ctx.closePath();
      }

      this.ctx.fillStyle = COLORS.asteroid;
      this.ctx.fill();
      this.ctx.strokeStyle = COLORS.asteroidOutline;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.ctx.restore();
    }
  }

  private drawPickups(pickups: Pickup[]): void {
    for (const pickup of pickups) {
      const pulse = 1 + Math.sin(this.time * 4) * 0.2;
      this.ctx.shadowColor = COLORS.pickup;
      this.ctx.shadowBlur = 10;
      this.ctx.beginPath();
      this.ctx.arc(pickup.position.x, pickup.position.y, 8 * pulse, 0, Math.PI * 2);
      this.ctx.fillStyle = COLORS.pickup + "80";
      this.ctx.fill();

      // Cross icon
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(pickup.position.x - 4, pickup.position.y);
      this.ctx.lineTo(pickup.position.x + 4, pickup.position.y);
      this.ctx.moveTo(pickup.position.x, pickup.position.y - 4);
      this.ctx.lineTo(pickup.position.x, pickup.position.y + 4);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
  }

  private drawKothZone(zone: KothZone | null): void {
    if (!zone) return;

    const alpha = 0.15 + Math.sin(this.time * 2) * 0.05;
    this.ctx.beginPath();
    this.ctx.arc(zone.position.x, zone.position.y, zone.radius, 0, Math.PI * 2);
    this.ctx.fillStyle = COLORS.kothZone + Math.round(alpha * 255).toString(16).padStart(2, "0");
    this.ctx.fill();

    this.ctx.strokeStyle = zone.owner ? COLORS.kothZone : COLORS.kothZone + "60";
    this.ctx.lineWidth = zone.owner ? 3 : 1;
    this.ctx.setLineDash(zone.owner ? [] : [10, 5]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  private drawPortals(portals: Portal[]): void {
    for (const portal of portals) {
      const pulse = 1 + Math.sin(this.time * 4 + portal.position.x) * 0.15;
      const r = portal.radius * pulse;

      // Swirling gradient
      const gradient = this.ctx.createRadialGradient(
        portal.position.x, portal.position.y, 0,
        portal.position.x, portal.position.y, r,
      );
      gradient.addColorStop(0, portal.color + "80");
      gradient.addColorStop(0.5, portal.color + "30");
      gradient.addColorStop(1, portal.color + "00");

      this.ctx.beginPath();
      this.ctx.arc(portal.position.x, portal.position.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();

      // Spinning ring
      this.ctx.save();
      this.ctx.translate(portal.position.x, portal.position.y);
      this.ctx.rotate(this.time * 3);
      this.ctx.strokeStyle = portal.color;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([8, 8]);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, portal.radius * 0.7, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.restore();

      // Inner core
      this.ctx.shadowColor = portal.color;
      this.ctx.shadowBlur = 15;
      this.ctx.beginPath();
      this.ctx.arc(portal.position.x, portal.position.y, 6, 0, Math.PI * 2);
      this.ctx.fillStyle = portal.color;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
  }

  private drawCores(state: GameState): void {
    if (state.gameMode !== "capture-the-core") return;

    const cores = state.cores;
    if (!cores) return;

    const drawCore = (core: { position: Vec2; carrierId: string | null; atBase: boolean }, color: string) => {
      if (core.carrierId) return; // Core is carried, drawn with player
      const pulse = 1 + Math.sin(this.time * 5) * 0.2;
      const r = 10 * pulse;

      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 15;
      this.ctx.beginPath();
      this.ctx.arc(core.position.x, core.position.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = color + "cc";
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      // Diamond shape inside
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(core.position.x, core.position.y - 6);
      this.ctx.lineTo(core.position.x + 4, core.position.y);
      this.ctx.lineTo(core.position.x, core.position.y + 6);
      this.ctx.lineTo(core.position.x - 4, core.position.y);
      this.ctx.closePath();
      this.ctx.stroke();

      // Base indicator ring
      if (core.atBase) {
        this.ctx.strokeStyle = color + "60";
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);
        this.ctx.beginPath();
        this.ctx.arc(core.position.x, core.position.y, 25, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    };

    drawCore(cores.red, "#ff4444");
    drawCore(cores.blue, "#4488ff");
  }

  private drawProjectiles(projectiles: Projectile[]): void {
    for (const proj of projectiles) {
      let color = COLORS.projectile;

      // Trail
      const trailDir = normalize(proj.velocity);
      const trailLen = Math.min(length(proj.velocity) * 0.03, 15);
      const trailStart = sub(proj.position, scale(trailDir, trailLen));

      const gradient = this.ctx.createLinearGradient(
        trailStart.x, trailStart.y,
        proj.position.x, proj.position.y,
      );
      gradient.addColorStop(0, color + "00");
      gradient.addColorStop(1, color + "cc");

      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = proj.radius * 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(trailStart.x, trailStart.y);
      this.ctx.lineTo(proj.position.x, proj.position.y);
      this.ctx.stroke();

      // Projectile core
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(proj.position.x, proj.position.y, proj.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
  }

  private drawParticles(particles: Particle[]): void {
    for (const p of particles) {
      this.ctx.globalAlpha = Math.max(0, p.alpha);
      this.ctx.beginPath();
      this.ctx.arc(p.position.x, p.position.y, Math.max(0.5, p.size), 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  private drawPlayers(state: GameState, localPlayerId: string): void {
    for (const player of Object.values(state.players)) {
      if (!player.alive) continue;
      const config = SHIP_CONFIGS[player.shipClass];
      const isLocal = player.id === localPlayerId;

      this.ctx.save();
      this.ctx.translate(player.position.x, player.position.y);
      this.ctx.rotate(player.rotation);

      // Phase dash transparency
      if (player.phaseActive) {
        this.ctx.globalAlpha = 0.3;
      }

      // Respawn invulnerability: blinking transparency
      if (player.invulnerable) {
        const blink = 0.5 + 0.3 * Math.sin(this.time * 25);
        this.ctx.globalAlpha = blink;
      }

      // Ship body
      this.drawShipBody(player, config, isLocal);

      // Invulnerability glow ring
      if (player.invulnerable) {
        const pulseR = config.collisionRadius * (1.4 + 0.2 * Math.sin(this.time * 15));
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 1.5;
        this.ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.time * 20);
        this.ctx.beginPath();
        this.ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      this.ctx.restore();

      // Shield bubble (not rotated)
      if (player.shieldActive) {
        this.drawShield(player, config);
      }

      // Apply invulnerability blink to HP bar and name too
      if (player.invulnerable) {
        const blink = 0.5 + 0.3 * Math.sin(this.time * 25);
        this.ctx.globalAlpha = blink;
      }

      // HP bar
      if (!isLocal || player.hp < player.maxHp) {
        this.drawPlayerHpBar(player, config);
      }

      // Name tag
      this.drawNameTag(player, config, isLocal);

      // Reset alpha after invulnerability blink
      this.ctx.globalAlpha = 1;

      // Radar indicator for enemies (passive mod)
      if (isLocal && state.players[localPlayerId]?.mods.passive === "radar") {
        this.drawRadarIndicators(state, localPlayerId);
      }
    }
  }

  private drawShipBody(
    player: PlayerState,
    config: typeof SHIP_CONFIGS[keyof typeof SHIP_CONFIGS],
    isLocal: boolean,
  ): void {
    const r = config.collisionRadius;

    // Ship glow
    this.ctx.shadowColor = config.color;
    this.ctx.shadowBlur = isLocal ? 15 : 8;

    this.ctx.beginPath();

    switch (player.shipClass) {
      case "viper":
        // Sleek triangle
        this.ctx.moveTo(r * 1.3, 0);
        this.ctx.lineTo(-r * 0.8, -r * 0.7);
        this.ctx.lineTo(-r * 0.4, 0);
        this.ctx.lineTo(-r * 0.8, r * 0.7);
        break;
      case "titan":
        // Wide pentagon
        this.ctx.moveTo(r * 1.1, 0);
        this.ctx.lineTo(r * 0.3, -r * 0.9);
        this.ctx.lineTo(-r * 0.8, -r * 0.7);
        this.ctx.lineTo(-r * 0.8, r * 0.7);
        this.ctx.lineTo(r * 0.3, r * 0.9);
        break;
      case "specter":
        // Angular diamond
        this.ctx.moveTo(r * 1.2, 0);
        this.ctx.lineTo(0, -r * 0.8);
        this.ctx.lineTo(-r * 1.0, 0);
        this.ctx.lineTo(0, r * 0.8);
        break;
      case "nova":
        // Hexagonal
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
          const px = Math.cos(angle) * r * (i === 0 ? 1.2 : 0.9);
          const py = Math.sin(angle) * r * 0.9;
          if (i === 0) this.ctx.moveTo(px, py);
          else this.ctx.lineTo(px, py);
        }
        break;
    }

    this.ctx.closePath();
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fill();
    this.ctx.strokeStyle = config.color;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    // Center dot
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 2, 0, Math.PI * 2);
    this.ctx.fillStyle = config.color;
    this.ctx.fill();
  }

  private drawShield(
    player: PlayerState,
    _config: typeof SHIP_CONFIGS[keyof typeof SHIP_CONFIGS],
  ): void {
    const alpha = 0.3 + Math.sin(this.time * 8) * 0.1;
    this.ctx.beginPath();
    this.ctx.arc(player.position.x, player.position.y, SPECIAL_CONFIGS["shield-bubble"].radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = COLORS.shieldColor;
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = alpha;
    this.ctx.stroke();
    this.ctx.globalAlpha = alpha * 0.3;
    this.ctx.fillStyle = COLORS.shieldColor;
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  private drawPlayerHpBar(
    player: PlayerState,
    config: typeof SHIP_CONFIGS[keyof typeof SHIP_CONFIGS],
  ): void {
    const barWidth = 30;
    const barHeight = 3;
    const x = player.position.x - barWidth / 2;
    const y = player.position.y - config.collisionRadius - 12;

    this.ctx.fillStyle = COLORS.hpBarDamage;
    this.ctx.fillRect(x, y, barWidth, barHeight);

    const hpPct = Math.max(0, player.hp / player.maxHp);
    this.ctx.fillStyle = hpPct > 0.3 ? COLORS.hpBar : "#ff8800";
    this.ctx.fillRect(x, y, barWidth * hpPct, barHeight);
  }

  private drawNameTag(
    player: PlayerState,
    config: typeof SHIP_CONFIGS[keyof typeof SHIP_CONFIGS],
    isLocal: boolean,
  ): void {
    this.ctx.font = "12px monospace";
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = isLocal ? config.color : COLORS.uiDim;
    this.ctx.fillText(
      player.name,
      player.position.x,
      player.position.y + config.collisionRadius + 14,
    );
  }

  private drawRadarIndicators(state: GameState, localPlayerId: string): void {
    const localPlayer = state.players[localPlayerId];
    if (!localPlayer) return;

    for (const player of Object.values(state.players)) {
      if (player.id === localPlayerId || !player.alive) continue;
      const dir = normalize(sub(player.position, localPlayer.position));
      const dist = length(sub(player.position, localPlayer.position));
      if (dist > 600) {
        const indicatorPos = add(localPlayer.position, scale(dir, 300));
        this.ctx.beginPath();
        this.ctx.arc(indicatorPos.x, indicatorPos.y, 4, 0, Math.PI * 2);
        this.ctx.fillStyle = SHIP_CONFIGS[player.shipClass].color + "80";
        this.ctx.fill();
      }
    }
  }

  private drawFogOfWar(player: PlayerState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const fogRadius = 300;

    // Convert player world position to screen position
    const screenX = w / 2 + (player.position.x - this.camera.x) * this.camera.zoom;
    const screenY = h / 2 + (player.position.y - this.camera.y) * this.camera.zoom;
    const screenRadius = fogRadius * this.camera.zoom;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";

    // Draw dark overlay with circular cutout
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2, true);
    ctx.fill();

    // Soft edge gradient
    const edgeGrad = ctx.createRadialGradient(
      screenX, screenY, screenRadius * 0.85,
      screenX, screenY, screenRadius,
    );
    edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
    edgeGrad.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.beginPath();
    ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
    ctx.fillStyle = edgeGrad;
    ctx.fill();

    ctx.restore();
  }

  private drawModeHUD(state: GameState, player: PlayerState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;

    // Asteroid Tag: "It" indicator
    if (state.gameMode === "asteroid-tag" && state.tagItPlayerId) {
      const isIt = state.tagItPlayerId === player.id;
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      if (isIt) {
        const pulse = 0.7 + Math.sin(this.time * 8) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#ff4444";
        ctx.fillText(t("mode.tag.youAreIt"), w / 2, 70);
        ctx.globalAlpha = 1;
      } else {
        const itPlayer = state.players[state.tagItPlayerId];
        if (itPlayer) {
          ctx.fillStyle = "#ffaa00";
          ctx.fillText(t("mode.tag.playerIsIt", { name: itPlayer.name }), w / 2, 70);
        }
      }
    }

    // Hot Potato: Bomb timer
    if (state.gameMode === "hot-potato" && state.potatoCarrierId) {
      const hasIt = state.potatoCarrierId === player.id;
      const remaining = Math.max(0, state.potatoTimer);
      const pct = remaining / POTATO_TIMER;

      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";
      if (hasIt) {
        const urgency = pct < 0.3 ? "#ff0000" : pct < 0.6 ? "#ff6600" : "#ffaa00";
        const pulse = pct < 0.3 ? (0.5 + Math.sin(this.time * 15) * 0.5) : 1;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = urgency;
        ctx.fillText(t("mode.potato.bomb", { t: remaining.toFixed(1) }), w / 2, 70);
        ctx.globalAlpha = 1;
      } else {
        const carrier = state.players[state.potatoCarrierId];
        if (carrier) {
          ctx.fillStyle = "#ffaa00";
          ctx.fillText(t("mode.potato.carrierHasBomb", { name: carrier.name, t: remaining.toFixed(1) }), w / 2, 70);
        }
      }
    }

    // Capture the Core: Team scores
    if (state.gameMode === "capture-the-core" && state.captureScores) {
      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";
      const myTeam = state.teams[player.id];

      // Red score
      ctx.fillStyle = myTeam === "red" ? "#ff6666" : "#ff4444";
      ctx.fillText(t("mode.capture.red", { score: state.captureScores.red }), w / 2 - 100, 70);

      // vs
      ctx.fillStyle = COLORS.uiDim;
      ctx.font = "14px monospace";
      ctx.fillText(`/ ${CAPTURE_WIN_SCORE}`, w / 2, 70);

      // Blue score
      ctx.font = "bold 20px monospace";
      ctx.fillStyle = myTeam === "blue" ? "#6688ff" : "#4488ff";
      ctx.fillText(t("mode.capture.blue", { score: state.captureScores.blue }), w / 2 + 100, 70);

      // Team indicator
      if (myTeam) {
        ctx.font = "12px monospace";
        ctx.fillStyle = myTeam === "red" ? "#ff4444" : "#4488ff";
        ctx.fillText(t("mode.capture.yourTeam", { team: myTeam === "red" ? t("mode.capture.teamRed") : t("mode.capture.teamBlue") }), w / 2, 90);
      }
    }

    // Survival Wave: Wave info
    if (state.gameMode === "survival-wave") {
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";

      if (state.wavePause) {
        ctx.fillStyle = "#44ff88";
        ctx.fillText(t("mode.survival.waveStarting", { n: state.waveNumber + 1, s: Math.ceil(state.wavePauseTimer) }), w / 2, 70);
      } else {
        ctx.fillStyle = "#ffaa00";
        ctx.fillText(t("mode.survival.waveInfo", { n: state.waveNumber, enemies: state.waveEnemiesRemaining }), w / 2, 70);
      }

      // Shared lives
      ctx.font = "14px monospace";
      ctx.fillStyle = state.sharedLives <= 3 ? "#ff4444" : "#44ff88";
      ctx.fillText(t("mode.survival.lives", { n: state.sharedLives }), w / 2, 92);
    }

    // Gravity Shift: active indicator
    if (state.gameMode === "gravity-shift") {
      const shifting = state.gravityWells.some((w) => w.isTemporary);
      if (shifting) {
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = COLORS.gravityWell;
        ctx.fillText(t("mode.gravity.active"), w / 2, 70);
      }
    }

    // Active mutator display (top-left below scoreboard)
    if (state.mutators.length > 0) {
      const scoreboardEnd = Object.keys(state.players).length * 18 + 30;
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "#888888";
      ctx.fillText(t("hud.mutators"), 20, scoreboardEnd);
      for (let i = 0; i < state.mutators.length; i++) {
        ctx.fillStyle = "#aa88ff";
        ctx.fillText(state.mutators[i], 20, scoreboardEnd + 14 + i * 13);
      }
    }
  }

  private drawMapEventOverlay(state: GameState): void {
    const active = state.mapEvents.filter((e) => e.active);
    if (active.length === 0) return;

    const ctx = this.ctx;
    const w = this.canvas.width;

    for (let i = 0; i < active.length; i++) {
      const event = active[i];
      const y = 115 + i * 22;

      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      const alpha = Math.min(1, event.timer); // Fade out in last second
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ff88ff";
      ctx.fillText(`${event.name} (${Math.ceil(event.timer)}s)`, w / 2, y);
      ctx.globalAlpha = 1;
    }
  }

  // ===== HUD (Screen Space) =====

  drawHUD(state: GameState, player: PlayerState, roomCode?: string, copiedFeedback = 0): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const config = SHIP_CONFIGS[player.shipClass];

    // HP Bar (bottom left)
    this.drawBar(20, h - 60, 200, 16, player.hp / player.maxHp, COLORS.hpBar, t("hud.hp"));

    // Energy Bar (bottom left, below HP)
    this.drawBar(20, h - 35, 200, 12, player.energy / player.maxEnergy, COLORS.energyBar, t("hud.energy"));

    // Special cooldown indicator (bottom center)
    const specialConfig = SPECIAL_CONFIGS[config.specialType];
    const specialPct = 1 - player.specialCooldown / (specialConfig.cooldown / 1000);
    this.drawBar(w / 2 - 60, h - 35, 120, 10, Math.max(0, specialPct), "#ff44ff",
      player.specialCooldown <= 0 ? t("hud.ready") : t("hud.special"));

    // Score (top center)
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    if (state.gameMode === "king-of-the-asteroid") {
      const score = Math.floor(state.kothScores[player.id] || 0);
      ctx.fillText(`${score} / ${KOTH_WIN_SCORE}`, w / 2, 40);
    } else if (state.gameMode === "capture-the-core") {
      // Score shown in mode HUD instead
    } else if (state.gameMode === "survival-wave") {
      ctx.fillText(t("hud.wave", { n: state.waveNumber }), w / 2, 40);
    } else {
      ctx.fillText(t("hud.kills", { n: player.score }), w / 2, 40);
    }

    // Timer (top right)
    const mins = Math.floor(state.timeRemaining / 60);
    const secs = Math.floor(state.timeRemaining % 60);
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = state.timeRemaining < 30 ? "#ff4444" : COLORS.ui;
    ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, w - 20, 35);

    // Room code (below timer, top right) for online games
    if (roomCode) {
      ctx.font = "12px monospace";
      ctx.textAlign = "right";
      if (copiedFeedback > 0) {
        ctx.fillStyle = "#44ff88";
        ctx.fillText(t("hud.copied"), w - 20, 55);
      } else {
        ctx.fillStyle = COLORS.uiDim;
        ctx.fillText(t("hud.room", { code: roomCode }), w - 20, 55);
      }
    }

    // Scoreboard (top left)
    this.drawScoreboard(state, player.id);

    // Crosshair
    this.drawCrosshair();

    // Respawn overlay
    if (!player.alive) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(t("hud.destroyed"), w / 2, h / 2 - 20);
      ctx.font = "18px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(t("hud.respawning", { s: Math.ceil(player.respawnTimer) }), w / 2, h / 2 + 20);
    }

    // Boost indicator
    if (player.boostActive) {
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.energyBar;
      ctx.fillText(t("hud.boost"), w / 2, h - 55);
    }
  }

  private drawBar(
    x: number, y: number, width: number, height: number,
    pct: number, color: string, label: string,
  ): void {
    const ctx = this.ctx;
    // Background
    ctx.fillStyle = "#111133";
    ctx.fillRect(x, y, width, height);
    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * Math.max(0, Math.min(1, pct)), height);
    // Border
    ctx.strokeStyle = "#334";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    // Label
    ctx.font = `${Math.min(height - 2, 10)}px monospace`;
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(label, x + 4, y + height - 3);
  }

  private drawScoreboard(state: GameState, localId: string): void {
    const players = Object.values(state.players)
      .sort((a, b) => {
        if (state.gameMode === "king-of-the-asteroid") {
          return (state.kothScores[b.id] || 0) - (state.kothScores[a.id] || 0);
        }
        return b.score - a.score;
      });

    const ctx = this.ctx;
    ctx.font = "12px monospace";
    ctx.textAlign = "left";

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const config = SHIP_CONFIGS[p.shipClass];
      const isLocal = p.id === localId;
      const y = 20 + i * 18;

      ctx.fillStyle = isLocal ? config.color : COLORS.uiDim;
      const score = state.gameMode === "king-of-the-asteroid"
        ? Math.floor(state.kothScores[p.id] || 0)
        : p.score;
      ctx.fillText(`${p.name}: ${score}`, 20, y);
    }
  }

  private drawCrosshair(): void {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const size = 12;

    this.ctx.strokeStyle = COLORS.ui + "60";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cx - size, cy);
    this.ctx.lineTo(cx - 4, cy);
    this.ctx.moveTo(cx + 4, cy);
    this.ctx.lineTo(cx + size, cy);
    this.ctx.moveTo(cx, cy - size);
    this.ctx.lineTo(cx, cy - 4);
    this.ctx.moveTo(cx, cy + 4);
    this.ctx.lineTo(cx, cy + size);
    this.ctx.stroke();
  }

  drawGameOver(state: GameState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("gameover.title"), w / 2, h / 2 - 60);

    if (state.winnerTeam) {
      ctx.font = "bold 28px monospace";
      ctx.fillStyle = state.winnerTeam === "red" ? "#ff4444" : "#4488ff";
      ctx.fillText(t("gameover.teamWins", { team: state.winnerTeam === "red" ? t("mode.capture.teamRed") : t("mode.capture.teamBlue") }), w / 2, h / 2 - 10);
    } else if (state.winnerId && state.players[state.winnerId]) {
      const winner = state.players[state.winnerId];
      const config = SHIP_CONFIGS[winner.shipClass];
      ctx.font = "bold 28px monospace";
      ctx.fillStyle = config.color;
      ctx.fillText(t("gameover.playerWins", { name: winner.name }), w / 2, h / 2 - 10);
    }

    // Final scores
    const players = Object.values(state.players).sort((a, b) => b.score - a.score);
    ctx.font = "16px monospace";
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const config = SHIP_CONFIGS[p.shipClass];
      ctx.fillStyle = config.color;
      ctx.fillText(
        t("gameover.score", { name: p.name, kills: p.score, deaths: p.deaths }),
        w / 2,
        h / 2 + 40 + i * 24,
      );
    }

    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(t("gameover.returnToMenu"), w / 2, h / 2 + 40 + players.length * 24 + 30);
  }

  // ===== Hub Menu (Landing Page) =====

  drawHub(hoveredId: string | null): void {
    const ctx = this.ctx;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.clickRegions = [];

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // Stars
    for (const star of this.starField) {
      const alpha = 0.2 + Math.sin(this.time + star.x) * 0.15;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(star.x % w, star.y % h, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // Title
    ctx.font = "bold 56px monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = COLORS.gravityWell;
    ctx.shadowBlur = 30;
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("ORBITAL CLASH", w / 2, h / 2 - 140);
    ctx.shadowBlur = 0;

    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.gravityWell;
    ctx.fillText(t("menu.subtitle"), w / 2, h / 2 - 110);

    // Main buttons (centered vertically)
    const btnY = h / 2 - 30;
    this.drawButton(ctx, w / 2, btnY, 260, 48, t("menu.singleplayer"), COLORS.ui, "button-singleplayer", hoveredId);
    this.drawButton(ctx, w / 2, btnY + 65, 260, 48, t("menu.multiplayer"), COLORS.uiDim, "button-online", hoveredId);
    this.drawButton(ctx, w / 2, btnY + 130, 260, 48, t("menu.quickPlay"), COLORS.uiDim, "button-quickplay", hoveredId);

    // Party buttons
    this.drawButton(ctx, w / 2 - 70, btnY + 195, 140, 40, "Party (N)", "#aa88ff", "button-party-create", hoveredId);
    this.drawButton(ctx, w / 2 + 70, btnY + 195, 140, 40, "Join (J)", "#aa88ff", "button-party-join", hoveredId);

    // Secondary buttons
    const accountLabel = this.accountButtonLabel;
    if (accountLabel) {
      this.drawButton(ctx, w / 2 - 90, btnY + 250, 160, 36, accountLabel, "#ffaa00", "button-account", hoveredId);
    }
    this.drawButton(ctx, w / 2 + 90, btnY + 250, 160, 36, t("menu.friends"), COLORS.uiDim, "button-friends", hoveredId);

    // Controls hint
    ctx.font = "12px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.textAlign = "center";
    ctx.fillText(t("menu.controls1"), w / 2, h - 50);
    ctx.fillText(t("menu.controls2"), w / 2, h - 32);
  }

  // ===== Game Config (Ship/Map/Mode Selection) =====

  drawGameConfig(
    selectedShip: number, selectedMap: number, selectedMode: number,
    hoveredId: string | null, _mouseX: number, _mouseY: number, onlineFlow: boolean,
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.clickRegions = [];

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // Stars
    for (const star of this.starField) {
      const alpha = 0.2 + Math.sin(this.time + star.x) * 0.15;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(star.x % w, star.y % h, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // Ship selection
    const ships: Array<keyof typeof SHIP_CONFIGS> = ["viper", "titan", "specter", "nova"];
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("menu.selectShip"), w / 2, 40);

    const shipBoxes: Array<{ bx: number; by: number; bw: number; bh: number; idx: number }> = [];

    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i];
      const config = SHIP_CONFIGS[ship];
      const bx = w / 2 - 290 + i * 150;
      const by = 60;
      const bw = 135;
      const bh = 100;
      const isSelected = i === selectedShip;
      const isHovered = hoveredId === `ship-${i}`;

      shipBoxes.push({ bx, by, bw, bh, idx: i });

      ctx.strokeStyle = isSelected ? config.color : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = config.color + "15";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      // Ship name
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = isSelected ? config.color : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(config.name, bx + bw / 2, by + 20);

      // Stats with icons
      const iconColor = isSelected ? config.color : COLORS.uiDim;
      const statX = bx + 14;
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = COLORS.uiDim;

      // HP (heart icon)
      this.drawIconHeart(ctx, statX, by + 33, 8, iconColor);
      ctx.fillText(String(config.maxHp), statX + 14, by + 40);

      // Speed (bolt icon)
      this.drawIconBolt(ctx, statX, by + 47, 8, iconColor);
      ctx.fillText(String(config.speed), statX + 14, by + 54);

      // Weapon (crosshair icon)
      this.drawIconCrosshair(ctx, statX, by + 61, 8, iconColor);
      ctx.fillText(t(`weapon.${config.weaponType}` as any), statX + 14, by + 68);

      // Special (star icon)
      this.drawIconStar(ctx, statX, by + 75, 8, iconColor);
      ctx.fillText(t(`special.${config.specialType}` as any), statX + 14, by + 82);

      ctx.textAlign = "center";
      this.clickRegions.push({ x: bx, y: by, width: bw, height: bh, id: `ship-${i}` });
    }

    // Ship tooltip (drawn on top of everything else, after all ship boxes)
    for (const sb of shipBoxes) {
      if (hoveredId === `ship-${sb.idx}`) {
        this.drawShipTooltip(ctx, sb.idx, sb.bx, sb.by, sb.bw, sb.bh, w);
      }
    }

    // Map selection (2 rows of 3)
    const mapIds: Array<keyof typeof MAPS> = [
      "nebula-station", "asteroid-belt", "the-singularity",
      "black-hole", "wormhole-station", "debris-field",
    ];
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("menu.selectMap"), w / 2, 190);

    for (let i = 0; i < mapIds.length; i++) {
      const map = MAPS[mapIds[i]];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx = w / 2 - 250 + col * 170;
      const by = 205 + row * 140;
      const bw = 155;
      const bh = 110;
      const isSelected = i === selectedMap;
      const isHovered = hoveredId === `map-${i}`;

      ctx.strokeStyle = isSelected ? COLORS.gravityWell : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = COLORS.gravityWell + "15";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      // Map name
      ctx.font = "12px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(map.name, bx + bw / 2, by + 16);

      // Minimap
      const mmx = bx + 4;
      const mmy = by + 23;
      const mmw = bw - 8;
      const mmh = bh - 27;
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(mmx, mmy, mmw, mmh);
      const scaleX = mmw / map.width;
      const scaleY = mmh / map.height;
      const s = Math.min(scaleX, scaleY);
      const ox = mmx + (mmw - map.width * s) / 2;
      const oy = mmy + (mmh - map.height * s) / 2;

      ctx.strokeStyle = "#333355";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(ox, oy, map.width * s, map.height * s);

      for (const gw of map.gravityWells) {
        const gx = ox + gw.position.x * s;
        const gy = oy + gw.position.y * s;
        const gr = Math.max(gw.radius * s, 3);
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        grad.addColorStop(0, "rgba(255, 160, 0, 0.6)");
        grad.addColorStop(1, "rgba(255, 160, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const ast of map.asteroids) {
        const ax = ox + ast.position.x * s;
        const ay = oy + ast.position.y * s;
        const ar = Math.max(ast.radius * s, 1.5);
        ctx.fillStyle = "#667788";
        ctx.beginPath();
        ctx.arc(ax, ay, ar, 0, Math.PI * 2);
        ctx.fill();
      }

      if (map.portals) {
        for (const portal of map.portals) {
          const px = ox + portal.position.x * s;
          const py = oy + portal.position.y * s;
          const pr = Math.max(portal.radius * s, 2.5);
          ctx.strokeStyle = portal.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      this.clickRegions.push({ x: bx, y: by, width: bw, height: bh, id: `map-${i}` });
    }

    // Mode selection (2 rows of 4)
    const modeNames = ["Deathmatch", "King of Asteroid", "Gravity Shift", "Duel",
      "Asteroid Tag", "Survival Wave", "Hot Potato", "Capture Core"];
    const modeDescs = [
      t("mode.desc.0"), t("mode.desc.1"), t("mode.desc.2"), t("mode.desc.3"),
      t("mode.desc.4"), t("mode.desc.5"), t("mode.desc.6"), t("mode.desc.7"),
    ];
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("menu.selectMode"), w / 2, 510);

    for (let i = 0; i < modeNames.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const bx = w / 2 - 310 + col * 155;
      const by = 528 + row * 80;
      const bw = 140;
      const bh = 58;
      const isSelected = i === selectedMode;
      const isHovered = hoveredId === `mode-${i}`;

      ctx.strokeStyle = isSelected ? COLORS.nova : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = COLORS.nova + "15";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      ctx.font = "bold 12px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(modeNames[i], bx + bw / 2, by + 20);

      ctx.font = "10px monospace";
      ctx.fillStyle = isSelected ? COLORS.uiDim : (isHovered ? COLORS.uiDim : "#555577");
      ctx.fillText(modeDescs[i], bx + bw / 2, by + 40);

      this.clickRegions.push({ x: bx, y: by, width: bw, height: bh, id: `mode-${i}` });
    }

    // Bottom buttons
    const btnY = h - 60;
    this.drawButton(ctx, w / 2 - 100, btnY, 180, 40, t("menu.back"), COLORS.uiDim, "button-back", hoveredId);
    if (onlineFlow) {
      this.drawButton(ctx, w / 2 + 100, btnY, 180, 40, t("menu.multiplayer"), COLORS.ui, "button-weiter", hoveredId);
    } else {
      this.drawButton(ctx, w / 2 + 100, btnY, 180, 40, t("menu.continue"), COLORS.ui, "button-weiter", hoveredId);
    }
  }

  // ===== Ship Stat Icons =====

  private drawIconHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
    const s = size / 8;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 4 * s, y + 7 * s);
    ctx.bezierCurveTo(x + 4 * s, y + 5 * s, x, y + 1 * s, x, y + 4 * s);
    ctx.bezierCurveTo(x, y + 6 * s, x + 4 * s, y + 8 * s, x + 4 * s, y + 8 * s);
    ctx.bezierCurveTo(x + 4 * s, y + 8 * s, x + 8 * s, y + 6 * s, x + 8 * s, y + 4 * s);
    ctx.bezierCurveTo(x + 8 * s, y + 1 * s, x + 4 * s, y + 5 * s, x + 4 * s, y + 7 * s);
    ctx.fill();
    ctx.restore();
  }

  private drawIconBolt(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
    const s = size / 8;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 5 * s, y);
    ctx.lineTo(x + 2 * s, y + 4 * s);
    ctx.lineTo(x + 5 * s, y + 4 * s);
    ctx.lineTo(x + 3 * s, y + 8 * s);
    ctx.stroke();
    ctx.restore();
  }

  private drawIconCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
    const s = size / 8;
    const cx = x + 4 * s;
    const cy = y + 4 * s;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 3 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + 8 * s);
    ctx.moveTo(x, cy);
    ctx.lineTo(x + 8 * s, cy);
    ctx.stroke();
    ctx.restore();
  }

  private drawIconStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const outer = size / 2;
    const inner = size / 5;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const outerAngle = (i * 2 * Math.PI / 5) - Math.PI / 2;
      const innerAngle = outerAngle + Math.PI / 5;
      if (i === 0) ctx.moveTo(cx + Math.cos(outerAngle) * outer, cy + Math.sin(outerAngle) * outer);
      else ctx.lineTo(cx + Math.cos(outerAngle) * outer, cy + Math.sin(outerAngle) * outer);
      ctx.lineTo(cx + Math.cos(innerAngle) * inner, cy + Math.sin(innerAngle) * inner);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ===== Ship Tooltip =====

  private drawShipTooltip(
    ctx: CanvasRenderingContext2D, shipIdx: number,
    bx: number, by: number, bw: number, _bh: number, screenW: number,
  ): void {
    const ships: Array<keyof typeof SHIP_CONFIGS> = ["viper", "titan", "specter", "nova"];
    const config = SHIP_CONFIGS[ships[shipIdx]];
    const tw = 220;
    const th = 140;

    // Position: above the ship box, centered horizontally
    let tx = bx + bw / 2 - tw / 2;
    if (tx < 10) tx = 10;
    if (tx + tw > screenW - 10) tx = screenW - 10 - tw;
    const ty = by - th - 8;

    // Background
    ctx.fillStyle = "#0a0a2a";
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, th);

    const px = tx + 10;
    let py = ty + 18;

    // Ship name
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = config.color;
    ctx.fillText(config.name, px, py);
    py += 20;

    // HP
    ctx.font = "11px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(`${t("ship.stat.hp" as any)}: ${config.maxHp}`, px, py);
    py += 16;

    // Speed
    ctx.fillText(`${t("ship.stat.speed" as any)}: ${config.speed}`, px, py);
    py += 16;

    // Weapon + desc
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(`${t("ship.stat.weapon" as any)}: ${t(`weapon.${config.weaponType}` as any)}`, px, py);
    py += 14;
    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "10px monospace";
    ctx.fillText(t(`weapon.${config.weaponType}.desc` as any), px, py);
    py += 18;

    // Special + desc
    ctx.fillStyle = COLORS.ui;
    ctx.font = "11px monospace";
    ctx.fillText(`${t("ship.stat.special" as any)}: ${t(`special.${config.specialType}` as any)}`, px, py);
    py += 14;
    ctx.fillStyle = COLORS.uiDim;
    ctx.font = "10px monospace";
    ctx.fillText(t(`special.${config.specialType}.desc` as any), px, py);

    ctx.textAlign = "center";
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, bw: number, bh: number,
    label: string, color: string, id: string, hoveredId: string | null,
  ): void {
    const bx = cx - bw / 2;
    const by = cy - bh / 2;
    const isHovered = hoveredId === id;

    ctx.strokeStyle = isHovered ? COLORS.ui : color;
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.strokeRect(bx, by, bw, bh);

    if (isHovered) {
      ctx.fillStyle = COLORS.ui + "12";
      ctx.fillRect(bx, by, bw, bh);
    }

    ctx.font = `bold ${bh > 40 ? 20 : 16}px monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = isHovered ? COLORS.ui : color;
    ctx.fillText(label, cx, cy + (bh > 40 ? 7 : 5));

    this.clickRegions.push({ x: bx, y: by, width: bw, height: bh, id });
  }

  // ===== Emotes (World Space) =====

  private static readonly EMOTE_DURATION = 2;

  private drawEmotes(state: GameState, emotes: Record<string, { text: string; timer: number }>): void {
    const ctx = this.ctx;
    for (const [playerId, emote] of Object.entries(emotes)) {
      if (emote.timer <= 0) continue;
      const player = state.players[playerId];
      if (!player || !player.alive) continue;

      const alpha = Math.min(1, emote.timer);
      const elapsed = Renderer.EMOTE_DURATION - emote.timer;
      const floatY = -40 - elapsed * 10;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";

      // Speech bubble background
      const metrics = ctx.measureText(emote.text);
      const bw = metrics.width + 16;
      const bh = 28;
      const px = player.position.x;
      const py = player.position.y;
      const bx = px - bw / 2;
      const by = py + floatY - bh / 2;
      const r = 6;

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + bw - r, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
      ctx.lineTo(bx + bw, by + bh - r);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
      ctx.lineTo(bx + r, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
      ctx.lineTo(bx, by + r);
      ctx.quadraticCurveTo(bx, by, bx + r, by);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = COLORS.ui;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Emote text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(emote.text, px, py + floatY + 6);
      ctx.restore();
    }
  }
}
