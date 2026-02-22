import { Renderer } from "../rendering/renderer";
import { InputHandler } from "./input";
import { AudioManager } from "../audio/audio-manager";
import { Bot } from "./bot";
import { Connection } from "../network/connection";
import {
  GameState, ShipClass, GameMode, MapId, ModLoadout,
  PlayerInput, ServerMessage,
} from "../../shared/types";
import {
  createGameState, addPlayer, simulateTick,
} from "../../shared/game-simulation";
import { SHIP_CONFIGS, COLORS } from "../../shared/constants";

type Screen = "menu" | "mod-select" | "playing" | "online-lobby";

const SHIP_OPTIONS: ShipClass[] = ["viper", "titan", "specter", "nova"];
const MAP_OPTIONS: MapId[] = ["nebula-station", "asteroid-belt", "the-singularity"];
const MODE_OPTIONS: GameMode[] = ["deathmatch", "king-of-the-asteroid", "gravity-shift", "duel"];
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

    switch (this.screen) {
      case "menu":
        this.renderer.drawMenu(this.selectedShip, this.selectedMap, this.selectedMode);
        break;
      case "mod-select":
        this.drawModSelect();
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
      if (key === "enter") {
        this.startLocalGame();
      }
      if (key === "escape") {
        this.screen = "menu";
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

    this.gameState = createGameState(mode, mapId);
    addPlayer(this.gameState, this.localPlayerId, this.playerName, shipClass, mods);

    const botCount = mode === "duel" ? 1 : 3;
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
      this.bots.push(new Bot(botId, 0.3 + Math.random() * 0.4));
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
        this.connection.send({ type: "join", name: this.playerName, shipClass: ship, mods });
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

    this.drawModCategory(ctx, w / 2, 120, "WEAPON MOD [1-4]", weaponMods, weaponDescs, this.selectedWeaponMod, "#ff4444");
    this.drawModCategory(ctx, w / 2, 280, "SHIP MOD [CTRL+1-4]", shipMods, shipDescs, this.selectedShipMod, "#4488ff");
    this.drawModCategory(ctx, w / 2, 440, "PASSIVE MOD [SHIFT+1-4]", passiveMods, passiveDescs, this.selectedPassiveMod, "#44ff88");

    ctx.font = "bold 18px monospace";
    ctx.fillStyle = COLORS.ui;
    const flash = Math.sin(performance.now() / 300) > 0;
    if (flash) ctx.fillText("PRESS ENTER TO START  |  ESC TO BACK", w / 2, h - 40);
  }

  // ===== Online Lobby Screen =====

  private drawOnlineLobby(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("MULTIPLAYER LOBBY", w / 2, 80);

    // New room button
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = COLORS.nova;
    ctx.fillText("[N] Create New Room", w / 2, 150);

    // Room code input
    ctx.font = "16px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("Or enter room code:", w / 2, 210);

    ctx.strokeStyle = COLORS.ui;
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 - 80, 225, 160, 40);
    ctx.font = "bold 24px monospace";
    ctx.fillStyle = COLORS.ui;
    const cursor = Math.sin(performance.now() / 300) > 0 ? "_" : "";
    ctx.fillText(this.roomCodeInput + cursor, w / 2, 252);

    ctx.font = "12px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("Press ENTER to join", w / 2, 290);

    // Status
    if (this.lobbyStatus) {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.gravityWell;
      ctx.fillText(this.lobbyStatus, w / 2, 350);
    }

    // Back
    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("[ESC] Back to menu", w / 2, h - 40);
  }

  private drawModCategory(
    ctx: CanvasRenderingContext2D,
    cx: number, y: number,
    title: string,
    names: string[],
    descs: string[],
    selected: number,
    color: string,
  ): void {
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(title, cx, y);

    for (let i = 0; i < names.length; i++) {
      const x = cx - 250 + i * 160;
      const boxY = y + 15;
      const isSelected = i === selected;

      ctx.strokeStyle = isSelected ? color : COLORS.uiDim;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(x - 50, boxY, 140, 55);

      if (isSelected) {
        ctx.fillStyle = color + "15";
        ctx.fillRect(x - 50, boxY, 140, 55);
      }

      ctx.font = "bold 12px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : COLORS.uiDim;
      ctx.fillText(names[i], x + 20, boxY + 20);

      ctx.font = "9px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(descs[i], x + 20, boxY + 40);
    }
  }
}
