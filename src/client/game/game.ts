import { Renderer, ClickableRegion } from "../rendering/renderer";
import { InputHandler } from "./input";
import { AudioManager } from "../audio/audio-manager";
import { Bot } from "./bot";
import { Connection } from "../network/connection";
import { ApiClient } from "../network/api";
import {
  GameState, ShipClass, GameMode, MapId, ModLoadout,
  PlayerInput, ServerMessage, ControlMode, PlayerState, Vec2,
  AuthUser, KillEvent, PostGameData, ChatMessage, FriendInfo, FriendRequest, Invite,
} from "../../shared/types";
import {
  createGameState, addPlayer, simulateTick,
} from "../../shared/game-simulation";
import {
  SHIP_CONFIGS, COLORS, DIFFICULTY_PRESETS, DEFAULT_DIFFICULTY_INDEX,
  DRIFT_FRICTION, BOOST_MULTIPLIER,
} from "../../shared/constants";
import {
  add, scale, normalize, vecFromAngle, angleDiff, clamp,
  applyGravity, reflectVelocity,
} from "../../shared/physics";
import { MAPS } from "../../shared/maps";

type Screen = "menu" | "mod-select" | "settings" | "playing" | "online-lobby"
  | "friends" | "login" | "register" | "profile" | "post-game" | "matchmaking";

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
  private api: ApiClient;

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
  private onlineFlow = false;

  // Online lobby state
  private roomCodeInput = "";
  private lobbyStatus = "";
  private activeRoomCode = "";
  private playerName = "Player";
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;
  private copiedFeedbackTimer = 0;

  // Online prediction/interpolation
  private remoteTargets: Record<string, { x: number; y: number; vx: number; vy: number; rot: number }> = {};

  // Audio tracking
  private prevProjectileCount = 0;
  private prevAliveStates: Record<string, boolean> = {};
  private prevPlayerHps: Record<string, number> = {};

  // Social state
  private currentUser: AuthUser | null = null;
  private friends: FriendInfo[] = [];
  private friendRequests: { incoming: FriendRequest[]; outgoing: FriendRequest[] } = { incoming: [], outgoing: [] };
  private invites: Invite[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private inviteCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Kill feed
  private killFeed: KillEvent[] = [];
  private killFeedTimers: number[] = [];
  private lastKillFeedIndex = 0;
  private comboCounter = 0;
  private comboTimer = 0;
  private killStreak = 0;
  private announcement = "";
  private announcementTimer = 0;

  // Post-game
  private postGameData: PostGameData | null = null;

  // Chat
  private chatOpen = false;
  private chatInput = "";
  private chatMessages: ChatMessage[] = [];

  // Matchmaking
  private matchmakingTimer = 0;
  private matchmakingPollInterval: ReturnType<typeof setInterval> | null = null;
  private matchmakingPlayersInQueue = 0;

  // Text input (for login, register, friends search)
  private textInputActive: string | null = null;
  private textInputFields: Record<string, string> = {};
  private textInputError = "";
  private textInputMessage = "";

  // Friends screen state
  private friendsSelectedIndex = 0;
  private friendsSearchMode = false;
  private friendsRequestsMode = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputHandler(canvas);
    this.audio = new AudioManager();
    this.connection = new Connection();
    this.api = new ApiClient();

    this.input.onKeyPress = (key) => this.handleKeyPress(key);
    this.input.onMouseClick = (mx, my) => this.handleMenuClick(mx, my);

    this.connection.onMessage((msg: ServerMessage) => {
      this.handleServerMessage(msg);
    });
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();

    // Auto-init guest if not logged in (non-blocking for local play)
    if (this.api.isLoggedIn) {
      this.api.getMe().then((user) => {
        this.currentUser = user;
        this.playerName = user.displayName;
      }).catch(() => {});
    }

    this.startHeartbeat();
    this.startInviteCheck();

    requestAnimationFrame((t) => this.loop(t));
  }

  /** Expose internal state for E2E tests */
  get _testState() {
    return {
      screen: this.screen,
      selectedShip: this.selectedShip,
      selectedMap: this.selectedMap,
      selectedMode: this.selectedMode,
      selectedControlMode: this.selectedControlMode,
      selectedDifficulty: this.selectedDifficulty,
      selectedBotCount: this.selectedBotCount,
      isOnline: this.isOnline,
      gameState: this.gameState,
      currentUser: this.currentUser,
      killFeed: this.killFeed,
      postGameData: this.postGameData,
    };
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.api.isLoggedIn) return;
      const status = this.screen === "playing" ? "online-ingame" : "online-menu";
      this.api.heartbeat(status, this.activeRoomCode || undefined).catch(() => {});
    }, 30_000);
  }

  private startInviteCheck(): void {
    this.inviteCheckInterval = setInterval(() => {
      if (!this.api.isAccount) return;
      this.api.getInvites().then((invites) => {
        this.invites = invites;
      }).catch(() => {});
    }, 10_000);
  }

  destroy(): void {
    this.running = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.inviteCheckInterval) clearInterval(this.inviteCheckInterval);
  }

  private loop(time: number): void {
    if (!this.running) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (this.copiedFeedbackTimer > 0) this.copiedFeedbackTimer -= dt;
    if (this.announcementTimer > 0) this.announcementTimer -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCounter = 0;
    }

    // Expire old kill feed entries
    for (let i = this.killFeedTimers.length - 1; i >= 0; i--) {
      this.killFeedTimers[i] -= dt;
      if (this.killFeedTimers[i] <= 0) {
        this.killFeed.splice(i, 1);
        this.killFeedTimers.splice(i, 1);
      }
    }

    const mx = this.input.getMouseX();
    const my = this.input.getMouseY();

    switch (this.screen) {
      case "menu": {
        const hovered = this.renderer.hitTest(mx, my);
        this.renderer.drawMenu(this.selectedShip, this.selectedMap, this.selectedMode, hovered);
        this.drawMenuOverlay(mx, my);
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
      case "post-game":
        this.drawPostGame();
        break;
      case "friends":
        this.drawFriends();
        break;
      case "login":
        this.drawLogin();
        break;
      case "register":
        this.drawRegister();
        break;
      case "profile":
        this.drawProfile();
        break;
      case "matchmaking":
        this.matchmakingTimer += dt;
        this.drawMatchmaking();
        break;
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  // ===== Key Press Handler =====

  private handleKeyPress(key: string): void {
    if (!this.audioInitialized) {
      this.audio.init();
      this.audioInitialized = true;
    }

    // Text input mode: capture all keys
    if (this.textInputActive) {
      this.handleTextInput(key);
      return;
    }

    // Chat input mode during gameplay
    if (this.chatOpen) {
      this.handleChatInput(key);
      return;
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
        this.onlineFlow = true;
        this.screen = "mod-select";
      }
      if (key === "f") {
        if (this.api.isAccount) {
          this.loadFriends();
          this.screen = "friends";
        } else {
          this.textInputError = "Freunde nur mit Konto verfuegbar";
        }
      }
      if (key === "p") this.screen = "profile";
      if (key === "l" && !this.api.isAccount) {
        this.textInputFields = {};
        this.textInputError = "";
        this.screen = "login";
      }
      if (key === " ") {
        this.startQuickPlay();
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
        if (this.onlineFlow) {
          this.screen = "online-lobby";
          this.roomCodeInput = "";
          this.lobbyStatus = "";
        } else {
          this.screen = "settings";
        }
      }
      if (key === "escape") {
        this.onlineFlow = false;
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
        this.screen = "mod-select";
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
      if (key === "t" && !this.gameState?.gameOver) {
        this.chatOpen = true;
        this.chatInput = "";
        return;
      }
      if (key === "enter" && this.gameState?.gameOver) {
        this.transitionToPostGame();
      }
    } else if (this.screen === "post-game") {
      if (key === "enter" || key === "n") {
        // Nochmal
        if (this.isOnline) {
          this.connection.send({ type: "rematch-vote" });
        } else {
          this.startLocalGame();
        }
      }
      if (key === "escape" || key === "m") {
        this.returnToMenu();
      }
    } else if (this.screen === "friends") {
      if (key === "escape") {
        this.friendsSearchMode = false;
        this.friendsRequestsMode = false;
        this.screen = "menu";
      }
      if (key === "arrowup") this.friendsSelectedIndex = Math.max(0, this.friendsSelectedIndex - 1);
      if (key === "arrowdown") this.friendsSelectedIndex = Math.min(this.friends.length - 1, this.friendsSelectedIndex + 1);
      if (key === "s") {
        this.friendsSearchMode = true;
        this.textInputFields = { search: "" };
        this.textInputActive = "search";
      }
      if (key === "a") this.friendsRequestsMode = !this.friendsRequestsMode;
    } else if (this.screen === "login") {
      if (key === "escape") this.screen = "menu";
      if (key === "tab" || key === "enter") {
        if (!this.textInputActive) {
          this.textInputActive = "email";
        } else if (this.textInputActive === "email") {
          this.textInputActive = "password";
        } else if (this.textInputActive === "password") {
          this.doLogin();
        }
      }
      if (key === "r") {
        this.textInputFields = {};
        this.textInputError = "";
        this.screen = "register";
      }
    } else if (this.screen === "register") {
      if (key === "escape") this.screen = "login";
    } else if (this.screen === "profile") {
      if (key === "escape") this.screen = "menu";
      if (key === "l" && this.api.isAccount) {
        this.api.logout();
        this.currentUser = null;
        this.screen = "menu";
      }
    } else if (this.screen === "matchmaking") {
      if (key === "escape") {
        this.cancelMatchmaking();
        this.screen = "menu";
      }
    }
  }

  private handleTextInput(key: string): void {
    if (!this.textInputActive) return;
    const field = this.textInputActive;

    if (key === "escape") {
      this.textInputActive = null;
      return;
    }
    if (key === "backspace") {
      this.textInputFields[field] = (this.textInputFields[field] || "").slice(0, -1);
      return;
    }
    if (key === "tab") {
      // Move to next field
      const fields = Object.keys(this.textInputFields);
      const idx = fields.indexOf(field);
      if (idx < fields.length - 1) {
        this.textInputActive = fields[idx + 1];
      } else {
        this.textInputActive = null;
      }
      return;
    }
    if (key === "enter") {
      if (this.screen === "login") this.doLogin();
      else if (this.screen === "register") this.doRegister();
      else if (this.friendsSearchMode) this.doFriendSearch();
      this.textInputActive = null;
      return;
    }
    if (key.length === 1) {
      this.textInputFields[field] = (this.textInputFields[field] || "") + key;
    }
  }

  private handleChatInput(key: string): void {
    if (key === "escape") {
      this.chatOpen = false;
      return;
    }
    if (key === "enter") {
      if (this.chatInput.trim()) {
        if (this.isOnline) {
          this.connection.send({ type: "chat", text: this.chatInput.trim() });
        }
      }
      this.chatOpen = false;
      this.chatInput = "";
      return;
    }
    if (key === "backspace") {
      this.chatInput = this.chatInput.slice(0, -1);
      return;
    }
    if (key.length === 1) {
      this.chatInput += key;
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
        this.onlineFlow = true;
        this.screen = "mod-select";
      }
    } else if (this.screen === "mod-select") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit.startsWith("mod-weapon-")) this.selectedWeaponMod = parseInt(hit.split("-")[2]);
      if (hit.startsWith("mod-ship-")) this.selectedShipMod = parseInt(hit.split("-")[2]);
      if (hit.startsWith("mod-passive-")) this.selectedPassiveMod = parseInt(hit.split("-")[2]);
      if (hit.startsWith("control-mode-")) this.selectedControlMode = parseInt(hit.split("-")[2]);
      if (hit === "button-start") {
        if (this.onlineFlow) {
          this.screen = "online-lobby";
          this.roomCodeInput = "";
          this.lobbyStatus = "";
        } else {
          this.screen = "settings";
        }
      }
      if (hit === "button-back") {
        this.onlineFlow = false;
        this.screen = "menu";
      }
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
      if (hit === "button-copy-code") this.copyRoomCode();
      if (hit === "button-lobby-back") {
        if (this.connectionCheckInterval) {
          clearInterval(this.connectionCheckInterval);
          this.connectionCheckInterval = null;
        }
        this.connection.disconnect();
        this.isOnline = false;
        this.screen = "mod-select";
      }
    } else if (this.screen === "playing" && this.isOnline && this.activeRoomCode) {
      const w = window.innerWidth;
      if (mx >= w - 160 && mx <= w - 10 && my >= 42 && my <= 68) {
        this.copyRoomCode();
      }
    }
  }

  private copyRoomCode(): void {
    if (!this.activeRoomCode) return;
    navigator.clipboard.writeText(this.activeRoomCode).catch(() => {});
    this.copiedFeedbackTimer = 2;
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

  // ===== Auth Actions =====

  private async doLogin(): Promise<void> {
    const email = this.textInputFields["email"] || "";
    const password = this.textInputFields["password"] || "";
    if (!email || !password) { this.textInputError = "Bitte alle Felder ausfuellen"; return; }

    try {
      this.currentUser = await this.api.login(email, password);
      this.playerName = this.currentUser.displayName;
      this.textInputError = "";
      this.screen = "menu";
    } catch (e: any) {
      this.textInputError = e.message || "Anmeldung fehlgeschlagen";
    }
  }

  private async doRegister(): Promise<void> {
    const email = this.textInputFields["email"] || "";
    const username = this.textInputFields["username"] || "";
    const password = this.textInputFields["password"] || "";
    const password2 = this.textInputFields["password2"] || "";
    if (!email || !username || !password) { this.textInputError = "Bitte alle Felder ausfuellen"; return; }
    if (password !== password2) { this.textInputError = "Passwoerter stimmen nicht ueberein"; return; }
    if (password.length < 6) { this.textInputError = "Passwort muss mindestens 6 Zeichen haben"; return; }

    try {
      this.currentUser = await this.api.register(email, username, password);
      this.playerName = this.currentUser.displayName;
      this.textInputError = "";
      this.screen = "menu";
    } catch (e: any) {
      this.textInputError = e.message || "Registrierung fehlgeschlagen";
    }
  }

  // ===== Friends =====

  private async loadFriends(): Promise<void> {
    if (!this.api.isAccount) return;
    try {
      this.friends = await this.api.getFriends();
      this.friendRequests = await this.api.getFriendRequests();
    } catch { /* offline */ }
  }

  private async doFriendSearch(): Promise<void> {
    const q = this.textInputFields["search"] || "";
    if (q.length < 2) return;
    try {
      // Search results shown as a simple overlay; for now reuse textInputMessage
      const results = await this.api.searchUsers(q);
      if (results.length === 0) {
        this.textInputMessage = "Kein Benutzer gefunden";
      } else {
        // Send request to first result for simplicity
        await this.api.sendFriendRequest(results[0].username);
        this.textInputMessage = `Anfrage an ${results[0].username} gesendet!`;
      }
    } catch (e: any) {
      this.textInputError = e.message || "Suche fehlgeschlagen";
    }
  }

  // ===== Quick Play =====

  private async startQuickPlay(): Promise<void> {
    if (!this.api.isLoggedIn) {
      // Auto-init guest for quick play
      try {
        this.currentUser = await this.api.initGuest();
        this.playerName = this.currentUser.displayName;
      } catch {
        this.textInputError = "Verbindung fehlgeschlagen";
        return;
      }
    }

    this.screen = "matchmaking";
    this.matchmakingTimer = 0;
    this.matchmakingPlayersInQueue = 0;

    const ship = SHIP_OPTIONS[this.selectedShip];
    const mods = this.getMods();
    const controlMode = CONTROL_MODE_OPTIONS[this.selectedControlMode];

    try {
      const result = await this.api.joinQueue(ship, mods, controlMode);
      if (result.status === "matched" && result.roomId) {
        this.joinRoom(result.roomId);
        return;
      }
    } catch {
      // Server not available — fall back to local game with bots after timeout
    }

    // Poll for match
    this.matchmakingPollInterval = setInterval(async () => {
      try {
        const status = await this.api.getQueueStatus();
        this.matchmakingPlayersInQueue = status.playersInQueue || 0;
        if (status.status === "matched" && status.roomId) {
          this.cancelMatchmaking();
          this.joinRoom(status.roomId);
        }
      } catch {
        // Server offline — will timeout to bot game
      }

      // After 30s without match, start local game with bots
      if (this.matchmakingTimer > 30 && this.screen === "matchmaking") {
        this.cancelMatchmaking();
        this.startLocalGame();
      }
    }, 2000);
  }

  private cancelMatchmaking(): void {
    if (this.matchmakingPollInterval) {
      clearInterval(this.matchmakingPollInterval);
      this.matchmakingPollInterval = null;
    }
    this.api.leaveQueue().catch(() => {});
  }

  // ===== Post-Game =====

  private transitionToPostGame(): void {
    if (!this.gameState) return;

    if (this.isOnline) {
      // Post-game data comes from server via handleServerMessage
      this.connection.disconnect();
    } else {
      // Generate local post-game data
      this.postGameData = this.generateLocalPostGame();
    }

    this.screen = "post-game";
  }

  private generateLocalPostGame(): PostGameData {
    if (!this.gameState) {
      return { matchResult: { matchId: "", mode: "deathmatch", map: "nebula-station", duration: 0, players: [], winnerId: null }, xpGained: 0, newLevel: null, challengeProgress: [] };
    }

    const players = Object.values(this.gameState.players).map((p) => {
      const stats = this.gameState!.playerStats[p.id];
      return {
        id: p.id, name: p.name, shipClass: p.shipClass,
        score: p.score, eliminations: p.eliminations, deaths: p.deaths,
        damageDealt: stats?.damageDealt ?? 0,
        accuracy: stats && stats.shotsFired > 0
          ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0,
        gravityKills: stats?.gravityKills ?? 0,
      };
    }).sort((a, b) => b.score - a.score);

    const localStats = this.gameState.playerStats[this.localPlayerId];
    const xpGained = 50 + (localStats?.shotsHit ?? 0) * 2 +
      (this.gameState.winnerId === this.localPlayerId ? 20 : 0);

    return {
      matchResult: {
        matchId: crypto.randomUUID?.()?.slice(0, 8) ?? "local",
        mode: this.gameState.gameMode,
        map: this.gameState.mapId,
        duration: Math.round(this.gameState.tick / 60),
        players,
        winnerId: this.gameState.winnerId,
      },
      xpGained,
      newLevel: null,
      challengeProgress: [],
    };
  }

  private returnToMenu(): void {
    if (this.isOnline) {
      this.connection.disconnect();
    }
    this.screen = "menu";
    this.gameState = null;
    this.bots = [];
    this.isOnline = false;
    this.onlineFlow = false;
    this.activeRoomCode = "";
    this.remoteTargets = {};
    this.killFeed = [];
    this.killFeedTimers = [];
    this.lastKillFeedIndex = 0;
    this.comboCounter = 0;
    this.killStreak = 0;
    this.postGameData = null;
    this.chatMessages = [];
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
    this.killFeed = [];
    this.killFeedTimers = [];
    this.lastKillFeedIndex = 0;
    this.comboCounter = 0;
    this.killStreak = 0;
    this.chatMessages = [];
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
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    this.activeRoomCode = roomId.toUpperCase();
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

      const localPlayer = this.gameState.players[this.localPlayerId];
      if (localPlayer?.alive) {
        this.predictLocalMovement(localPlayer, input, dt);
      }

      for (const [id, player] of Object.entries(this.gameState.players)) {
        if (id === this.localPlayerId) continue;
        const target = this.remoteTargets[id];
        if (target) {
          const t = Math.min(1, dt * 12);
          player.position.x += (target.x - player.position.x) * t;
          player.position.y += (target.y - player.position.y) * t;
          const rotDelta = angleDiff(player.rotation, target.rot);
          player.rotation += rotDelta * t;
        }
      }

      this.processAudioEvents();
      this.renderer.render(this.gameState, this.localPlayerId, dt, this.activeRoomCode, this.copiedFeedbackTimer);
    } else {
      const inputs: Record<string, PlayerInput> = {};
      inputs[this.localPlayerId] = this.input.getInput();
      for (const bot of this.bots) {
        inputs[bot.id] = bot.getInput(this.gameState);
      }

      simulateTick(this.gameState, inputs, dt);

      // Process new kill events from simulation
      this.processLocalKillFeed();

      this.processAudioEvents();
      this.renderer.render(this.gameState, this.localPlayerId, dt);
    }

    // Draw kill feed overlay
    this.drawKillFeedOverlay();

    // Draw chat overlay
    if (this.chatMessages.length > 0 || this.chatOpen) {
      this.drawChatOverlay();
    }

    // Draw announcement
    if (this.announcementTimer > 0) {
      this.drawAnnouncement();
    }

    // Draw invite banner if applicable
    if (this.invites.length > 0) {
      this.drawInviteBanner();
    }
  }

  private processLocalKillFeed(): void {
    if (!this.gameState) return;
    const feed = this.gameState.killFeed;
    while (this.lastKillFeedIndex < feed.length) {
      const event = feed[this.lastKillFeedIndex];
      this.addKillFeedEntry(event);
      this.lastKillFeedIndex++;
    }
  }

  private addKillFeedEntry(event: KillEvent): void {
    this.killFeed.push(event);
    this.killFeedTimers.push(5); // 5 seconds display

    // Track combos and killstreaks for local player
    if (event.killerId === this.localPlayerId && event.victimId !== this.localPlayerId) {
      this.killStreak++;
      this.comboTimer = 3;
      this.comboCounter++;

      if (this.comboCounter === 2) this.showAnnouncement("Doppelkill!");
      else if (this.comboCounter === 3) this.showAnnouncement("Triplekill!");
      if (this.killStreak === 3) this.showAnnouncement("Killstreak!");
      else if (this.killStreak === 5) this.showAnnouncement("Unaufhaltsam!");
    }
    if (event.victimId === this.localPlayerId) {
      this.killStreak = 0;
      this.comboCounter = 0;
    }
  }

  private showAnnouncement(text: string): void {
    this.announcement = text;
    this.announcementTimer = 2;
  }

  private predictLocalMovement(player: PlayerState, input: PlayerInput, dt: number): void {
    const config = SHIP_CONFIGS[player.shipClass];

    const rotDiff = angleDiff(player.rotation, input.aimAngle);
    const maxRot = config.rotationSpeed * dt;
    player.rotation += clamp(rotDiff, -maxRot, maxRot);

    let friction = DRIFT_FRICTION;
    if (player.mods.ship === "drift-master") friction = 0.99;
    player.velocity = scale(player.velocity, Math.pow(friction, dt * 60));

    if (this.gameState) {
      const gravityMul = player.mods.ship === "gravity-anchor" ? 0.3 : 1.0;
      const gravVel = applyGravity({ x: 0, y: 0 }, player.position, this.gameState.gravityWells, dt);
      player.velocity = add(player.velocity, scale(gravVel, gravityMul));
    }

    let thrustDir: Vec2 | null = null;
    if (player.controlMode === "ship-relative") {
      const forward = vecFromAngle(player.rotation);
      const right = vecFromAngle(player.rotation + Math.PI / 2);
      let fx = 0, fy = 0;
      if (input.up) { fx += forward.x; fy += forward.y; }
      if (input.down) { fx -= forward.x * 0.5; fy -= forward.y * 0.5; }
      if (input.left) { fx -= right.x; fy -= right.y; }
      if (input.right) { fx += right.x; fy += right.y; }
      if (fx !== 0 || fy !== 0) thrustDir = normalize({ x: fx, y: fy });
    } else {
      let tx = 0, ty = 0;
      if (input.up) ty -= 1;
      if (input.down) ty += 1;
      if (input.left) tx -= 1;
      if (input.right) tx += 1;
      if (tx !== 0 || ty !== 0) thrustDir = normalize({ x: tx, y: ty });
    }

    if (thrustDir) {
      let speed = config.speed;
      if (player.mods.ship === "drift-master") speed *= 1.1;
      if (input.boost && player.energy > 0) {
        const boostMul = player.mods.ship === "afterburner" ? 1.3 : 1.0;
        speed *= BOOST_MULTIPLIER * boostMul;
      }
      player.velocity = add(player.velocity, scale(thrustDir, speed * dt));
    }

    player.position = add(player.position, scale(player.velocity, dt));

    if (this.gameState) {
      const map = MAPS[this.gameState.mapId];
      const bounced = reflectVelocity(player.position, player.velocity, config.collisionRadius, map.width, map.height);
      player.position = bounced.pos;
      player.velocity = bounced.vel;
    }
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

  private reconcileWithServer(serverState: GameState): void {
    if (!this.gameState) return;

    const localPlayer = this.gameState.players[this.localPlayerId];
    const predicted = localPlayer ? {
      x: localPlayer.position.x, y: localPlayer.position.y,
      vx: localPlayer.velocity.x, vy: localPlayer.velocity.y,
      rot: localPlayer.rotation,
    } : null;

    const rendered: Record<string, { x: number; y: number; rot: number }> = {};
    for (const [id, player] of Object.entries(this.gameState.players)) {
      if (id === this.localPlayerId) continue;
      rendered[id] = { x: player.position.x, y: player.position.y, rot: player.rotation };
    }

    for (const [id, player] of Object.entries(serverState.players)) {
      if (id === this.localPlayerId) continue;
      this.remoteTargets[id] = {
        x: player.position.x, y: player.position.y,
        vx: player.velocity.x, vy: player.velocity.y,
        rot: player.rotation,
      };
    }

    this.gameState = serverState;

    if (predicted && this.gameState.players[this.localPlayerId]) {
      const p = this.gameState.players[this.localPlayerId];
      const t = 0.3;
      p.position.x = predicted.x + (p.position.x - predicted.x) * t;
      p.position.y = predicted.y + (p.position.y - predicted.y) * t;
      p.velocity.x = predicted.vx + (p.velocity.x - predicted.vx) * t;
      p.velocity.y = predicted.vy + (p.velocity.y - predicted.vy) * t;
      p.rotation = predicted.rot;
    }

    for (const [id, r] of Object.entries(rendered)) {
      const p = this.gameState.players[id];
      if (p && p.alive) {
        p.position.x = r.x;
        p.position.y = r.y;
        p.rotation = r.rot;
      }
    }

    for (const id of Object.keys(this.remoteTargets)) {
      if (!serverState.players[id]) delete this.remoteTargets[id];
    }
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "state":
        if (this.screen === "playing" && this.gameState) {
          this.reconcileWithServer(msg.state);
        } else {
          this.gameState = msg.state;
          if (this.screen === "online-lobby" || this.screen === "matchmaking") {
            this.screen = "playing";
            this.initAudioTracking();
          }
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
      case "kill":
        this.addKillFeedEntry(msg.event);
        break;
      case "chat":
        this.chatMessages.push(msg.message);
        if (this.chatMessages.length > 50) this.chatMessages.shift();
        break;
      case "post-game":
        this.postGameData = msg.data;
        break;
      case "rematch":
        // Could show vote count, for now just auto-transition
        break;
    }
  }

  // ===== HUD Overlays (drawn on top of game) =====

  private drawKillFeedOverlay(): void {
    if (this.killFeed.length === 0) return;
    const ctx = this.canvas.getContext("2d")!;
    const x = ctx.canvas.width - 20;
    let y = 80;
    const maxVisible = 5;

    const start = Math.max(0, this.killFeed.length - maxVisible);
    for (let i = start; i < this.killFeed.length; i++) {
      const event = this.killFeed[i];
      const isLocal = event.killerId === this.localPlayerId || event.victimId === this.localPlayerId;

      ctx.font = "12px monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = isLocal ? "#ffaa00" : "#999999";
      ctx.fillText(this.getKillText(event), x, y);
      y += 18;
    }
    ctx.textAlign = "left"; // Reset
  }

  private getKillText(event: KillEvent): string {
    const arrow = " \u2192 ";
    switch (event.killType) {
      case "gravity-well": return `${event.killerName}${arrow}${event.victimName} [Gravity]`;
      case "ricochet": return `${event.killerName}${arrow}${event.victimName} [Ricochet]`;
      case "homing": return `${event.killerName}${arrow}${event.victimName} [Homing]`;
      case "melee": return `${event.killerName}${arrow}${event.victimName} [Nahkampf]`;
      case "emp": return `${event.killerName}${arrow}${event.victimName} [EMP]`;
      default: return `${event.killerName}${arrow}${event.victimName}`;
    }
  }

  private drawChatOverlay(): void {
    const ctx = this.canvas.getContext("2d")!;
    const x = 20;
    const baseY = ctx.canvas.height - 40;

    // Show last 5 messages
    const visible = this.chatMessages.slice(-5);
    for (let i = 0; i < visible.length; i++) {
      const msg = visible[i];
      const y = baseY - (visible.length - 1 - i) * 18;
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x - 5, y - 12, 400, 16);
      ctx.fillStyle = "#aaaaff";
      ctx.fillText(`${msg.senderName}: `, x, y);
      const nameWidth = ctx.measureText(`${msg.senderName}: `).width;
      ctx.fillStyle = "#cccccc";
      ctx.fillText(msg.text, x + nameWidth, y);
    }

    // Chat input
    if (this.chatOpen) {
      const y = baseY + 5;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(x - 5, y - 12, 400, 20);
      ctx.font = "12px monospace";
      ctx.fillStyle = "#ffffff";
      const cursor = Math.sin(performance.now() / 300) > 0 ? "_" : "";
      ctx.fillText(`> ${this.chatInput}${cursor}`, x, y);
    }
  }

  private drawAnnouncement(): void {
    const ctx = this.canvas.getContext("2d")!;
    const alpha = Math.min(1, this.announcementTimer);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffaa00";
    ctx.fillText(this.announcement, ctx.canvas.width / 2, ctx.canvas.height / 2 - 50);
    ctx.restore();
  }

  private drawInviteBanner(): void {
    if (this.screen === "playing") return; // Don't show during gameplay
    const invite = this.invites[0];
    if (!invite) return;

    const ctx = this.canvas.getContext("2d")!;
    const w = ctx.canvas.width;
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(w / 2 - 250, 10, 500, 40);
    ctx.strokeStyle = "#ffaa00";
    ctx.strokeRect(w / 2 - 250, 10, 500, 40);
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffaa00";
    ctx.fillText(`${invite.fromName} laedt dich ein!  [Enter = Annehmen]  [Esc = Ablehnen]`, w / 2, 35);
  }

  // ===== New Screen Drawings =====

  private drawMenuOverlay(_mx: number, _my: number): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = ctx.canvas.width;

    // User info top-right
    if (this.currentUser) {
      ctx.font = "12px monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = "#aaaaaa";
      ctx.fillText(`${this.currentUser.displayName} (Lvl ${this.currentUser.level})`, w - 20, 20);
    }

    // Keyboard hints at bottom
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#555555";
    const hints = "Space = Quick Play  |  F = Freunde  |  P = Profil";
    ctx.fillText(hints, w / 2, ctx.canvas.height - 15);

    if (!this.api.isAccount) {
      ctx.fillText("L = Anmelden", w / 2, ctx.canvas.height - 30);
    }

    // Error message
    if (this.textInputError) {
      ctx.font = "14px monospace";
      ctx.fillStyle = "#ff4444";
      ctx.fillText(this.textInputError, w / 2, ctx.canvas.height - 50);
    }
  }

  private drawPostGame(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffaa00";
    ctx.fillText("RUNDE VORBEI!", w / 2, 60);

    if (!this.postGameData) {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText("Lade Ergebnisse...", w / 2, 150);
      return;
    }

    const result = this.postGameData.matchResult;

    // Winner
    if (result.winnerId) {
      const winner = result.players.find((p) => p.id === result.winnerId);
      if (winner) {
        ctx.font = "bold 24px monospace";
        ctx.fillStyle = "#44ff88";
        ctx.fillText(`Gewinner: ${winner.name}`, w / 2, 100);
      }
    }

    // Scoreboard
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = COLORS.ui;
    const headers = ["#", "Name", "Klasse", "Kills", "Tode", "Schaden", "Genauigkeit"];
    const colX = [w / 2 - 340, w / 2 - 300, w / 2 - 160, w / 2 - 40, w / 2 + 40, w / 2 + 130, w / 2 + 260];
    ctx.textAlign = "left";
    headers.forEach((h, i) => ctx.fillText(h, colX[i], 140));

    result.players.forEach((p, i) => {
      const y = 170 + i * 28;
      const isLocal = p.id === this.localPlayerId;
      ctx.font = "12px monospace";
      ctx.fillStyle = isLocal ? "#ffaa00" : "#cccccc";
      ctx.fillText(`${i + 1}`, colX[0], y);
      ctx.fillText(p.name, colX[1], y);
      ctx.fillText(p.shipClass, colX[2], y);
      ctx.fillText(`${p.eliminations}`, colX[3], y);
      ctx.fillText(`${p.deaths}`, colX[4], y);
      ctx.fillText(`${p.damageDealt}`, colX[5], y);
      ctx.fillText(`${p.accuracy}%`, colX[6], y);
    });

    // XP gained
    const xpY = 190 + result.players.length * 28;
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#44ff88";
    ctx.fillText(`+${this.postGameData.xpGained} XP`, w / 2, xpY);

    // Buttons
    ctx.font = "16px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("[Enter/N] Nochmal!     [Esc/M] Hauptmenue", w / 2, xpY + 50);
  }

  private drawFriends(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    const online = this.friends.filter((f) => f.presence !== "offline").length;
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(`FREUNDE (${online}/${this.friends.length} Online)`, w / 2, 60);

    if (this.friends.length === 0) {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText("Noch keine Freunde. Druecke S zum Suchen.", w / 2, 150);
    }

    // Friend list
    for (let i = 0; i < this.friends.length; i++) {
      const friend = this.friends[i];
      const y = 100 + i * 35;
      const isSelected = i === this.friendsSelectedIndex;

      if (isSelected) {
        ctx.fillStyle = "rgba(100,100,255,0.1)";
        ctx.fillRect(w / 2 - 300, y - 15, 600, 30);
      }

      // Status dot
      ctx.fillStyle = friend.presence === "offline" ? "#555555"
        : friend.presence === "online-ingame" ? "#ff6600" : "#44ff88";
      ctx.beginPath();
      ctx.arc(w / 2 - 280, y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "14px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = isSelected ? COLORS.ui : "#cccccc";
      ctx.fillText(friend.username, w / 2 - 260, y + 4);

      ctx.fillStyle = COLORS.uiDim;
      ctx.font = "11px monospace";
      ctx.fillText(`Lvl ${friend.level}`, w / 2 - 100, y + 4);

      const statusText = friend.presence === "offline" ? "Offline"
        : friend.presence === "online-ingame" ? "Im Spiel" : "Online";
      ctx.fillText(statusText, w / 2 + 50, y + 4);

      if (friend.presence === "online-ingame" && friend.roomId) {
        ctx.fillStyle = "#44ff88";
        ctx.fillText("[Beitreten]", w / 2 + 200, y + 4);
      }
    }

    // Friend requests
    if (this.friendsRequestsMode && this.friendRequests.incoming.length > 0) {
      const reqY = 120 + this.friends.length * 35;
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(`Anfragen (${this.friendRequests.incoming.length})`, w / 2, reqY);

      for (let i = 0; i < this.friendRequests.incoming.length; i++) {
        const req = this.friendRequests.incoming[i];
        ctx.font = "14px monospace";
        ctx.fillStyle = "#cccccc";
        ctx.fillText(`${req.fromUsername} moechte dein Freund sein`, w / 2, reqY + 25 + i * 25);
      }
    }

    // Bottom hints
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("S = Suchen  |  A = Anfragen  |  Esc = Zurueck", w / 2, h - 30);

    // Search mode overlay
    if (this.friendsSearchMode) {
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(w / 2 - 200, h / 2 - 50, 400, 100);
      ctx.strokeStyle = COLORS.ui;
      ctx.strokeRect(w / 2 - 200, h / 2 - 50, 400, 100);
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText("Benutzername eingeben:", w / 2, h / 2 - 20);
      const cursor = Math.sin(performance.now() / 300) > 0 ? "_" : "";
      ctx.fillText((this.textInputFields["search"] || "") + cursor, w / 2, h / 2 + 10);

      if (this.textInputMessage) {
        ctx.fillStyle = "#44ff88";
        ctx.fillText(this.textInputMessage, w / 2, h / 2 + 35);
      }
    }
  }

  private drawLogin(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("ANMELDEN", w / 2, 80);

    // Email field
    this.drawInputField(ctx, w / 2, 160, "E-Mail", "email", false);
    // Password field
    this.drawInputField(ctx, w / 2, 230, "Passwort", "password", true);

    // Error
    if (this.textInputError) {
      ctx.font = "14px monospace";
      ctx.fillStyle = "#ff4444";
      ctx.fillText(this.textInputError, w / 2, 290);
    }

    // Buttons
    ctx.font = "16px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("[Enter] Anmelden  |  [R] Registrieren  |  [Esc] Zurueck", w / 2, 340);
    ctx.font = "12px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("Klicke auf ein Feld und tippe den Wert ein. Tab = naechstes Feld.", w / 2, 380);
  }

  private drawRegister(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("KONTO ERSTELLEN", w / 2, 80);

    this.drawInputField(ctx, w / 2, 140, "E-Mail", "email", false);
    this.drawInputField(ctx, w / 2, 210, "Benutzername", "username", false);
    this.drawInputField(ctx, w / 2, 280, "Passwort (min. 6 Zeichen)", "password", true);
    this.drawInputField(ctx, w / 2, 350, "Passwort wiederholen", "password2", true);

    if (this.textInputError) {
      ctx.font = "14px monospace";
      ctx.fillStyle = "#ff4444";
      ctx.fillText(this.textInputError, w / 2, 410);
    }

    ctx.font = "16px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("[Enter] Registrieren  |  [Esc] Zurueck", w / 2, 460);

    if (this.api.isGuest) {
      ctx.font = "12px monospace";
      ctx.fillStyle = "#44ff88";
      ctx.fillText("Dein Gast-Fortschritt wird uebernommen!", w / 2, 500);
    }
  }

  private drawProfile(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("PROFIL", w / 2, 80);

    if (this.currentUser) {
      ctx.font = "bold 24px monospace";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(this.currentUser.displayName, w / 2, 140);

      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(`Level ${this.currentUser.level}`, w / 2, 175);
      ctx.fillText(`Typ: ${this.currentUser.type === "account" ? "Registriert" : "Gast"}`, w / 2, 210);
    } else {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText("Nicht angemeldet", w / 2, 150);
    }

    if (this.api.isGuest) {
      ctx.font = "14px monospace";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText("Registriere dich um Freunde hinzuzufuegen und Cosmetics freizuschalten!", w / 2, 280);
    }

    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    if (this.api.isAccount) {
      ctx.fillText("[L] Abmelden  |  [Esc] Zurueck", w / 2, 350);
    } else {
      ctx.fillText("[Esc] Zurueck", w / 2, 350);
    }
  }

  private drawMatchmaking(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;

    const dots = ".".repeat(Math.floor(this.matchmakingTimer * 2) % 4);
    ctx.fillText(`SUCHE MITSPIELER${dots}`, w / 2, h / 2 - 40);

    ctx.font = "18px monospace";
    ctx.fillStyle = "#ffaa00";
    ctx.fillText(`${this.matchmakingPlayersInQueue} Spieler in Warteschlange`, w / 2, h / 2 + 10);

    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    const remaining = Math.max(0, 30 - Math.floor(this.matchmakingTimer));
    ctx.fillText(`Bot-Spiel in ${remaining}s falls kein Match`, w / 2, h / 2 + 50);

    ctx.fillText("[Esc] Abbrechen", w / 2, h / 2 + 90);
  }

  private drawInputField(
    ctx: CanvasRenderingContext2D, cx: number, y: number,
    label: string, fieldName: string, isPassword: boolean,
  ): void {
    const isActive = this.textInputActive === fieldName;
    const value = this.textInputFields[fieldName] || "";
    const displayValue = isPassword ? "*".repeat(value.length) : value;

    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(label, cx, y - 20);

    ctx.strokeStyle = isActive ? COLORS.ui : COLORS.uiDim;
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.strokeRect(cx - 150, y - 15, 300, 30);

    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.ui;
    const cursor = isActive && Math.sin(performance.now() / 300) > 0 ? "_" : "";
    ctx.fillText(displayValue + cursor, cx, y + 5);

    // Make field clickable
    if (!this.textInputActive || this.textInputActive !== fieldName) {
      // Simple: click on field area to activate
      const mx = this.input.getMouseX();
      const my = this.input.getMouseY();
      if (mx >= cx - 150 && mx <= cx + 150 && my >= y - 15 && my <= y + 15) {
        // Detect click in handleMenuClick would be needed, but for keyboard flow:
        // Just allow Tab to navigate between fields
      }
    }
  }

  // ===== Existing Screen Drawings =====

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

    this.drawMenuButton(ctx, w / 2, 645, 220, 44, "Weiter", COLORS.ui, "button-start", mx, my);
    this.drawMenuButton(ctx, w / 2, 700, 150, 36, "Zurueck", COLORS.uiDim, "button-back", mx, my);
  }

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

    ctx.font = "12px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("Q/E = Schwierigkeit  |  W/S = Bots  |  1-5 = Schwierigkeit direkt", w / 2, 360);

    this.drawMenuButton(ctx, w / 2, 410, 220, 44, "LOS GEHTS!", COLORS.ui, "button-start-game", mx, my);
    this.drawMenuButton(ctx, w / 2, 465, 150, 36, "Zurueck", COLORS.uiDim, "button-settings-back", mx, my);
  }

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

    this.drawMenuButton(ctx, w / 2, 145, 240, 40, "Neuer Raum erstellen", COLORS.nova, "button-new-room", mx, my);

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

    if (this.activeRoomCode) {
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText("Code zum Teilen:", w / 2, 330);

      ctx.font = "bold 32px monospace";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(this.activeRoomCode, w / 2, 368);

      const copyLabel = this.copiedFeedbackTimer > 0 ? "Kopiert!" : "[ Kopieren ]";
      const copyColor = this.copiedFeedbackTimer > 0 ? "#44ff88" : COLORS.uiDim;
      const copyHovered = this.hitTestLocal(mx, my) === "button-copy-code";
      this.drawMenuButton(ctx, w / 2, 405, 140, 28, copyLabel, copyHovered ? COLORS.ui : copyColor, "button-copy-code", mx, my);
    }

    if (this.lobbyStatus) {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.gravityWell;
      ctx.fillText(this.lobbyStatus, w / 2, 420);
    }

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
