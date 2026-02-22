import { Renderer, ClickableRegion } from "../rendering/renderer";
import { InputHandler } from "./input";
import { AudioManager } from "../audio/audio-manager";
import { Bot } from "./bot";
import { Connection } from "../network/connection";
import {
  GameState, ShipClass, GameMode, MapId, ModLoadout,
  PlayerInput, ServerMessage, ControlMode,
} from "../../shared/types";
import {
  createGameState, addPlayer, simulateTick,
} from "../../shared/game-simulation";
import { SHIP_CONFIGS, COLORS, DIFFICULTY_PRESETS, DEFAULT_DIFFICULTY_INDEX } from "../../shared/constants";

type Screen = "menu" | "mod-select" | "settings" | "playing" | "online-lobby";

const SHIP_OPTIONS: ShipClass[] = ["viper", "titan", "specter", "nova"];
const MAP_OPTIONS: MapId[] = ["nebula-station", "asteroid-belt", "the-singularity"];
const MODE_OPTIONS: GameMode[] = ["deathmatch", "king-of-the-asteroid", "gravity-shift", "duel"];
const CONTROL_MODE_OPTIONS: ControlMode[] = ["absolute", "ship-relative"];
const CONTROL_MODE_NAMES = ["Standard (WASD)", "Schiff-Relativ"];
const CONTROL_MODE_DESCS = ["WASD = Richtung, Maus = Zielen", "W/S = Vor/Zurueck, A/D = Strafen"];
const BOT_NAMES = ["Orion", "Nebula", "Comet", "Pulsar", "Quasar", "Nova", "Zenith", "Eclipse"];

export class Game {
  private renderer: Renderer;
  private input: InputHandler;
  private audio: AudioManager;
  private connection: Connection;

  private screen: Screen = "menu";
  private lastTime = 0;
  private running = false;
  private audioInitialized = false;

  // Menu state
  private selectedShip = 0;
  private selectedMap = 0;
  private selectedMode = 0;

  // Mod select state
  private selectedWeaponMod = 0;
  private selectedShipMod = 0;
  private selectedPassiveMod = 0;
  private selectedControlMode = 0;
  private selectedDifficulty = DEFAULT_DIFFICULTY_INDEX;
  private selectedBotCount = 3;

  // Click regions for mod-select / online-lobby / settings
  private menuClickRegions: ClickableRegion[] = [];

  // Game state
  private gameState: GameState | null = null;
  private localPlayerId = "local-player";
  private bots: Bot[] = [];
  private isOnline = false;

  // Online lobby state
  private roomCodeInput = "";
  private lobbyStatus = "";
  private playerName = "Player";
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Audio tracking
  private prevProjectileCount = 0;
  private prevAliveStates: Record<string, boolean> = {};
  private prevPlayerHps: Record<string, number> = {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputHandler(canvas);
    this.audio = new AudioManager();
    this.connection = new Connection();

    this.input.onKeyPress = (key) => this.handleKeyPress(key);
    this.input.onMouseClick = (mx, my) => this.handleMenuClick(mx, my);

    this.connection.onMessage((msg: ServerMessage) => {
      this.handleServerMessage(msg);
    });
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(time: number): void {
    if (!this.running) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    const mx = this.input.getMouseX();
    const my = this.input.getMouseY();

    switch (this.screen) {
      case "menu": {
        const hovered = this.renderer.hitTest(mx, my);
        this.renderer.drawMenu(this.selectedShip, this.selectedMap, this.selectedMode, hovered);
        break;
      }
      case "mod-select":
        this.drawModSelect();
        break;
      case "settings":
        this.drawSettings();
        break;
      case "online-lobby":
        this.drawOnlineLobby();
        break;
      case "playing":
        this.updateGame(dt);
        break;
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  private handleKeyPress(key: string): void {
    if (!this.audioInitialized) {
      this.audio.init();
      this.audioInitialized = true;
    }

    if (this.screen === "menu") {
      if (key === "1") this.selectedShip = 0;
      if (key === "2") this.selectedShip = 1;
      if (key === "3") this.selectedShip = 2;
      if (key === "4") this.selectedShip = 3;
      if (key === "q") this.selectedMap = (this.selectedMap + MAP_OPTIONS.length - 1) % MAP_OPTIONS.length;
      if (key === "e") this.selectedMap = (this.selectedMap + 1) % MAP_OPTIONS.length;
      if (key === "z") this.selectedMode = (this.selectedMode + MODE_OPTIONS.length - 1) % MODE_OPTIONS.length;
      if (key === "c") this.selectedMode = (this.selectedMode + 1) % MODE_OPTIONS.length;
      if (key === "enter") {
        this.screen = "mod-select";
      }
      if (key === "m") {
        this.screen = "online-lobby";
        this.roomCodeInput = "";
        this.lobbyStatus = "";
      }
    } else if (this.screen === "mod-select") {
      if (key === "1" || key === "2" || key === "3" || key === "4") {
        const idx = parseInt(key) - 1;
        if (this.input.isKeyDown("shift")) {
          this.selectedPassiveMod = idx;
        } else if (this.input.isKeyDown("control")) {
          this.selectedShipMod = idx;
        } else {
          this.selectedWeaponMod = idx;
        }
      }
      if (key === "tab") {
        this.selectedControlMode = (this.selectedControlMode + 1) % CONTROL_MODE_OPTIONS.length;
      }
      if (key === "enter") {
        this.screen = "settings";
      }
      if (key === "escape") {
        this.screen = "menu";
      }
    } else if (this.screen === "settings") {
      if (key === "enter") {
        this.startLocalGame();
      }
      if (key === "escape") {
        this.screen = "mod-select";
      }
      if (key === "arrowleft" || key === "q") {
        this.selectedDifficulty = Math.max(0, this.selectedDifficulty - 1);
      }
      if (key === "arrowright" || key === "e") {
        this.selectedDifficulty = Math.min(DIFFICULTY_PRESETS.length - 1, this.selectedDifficulty + 1);
      }
      if (key >= "1" && key <= "5") {
        this.selectedDifficulty = parseInt(key) - 1;
      }
      if (key === "arrowup" || key === "w") {
        this.selectedBotCount = Math.min(3, this.selectedBotCount + 1);
      }
      if (key === "arrowdown" || key === "s") {
        this.selectedBotCount = Math.max(1, this.selectedBotCount - 1);
      }
    } else if (this.screen === "online-lobby") {
      if (key === "escape") {
        if (this.connectionCheckInterval) {
          clearInterval(this.connectionCheckInterval);
          this.connectionCheckInterval = null;
        }
        this.connection.disconnect();
        this.isOnline = false;
        this.screen = "menu";
      }
      if (key === "backspace") {
        this.roomCodeInput = this.roomCodeInput.slice(0, -1);
      } else if (key === "enter") {
        if (this.roomCodeInput.length > 0) {
          this.joinRoom(this.roomCodeInput);
        }
      } else if (key === "n") {
        this.createAndJoinRoom();
      } else if (key.length === 1 && /[a-z0-9]/i.test(key) && this.roomCodeInput.length < 8) {
        this.roomCodeInput += key;
      }
    } else if (this.screen === "playing") {
      if (key === "enter" && this.gameState?.gameOver) {
        if (this.isOnline) {
          this.connection.disconnect();
        }
        this.screen = "menu";
        this.gameState = null;
        this.bots = [];
        this.isOnline = false;
      }
    }
  }

  private handleMenuClick(mx: number, my: number): void {
    if (!this.audioInitialized) {
      this.audio.init();
      this.audioInitialized = true;
    }

    if (this.screen === "menu") {
      const hit = this.renderer.hitTest(mx, my);
      if (!hit) return;
      if (hit.startsWith("ship-")) this.selectedShip = parseInt(hit.split("-")[1]);
      if (hit.startsWith("map-")) this.selectedMap = parseInt(hit.split("-")[1]);
      if (hit.startsWith("mode-")) this.selectedMode = parseInt(hit.split("-")[1]);
      if (hit === "button-weiter") this.screen = "mod-select";
      if (hit === "button-online") {
        this.screen = "online-lobby";
        this.roomCodeInput = "";
        this.lobbyStatus = "";
      }
    } else if (this.screen === "mod-select") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit.startsWith("mod-weapon-")) this.selectedWeaponMod = parseInt(hit.split("-")[2]);
      if (hit.startsWith("mod-ship-")) this.selectedShipMod = parseInt(hit.split("-")[2]);
      if (hit.startsWith("mod-passive-")) this.selectedPassiveMod = parseInt(hit.split("-")[2]);
      if (hit.startsWith("control-mode-")) this.selectedControlMode = parseInt(hit.split("-")[2]);
      if (hit === "button-start") this.screen = "settings";
      if (hit === "button-back") this.screen = "menu";
    } else if (this.screen === "settings") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit.startsWith("difficulty-")) this.selectedDifficulty = parseInt(hit.split("-")[1]);
      if (hit.startsWith("botcount-")) this.selectedBotCount = parseInt(hit.split("-")[1]);
      if (hit === "button-start-game") this.startLocalGame();
      if (hit === "button-settings-back") this.screen = "mod-select";
    } else if (this.screen === "online-lobby") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "button-new-room") this.createAndJoinRoom();
      if (hit === "button-lobby-back") {
        if (this.connectionCheckInterval) {
          clearInterval(this.connectionCheckInterval);
          this.connectionCheckInterval = null;
        }
        this.connection.disconnect();
        this.isOnline = false;
        this.screen = "menu";
      }
    }
  }

  private hitTestLocal(mx: number, my: number): string | null {
    for (const region of this.menuClickRegions) {
      if (mx >= region.x && mx <= region.x + region.width &&
          my >= region.y && my <= region.y + region.height) {
        return region.id;
      }
    }
    return null;
  }

  private getMods(): ModLoadout {
    const weaponMods: Array<ModLoadout["weapon"]> = ["piercing", "ricochet", "gravity-sync", "rapid-fire"];
    const shipMods: Array<ModLoadout["ship"]> = ["afterburner", "hull-plating", "drift-master", "gravity-anchor"];
    const passiveMods: Array<ModLoadout["passive"]> = ["scavenger", "overcharge", "ghost-trail", "radar"];
    return {
      weapon: weaponMods[this.selectedWeaponMod],
      ship: shipMods[this.selectedShipMod],
      passive: passiveMods[this.selectedPassiveMod],
    };
  }

  // ===== Local Game =====

  private startLocalGame(): void {
    const mode = MODE_OPTIONS[this.selectedMode];
    const mapId = MAP_OPTIONS[this.selectedMap];
    const shipClass = SHIP_OPTIONS[this.selectedShip];
    const mods = this.getMods();

    const controlMode = CONTROL_MODE_OPTIONS[this.selectedControlMode];
    this.gameState = createGameState(mode, mapId);
    addPlayer(this.gameState, this.localPlayerId, this.playerName, shipClass, mods, controlMode);

    const botCount = mode === "duel" ? 1 : this.selectedBotCount;
    const preset = DIFFICULTY_PRESETS[this.selectedDifficulty];
    this.bots = [];
    const availableShips = SHIP_OPTIONS.filter((s) => s !== shipClass);

    for (let i = 0; i < botCount; i++) {
      const botId = `bot-${i}`;
      const botShip = availableShips[i % availableShips.length];
      const botMods: ModLoadout = {
        weapon: (["piercing", "ricochet", "gravity-sync", "rapid-fire"] as const)[Math.floor(Math.random() * 4)],
        ship: (["afterburner", "hull-plating", "drift-master", "gravity-anchor"] as const)[Math.floor(Math.random() * 4)],
        passive: (["scavenger", "overcharge", "ghost-trail", "radar"] as const)[Math.floor(Math.random() * 4)],
      };
      addPlayer(this.gameState, botId, BOT_NAMES[i % BOT_NAMES.length], botShip, botMods);
      this.bots.push(new Bot(botId, preset));
    }

    this.initAudioTracking();
    this.screen = "playing";
    this.isOnline = false;
  }

  // ===== Online Lobby =====

  private async createAndJoinRoom(): Promise<void> {
    try {
      this.lobbyStatus = "Creating room...";
      const res = await fetch("/api/rooms/create", { method: "POST" });
      const data = await res.json() as { roomId: string };
      this.roomCodeInput = data.roomId;
      this.joinRoom(data.roomId);
    } catch {
      this.lobbyStatus = "Failed to create room";
    }
  }

  private joinRoom(roomId: string): void {
    // Clean up any previous connection attempt
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    this.lobbyStatus = `Joining room ${roomId}...`;
    this.connection.connect(roomId);
    this.isOnline = true;

    this.connectionCheckInterval = setInterval(() => {
      if (this.connection.connected) {
        clearInterval(this.connectionCheckInterval!);
        this.connectionCheckInterval = null;
        const ship = SHIP_OPTIONS[this.selectedShip];
        const mods = this.getMods();
        const controlMode = CONTROL_MODE_OPTIONS[this.selectedControlMode];
        this.connection.send({ type: "join", name: this.playerName, shipClass: ship, mods, controlMode });
        this.lobbyStatus = `Connected to room ${roomId}. Waiting for players...`;
      }
    }, 100);

    setTimeout(() => {
      if (this.connectionCheckInterval) {
        clearInterval(this.connectionCheckInterval);
        this.connectionCheckInterval = null;
      }
      if (!this.connection.connected) {
        this.lobbyStatus = "Connection timed out. Server may not be deployed.";
      }
    }, 5000);
  }

  // ===== Game Update =====

  private updateGame(dt: number): void {
    if (!this.gameState) return;

    if (this.isOnline) {
      const input = this.input.getInput();
      this.connection.send({ type: "input", input });
      this.renderer.render(this.gameState, this.localPlayerId, dt);
      return;
    }

    const inputs: Record<string, PlayerInput> = {};
    inputs[this.localPlayerId] = this.input.getInput();
    for (const bot of this.bots) {
      inputs[bot.id] = bot.getInput(this.gameState);
    }

    simulateTick(this.gameState, inputs, dt);
    this.processAudioEvents();
    this.renderer.render(this.gameState, this.localPlayerId, dt);
  }

  private initAudioTracking(): void {
    this.prevProjectileCount = 0;
    this.prevAliveStates = {};
    this.prevPlayerHps = {};
    if (this.gameState) {
      for (const p of Object.values(this.gameState.players)) {
        this.prevAliveStates[p.id] = p.alive;
        this.prevPlayerHps[p.id] = p.hp;
      }
    }
  }

  private processAudioEvents(): void {
    if (!this.gameState) return;

    const currentProjCount = this.gameState.projectiles.length;
    if (currentProjCount > this.prevProjectileCount) {
      this.audio.playShoot();
    }
    this.prevProjectileCount = currentProjCount;

    for (const player of Object.values(this.gameState.players)) {
      const wasAlive = this.prevAliveStates[player.id];
      if (wasAlive && !player.alive) {
        this.audio.playExplosion();
      }
      this.prevAliveStates[player.id] = player.alive;

      const prevHp = this.prevPlayerHps[player.id] ?? player.maxHp;
      if (player.hp < prevHp && player.alive) {
        this.audio.playHit();
      }
      this.prevPlayerHps[player.id] = player.hp;
    }
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "state":
        this.gameState = msg.state;
        if (this.screen === "online-lobby") {
          this.screen = "playing";
          this.initAudioTracking();
        }
        break;
      case "joined":
        this.localPlayerId = msg.playerId;
        this.lobbyStatus = "Joined! Waiting for game to start...";
        break;
      case "countdown":
        this.lobbyStatus = `Starting in ${msg.seconds}...`;
        break;
      case "game-over":
        break;
    }
  }

  // ===== Mod Select Screen =====

  private drawModSelect(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.menuClickRegions = [];

    const mx = this.input.getMouseX();
    const my = this.input.getMouseY();

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    const ship = SHIP_OPTIONS[this.selectedShip];
    const config = SHIP_CONFIGS[ship];

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = config.color;
    ctx.fillText(`${config.name} - MOD LOADOUT`, w / 2, 60);

    const weaponMods = ["Piercing", "Ricochet", "Gravity-Sync", "Rapid Fire"];
    const weaponDescs = [
      "Shots pass through first enemy",
      "Shots bounce off walls",
      "Shots curve more with gravity",
      "+40% fire rate, -30% damage",
    ];
    const shipMods = ["Afterburner", "Hull Plating", "Drift Master", "Gravity Anchor"];
    const shipDescs = [
      "Longer boost, slower regen",
      "+25% HP, -15% speed",
      "Less friction, faster turns",
      "Less affected by gravity",
    ];
    const passiveMods = ["Scavenger", "Overcharge", "Ghost Trail", "Radar"];
    const passiveDescs = [
      "Kills drop HP pickups",
      "3 consecutive hits = 2x damage",
      "Leave damaging trail",
      "See off-screen enemies",
    ];

    this.drawModCategory(ctx, w / 2, 120, "WEAPON MOD", weaponMods, weaponDescs, this.selectedWeaponMod, "#ff4444", "weapon", mx, my);
    this.drawModCategory(ctx, w / 2, 260, "SHIP MOD", shipMods, shipDescs, this.selectedShipMod, "#4488ff", "ship", mx, my);
    this.drawModCategory(ctx, w / 2, 400, "PASSIVE MOD", passiveMods, passiveDescs, this.selectedPassiveMod, "#44ff88", "passive", mx, my);

    // Control mode selector
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "#ffaa00";
    ctx.textAlign = "center";
    ctx.fillText("STEUERUNG", w / 2, 545);

    for (let i = 0; i < 2; i++) {
      const bx = w / 2 - 230 + i * 240;
      const by = 560;
      const bw = 210;
      const bh = 50;
      const isSelected = i === this.selectedControlMode;
      const regionId = `control-mode-${i}`;
      const isHovered = this.hitTestLocal(mx, my) === regionId;

      ctx.strokeStyle = isSelected ? "#ffaa00" : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = "#ffaa0015";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      ctx.font = "bold 12px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(CONTROL_MODE_NAMES[i], bx + bw / 2, by + 20);

      ctx.font = "9px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(CONTROL_MODE_DESCS[i], bx + bw / 2, by + 38);

      this.menuClickRegions.push({ x: bx, y: by, width: bw, height: bh, id: regionId });
    }

    // Buttons
    this.drawMenuButton(ctx, w / 2, 645, 220, 44, "Weiter", COLORS.ui, "button-start", mx, my);
    this.drawMenuButton(ctx, w / 2, 700, 150, 36, "Zurueck", COLORS.uiDim, "button-back", mx, my);
  }

  // ===== Settings Screen =====

  private drawSettings(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.menuClickRegions = [];

    const mx = this.input.getMouseX();
    const my = this.input.getMouseY();

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("SPIELEINSTELLUNGEN", w / 2, 60);

    // Difficulty section
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "#ff4444";
    ctx.fillText("BOT-SCHWIERIGKEIT", w / 2, 110);

    const diffColors = ["#44ff44", "#88ff00", "#ffaa00", "#ff6600", "#ff2222"];
    for (let i = 0; i < DIFFICULTY_PRESETS.length; i++) {
      const preset = DIFFICULTY_PRESETS[i];
      const bx = w / 2 - 365 + i * 148;
      const by = 130;
      const bw = 135;
      const bh = 75;
      const isSelected = i === this.selectedDifficulty;
      const regionId = `difficulty-${i}`;
      const isHovered = this.hitTestLocal(mx, my) === regionId;
      const diffColor = diffColors[i];

      ctx.strokeStyle = isSelected ? diffColor : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = diffColor + "15";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      ctx.font = "bold 11px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(preset.name, bx + bw / 2, by + 25);

      ctx.font = "9px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(preset.description, bx + bw / 2, by + 45);

      // Difficulty bar
      const barW = bw - 20;
      const barH = 4;
      const barX = bx + 10;
      const barY = by + 58;
      ctx.fillStyle = "#111133";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = diffColor;
      ctx.fillRect(barX, barY, barW * preset.difficulty, barH);

      this.menuClickRegions.push({ x: bx, y: by, width: bw, height: bh, id: regionId });
    }

    // Bot count section
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "#4488ff";
    ctx.fillText("ANZAHL BOTS", w / 2, 250);

    for (let i = 1; i <= 3; i++) {
      const bx = w / 2 - 200 + (i - 1) * 140;
      const by = 270;
      const bw = 120;
      const bh = 50;
      const isSelected = i === this.selectedBotCount;
      const regionId = `botcount-${i}`;
      const isHovered = this.hitTestLocal(mx, my) === regionId;

      ctx.strokeStyle = isSelected ? "#4488ff" : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = "#4488ff15";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      ctx.font = "bold 24px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(`${i}`, bx + bw / 2, by + 34);

      this.menuClickRegions.push({ x: bx, y: by, width: bw, height: bh, id: regionId });
    }

    // Hints
    ctx.font = "12px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("Q/E = Schwierigkeit  |  W/S = Bots  |  1-5 = Schwierigkeit direkt", w / 2, 360);

    // Buttons
    this.drawMenuButton(ctx, w / 2, 410, 220, 44, "LOS GEHTS!", COLORS.ui, "button-start-game", mx, my);
    this.drawMenuButton(ctx, w / 2, 465, 150, 36, "Zurueck", COLORS.uiDim, "button-settings-back", mx, my);
  }

  // ===== Online Lobby Screen =====

  private drawOnlineLobby(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.menuClickRegions = [];

    const mx = this.input.getMouseX();
    const my = this.input.getMouseY();

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("MULTIPLAYER LOBBY", w / 2, 80);

    // New room button
    this.drawMenuButton(ctx, w / 2, 145, 240, 40, "Neuer Raum erstellen", COLORS.nova, "button-new-room", mx, my);

    // Room code input
    ctx.font = "16px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.textAlign = "center";
    ctx.fillText("Oder Raum-Code eingeben:", w / 2, 220);

    ctx.strokeStyle = COLORS.ui;
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 - 80, 235, 160, 40);
    ctx.font = "bold 24px monospace";
    ctx.fillStyle = COLORS.ui;
    const cursor = Math.sin(performance.now() / 300) > 0 ? "_" : "";
    ctx.fillText(this.roomCodeInput + cursor, w / 2, 262);

    ctx.font = "12px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("ENTER zum Beitreten", w / 2, 298);

    // Status
    if (this.lobbyStatus) {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.gravityWell;
      ctx.fillText(this.lobbyStatus, w / 2, 360);
    }

    // Back button
    this.drawMenuButton(ctx, w / 2, h - 50, 200, 36, "Zurueck", COLORS.uiDim, "button-lobby-back", mx, my);
  }

  private drawModCategory(
    ctx: CanvasRenderingContext2D,
    cx: number, y: number,
    title: string,
    names: string[],
    descs: string[],
    selected: number,
    color: string,
    categoryId: string,
    mx: number, my: number,
  ): void {
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(title, cx, y);

    for (let i = 0; i < names.length; i++) {
      const bx = cx - 250 + i * 160 - 50;
      const by = y + 15;
      const bw = 140;
      const bh = 55;
      const isSelected = i === selected;
      const regionId = `mod-${categoryId}-${i}`;
      const isHovered = mx >= bx && mx <= bx + bw && my >= by && my <= by + bh;

      ctx.strokeStyle = isSelected ? color : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = color + "15";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      ctx.font = "bold 12px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(names[i], bx + bw / 2, by + 20);

      ctx.font = "9px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(descs[i], bx + bw / 2, by + 40);

      this.menuClickRegions.push({ x: bx, y: by, width: bw, height: bh, id: regionId });
    }
  }

  private drawMenuButton(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, bw: number, bh: number,
    label: string, color: string, id: string,
    mx: number, my: number,
  ): void {
    const bx = cx - bw / 2;
    const by = cy - bh / 2;
    const isHovered = mx >= bx && mx <= bx + bw && my >= by && my <= by + bh;

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

    this.menuClickRegions.push({ x: bx, y: by, width: bw, height: bh, id });
  }
}
