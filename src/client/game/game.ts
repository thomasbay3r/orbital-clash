import { Renderer, ClickableRegion } from "../rendering/renderer";
import { InputHandler } from "./input";
import { AudioManager } from "../audio/audio-manager";
import { Bot } from "./bot";
import { Connection } from "../network/connection";
import { ApiClient } from "../network/api";
import {
  GameState, ShipClass, GameMode, MapId, ModLoadout, MutatorId, KillType,
  PlayerInput, ServerMessage, ControlMode, PlayerState, Vec2,
  AuthUser, KillEvent, PostGameData, ChatMessage, FriendInfo, FriendRequest, Invite,
} from "../../shared/types";
import type { PartyServerMessage, PartyStateSnapshot } from "../../server/party-room";
import {
  createGameState, addPlayer, simulateTick,
} from "../../shared/game-simulation";
import {
  SHIP_CONFIGS, COLORS, DIFFICULTY_PRESETS, DEFAULT_DIFFICULTY_INDEX,
  DRIFT_FRICTION, BOOST_MULTIPLIER, MUTATOR_CONFIGS, XP_PER_LEVEL, MAX_LEVEL,
  SKIN_CONFIGS, TRAIL_CONFIGS, KILL_EFFECT_CONFIGS, TITLE_CONFIGS, EMOTE_CONFIGS,
  DAILY_CHALLENGE_POOL, WEEKLY_CHALLENGE_POOL, ACHIEVEMENT_CONFIGS,
  TUTORIAL_SCREENS,
} from "../../shared/constants";
import type { TutorialScreenId } from "../../shared/constants";
import { ChallengeProgress } from "../../shared/types";
import {
  add, scale, normalize, vecFromAngle, angleDiff, clamp,
  applyGravity, reflectVelocity,
} from "../../shared/physics";
import { MAPS } from "../../shared/maps";
import { t, getLang, setLang } from "../../shared/i18n";

type Screen = "menu" | "game-config" | "mod-select" | "settings" | "playing" | "online-lobby"
  | "friends" | "login" | "register" | "profile" | "post-game" | "matchmaking"
  | "challenges" | "cosmetics" | "mutator-roulette" | "party-lobby" | "tournament-bracket"
  | "help";

const SHIP_OPTIONS: ShipClass[] = ["viper", "titan", "specter", "nova"];
const MAP_OPTIONS: MapId[] = [
  "nebula-station", "asteroid-belt", "the-singularity",
  "black-hole", "wormhole-station", "debris-field",
];
const MODE_OPTIONS: GameMode[] = [
  "deathmatch", "king-of-the-asteroid", "gravity-shift", "duel",
  "asteroid-tag", "survival-wave", "hot-potato", "capture-the-core",
];
const MUTATOR_OPTIONS: MutatorId[] = [
  "hypergravity", "zero-g", "big-head", "ricochet-arena",
  "glass-cannon", "mystery-loadout", "fog-of-war", "speed-demon", "friendly-fire",
  "mirror-match",
];
const CONTROL_MODE_OPTIONS: ControlMode[] = ["absolute", "ship-relative"];
const getControlModeNames = () => [t("controls.standard"), t("controls.relative")];
const getControlModeDescs = () => [t("controls.standard.desc"), t("controls.relative.desc")];
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
  private selectedMutators: MutatorId[] = [];

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

  // Progression state
  private dailyChallenges: ChallengeProgress[] = [];
  private weeklyChallenges: ChallengeProgress[] = [];
  private unlockedAchievements: string[] = [];
  private challengeScrollOffset = 0;
  private cosmeticCategory = 0; // 0=skins, 1=trails, 2=effects, 3=titles

  // Emote wheel state
  private emoteWheelOpen = false;
  private activeEmotes: Record<string, { text: string; timer: number }> = {};
  private emoteCooldown = 0;

  // Slowmo state (client-side only, last kill effect)
  private slowmoActive = false;
  private slowmoTimer = 0;

  // Mutator roulette state
  private rouletteEnabled = false;
  private rouletteTimer = 0;
  private rouletteSelected: MutatorId[] = [];
  private rouletteHighlight = 0;
  private rouletteLockedCount = 0;

  // Kill-cam ring buffer & state
  private positionHistory: Array<Record<string, { x: number; y: number; rot: number; alive: boolean }>> = [];
  private killCamData: {
    frames: Array<Record<string, { x: number; y: number; rot: number; alive: boolean }>>;
    killerId: string;
    killerName: string;
    killType: KillType;
  } | null = null;
  private killCamTimer = 0;
  private prevLocalAlive = true;

  // Post-game highlight tracking
  private highlightKills: Array<{
    killerName: string; victimName: string; killType: KillType;
    score: number; label: string;
  }> = [];
  private highlightPhaseTimer = 0;
  private showingHighlights = false;

  // Session leaderboard (accumulated across rematches)
  private sessionStats: Record<string, {
    name: string; kills: number; deaths: number; wins: number;
    damageDealt: number; shotsFired: number; shotsHit: number;
    gamesPlayed: number;
  }> = {};
  private sessionGamesPlayed = 0;
  private showSessionStats = false;

  // Party system state
  private partyWs: WebSocket | null = null;
  private partyState: PartyStateSnapshot | null = null;
  private partyCodeInput = "";
  private partyStatus = "";
  private partyReady = false;
  private partyCopiedTimer = 0;
  private partyShowSession = false;
  private partyChatOpen = false;
  private partyChatInput = "";
  private partyChatMessages: ChatMessage[] = [];

  // Tournament state
  private tournamentActive = false;
  private tournamentBracket: Array<{ player1: string; player2: string | null; winner: string | null; round: number }> = [];
  private tournamentPlayers: Array<{ id: string; name: string }> = [];
  private tournamentCurrentMatch = -1;
  private tournamentChampion: string | null = null;

  // Tutorial state
  private tutorialEnabled = true;
  private tutorialSeen = new Set<TutorialScreenId>();
  private tutorialActive: TutorialScreenId | null = null;
  private tutorialResetFeedback = 0;
  private firstGameStarted = false;

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

    this.loadTutorialState();
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();

    // Auto-init guest if not logged in (non-blocking for local play)
    if (this.api.isLoggedIn) {
      this.api.getMe().then((user: any) => {
        this.currentUser = user;
        this.playerName = user.displayName;
        this.restoreLocalXp();
        this.syncTutorialFromServer(user);
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
      selectedMutators: this.selectedMutators,
      dailyChallenges: this.dailyChallenges,
      weeklyChallenges: this.weeklyChallenges,
      unlockedAchievements: this.unlockedAchievements,
      cosmeticCategory: this.cosmeticCategory,
      emoteWheelOpen: this.emoteWheelOpen,
      killStreak: this.killStreak,
      slowmoActive: this.slowmoActive,
      tutorialEnabled: this.tutorialEnabled,
      tutorialSeen: [...this.tutorialSeen],
      tutorialActive: this.tutorialActive,
      tutorialResetFeedback: this.tutorialResetFeedback,
      firstGameStarted: this.firstGameStarted,
      // Methods exposed for future task wiring (suppress noUnusedLocals)
      _tutorialHelpers: {
        markSeen: this.markTutorialSeen.bind(this),
        disable: this.disableTutorial.bind(this),
        shouldShow: this.shouldShowTutorial.bind(this),
      },
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

  // ===== Tutorial State =====

  private loadTutorialState(): void {
    try {
      const enabled = localStorage.getItem("tutorialEnabled");
      if (enabled !== null) this.tutorialEnabled = enabled === "true";
      const seen = localStorage.getItem("tutorialSeen");
      if (seen) this.tutorialSeen = new Set(JSON.parse(seen));
    } catch { /* ignore corrupt data */ }
  }

  private saveTutorialState(): void {
    localStorage.setItem("tutorialEnabled", String(this.tutorialEnabled));
    localStorage.setItem("tutorialSeen", JSON.stringify([...this.tutorialSeen]));
  }

  private markTutorialSeen(id: TutorialScreenId): void {
    this.tutorialSeen.add(id);
    this.tutorialActive = null;
    this.saveTutorialState();
    if (this.api.isAccount) {
      this.api.saveTutorialState(this.tutorialEnabled, [...this.tutorialSeen]).catch(() => {});
    }
  }

  private disableTutorial(): void {
    this.tutorialEnabled = false;
    this.tutorialActive = null;
    this.saveTutorialState();
    if (this.api.isAccount) {
      this.api.saveTutorialState(this.tutorialEnabled, [...this.tutorialSeen]).catch(() => {});
    }
  }

  private syncTutorialFromServer(data: { tutorial_enabled?: number; tutorial_seen?: string }): void {
    if (data.tutorial_enabled === undefined) return;
    const serverSeen = new Set<TutorialScreenId>(
      JSON.parse(data.tutorial_seen || "[]"),
    );
    for (const id of serverSeen) this.tutorialSeen.add(id);
    if (!data.tutorial_enabled) this.tutorialEnabled = false;
    this.saveTutorialState();
  }

  private shouldShowTutorial(id: TutorialScreenId): boolean {
    return this.tutorialEnabled && !this.tutorialSeen.has(id);
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
    if (this.emoteCooldown > 0) this.emoteCooldown -= dt;
    if (this.slowmoTimer > 0) {
      this.slowmoTimer -= dt;
      if (this.slowmoTimer <= 0) this.slowmoActive = false;
    }

    // Expire emote displays
    for (const [id, emote] of Object.entries(this.activeEmotes)) {
      emote.timer -= dt;
      if (emote.timer <= 0) delete this.activeEmotes[id];
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
        this.renderer.accountButtonLabel = this.api.isAccount ? t("profile.account") : t("profile.login");
        const hovered = this.renderer.hitTest(mx, my);
        this.renderer.drawHub(hovered);
        this.drawMenuOverlay(mx, my);
        break;
      }
      case "game-config": {
        const hovered2 = this.renderer.hitTest(mx, my);
        this.renderer.drawGameConfig(this.selectedShip, this.selectedMap, this.selectedMode, hovered2, mx, my, this.onlineFlow);
        this.drawMenuOverlay(mx, my);
        // Tutorial overlay
        if (this.shouldShowTutorial("game-config")) {
          this.tutorialActive = "game-config";
          const ctx = this.canvas.getContext("2d")!;
          this.drawTutorialOverlay(ctx, this.canvas.width, this.canvas.height, t("tutorial.overlay.gameConfig"));
        }
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
      case "challenges":
        this.drawChallenges();
        break;
      case "cosmetics":
        this.drawCosmetics();
        break;
      case "mutator-roulette":
        this.rouletteTimer += dt;
        this.drawMutatorRoulette(dt);
        break;
      case "party-lobby":
        if (this.partyCopiedTimer > 0) this.partyCopiedTimer -= dt;
        this.drawPartyLobby();
        break;
      case "tournament-bracket":
        this.drawTournamentBracket();
        break;
      case "help":
        if (this.tutorialResetFeedback > 0) this.tutorialResetFeedback -= dt;
        this.drawHelp();
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
      // If Escape deactivated the field, fall through to screen-specific handlers
      if (this.textInputActive) return;
      if (key !== "escape") return;
    }

    // Chat input mode during gameplay
    if (this.chatOpen) {
      this.handleChatInput(key);
      return;
    }

    // Tutorial dismiss handling
    if (this.tutorialActive) {
      const config = TUTORIAL_SCREENS.find((s) => s.id === this.tutorialActive);
      if (config?.type === "overlay") {
        if (key === "enter") {
          this.markTutorialSeen(this.tutorialActive);
          return;
        }
        if (key === "t") {
          this.disableTutorial();
          return;
        }
        return; // Block all other keys during overlay
      }
      if (config?.type === "banner") {
        if (key === "enter") {
          this.markTutorialSeen(this.tutorialActive);
          return;
        }
        if (key === "t" && !this.chatOpen) {
          this.disableTutorial();
          return;
        }
      }
    }

    if (this.screen === "menu") {
      // Hub: navigation only
      if (key === "enter") {
        this.screen = "game-config";
      }
      if (key === "m") {
        this.onlineFlow = true;
        this.screen = "game-config";
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
      if (key === "h") this.screen = "help";
      if (key === "l" && !this.api.isAccount) {
        this.textInputFields = { email: "", password: "" };
        this.textInputActive = null;
        this.textInputError = "";
        this.screen = "login";
      }
      if (key === " ") {
        this.startQuickPlay();
      }
      if (key === "n") {
        this.createParty();
      }
      if (key === "j") {
        this.partyCodeInput = "";
        this.partyStatus = "";
        this.screen = "party-lobby";
      }
    } else if (this.screen === "game-config") {
      // Game config: ship/map/mode selection
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
      if (key === "escape") {
        this.onlineFlow = false;
        this.screen = "menu";
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
        this.screen = "game-config";
      }
    } else if (this.screen === "settings") {
      if (key === "enter") {
        if (this.rouletteEnabled) {
          this.startMutatorRoulette();
        } else {
          this.startLocalGame();
        }
      }
      if (key === "o") {
        this.rouletteEnabled = !this.rouletteEnabled;
      }
      if (key === "h") {
        this.tutorialEnabled = !this.tutorialEnabled;
        this.saveTutorialState();
        if (this.api.isAccount) {
          this.api.saveTutorialState(this.tutorialEnabled, [...this.tutorialSeen]).catch(() => {});
        }
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
      // Mutator toggles: M + number
      if (key === "m") {
        // Cycle through mutator pages (not needed, just a hint key)
      }
      // Toggle mutators with number keys when holding M would be complex,
      // so use letter keys for common mutators
      if (key === "g") this.toggleMutator("hypergravity");
      if (key === "z") this.toggleMutator("zero-g");
      if (key === "b") this.toggleMutator("big-head");
      if (key === "r") this.toggleMutator("ricochet-arena");
      if (key === "c") this.toggleMutator("glass-cannon");
      if (key === "f") this.toggleMutator("fog-of-war");
      if (key === "d") this.toggleMutator("speed-demon");
      if (key === "x") this.toggleMutator("friendly-fire");
      if (key === "y") this.toggleMutator("mystery-loadout");
      if (key === "i") this.toggleMutator("mirror-match");
    } else if (this.screen === "mutator-roulette") {
      if (key === "enter" || key === "escape") {
        this.selectedMutators = [...this.rouletteSelected];
        this.startLocalGame();
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
      if (key === "v" && !this.gameState?.gameOver && !this.chatOpen) {
        this.emoteWheelOpen = !this.emoteWheelOpen;
        return;
      }
      if (this.emoteWheelOpen && key >= "1" && key <= "8") {
        this.sendEmote(parseInt(key) - 1);
        this.emoteWheelOpen = false;
        return;
      }
      if (key === "escape" && this.emoteWheelOpen) {
        this.emoteWheelOpen = false;
        return;
      }
      if (key === "enter" && this.gameState?.gameOver) {
        this.transitionToPostGame();
      }
    } else if (this.screen === "post-game") {
      // Skip highlights phase
      if (this.showingHighlights) {
        if (key === "enter" || key === "escape" || key === " ") {
          this.showingHighlights = false;
        }
        return;
      }
      // Toggle session/match view
      if (key === "s" && this.sessionGamesPlayed > 1) {
        this.showSessionStats = true;
      } else if (key === "m" && this.showSessionStats) {
        this.showSessionStats = false;
      } else if (key === "enter" || key === "n") {
        // Nochmal
        this.showSessionStats = false;
        if (this.isOnline) {
          this.connection.send({ type: "rematch-vote" });
        } else {
          this.startLocalGame();
        }
      } else if (key === "escape") {
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
        this.textInputFields = { email: "", username: "", password: "", password2: "" };
        this.textInputActive = "email";
        this.textInputError = "";
        this.screen = "register";
      }
    } else if (this.screen === "register") {
      if (key === "escape") this.screen = "login";
      if (key === "tab") {
        if (!this.textInputActive) {
          this.textInputActive = "email";
        }
        // Tab cycling handled by handleTextInput when a field is active
      }
    } else if (this.screen === "profile") {
      if (key === "escape") this.screen = "menu";
      if (key === "l" && this.api.isAccount) {
        this.api.logout();
        this.currentUser = null;
        this.screen = "menu";
      }
      if (key === "c") this.screen = "challenges";
      if (key === "k") this.screen = "cosmetics";
    } else if (this.screen === "challenges") {
      if (key === "escape") this.screen = "profile";
      if (key === "arrowup") this.challengeScrollOffset = Math.max(0, this.challengeScrollOffset - 1);
      if (key === "arrowdown") this.challengeScrollOffset++;
    } else if (this.screen === "cosmetics") {
      if (key === "escape") this.screen = "profile";
      if (key === "1") this.cosmeticCategory = 0;
      if (key === "2") this.cosmeticCategory = 1;
      if (key === "3") this.cosmeticCategory = 2;
      if (key === "4") this.cosmeticCategory = 3;
      if (key === "arrowleft") this.cosmeticCategory = Math.max(0, this.cosmeticCategory - 1);
      if (key === "arrowright") this.cosmeticCategory = Math.min(3, this.cosmeticCategory + 1);
    } else if (this.screen === "help") {
      if (key === "escape") this.screen = "menu";
      if (key === "r") {
        this.tutorialSeen.clear();
        this.tutorialEnabled = true;
        this.firstGameStarted = false;
        this.saveTutorialState();
        this.tutorialResetFeedback = 2;
      }
    } else if (this.screen === "matchmaking") {
      if (key === "escape") {
        this.cancelMatchmaking();
        this.screen = "menu";
      }
    } else if (this.screen === "tournament-bracket") {
      if (key === "escape") {
        this.tournamentActive = false;
        this.screen = "settings";
      }
      if (key === "enter") {
        if (this.tournamentChampion) {
          // Tournament over — return to settings
          this.tournamentActive = false;
          this.screen = "settings";
        } else {
          // Find next unplayed match
          const nextIdx = this.tournamentBracket.findIndex((m) => m.winner === null && m.player2 !== null);
          if (nextIdx >= 0) {
            this.startTournamentMatch(nextIdx);
          }
        }
      }
    } else if (this.screen === "party-lobby") {
      // Not connected yet — entering party code
      if (!this.partyState && !this.partyWs) {
        if (key === "escape") {
          this.screen = "menu";
          return;
        }
        if (key === "backspace") {
          this.partyCodeInput = this.partyCodeInput.slice(0, -1);
          return;
        }
        if (key === "enter" && this.partyCodeInput.length > 0) {
          this.connectToParty(this.partyCodeInput);
          return;
        }
        if (key === "n") {
          this.createParty();
          return;
        }
        if (key.length === 1 && this.partyCodeInput.length < 12) {
          this.partyCodeInput += key;
          return;
        }
        return;
      }

      if (this.partyChatOpen) {
        if (key === "escape") {
          this.partyChatOpen = false;
          return;
        }
        if (key === "enter") {
          if (this.partyChatInput.trim()) {
            this.sendPartyMessage({ type: "chat", text: this.partyChatInput.trim() });
            this.partyChatInput = "";
          }
          this.partyChatOpen = false;
          return;
        }
        if (key === "backspace") {
          this.partyChatInput = this.partyChatInput.slice(0, -1);
          return;
        }
        if (key.length === 1) {
          this.partyChatInput += key;
          return;
        }
        return;
      }
      if (key === "escape") {
        this.disconnectParty();
        this.screen = "menu";
      }
      if (key === "r") {
        this.partyReady = !this.partyReady;
        this.sendPartyMessage({ type: "ready", ready: this.partyReady });
      }
      if (key === "t") {
        this.partyChatOpen = true;
        this.partyChatInput = "";
      }
      if (key === "s") {
        this.partyShowSession = !this.partyShowSession;
      }
      // Leader: Enter = start game
      if (key === "enter" && this.partyState) {
        const myId = this.currentUser?.id ?? "";
        if (myId === this.partyState.leaderId) {
          this.sendPartyMessage({ type: "start-game" });
        }
      }
      // Leader: Q/E = change mode, W/S = change map
      if (this.partyState) {
        const myId = this.currentUser?.id ?? "";
        if (myId === this.partyState.leaderId) {
          if (key === "q") {
            const modeIdx = MODE_OPTIONS.indexOf(this.partyState.selectedMode);
            const newIdx = (modeIdx - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length;
            this.sendPartyMessage({ type: "settings", mode: MODE_OPTIONS[newIdx] });
          }
          if (key === "e") {
            const modeIdx = MODE_OPTIONS.indexOf(this.partyState.selectedMode);
            const newIdx = (modeIdx + 1) % MODE_OPTIONS.length;
            this.sendPartyMessage({ type: "settings", mode: MODE_OPTIONS[newIdx] });
          }
          if (key === "w") {
            const mapIdx = MAP_OPTIONS.indexOf(this.partyState.selectedMap);
            const newIdx = (mapIdx + 1) % MAP_OPTIONS.length;
            this.sendPartyMessage({ type: "settings", map: MAP_OPTIONS[newIdx] });
          }
          if (key === "arrowdown") {
            const mapIdx = MAP_OPTIONS.indexOf(this.partyState.selectedMap);
            const newIdx = (mapIdx - 1 + MAP_OPTIONS.length) % MAP_OPTIONS.length;
            this.sendPartyMessage({ type: "settings", map: MAP_OPTIONS[newIdx] });
          }
        }
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
      // Hub: check overlay + main buttons
      const localHit = this.hitTestLocal(mx, my);
      if (localHit === "btn-lang-toggle") {
        setLang(getLang() === "de" ? "en" : "de");
        this.renderer.accountButtonLabel = this.api.isAccount ? t("profile.account") : t("profile.login");
        return;
      }
      const hit = this.renderer.hitTest(mx, my);
      if (!hit) return;
      if (hit === "button-singleplayer") this.screen = "game-config";
      if (hit === "button-online") {
        this.onlineFlow = true;
        this.screen = "game-config";
      }
      if (hit === "button-quickplay") this.startQuickPlay();
      if (hit === "button-party-create") this.createParty();
      if (hit === "button-party-join") {
        this.partyCodeInput = "";
        this.partyStatus = "";
        this.screen = "party-lobby";
      }
      if (hit === "button-account") {
        if (this.api.isAccount) {
          this.screen = "profile";
        } else {
          this.textInputFields = { email: "", password: "" };
          this.textInputActive = "email";
          this.textInputError = "";
          this.screen = "login";
        }
      }
      if (hit === "button-friends") {
        if (this.api.isAccount) {
          this.loadFriends();
          this.screen = "friends";
        } else {
          this.textInputError = "Freunde nur mit Konto verfuegbar";
        }
      }
    } else if (this.screen === "game-config") {
      // Game config: ship/map/mode selection
      const localHit = this.hitTestLocal(mx, my);
      if (localHit === "btn-lang-toggle") {
        setLang(getLang() === "de" ? "en" : "de");
        return;
      }
      const hit = this.renderer.hitTest(mx, my);
      if (!hit) return;
      if (hit.startsWith("ship-")) this.selectedShip = parseInt(hit.split("-")[1]);
      if (hit.startsWith("map-")) this.selectedMap = parseInt(hit.split("-")[1]);
      if (hit.startsWith("mode-")) this.selectedMode = parseInt(hit.split("-")[1]);
      if (hit === "button-weiter") this.screen = "mod-select";
      if (hit === "button-back") {
        this.onlineFlow = false;
        this.screen = "menu";
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
        this.screen = "game-config";
      }
    } else if (this.screen === "settings") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit.startsWith("difficulty-")) this.selectedDifficulty = parseInt(hit.split("-")[1]);
      if (hit.startsWith("botcount-")) this.selectedBotCount = parseInt(hit.split("-")[1]);
      if (hit?.startsWith("mutator-")) {
        const mutId = hit.slice(8) as MutatorId;
        this.toggleMutator(mutId);
      }
      if (hit === "btn-roulette-toggle") this.rouletteEnabled = !this.rouletteEnabled;
      if (hit === "button-tutorial-toggle") {
        this.tutorialEnabled = !this.tutorialEnabled;
        this.saveTutorialState();
        if (this.api.isAccount) {
          this.api.saveTutorialState(this.tutorialEnabled, [...this.tutorialSeen]).catch(() => {});
        }
      }
      if (hit === "button-start-game") {
        if (this.rouletteEnabled) {
          this.startMutatorRoulette();
        } else {
          this.startLocalGame();
        }
      }
      if (hit === "button-start-tournament") this.startTournament();
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
    } else if (this.screen === "profile") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-challenges") this.screen = "challenges";
      if (hit === "btn-cosmetics") { this.cosmeticCategory = 0; this.screen = "cosmetics"; }
      if (hit === "btn-profile-back") this.screen = "menu";
      if (hit === "btn-logout") { this.api.logout(); this.currentUser = null; this.screen = "menu"; }
    } else if (this.screen === "post-game") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-play-again") {
        this.showSessionStats = false;
        if (this.isOnline) {
          this.connection.send({ type: "rematch-vote" });
        } else {
          this.startLocalGame();
        }
      }
      if (hit === "btn-to-menu") this.returnToMenu();
    } else if (this.screen === "login") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-do-login") this.doLogin();
      if (hit === "btn-to-register") {
        this.textInputFields = { email: "", username: "", password: "", password2: "" };
        this.textInputActive = "email";
        this.textInputError = "";
        this.screen = "register";
      }
      if (hit === "btn-login-back") this.screen = "menu";
      if (hit?.startsWith("field-")) this.textInputActive = hit.slice(6);
    } else if (this.screen === "register") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-do-register") this.doRegister();
      if (hit === "btn-register-back") this.screen = "login";
      if (hit?.startsWith("field-")) this.textInputActive = hit.slice(6);
    } else if (this.screen === "friends") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-friends-search") {
        this.friendsSearchMode = !this.friendsSearchMode;
        this.textInputFields = { search: "" };
        this.textInputActive = "search";
      }
      if (hit === "btn-friends-requests") { this.friendsRequestsMode = !this.friendsRequestsMode; }
      if (hit === "btn-friends-back") this.screen = "menu";
      if (hit.startsWith("btn-join-friend-")) {
        const idx = parseInt(hit.split("-")[3]);
        const friend = this.friends[idx];
        if (friend?.roomId) this.joinRoom(friend.roomId);
      }
    } else if (this.screen === "challenges") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-challenges-back") this.screen = "profile";
    } else if (this.screen === "cosmetics") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit.startsWith("btn-cosmetics-tab-")) { this.cosmeticCategory = parseInt(hit.split("-")[3]); }
      if (hit === "btn-cosmetics-back") this.screen = "profile";
    } else if (this.screen === "matchmaking") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-matchmaking-cancel") { this.cancelMatchmaking(); this.screen = "menu"; }
    } else if (this.screen === "party-lobby") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-party-leave") {
        this.disconnectParty();
        this.screen = "menu";
      }
    } else if (this.screen === "tournament-bracket") {
      const hit = this.hitTestLocal(mx, my);
      if (!hit) return;
      if (hit === "btn-tournament-next") {
        const nextIdx = this.tournamentBracket.findIndex((m) => m.winner === null && m.player2 !== null);
        if (nextIdx >= 0) this.startTournamentMatch(nextIdx);
      }
      if (hit === "btn-tournament-back") {
        this.tournamentActive = false;
        this.screen = "settings";
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

  private toggleMutator(id: MutatorId): void {
    const idx = this.selectedMutators.indexOf(id);
    if (idx >= 0) {
      this.selectedMutators.splice(idx, 1);
    } else {
      this.selectedMutators.push(id);
    }
  }

  private initChallengesIfNeeded(): void {
    if (this.dailyChallenges.length === 0) {
      // Pick 3 random daily challenges
      const pool = [...DAILY_CHALLENGE_POOL];
      for (let i = 0; i < 3 && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        const config = pool.splice(idx, 1)[0];
        this.dailyChallenges.push({
          challengeId: config.id,
          progress: 0,
          target: config.target,
          completed: false,
        });
      }
    }
    if (this.weeklyChallenges.length === 0) {
      // Pick 3 random weekly challenges
      const pool = [...WEEKLY_CHALLENGE_POOL];
      for (let i = 0; i < 3 && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        const config = pool.splice(idx, 1)[0];
        this.weeklyChallenges.push({
          challengeId: config.id,
          progress: 0,
          target: config.target,
          completed: false,
        });
      }
    }
  }

  private updateChallengeProgress(): void {
    if (!this.gameState) return;
    const player = this.gameState.players[this.localPlayerId];
    if (!player) return;

    const stats = this.gameState.playerStats[this.localPlayerId];
    const isWinner = this.gameState.winnerId === this.localPlayerId;
    const noDeath = player.deaths === 0;

    const allChallenges = [...this.dailyChallenges, ...this.weeklyChallenges];
    for (const c of allChallenges) {
      if (c.completed) continue;
      const config = [...DAILY_CHALLENGE_POOL, ...WEEKLY_CHALLENGE_POOL].find((d) => d.id === c.challengeId);
      if (!config) continue;

      switch (config.type) {
        case "play-games": c.progress++; break;
        case "get-kills": c.progress += player.eliminations; break;
        case "win-games": if (isWinner) c.progress++; break;
        case "gravity-kills": c.progress += stats?.gravityKills ?? 0; break;
        case "use-special": c.progress++; break; // Approximate: 1 per game
        case "no-death-win": if (isWinner && noDeath) c.progress++; break;
        case "damage-dealt": c.progress += stats?.damageDealt ?? 0; break;
        case "mode-variety": c.progress++; break; // Simplified
      }

      if (c.progress >= c.target) {
        c.progress = c.target;
        c.completed = true;
      }
    }
  }

  private checkAchievements(): void {
    if (!this.gameState) return;
    const player = this.gameState.players[this.localPlayerId];
    if (!player) return;

    // first-game: always earned after first game
    if (!this.unlockedAchievements.includes("first-game")) {
      this.unlockedAchievements.push("first-game");
    }

    // cartographer: check if all maps played (simplified - just track current map)
    // These would need persistent storage for full tracking; simplified for local play
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
    if (!email || !password) { this.textInputError = t("error.fillAllFields"); return; }

    try {
      this.currentUser = await this.api.login(email, password);
      this.playerName = this.currentUser.displayName;
      this.textInputError = "";
      this.screen = "menu";
      // Sync tutorial state from server
      this.api.getMe().then((data: any) => this.syncTutorialFromServer(data)).catch(() => {});
    } catch (e: any) {
      this.textInputError = e.message || t("error.loginFailed");
    }
  }

  private async doRegister(): Promise<void> {
    const email = this.textInputFields["email"] || "";
    const username = this.textInputFields["username"] || "";
    const password = this.textInputFields["password"] || "";
    const password2 = this.textInputFields["password2"] || "";
    if (!email || !username || !password) { this.textInputError = t("error.fillAllFields"); return; }
    if (password !== password2) { this.textInputError = t("error.passwordsMismatch"); return; }
    if (password.length < 6) { this.textInputError = t("error.passwordTooShort"); return; }

    try {
      this.currentUser = await this.api.register(email, username, password);
      this.playerName = this.currentUser.displayName;
      this.textInputError = "";
      this.screen = "menu";
    } catch (e: any) {
      this.textInputError = e.message || t("error.registerFailed");
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
        this.textInputMessage = t("friends.noResult");
      } else {
        // Send request to first result for simplicity
        await this.api.sendFriendRequest(results[0].username);
        this.textInputMessage = t("friends.requestSent", { name: results[0].username });
      }
    } catch (e: any) {
      this.textInputError = e.message || t("error.searchFailed");
    }
  }

  // ===== Quick Play =====

  private async startQuickPlay(): Promise<void> {
    if (!this.api.isLoggedIn) {
      // Auto-init guest for quick play
      try {
        this.currentUser = await this.api.initGuest();
        this.playerName = this.currentUser.displayName;
        this.restoreLocalXp();
      } catch {
        this.textInputError = t("error.connectionFailed");
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

  private restoreLocalXp(): void {
    if (!this.currentUser) return;
    try {
      const saved = localStorage.getItem("local_xp");
      if (saved) {
        const savedXp = parseInt(saved, 10);
        if (savedXp > this.currentUser.xp) {
          this.currentUser.xp = savedXp;
          this.currentUser.level = Math.min(MAX_LEVEL, Math.floor(savedXp / XP_PER_LEVEL) + 1);
        }
      }
    } catch {}
  }

  private transitionToPostGame(): void {
    if (!this.gameState) return;

    // Track challenge progress and achievements before generating post-game data
    this.updateChallengeProgress();
    this.checkAchievements();
    this.accumulateSessionStats();

    if (this.isOnline) {
      // Post-game data comes from server via handleServerMessage
      this.connection.disconnect();
    } else {
      // Generate local post-game data
      this.postGameData = this.generateLocalPostGame();
      // Report match to server for persistent XP storage
      if (this.api.isLoggedIn && this.postGameData) {
        this.api.reportMatch(this.postGameData.matchResult).catch(() => {});
      }
    }

    // Accumulate XP locally and persist
    if (this.postGameData && this.currentUser) {
      this.currentUser.xp += this.postGameData.xpGained;
      this.currentUser.level = Math.min(MAX_LEVEL, Math.floor(this.currentUser.xp / XP_PER_LEVEL) + 1);
      try { localStorage.setItem("local_xp", String(this.currentUser.xp)); } catch {}
    }

    // Tournament: advance bracket instead of normal post-game
    if (this.tournamentActive && this.gameState) {
      const winnerId = this.gameState.winnerId;
      const winnerPlayer = winnerId ? this.gameState.players[winnerId] : null;
      const winnerName = winnerPlayer?.name ?? "";
      this.gameState = null;
      this.bots = [];
      this.advanceTournament(winnerName);
      return;
    }

    // Show highlight reel if there are impressive kills, otherwise go straight to post-game
    const topHighlights = this.highlightKills
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (topHighlights.length > 0) {
      this.showingHighlights = true;
      this.highlightPhaseTimer = 0;
      this.highlightKills = topHighlights;
      this.screen = "post-game";
    } else {
      this.showingHighlights = false;
      this.screen = "post-game";
    }
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

    const challengeProgress = [...this.dailyChallenges, ...this.weeklyChallenges]
      .filter((c) => c.progress > 0)
      .map((c) => ({
        challengeId: c.challengeId,
        progress: c.progress,
        target: c.target,
        completed: c.completed,
      }));

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
      challengeProgress,
    };
  }

  private accumulateSessionStats(): void {
    if (!this.gameState) return;
    this.sessionGamesPlayed++;

    for (const p of Object.values(this.gameState.players)) {
      const stats = this.gameState.playerStats[p.id];
      if (!this.sessionStats[p.id]) {
        this.sessionStats[p.id] = {
          name: p.name, kills: 0, deaths: 0, wins: 0,
          damageDealt: 0, shotsFired: 0, shotsHit: 0, gamesPlayed: 0,
        };
      }
      const s = this.sessionStats[p.id];
      s.kills += p.eliminations;
      s.deaths += p.deaths;
      s.damageDealt += stats?.damageDealt ?? 0;
      s.shotsFired += stats?.shotsFired ?? 0;
      s.shotsHit += stats?.shotsHit ?? 0;
      s.gamesPlayed++;
      if (this.gameState.winnerId === p.id) s.wins++;
    }
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
    this.selectedMutators = [];
    this.emoteWheelOpen = false;
    this.activeEmotes = {};
    this.emoteCooldown = 0;
    this.slowmoActive = false;
    this.slowmoTimer = 0;
    // Reset session leaderboard
    this.sessionStats = {};
    this.sessionGamesPlayed = 0;
    this.showSessionStats = false;
  }

  // ===== Local Game =====

  private startLocalGame(): void {
    const mode = MODE_OPTIONS[this.selectedMode];
    const mapId = MAP_OPTIONS[this.selectedMap];
    const shipClass = SHIP_OPTIONS[this.selectedShip];
    const mods = this.getMods();

    this.initChallengesIfNeeded();

    const controlMode = CONTROL_MODE_OPTIONS[this.selectedControlMode];
    this.gameState = createGameState(mode, mapId, this.selectedMutators);
    addPlayer(this.gameState, this.localPlayerId, this.playerName, shipClass, mods, controlMode);

    const botCount = mode === "duel" ? 1 : this.selectedBotCount;
    const preset = DIFFICULTY_PRESETS[this.selectedDifficulty];
    this.bots = [];
    const availableShips = SHIP_OPTIONS.filter((s) => s !== shipClass);

    const isMirror = this.selectedMutators.includes("mirror-match");
    for (let i = 0; i < botCount; i++) {
      const botId = `bot-${i}`;
      const botShip = isMirror ? shipClass : availableShips[i % availableShips.length];
      const botMods: ModLoadout = isMirror ? { ...mods } : {
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
    this.positionHistory = [];
    this.killCamData = null;
    this.killCamTimer = 0;
    this.prevLocalAlive = true;
    this.highlightKills = [];
    this.highlightPhaseTimer = 0;
    this.showingHighlights = false;
    this.screen = "playing";
    this.isOnline = false;
  }

  // ===== Tournament =====

  private startTournament(): void {
    // Gather players: local player + bots
    this.tournamentPlayers = [
      { id: this.localPlayerId, name: this.playerName },
    ];
    for (let i = 0; i < this.selectedBotCount; i++) {
      this.tournamentPlayers.push({ id: `bot-${i}`, name: BOT_NAMES[i % BOT_NAMES.length] });
    }
    // Need at least 2 players
    if (this.tournamentPlayers.length < 2) return;

    // Shuffle for random seeding
    for (let i = this.tournamentPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tournamentPlayers[i], this.tournamentPlayers[j]] = [this.tournamentPlayers[j], this.tournamentPlayers[i]];
    }

    // Build bracket: pair players
    this.tournamentBracket = [];
    let round = 1;
    const players = [...this.tournamentPlayers];

    // First round: pair up
    for (let i = 0; i < players.length; i += 2) {
      if (i + 1 < players.length) {
        this.tournamentBracket.push({
          player1: players[i].name,
          player2: players[i + 1].name,
          winner: null,
          round,
        });
      } else {
        // Bye — auto-advance
        this.tournamentBracket.push({
          player1: players[i].name,
          player2: null,
          winner: players[i].name,
          round,
        });
      }
    }

    this.tournamentCurrentMatch = -1;
    this.tournamentChampion = null;
    this.tournamentActive = true;
    this.screen = "tournament-bracket";
  }

  private advanceTournament(winnerName: string): void {
    // Record winner for current match
    if (this.tournamentCurrentMatch >= 0 && this.tournamentCurrentMatch < this.tournamentBracket.length) {
      this.tournamentBracket[this.tournamentCurrentMatch].winner = winnerName;
    }

    // Find winners of current round
    const currentRound = this.tournamentBracket.length > 0
      ? Math.max(...this.tournamentBracket.map((m) => m.round))
      : 0;
    const roundMatches = this.tournamentBracket.filter((m) => m.round === currentRound);
    const allDecided = roundMatches.every((m) => m.winner !== null);

    if (allDecided) {
      const winners = roundMatches.map((m) => m.winner!);
      if (winners.length === 1) {
        // Tournament is over!
        this.tournamentChampion = winners[0];
        this.tournamentCurrentMatch = -1;
      } else {
        // Create next round
        const nextRound = currentRound + 1;
        for (let i = 0; i < winners.length; i += 2) {
          if (i + 1 < winners.length) {
            this.tournamentBracket.push({
              player1: winners[i],
              player2: winners[i + 1],
              winner: null,
              round: nextRound,
            });
          } else {
            this.tournamentBracket.push({
              player1: winners[i],
              player2: null,
              winner: winners[i],
              round: nextRound,
            });
          }
        }
      }
    }

    this.screen = "tournament-bracket";
  }

  private startTournamentMatch(matchIdx: number): void {
    const match = this.tournamentBracket[matchIdx];
    if (!match || match.winner !== null || !match.player2) return;

    this.tournamentCurrentMatch = matchIdx;

    // Find player IDs
    const p1 = this.tournamentPlayers.find((p) => p.name === match.player1);
    const p2 = this.tournamentPlayers.find((p) => p.name === match.player2);
    if (!p1 || !p2) return;

    // Set up a duel game
    const mode: GameMode = "duel";
    const mapId = MAP_OPTIONS[this.selectedMap];
    const mods = this.getMods();
    const shipClass = SHIP_OPTIONS[this.selectedShip];
    const controlMode = CONTROL_MODE_OPTIONS[this.selectedControlMode];
    const preset = DIFFICULTY_PRESETS[this.selectedDifficulty];

    this.gameState = createGameState(mode, mapId, this.selectedMutators);

    // Add players — local player uses their settings, bots use random
    if (p1.id === this.localPlayerId) {
      addPlayer(this.gameState, p1.id, p1.name, shipClass, mods, controlMode);
    } else {
      const botShip = SHIP_OPTIONS[Math.floor(Math.random() * 4)];
      addPlayer(this.gameState, p1.id, p1.name, botShip, mods);
    }

    if (p2.id === this.localPlayerId) {
      addPlayer(this.gameState, p2.id, p2.name, shipClass, mods, controlMode);
    } else {
      const botShip = SHIP_OPTIONS[Math.floor(Math.random() * 4)];
      addPlayer(this.gameState, p2.id, p2.name, botShip, mods);
    }

    // Build bots list from scratch — avoids overwrite bugs
    this.bots = [];
    if (p1.id !== this.localPlayerId) {
      this.bots.push(new Bot(p1.id, preset));
    }
    if (p2.id !== this.localPlayerId) {
      this.bots.push(new Bot(p2.id, preset));
    }

    this.initAudioTracking();
    this.killFeed = [];
    this.killFeedTimers = [];
    this.lastKillFeedIndex = 0;
    this.comboCounter = 0;
    this.killStreak = 0;
    this.positionHistory = [];
    this.killCamData = null;
    this.killCamTimer = 0;
    this.prevLocalAlive = true;
    this.highlightKills = [];
    this.highlightPhaseTimer = 0;
    this.showingHighlights = false;
    this.screen = "playing";
    this.isOnline = false;
  }

  // ===== Party System =====

  private async createParty(): Promise<void> {
    try {
      const res = await fetch("/api/party/create", { method: "POST" });
      const data = await res.json() as { partyId: string };
      this.connectToParty(data.partyId);
    } catch {
      this.partyStatus = "Fehler beim Erstellen";
    }
  }

  private connectToParty(partyId: string): void {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws/party/${partyId}`);
    this.partyWs = ws;
    this.partyStatus = "Verbinde...";

    ws.onopen = () => {
      const userId = this.currentUser?.id ?? `guest-${crypto.randomUUID().slice(0, 6)}`;
      const displayName = this.playerName;
      const level = this.currentUser?.level ?? 1;
      ws.send(JSON.stringify({ type: "join", userId, displayName, level }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as PartyServerMessage;
      this.handlePartyMessage(msg);
    };

    ws.onclose = () => {
      if (this.screen === "party-lobby") {
        this.partyStatus = "Verbindung getrennt";
        this.partyWs = null;
        this.partyState = null;
        this.partyReady = false;
      }
    };

    ws.onerror = () => {
      this.partyStatus = "Verbindungsfehler";
    };
  }

  private handlePartyMessage(msg: PartyServerMessage): void {
    switch (msg.type) {
      case "party-state":
        this.partyState = msg.state;
        this.partyStatus = "";
        if (this.screen !== "party-lobby" && this.screen !== "playing") {
          this.screen = "party-lobby";
        }
        break;
      case "chat":
        this.partyChatMessages.push(msg.message);
        if (this.partyChatMessages.length > 50) this.partyChatMessages.shift();
        break;
      case "game-starting":
        // Join the game room that the party leader created
        this.partyCodeInput = "";
        this.onlineFlow = true;
        this.joinRoom(msg.roomId);
        break;
      case "kicked":
        this.disconnectParty();
        this.partyStatus = t("party.kicked");
        this.screen = "menu";
        break;
      case "error":
        this.partyStatus = msg.message;
        break;
    }
  }

  private disconnectParty(): void {
    if (this.partyWs) {
      this.partyWs.send(JSON.stringify({ type: "leave" }));
      this.partyWs.close();
      this.partyWs = null;
    }
    this.partyState = null;
    this.partyReady = false;
    this.partyChatMessages = [];
    this.partyShowSession = false;
  }

  private sendPartyMessage(msg: Record<string, unknown>): void {
    if (this.partyWs?.readyState === WebSocket.OPEN) {
      this.partyWs.send(JSON.stringify(msg));
    }
  }

  // ===== Online Lobby =====

  private async createAndJoinRoom(): Promise<void> {
    try {
      this.lobbyStatus = t("lobby.creating");
      const res = await fetch("/api/rooms/create", { method: "POST" });
      const data = await res.json() as { roomId: string };
      this.roomCodeInput = data.roomId;
      this.joinRoom(data.roomId);
    } catch {
      this.lobbyStatus = t("lobby.createFailed");
    }
  }

  private joinRoom(roomId: string): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    this.activeRoomCode = roomId.toUpperCase();
    this.lobbyStatus = t("lobby.joining", { id: roomId });
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
        this.lobbyStatus = t("lobby.connected", { id: roomId });
      }
    }, 100);

    setTimeout(() => {
      if (this.connectionCheckInterval) {
        clearInterval(this.connectionCheckInterval);
        this.connectionCheckInterval = null;
      }
      if (!this.connection.connected) {
        this.lobbyStatus = t("lobby.timeout");
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
      const extras = { slowmo: this.slowmoActive, emotes: this.activeEmotes };
      this.renderer.render(this.gameState, this.localPlayerId, dt, this.activeRoomCode, this.copiedFeedbackTimer, extras);
    } else {
      const inputs: Record<string, PlayerInput> = {};
      inputs[this.localPlayerId] = this.input.getInput();
      for (const bot of this.bots) {
        inputs[bot.id] = bot.getInput(this.gameState);
      }

      const wasGameOver = this.gameState.gameOver;
      simulateTick(this.gameState, inputs, dt);

      // Trigger slowmo zoom on game end (visual only — simulation is stopped)
      if (this.gameState.gameOver && !wasGameOver) {
        this.slowmoActive = true;
        this.slowmoTimer = 1.2;
      }

      // Process new kill events from simulation
      this.processLocalKillFeed();

      // Record position history ring buffer (for kill-cam)
      this.recordPositionFrame();

      // Detect local player death → trigger kill-cam
      this.detectLocalPlayerDeath();

      this.processAudioEvents();
      const extras = { slowmo: this.slowmoActive, emotes: this.activeEmotes };
      this.renderer.render(this.gameState, this.localPlayerId, dt, undefined, 0, extras);
    }

    // Kill-cam overlay (during respawn invulnerability)
    if (this.killCamData && this.killCamTimer > 0) {
      this.killCamTimer -= dt;
      this.drawKillCamOverlay();
      if (this.killCamTimer <= 0) {
        this.killCamData = null;
      }
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

    // Draw emote wheel overlay
    if (this.emoteWheelOpen) {
      this.drawEmoteWheel();
    }

    // Emote wheel tutorial banner
    if (this.emoteWheelOpen && this.shouldShowTutorial("emote-wheel")) {
      this.tutorialActive = "emote-wheel";
      const emoteCtx = this.canvas.getContext("2d")!;
      this.drawTutorialBanner(emoteCtx, this.canvas.width, t("tutorial.banner.emoteWheel"));
    }

    // First-gameplay tutorial overlay
    if (!this.firstGameStarted && this.shouldShowTutorial("first-gameplay")) {
      this.firstGameStarted = true;
      this.tutorialActive = "first-gameplay";
    }
    if (this.tutorialActive === "first-gameplay") {
      const fgCtx = this.canvas.getContext("2d")!;
      this.drawTutorialOverlay(fgCtx, this.canvas.width, this.canvas.height, t("tutorial.overlay.firstGameplay"));
    }
  }

  private sendEmote(index: number): void {
    if (this.emoteCooldown > 0) return;
    if (index >= EMOTE_CONFIGS.length) return;

    const emote = EMOTE_CONFIGS[index];
    const playerLevel = this.currentUser?.level ?? 1;
    if (emote.unlockLevel > playerLevel) return;

    this.activeEmotes[this.localPlayerId] = { text: emote.text, timer: 2 };
    this.emoteCooldown = 3;
    this.audio.playShoot(); // Brief UI feedback sound

    // Send to server in online games
    if (this.isOnline) {
      this.connection.send({ type: "emote", text: emote.text });
    }
  }

  private drawEmoteWheel(): void {
    const ctx = this.renderer.getContext();
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = 120;

    // Semi-transparent backdrop
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);

    // Wheel background
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 20, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fill();
    ctx.strokeStyle = COLORS.ui;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Title
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("emotes.title"), cx, cy - radius - 30);

    // Draw emote options in a circle
    const playerLevel = this.currentUser?.level ?? 1;
    const count = Math.min(EMOTE_CONFIGS.length, 8);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const ex = cx + Math.cos(angle) * radius;
      const ey = cy + Math.sin(angle) * radius;
      const locked = EMOTE_CONFIGS[i].unlockLevel > playerLevel;

      // Number label
      ctx.font = "bold 12px monospace";
      ctx.fillStyle = locked ? COLORS.uiDim : "#888888";
      ctx.fillText(`${i + 1}`, ex, ey - 14);

      // Emote text or lock indicator
      ctx.font = "bold 16px monospace";
      if (locked) {
        ctx.fillStyle = COLORS.uiDim;
        ctx.fillText(`Lvl ${EMOTE_CONFIGS[i].unlockLevel}`, ex, ey + 4);
      } else {
        ctx.fillStyle = this.emoteCooldown > 0 ? COLORS.uiDim : "#ffffff";
        ctx.fillText(EMOTE_CONFIGS[i].text, ex, ey + 4);
      }
    }

    if (this.emoteCooldown > 0) {
      ctx.font = "bold 12px monospace";
      ctx.fillStyle = "#ff4444";
      ctx.fillText(t("emotes.cooldown", { t: this.emoteCooldown.toFixed(1) }), cx, cy + radius + 35);
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

      // Combo announcements (rapid multi-kills within 3s)
      if (this.comboCounter === 2) this.showAnnouncement(t("announce.doubleKill"));
      else if (this.comboCounter === 3) this.showAnnouncement(t("announce.tripleKill"));
      else if (this.comboCounter >= 4) this.showAnnouncement(t("announce.multiKill"));
      // Streak milestones (kills without dying)
      if (this.killStreak === 5) this.showAnnouncement(t("announce.unstoppable"));
      else if (this.killStreak === 10) this.showAnnouncement(t("announce.godlike"));

      // Track impressive kills for highlight reel
      this.trackHighlightKill(event);
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
      case "emote":
        this.activeEmotes[msg.playerId] = { text: msg.text, timer: 2 };
        break;
      case "post-game":
        this.postGameData = msg.data;
        // Apply XP locally (online path — data arrives from server)
        if (this.postGameData && this.currentUser) {
          this.currentUser.xp += this.postGameData.xpGained;
          this.currentUser.level = Math.min(MAX_LEVEL, Math.floor(this.currentUser.xp / XP_PER_LEVEL) + 1);
          try { localStorage.setItem("local_xp", String(this.currentUser.xp)); } catch {}
        }
        // Auto-transition to post-game screen if still on playing
        if (this.screen === "playing") {
          this.accumulateSessionStats();
          this.updateChallengeProgress();
          this.checkAchievements();
          const topHighlights = this.highlightKills.sort((a, b) => b.score - a.score).slice(0, 3);
          if (topHighlights.length > 0) {
            this.showingHighlights = true;
            this.highlightPhaseTimer = 0;
            this.highlightKills = topHighlights;
          } else {
            this.showingHighlights = false;
          }
          this.screen = "post-game";
        }
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

      ctx.font = "13px monospace";
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
      case "gravity-well": return `${event.killerName}${arrow}${event.victimName} ${t("killfeed.gravity")}`;
      case "ricochet": return `${event.killerName}${arrow}${event.victimName} ${t("killfeed.ricochet")}`;
      case "homing": return `${event.killerName}${arrow}${event.victimName} ${t("killfeed.homing")}`;
      case "melee": return `${event.killerName}${arrow}${event.victimName} ${t("killfeed.melee")}`;
      case "emp": return `${event.killerName}${arrow}${event.victimName} ${t("killfeed.emp")}`;
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
      ctx.font = "13px monospace";
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
      ctx.font = "13px monospace";
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
    ctx.fillText(t("invite.banner", { name: invite.fromName }), w / 2, 35);
  }

  // ===== New Screen Drawings =====

  private drawMenuOverlay(_mx: number, _my: number): void {
    // Clear click regions at start of each frame to prevent unbounded growth
    this.menuClickRegions = [];
    const ctx = this.canvas.getContext("2d")!;
    const w = ctx.canvas.width;

    // User info top-right
    if (this.currentUser) {
      ctx.font = "13px monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = "#aaaaaa";
      ctx.fillText(`${this.currentUser.displayName} (Lvl ${this.currentUser.level})`, w - 20, 20);
    }

    // Keyboard shortcut hints at bottom
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(t("menu.shortcuts"), w / 2, ctx.canvas.height - 15);

    // Language toggle (bottom-right)
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "right";
    const langX = w - 20;
    const langY = ctx.canvas.height - 15;
    const currentLang = getLang();
    // Highlight current language
    const deColor = currentLang === "de" ? "#ffaa00" : COLORS.uiDim;
    const enColor = currentLang === "en" ? "#ffaa00" : COLORS.uiDim;
    ctx.fillStyle = deColor;
    ctx.fillText("DE", langX - 30, langY);
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("|", langX - 18, langY);
    ctx.fillStyle = enColor;
    ctx.fillText("EN", langX, langY);
    this.menuClickRegions.push({ x: langX - 45, y: langY - 12, width: 50, height: 18, id: "btn-lang-toggle" });

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
    this.menuClickRegions = [];
    const mx = this.input.getMouseX();
    const my = this.input.getMouseY();

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // Show highlight reel phase before scoreboard
    if (this.showingHighlights) {
      this.highlightPhaseTimer += 1 / 60; // approximate dt
      this.drawHighlightReel(ctx, w, h);
      // Auto-advance after 2s per highlight + 1s intro
      const totalDuration = 1 + this.highlightKills.length * 2;
      if (this.highlightPhaseTimer >= totalDuration) {
        this.showingHighlights = false;
      }
      return;
    }

    // Show session leaderboard or match result
    if (this.showSessionStats && this.sessionGamesPlayed > 1) {
      this.drawSessionLeaderboard(ctx, w, h, mx, my);
      return;
    }

    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffaa00";
    ctx.fillText(t("postgame.title"), w / 2, 60);

    if (!this.postGameData) {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(t("postgame.loading"), w / 2, 150);
      return;
    }

    const result = this.postGameData.matchResult;

    // Winner
    if (result.winnerId) {
      const winner = result.players.find((p) => p.id === result.winnerId);
      if (winner) {
        ctx.font = "bold 24px monospace";
        ctx.fillStyle = "#44ff88";
        ctx.fillText(t("postgame.winner", { name: winner.name }), w / 2, 100);
      }
    }

    // Scoreboard
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = COLORS.ui;
    const headers = [t("postgame.headers.rank"), t("postgame.headers.name"), t("postgame.headers.class"), t("postgame.headers.kills"), t("postgame.headers.deaths"), t("postgame.headers.damage"), t("postgame.headers.accuracy")];
    const colX = [w / 2 - 340, w / 2 - 300, w / 2 - 160, w / 2 - 40, w / 2 + 40, w / 2 + 130, w / 2 + 260];
    ctx.textAlign = "left";
    headers.forEach((hdr, i) => ctx.fillText(hdr, colX[i], 140));

    result.players.forEach((p, i) => {
      const y = 170 + i * 28;
      const isLocal = p.id === this.localPlayerId;
      ctx.font = "13px monospace";
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

    // Session tab hint (if there are session stats from previous games)
    if (this.sessionGamesPlayed > 1) {
      ctx.font = "13px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(t("postgame.sessionTab") + "  |  " + t("postgame.sessionGames", { n: String(this.sessionGamesPlayed) }), w / 2, xpY + 25);
    }

    // Buttons
    const btnY = this.sessionGamesPlayed > 1 ? xpY + 60 : xpY + 50;
    this.drawMenuButton(ctx, w / 2 - 120, btnY, 180, 40, t("postgame.playAgain"), COLORS.ui, "btn-play-again", mx, my);
    this.drawMenuButton(ctx, w / 2 + 120, btnY, 180, 40, t("postgame.toMenu"), COLORS.uiDim, "btn-to-menu", mx, my);

    // Tutorial banner
    if (this.shouldShowTutorial("scoreboard")) {
      this.tutorialActive = "scoreboard";
      this.drawTutorialBanner(ctx, w, t("tutorial.banner.scoreboard"));
    }
  }

  private drawSessionLeaderboard(ctx: CanvasRenderingContext2D, w: number, h: number, mx: number, my: number): void {
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#aa88ff";
    ctx.fillText(t("postgame.sessionTitle"), w / 2, 60);

    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(t("postgame.sessionGames", { n: String(this.sessionGamesPlayed) }), w / 2, 85);

    // Session scoreboard — sort by kills desc
    const entries = Object.values(this.sessionStats).sort((a, b) => b.kills - a.kills);

    const sHeaders = [
      "#",
      t("postgame.sessionHeaders.name"),
      t("postgame.sessionHeaders.kills"),
      t("postgame.sessionHeaders.deaths"),
      t("postgame.sessionHeaders.wins"),
      t("postgame.sessionHeaders.dmg"),
      t("postgame.sessionHeaders.acc"),
      t("postgame.sessionHeaders.games"),
    ];
    const sColX = [w / 2 - 340, w / 2 - 300, w / 2 - 120, w / 2 - 40, w / 2 + 30, w / 2 + 100, w / 2 + 190, w / 2 + 270];

    ctx.font = "bold 14px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.textAlign = "left";
    sHeaders.forEach((hdr, i) => ctx.fillText(hdr, sColX[i], 120));

    entries.forEach((s, i) => {
      const y = 150 + i * 28;
      const isLocal = s === this.sessionStats[this.localPlayerId];
      ctx.font = "13px monospace";
      ctx.fillStyle = isLocal ? "#ffaa00" : "#cccccc";
      ctx.fillText(`${i + 1}`, sColX[0], y);
      ctx.fillText(s.name, sColX[1], y);
      ctx.fillText(`${s.kills}`, sColX[2], y);
      ctx.fillText(`${s.deaths}`, sColX[3], y);
      ctx.fillText(`${s.wins}`, sColX[4], y);
      ctx.fillText(`${s.damageDealt}`, sColX[5], y);
      const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
      ctx.fillText(`${acc}%`, sColX[6], y);
      ctx.fillText(`${s.gamesPlayed}`, sColX[7], y);
    });

    // Fun awards (after 3+ games)
    if (this.sessionGamesPlayed >= 3 && entries.length > 1) {
      const awardY = 165 + entries.length * 28;
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText("--- AWARDS ---", w / 2, awardY);

      const awards: Array<{ label: string; name: string; color: string }> = [];

      // Kill King — most kills
      const killKing = entries[0];
      awards.push({ label: t("postgame.award.killKing"), name: killKing.name, color: "#ff4444" });

      // Dies the most — most deaths
      const deathKing = [...entries].sort((a, b) => b.deaths - a.deaths)[0];
      if (deathKing !== killKing) {
        awards.push({ label: t("postgame.award.mostDeaths"), name: deathKing.name, color: "#888888" });
      }

      // Sharpshooter — best accuracy (min 10 shots)
      const sniperCandidates = entries.filter((e) => e.shotsFired >= 10);
      if (sniperCandidates.length > 0) {
        const sniper = sniperCandidates.sort((a, b) =>
          (b.shotsHit / b.shotsFired) - (a.shotsHit / a.shotsFired))[0];
        awards.push({ label: t("postgame.award.sniper"), name: sniper.name, color: "#44aaff" });
      }

      // Serial Winner — most wins
      const winnerSorted = [...entries].sort((a, b) => b.wins - a.wins);
      if (winnerSorted[0].wins > 0) {
        awards.push({ label: t("postgame.award.winner"), name: winnerSorted[0].name, color: "#44ff88" });
      }

      ctx.font = "14px monospace";
      awards.forEach((a, i) => {
        const ay = awardY + 25 + i * 24;
        ctx.fillStyle = a.color;
        ctx.fillText(`${a.label}: ${a.name}`, w / 2, ay);
      });
    }

    // Tab hint
    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.textAlign = "center";
    ctx.fillText(t("postgame.matchTab"), w / 2, h - 80);

    // Buttons
    this.drawMenuButton(ctx, w / 2 - 120, h - 55, 180, 40, t("postgame.playAgain"), COLORS.ui, "btn-play-again", mx, my);
    this.drawMenuButton(ctx, w / 2 + 120, h - 55, 180, 40, t("postgame.toMenu"), COLORS.uiDim, "btn-to-menu", mx, my);
  }

  private drawFriends(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.menuClickRegions = [];
    const mx = this.input.getMouseX();
    const my = this.input.getMouseY();

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    const online = this.friends.filter((f) => f.presence !== "offline").length;
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("friends.title", { online, total: this.friends.length }), w / 2, 60);

    if (this.friends.length === 0) {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(t("friends.empty"), w / 2, 150);
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
      ctx.fillStyle = friend.presence === "offline" ? COLORS.uiDim
        : friend.presence === "online-ingame" ? "#ff6600" : "#44ff88";
      ctx.beginPath();
      ctx.arc(w / 2 - 280, y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "14px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = isSelected ? COLORS.ui : "#cccccc";
      ctx.fillText(friend.username, w / 2 - 260, y + 4);

      ctx.fillStyle = COLORS.uiDim;
      ctx.font = "13px monospace";
      ctx.fillText(`Lvl ${friend.level}`, w / 2 - 100, y + 4);

      const statusText = friend.presence === "offline" ? t("friends.offline")
        : friend.presence === "online-ingame" ? t("friends.inGame") : t("friends.online");
      ctx.fillText(statusText, w / 2 + 50, y + 4);

      if (friend.presence === "online-ingame" && friend.roomId) {
        ctx.fillStyle = "#44ff88";
        ctx.fillText(t("friends.join"), w / 2 + 200, y + 4);
        this.menuClickRegions.push({ x: w / 2 + 150, y: y - 10, width: 120, height: 20, id: `btn-join-friend-${i}` });
      }
    }

    // Friend requests
    if (this.friendsRequestsMode && this.friendRequests.incoming.length > 0) {
      const reqY = 120 + this.friends.length * 35;
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(t("friends.requests", { n: this.friendRequests.incoming.length }), w / 2, reqY);

      for (let i = 0; i < this.friendRequests.incoming.length; i++) {
        const req = this.friendRequests.incoming[i];
        ctx.font = "14px monospace";
        ctx.fillStyle = "#cccccc";
        ctx.fillText(t("friends.requestText", { name: req.fromUsername }), w / 2, reqY + 25 + i * 25);
      }
    }

    // Bottom buttons
    this.drawMenuButton(ctx, w / 2 - 170, h - 35, 140, 34, t("friends.searchBtn"), COLORS.ui, "btn-friends-search", mx, my);
    this.drawMenuButton(ctx, w / 2, h - 35, 140, 34, t("friends.requestsBtn"), COLORS.nova, "btn-friends-requests", mx, my);
    this.drawMenuButton(ctx, w / 2 + 170, h - 35, 140, 34, t("friends.back"), COLORS.uiDim, "btn-friends-back", mx, my);

    // Search mode overlay
    if (this.friendsSearchMode) {
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(w / 2 - 200, h / 2 - 50, 400, 100);
      ctx.strokeStyle = COLORS.ui;
      ctx.strokeRect(w / 2 - 200, h / 2 - 50, 400, 100);
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(t("friends.searchPrompt"), w / 2, h / 2 - 20);
      const cursor = Math.sin(performance.now() / 300) > 0 ? "_" : "";
      ctx.fillText((this.textInputFields["search"] || "") + cursor, w / 2, h / 2 + 10);

      if (this.textInputMessage) {
        ctx.fillStyle = "#44ff88";
        ctx.fillText(this.textInputMessage, w / 2, h / 2 + 35);
      }
    }

    // Tutorial banner
    if (this.shouldShowTutorial("friends")) {
      this.tutorialActive = "friends";
      this.drawTutorialBanner(ctx, w, t("tutorial.banner.friends"));
    }
  }

  private drawLogin(): void {
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
    ctx.fillText(t("login.title"), w / 2, 80);

    // Email field
    this.drawInputField(ctx, w / 2, 160, t("login.email"), "email", false);
    // Password field
    this.drawInputField(ctx, w / 2, 230, t("login.password"), "password", true);

    // Error
    if (this.textInputError) {
      ctx.font = "14px monospace";
      ctx.fillStyle = "#ff4444";
      ctx.fillText(this.textInputError, w / 2, 290);
    }

    // Buttons
    this.drawMenuButton(ctx, w / 2 - 160, 340, 160, 38, t("login.submit"), COLORS.ui, "btn-do-login", mx, my);
    this.drawMenuButton(ctx, w / 2, 340, 160, 38, t("login.register"), COLORS.nova, "btn-to-register", mx, my);
    this.drawMenuButton(ctx, w / 2 + 160, 340, 130, 38, t("login.back"), COLORS.uiDim, "btn-login-back", mx, my);
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(t("login.hint"), w / 2, 380);
  }

  private drawRegister(): void {
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
    ctx.fillText(t("register.title"), w / 2, 80);

    this.drawInputField(ctx, w / 2, 140, t("login.email"), "email", false);
    this.drawInputField(ctx, w / 2, 210, t("register.username"), "username", false);
    this.drawInputField(ctx, w / 2, 280, t("register.passwordHint"), "password", true);
    this.drawInputField(ctx, w / 2, 350, t("register.passwordRepeat"), "password2", true);

    if (this.textInputError) {
      ctx.font = "14px monospace";
      ctx.fillStyle = "#ff4444";
      ctx.fillText(this.textInputError, w / 2, 410);
    }

    this.drawMenuButton(ctx, w / 2 - 90, 460, 180, 38, t("register.submit"), COLORS.ui, "btn-do-register", mx, my);
    this.drawMenuButton(ctx, w / 2 + 90, 460, 130, 38, t("register.back"), COLORS.uiDim, "btn-register-back", mx, my);

    if (this.api.isGuest) {
      ctx.font = "13px monospace";
      ctx.fillStyle = "#44ff88";
      ctx.fillText(t("register.guestMigration"), w / 2, 500);
    }
  }

  private drawProfile(): void {
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
    ctx.fillText(t("profile.title"), w / 2, 80);

    if (this.currentUser) {
      ctx.font = "bold 24px monospace";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(this.currentUser.displayName, w / 2, 140);

      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(t("profile.level", { n: this.currentUser.level }), w / 2, 175);

      // XP progress bar
      const xpInLevel = this.currentUser.xp % XP_PER_LEVEL;
      const xpProgress = this.currentUser.level >= MAX_LEVEL ? 1 : xpInLevel / XP_PER_LEVEL;
      const barW = 300;
      const barH = 14;
      const barX = w / 2 - barW / 2;
      const barY = 188;
      ctx.fillStyle = "#111133";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#ffaa00";
      ctx.fillRect(barX, barY, barW * xpProgress, barH);
      ctx.strokeStyle = "#ffaa0044";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.font = "13px monospace";
      ctx.fillStyle = COLORS.uiDim;
      if (this.currentUser.level >= MAX_LEVEL) {
        ctx.fillText(`${this.currentUser.xp} XP (Max)`, w / 2, barY + barH + 16);
      } else {
        ctx.fillText(`${xpInLevel} / ${XP_PER_LEVEL} XP`, w / 2, barY + barH + 16);
      }

      ctx.font = "16px monospace";
      ctx.fillText(this.currentUser.type === "account" ? t("profile.typeAccount") : t("profile.typeGuest"), w / 2, 236);
    } else {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(t("profile.notLoggedIn"), w / 2, 150);
    }

    // Challenge/Cosmetic counters
    const completedDaily = this.dailyChallenges.filter((c) => c.completed).length;
    const completedWeekly = this.weeklyChallenges.filter((c) => c.completed).length;
    ctx.font = "14px monospace";
    ctx.fillStyle = "#ffaa00";
    ctx.fillText(t("profile.challenges", { done: completedDaily, total: this.dailyChallenges.length, wDone: completedWeekly, wTotal: this.weeklyChallenges.length }), w / 2, 290);

    ctx.fillStyle = "#ff44aa";
    ctx.fillText(t("profile.achievements", { done: this.unlockedAchievements.length, total: ACHIEVEMENT_CONFIGS.length }), w / 2, 320);

    if (this.api.isGuest) {
      ctx.font = "14px monospace";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(t("profile.guestHint"), w / 2, 360);
    }

    // Navigation buttons
    let btnX = w / 2 - 200;
    this.drawMenuButton(ctx, btnX, 410, 190, 38, t("profile.challengesBtn"), COLORS.ui, "btn-challenges", mx, my);
    btnX += 200;
    this.drawMenuButton(ctx, btnX, 410, 130, 38, t("profile.cosmeticsBtn"), COLORS.nova, "btn-cosmetics", mx, my);
    btnX += 165;
    this.drawMenuButton(ctx, btnX, 410, 120, 38, t("profile.backBtn"), COLORS.uiDim, "btn-profile-back", mx, my);
    if (this.api.isAccount) {
      this.drawMenuButton(ctx, w / 2, 460, 140, 36, t("profile.logout"), COLORS.gravityWell, "btn-logout", mx, my);
    }

    // Tutorial banner
    if (this.shouldShowTutorial("profile")) {
      this.tutorialActive = "profile";
      this.drawTutorialBanner(ctx, w, t("tutorial.banner.profile"));
    }
  }

  private drawMatchmaking(): void {
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

    const dots = ".".repeat(Math.floor(this.matchmakingTimer * 2) % 4);
    ctx.fillText(t("matchmaking.title") + dots, w / 2, h / 2 - 40);

    ctx.font = "18px monospace";
    ctx.fillStyle = "#ffaa00";
    ctx.fillText(t("matchmaking.queue", { n: this.matchmakingPlayersInQueue }), w / 2, h / 2 + 10);

    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    const remaining = Math.max(0, 30 - Math.floor(this.matchmakingTimer));
    ctx.fillText(t("matchmaking.botFallback", { s: remaining }), w / 2, h / 2 + 50);

    this.drawMenuButton(ctx, w / 2, h / 2 + 90, 160, 34, t("matchmaking.cancel"), COLORS.gravityWell, "btn-matchmaking-cancel", mx, my);
  }

  private drawPartyLobby(): void {
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
    ctx.fillStyle = "#aa88ff";
    ctx.fillText(t("party.title"), w / 2, 50);

    // Not connected yet — show code entry
    if (!this.partyState) {
      ctx.font = "18px monospace";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(t("party.enterCode"), w / 2, h / 2 - 50);

      // Code input box
      const cursor = Math.sin(performance.now() / 300) > 0 ? "_" : "";
      ctx.strokeStyle = COLORS.ui;
      ctx.lineWidth = 2;
      ctx.strokeRect(w / 2 - 100, h / 2 - 30, 200, 40);
      ctx.font = "bold 20px monospace";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(this.partyCodeInput + cursor, w / 2, h / 2);

      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText("ENTER = Beitreten  |  N = Neue Party  |  ESC = Zurueck", w / 2, h / 2 + 40);

      if (this.partyStatus) {
        ctx.fillStyle = "#ff4444";
        ctx.fillText(this.partyStatus, w / 2, h / 2 + 70);
      }
      return;
    }

    // Connected — show party info
    const party = this.partyState;

    // Party code
    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(t("party.code", { code: party.partyId.toUpperCase() }), w / 2, 75);

    // Session stats view
    if (this.partyShowSession && party.gamesPlayed > 0) {
      this.drawPartySessionStats(ctx, w, h, party);
      ctx.font = "13px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText("[S] Zurueck zur Lobby", w / 2, h - 50);
      this.drawMenuButton(ctx, w / 2, h - 30, 160, 30, t("party.back"), COLORS.uiDim, "btn-party-leave", mx, my);
      return;
    }

    // Members list
    const myId = this.currentUser?.id ?? "";
    const isLeader = myId === party.leaderId;

    ctx.font = "bold 16px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.textAlign = "center";
    ctx.fillText(t("party.members", { n: String(party.members.length) }), w / 2, 110);

    for (let i = 0; i < party.members.length; i++) {
      const m = party.members[i];
      const y = 140 + i * 32;

      // Background highlight
      if (m.id === myId) {
        ctx.fillStyle = "rgba(100,100,255,0.1)";
        ctx.fillRect(w / 2 - 250, y - 12, 500, 28);
      }

      ctx.font = "14px monospace";
      ctx.textAlign = "left";

      // Leader crown
      if (m.isLeader) {
        ctx.fillStyle = "#ffaa00";
        ctx.fillText("[L]", w / 2 - 240, y + 4);
      }

      // Name
      ctx.fillStyle = m.id === myId ? "#ffaa00" : "#cccccc";
      ctx.fillText(m.displayName, w / 2 - 200, y + 4);

      // Level
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(`Lvl ${m.level}`, w / 2 + 50, y + 4);

      // Ready status
      ctx.fillStyle = m.ready ? "#44ff88" : "#ff4444";
      ctx.fillText(m.ready ? t("party.ready") : t("party.notReady"), w / 2 + 130, y + 4);
    }

    // Settings (leader can change)
    const settY = 160 + party.members.length * 32;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("party.settings"), w / 2, settY);

    const modeIdx = MODE_OPTIONS.indexOf(party.selectedMode);
    const mapIdx = MAP_OPTIONS.indexOf(party.selectedMap);
    ctx.font = "14px monospace";
    ctx.fillStyle = isLeader ? "#ffaa00" : COLORS.uiDim;
    ctx.fillText(`${isLeader ? "Q/E " : ""}Modus: ${MODE_OPTIONS[modeIdx]}`, w / 2, settY + 22);
    ctx.fillText(`${isLeader ? "W/Down " : ""}Karte: ${MAP_OPTIONS[mapIdx]}`, w / 2, settY + 42);

    // Chat messages (last 5)
    const chatY = settY + 70;
    ctx.font = "13px monospace";
    const visibleChat = this.partyChatMessages.slice(-5);
    for (let i = 0; i < visibleChat.length; i++) {
      const msg = visibleChat[i];
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(`${msg.senderName}: ${msg.text}`, w / 2, chatY + i * 18);
    }

    // Chat input
    if (this.partyChatOpen) {
      const inputY = h - 80;
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(w / 2 - 200, inputY - 15, 400, 30);
      ctx.strokeStyle = COLORS.ui;
      ctx.strokeRect(w / 2 - 200, inputY - 15, 400, 30);
      const cursor = Math.sin(performance.now() / 300) > 0 ? "_" : "";
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(this.partyChatInput + cursor, w / 2, inputY + 4);
    }

    // Bottom hints
    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    const hints: string[] = [t("party.toggleReady"), t("party.chat")];
    if (isLeader) hints.push(t("party.start"));
    if (party.gamesPlayed > 0) hints.push(t("party.session"));
    ctx.fillText(hints.join("  |  "), w / 2, h - 50);

    this.drawMenuButton(ctx, w / 2, h - 25, 160, 30, t("party.back"), COLORS.uiDim, "btn-party-leave", mx, my);

    // Tutorial banner
    if (this.shouldShowTutorial("party-lobby")) {
      this.tutorialActive = "party-lobby";
      this.drawTutorialBanner(ctx, w, t("tutorial.banner.partyLobby"));
    }
  }

  private drawPartySessionStats(ctx: CanvasRenderingContext2D, w: number, _h: number, party: PartyStateSnapshot): void {
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#aa88ff";
    ctx.fillText(t("postgame.sessionTitle"), w / 2, 110);
    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(t("postgame.sessionGames", { n: String(party.gamesPlayed) }), w / 2, 132);

    const entries = Object.values(party.sessionStats).sort((a, b) => b.kills - a.kills);
    const sColX = [w / 2 - 300, w / 2 - 260, w / 2 - 80, w / 2, w / 2 + 60, w / 2 + 130, w / 2 + 220];
    const sHeaders = ["#", "Name", "Kills", "Tode", "Siege", "Schaden", "Gen."];

    ctx.font = "bold 13px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.textAlign = "left";
    sHeaders.forEach((hdr, i) => ctx.fillText(hdr, sColX[i], 160));

    entries.forEach((s, i) => {
      const y = 185 + i * 26;
      ctx.font = "13px monospace";
      ctx.fillStyle = "#cccccc";
      ctx.fillText(`${i + 1}`, sColX[0], y);
      ctx.fillText(s.name, sColX[1], y);
      ctx.fillText(`${s.kills}`, sColX[2], y);
      ctx.fillText(`${s.deaths}`, sColX[3], y);
      ctx.fillText(`${s.wins}`, sColX[4], y);
      ctx.fillText(`${s.damageDealt}`, sColX[5], y);
      const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
      ctx.fillText(`${acc}%`, sColX[6], y);
    });
  }

  private drawTournamentBracket(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.menuClickRegions = [];
    const mx = this.input.getMouseX();
    const my = this.input.getMouseY();

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#aa88ff";
    ctx.fillText(t("tournament.bracket"), w / 2, 50);

    // Champion display
    if (this.tournamentChampion) {
      ctx.font = "bold 28px monospace";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(t("tournament.champion"), w / 2, 90);
      ctx.font = "bold 24px monospace";
      ctx.fillStyle = "#44ff88";
      ctx.fillText(this.tournamentChampion, w / 2, 120);

      this.drawMenuButton(ctx, w / 2, h - 50, 200, 40, t("tournament.back"), COLORS.uiDim, "btn-tournament-back", mx, my);
      return;
    }

    // Draw bracket - group by rounds
    const rounds = new Map<number, typeof this.tournamentBracket>();
    for (const match of this.tournamentBracket) {
      if (!rounds.has(match.round)) rounds.set(match.round, []);
      rounds.get(match.round)!.push(match);
    }

    const totalRounds = rounds.size;
    const bracketWidth = Math.min(w - 80, totalRounds * 250);
    const startX = (w - bracketWidth) / 2;

    let roundIdx = 0;
    for (const [round, matches] of rounds) {
      const rx = startX + roundIdx * (bracketWidth / totalRounds);
      const colWidth = bracketWidth / totalRounds;

      // Round label
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.uiDim;
      const roundLabel = totalRounds > 1 && round === totalRounds
        ? t("tournament.final")
        : t("tournament.round", { n: String(round) });
      ctx.fillText(roundLabel, rx + colWidth / 2, 85);

      // Matches in this round
      const matchHeight = 65;
      const totalHeight = matches.length * matchHeight;
      const matchStartY = 100 + (h - 200 - totalHeight) / 2;

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const my2 = matchStartY + i * matchHeight;

        // Match box
        const bx = rx + 10;
        const bw = colWidth - 20;
        const isNext = match.winner === null && match.player2 !== null;

        ctx.strokeStyle = isNext ? "#ffaa00" : (match.winner ? "#44ff88" : COLORS.uiDim);
        ctx.lineWidth = isNext ? 2 : 1;
        ctx.strokeRect(bx, my2, bw, 55);

        if (isNext) {
          ctx.fillStyle = "rgba(255,170,0,0.05)";
          ctx.fillRect(bx, my2, bw, 55);
        }

        // Player 1
        ctx.font = "13px monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = match.winner === match.player1 ? "#44ff88" : "#cccccc";
        ctx.fillText(match.player1, bx + 10, my2 + 20);

        // VS
        ctx.font = "13px monospace";
        ctx.fillStyle = COLORS.uiDim;
        ctx.textAlign = "center";
        ctx.fillText("vs", bx + bw / 2, my2 + 30);

        // Player 2
        ctx.font = "13px monospace";
        ctx.textAlign = "left";
        if (match.player2) {
          ctx.fillStyle = match.winner === match.player2 ? "#44ff88" : "#cccccc";
          ctx.fillText(match.player2, bx + 10, my2 + 45);
        } else {
          ctx.fillStyle = COLORS.uiDim;
          ctx.fillText(t("tournament.bye"), bx + 10, my2 + 45);
        }

        // Winner indicator
        if (match.winner) {
          ctx.font = "bold 12px monospace";
          ctx.textAlign = "right";
          ctx.fillStyle = "#44ff88";
          ctx.fillText("WIN", bx + bw - 8, my2 + 32);
        }
      }

      roundIdx++;
    }

    // Next match button
    const nextIdx = this.tournamentBracket.findIndex((m) => m.winner === null && m.player2 !== null);
    if (nextIdx >= 0) {
      const nextMatch = this.tournamentBracket[nextIdx];
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(t("tournament.nextMatch", { p1: nextMatch.player1, p2: nextMatch.player2! }), w / 2, h - 90);

      this.drawMenuButton(ctx, w / 2 - 120, h - 55, 200, 40, "Match starten", COLORS.ui, "btn-tournament-next", mx, my);
    }

    this.drawMenuButton(ctx, w / 2 + 120, h - 55, 160, 40, t("tournament.back"), COLORS.uiDim, "btn-tournament-back", mx, my);
  }

  private drawTutorialBanner(ctx: CanvasRenderingContext2D, w: number, text: string): void {
    const bannerH = 44;
    ctx.fillStyle = "rgba(10, 14, 39, 0.92)";
    ctx.fillRect(0, 0, w, bannerH);
    ctx.strokeStyle = COLORS.uiDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, bannerH);
    ctx.lineTo(w, bannerH);
    ctx.stroke();
    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, 18);
    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(`${t("tutorial.ok")}    ${t("tutorial.dismiss")}`, w / 2, 36);
  }

  private drawTutorialOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
    ctx.fillStyle = "rgba(10, 14, 39, 0.85)";
    ctx.fillRect(0, 0, w, h);
    ctx.font = "bold 24px monospace";
    ctx.fillStyle = "#ffaa00";
    ctx.textAlign = "center";
    ctx.fillText("TUTORIAL", w / 2, h / 2 - 40);
    ctx.font = "16px monospace";
    ctx.fillStyle = COLORS.ui;
    const words = text.split(" ");
    const maxWidth = w - 100;
    let line = "";
    let y = h / 2;
    for (const word of words) {
      const testLine = line + (line ? " " : "") + word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, w / 2, y);
        line = word;
        y += 24;
      } else {
        line = testLine;
      }
    }
    if (line) ctx.fillText(line, w / 2, y);
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(`${t("tutorial.ok")}    ${t("tutorial.dismiss")}`, w / 2, h / 2 + 80);
  }

  private drawInputField(
    ctx: CanvasRenderingContext2D, cx: number, y: number,
    label: string, fieldName: string, isPassword: boolean,
  ): void {
    const isActive = this.textInputActive === fieldName;
    const value = this.textInputFields[fieldName] || "";
    const displayValue = isPassword ? "*".repeat(value.length) : value;

    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(label, cx, y - 20);

    ctx.strokeStyle = isActive ? COLORS.ui : COLORS.uiDim;
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.strokeRect(cx - 150, y - 15, 300, 30);

    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.textAlign = "left";
    const textX = cx - 140;
    ctx.fillText(displayValue, textX, y + 5);
    if (isActive) {
      const textW = ctx.measureText(displayValue).width;
      ctx.fillStyle = Math.sin(performance.now() / 500) > 0 ? COLORS.ui : "transparent";
      ctx.fillText("|", textX + textW + 1, y + 5);
    }
    ctx.textAlign = "center";

    // Register click region so handleMenuClick can activate this field
    this.menuClickRegions.push({ x: cx - 150, y: y - 15, width: 300, height: 30, id: `field-${fieldName}` });
  }

  // ===== Challenges & Cosmetics Screens =====

  private drawChallenges(): void {
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
    ctx.fillText(t("challenges.title"), w / 2, 60);

    // Daily Challenges
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = "#ffaa00";
    ctx.fillText(t("challenges.daily"), w / 2, 110);

    for (let i = 0; i < this.dailyChallenges.length; i++) {
      const c = this.dailyChallenges[i];
      const config = DAILY_CHALLENGE_POOL.find((d) => d.id === c.challengeId);
      if (!config) continue;
      const y = 140 + i * 55;

      // Background
      ctx.fillStyle = c.completed ? "#112211" : "#111122";
      ctx.fillRect(w / 2 - 300, y, 600, 45);
      ctx.strokeStyle = c.completed ? "#44ff88" : "#333355";
      ctx.lineWidth = 1;
      ctx.strokeRect(w / 2 - 300, y, 600, 45);

      // Name + description
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = c.completed ? "#44ff88" : COLORS.ui;
      ctx.fillText(config.name, w / 2 - 285, y + 18);
      ctx.font = "13px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(config.description, w / 2 - 285, y + 35);

      // Progress bar
      const barX = w / 2 + 100;
      const barW = 140;
      const barH = 10;
      const barY = y + 15;
      const progress = Math.min(1, c.progress / c.target);
      ctx.fillStyle = "#111133";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = c.completed ? "#44ff88" : "#ffaa00";
      ctx.fillRect(barX, barY, barW * progress, barH);

      // Progress text
      ctx.font = "13px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(`${c.progress}/${c.target}`, barX + barW / 2, barY + barH + 14);

      // XP reward
      ctx.textAlign = "right";
      ctx.fillStyle = c.completed ? "#44ff88" : "#ffaa00";
      ctx.fillText(`+${config.xpReward} XP`, w / 2 + 290, y + 20);
    }

    // Weekly Challenges
    const weeklyY = 160 + this.dailyChallenges.length * 55;
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#4488ff";
    ctx.fillText(t("challenges.weekly"), w / 2, weeklyY);

    for (let i = 0; i < this.weeklyChallenges.length; i++) {
      const c = this.weeklyChallenges[i];
      const config = WEEKLY_CHALLENGE_POOL.find((d) => d.id === c.challengeId);
      if (!config) continue;
      const y = weeklyY + 25 + i * 55;

      ctx.fillStyle = c.completed ? "#112211" : "#111122";
      ctx.fillRect(w / 2 - 300, y, 600, 45);
      ctx.strokeStyle = c.completed ? "#44ff88" : "#333355";
      ctx.lineWidth = 1;
      ctx.strokeRect(w / 2 - 300, y, 600, 45);

      ctx.font = "bold 13px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = c.completed ? "#44ff88" : COLORS.ui;
      ctx.fillText(config.name, w / 2 - 285, y + 18);
      ctx.font = "13px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(config.description, w / 2 - 285, y + 35);

      const barX = w / 2 + 100;
      const barW = 140;
      const barH = 10;
      const barY = y + 15;
      const progress = Math.min(1, c.progress / c.target);
      ctx.fillStyle = "#111133";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = c.completed ? "#44ff88" : "#4488ff";
      ctx.fillRect(barX, barY, barW * progress, barH);

      ctx.font = "13px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(`${c.progress}/${c.target}`, barX + barW / 2, barY + barH + 14);

      ctx.textAlign = "right";
      ctx.fillStyle = c.completed ? "#44ff88" : "#4488ff";
      ctx.fillText(`+${config.xpReward} XP`, w / 2 + 290, y + 20);
    }

    // Empty state
    if (this.dailyChallenges.length === 0 && this.weeklyChallenges.length === 0) {
      ctx.font = "16px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(t("challenges.empty"), w / 2, 200);
    }

    // Achievements section — ensure no overlap with empty-state text at y=200
    const achY = Math.max(250, weeklyY + 50 + this.weeklyChallenges.length * 55);
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff44aa";
    ctx.fillText(t("challenges.achievements"), w / 2, achY);

    for (let i = 0; i < ACHIEVEMENT_CONFIGS.length; i++) {
      const ach = ACHIEVEMENT_CONFIGS[i];
      const unlocked = this.unlockedAchievements.includes(ach.id);
      const y = achY + 25 + i * 40;
      if (y > h - 60) break; // Don't draw off-screen

      ctx.fillStyle = unlocked ? "#221122" : "#111122";
      ctx.fillRect(w / 2 - 300, y, 600, 34);
      ctx.strokeStyle = unlocked ? "#ff44aa" : "#333355";
      ctx.lineWidth = 1;
      ctx.strokeRect(w / 2 - 300, y, 600, 34);

      ctx.font = "bold 12px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = unlocked ? "#ff44aa" : COLORS.uiDim;
      ctx.fillText(`${unlocked ? "[x]" : "[ ]"} ${ach.name}`, w / 2 - 285, y + 15);

      ctx.font = "13px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(ach.description, w / 2 - 285, y + 28);

      ctx.textAlign = "right";
      ctx.fillStyle = unlocked ? "#ff44aa" : COLORS.uiDim;
      ctx.fillText(ach.reward, w / 2 + 290, y + 20);
    }

    // Navigation button
    this.drawMenuButton(ctx, w / 2, h - 35, 200, 34, t("challenges.back"), COLORS.uiDim, "btn-challenges-back", mx, my);

    // Tutorial banner
    if (this.shouldShowTutorial("challenges")) {
      this.tutorialActive = "challenges";
      this.drawTutorialBanner(ctx, w, t("tutorial.banner.challenges"));
    }
  }

  private drawCosmetics(): void {
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
    ctx.fillText(t("cosmetics.title"), w / 2, 60);

    // Category tabs as clickable buttons
    const categories = [t("cosmetics.skins"), t("cosmetics.trails"), t("cosmetics.effects"), t("cosmetics.titles")];
    const catColors = ["#ff6644", "#44aaff", "#ff44aa", "#ffaa00"];
    for (let i = 0; i < categories.length; i++) {
      const tx = w / 2 - 225 + i * 150;
      const isActive = i === this.cosmeticCategory;
      const tabColor = isActive ? catColors[i] : COLORS.uiDim;
      this.drawMenuButton(ctx, tx, 100, 120, 30, categories[i], tabColor, `btn-cosmetics-tab-${i}`, mx, my);

      if (isActive) {
        ctx.fillStyle = catColors[i];
        ctx.fillRect(tx - 50, 118, 100, 2);
      }
    }

    const level = this.currentUser?.level ?? 1;
    let items: { id: string; name: string; detail: string; unlockLevel: number; color: string }[] = [];

    if (this.cosmeticCategory === 0) {
      // Skins
      items = SKIN_CONFIGS.map((s) => ({
        id: s.id,
        name: s.name,
        detail: `${SHIP_CONFIGS[s.shipClass].name} | Farbe`,
        unlockLevel: s.unlockLevel,
        color: s.color,
      }));
    } else if (this.cosmeticCategory === 1) {
      // Trails
      items = TRAIL_CONFIGS.map((t) => ({
        id: t.id,
        name: t.name,
        detail: `${t.particleCount} Partikel | ${t.lifetime}ms`,
        unlockLevel: t.unlockLevel,
        color: t.color,
      }));
    } else if (this.cosmeticCategory === 2) {
      // Kill effects
      items = KILL_EFFECT_CONFIGS.map((e) => ({
        id: e.id,
        name: e.name,
        detail: `${e.colors.length} Farben`,
        unlockLevel: e.unlockLevel,
        color: e.colors[0],
      }));
    } else {
      // Titles
      items = TITLE_CONFIGS.map((t) => ({
        id: t.id,
        name: t.name,
        detail: "",
        unlockLevel: t.unlockLevel,
        color: "#ffaa00",
      }));
    }

    // Draw items grid
    const cols = 3;
    const itemW = 190;
    const itemH = 60;
    const startX = w / 2 - (cols * itemW) / 2;
    const startY = 130;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (itemW + 10);
      const y = startY + row * (itemH + 10);
      if (y > h - 80) break;

      const unlocked = item.unlockLevel === 0
        ? ACHIEVEMENT_CONFIGS.some((a) => a.rewardId === item.id && this.unlockedAchievements.includes(a.id))
        : level >= item.unlockLevel;

      // Card
      ctx.fillStyle = unlocked ? "#111133" : "#0a0a1a";
      ctx.fillRect(x, y, itemW, itemH);
      ctx.strokeStyle = unlocked ? item.color : "#222233";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, itemW, itemH);

      // Color swatch
      ctx.fillStyle = unlocked ? item.color : COLORS.uiDim;
      ctx.fillRect(x + 8, y + 8, 12, 12);

      // Name
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = unlocked ? COLORS.ui : COLORS.uiDim;
      ctx.fillText(item.name, x + 28, y + 18);

      // Detail
      if (item.detail) {
        ctx.font = "13px monospace";
        ctx.fillStyle = COLORS.uiDim;
        ctx.fillText(item.detail, x + 28, y + 34);
      }

      // Lock / Level info
      if (!unlocked) {
        ctx.font = "13px monospace";
        ctx.fillStyle = "#ff4444";
        ctx.fillText(item.unlockLevel > 0 ? `Lvl ${item.unlockLevel}` : t("cosmetics.achievement"), x + 28, y + 50);
      } else {
        ctx.font = "13px monospace";
        ctx.fillStyle = "#44ff88";
        ctx.fillText(t("cosmetics.unlocked"), x + 28, y + 50);
      }
    }

    // Navigation button
    this.drawMenuButton(ctx, w / 2, h - 35, 140, 34, t("cosmetics.back"), COLORS.uiDim, "btn-cosmetics-back", mx, my);

    // Tutorial banner
    if (this.shouldShowTutorial("cosmetics")) {
      this.tutorialActive = "cosmetics";
      this.drawTutorialBanner(ctx, w, t("tutorial.banner.cosmetics"));
    }
  }

  private drawHelp(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.menuClickRegions = [];
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.font = "bold 36px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("help.title"), w / 2, 60);

    ctx.textAlign = "left";
    const x = w / 2 - 300;
    let y = 110;
    const section = (title: string, color: string) => {
      ctx.font = "bold 16px monospace";
      ctx.fillStyle = color;
      ctx.fillText(title, x, y);
      y += 24;
    };
    const line = (text: string) => {
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(text, x + 10, y);
      y += 20;
    };
    const dimLine = (text: string) => {
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(text, x + 10, y);
      y += 20;
    };

    // Controls
    section(t("help.controls.title"), "#ffaa00");
    line(t("help.controls.move"));
    line(t("help.controls.aim"));
    line(t("help.controls.shoot"));
    line(t("help.controls.special"));
    line(t("help.controls.boost"));
    line(t("help.controls.emote"));
    line(t("help.controls.chat"));
    y += 10;

    // Ships
    section(t("help.ships.title"), "#00f0ff");
    line(t("help.ships.viper"));
    line(t("help.ships.titan"));
    line(t("help.ships.specter"));
    line(t("help.ships.nova"));
    y += 10;

    // Modes
    section(t("help.modes.title"), "#44ff88");
    dimLine(t("help.modes.list"));
    y += 10;

    // Mutators
    section(t("help.mutators.title"), "#aa88ff");
    dimLine(t("help.mutators.desc"));
    y += 10;

    // Social
    section(t("help.social.title"), "#ff44aa");
    line(t("help.social.desc"));
    y += 20;

    // Reset tutorial button
    ctx.textAlign = "center";
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = this.tutorialResetFeedback > 0 ? "#44ff88" : COLORS.uiDim;
    ctx.fillText(
      this.tutorialResetFeedback > 0 ? t("help.tutorialReset") : t("help.resetTutorial"),
      w / 2, y,
    );
    y += 40;

    // Back hint
    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText("[Escape] " + t("help.back"), w / 2, y);
  }

  // ===== Kill-Cam & Highlights =====

  private recordPositionFrame(): void {
    if (!this.gameState) return;
    const snapshot: Record<string, { x: number; y: number; rot: number; alive: boolean }> = {};
    for (const [id, p] of Object.entries(this.gameState.players)) {
      snapshot[id] = { x: p.position.x, y: p.position.y, rot: p.rotation, alive: p.alive };
    }
    this.positionHistory.push(snapshot);
    // Keep last 150 frames (~2.5s at 60fps)
    if (this.positionHistory.length > 150) {
      this.positionHistory.shift();
    }
  }

  private detectLocalPlayerDeath(): void {
    if (!this.gameState) return;
    const localPlayer = this.gameState.players[this.localPlayerId];
    if (!localPlayer) return;

    const wasDead = !this.prevLocalAlive;
    const isDead = !localPlayer.alive;
    this.prevLocalAlive = localPlayer.alive;

    // Detect death transition (alive → dead)
    if (isDead && !wasDead) {
      // Find the kill event for this death
      const killEvent = [...this.gameState.killFeed]
        .reverse()
        .find((e) => e.victimId === this.localPlayerId);

      if (killEvent && this.positionHistory.length > 0) {
        this.killCamData = {
          frames: [...this.positionHistory],
          killerId: killEvent.killerId,
          killerName: killEvent.killerName,
          killType: killEvent.killType,
        };
        this.killCamTimer = 2.5;

        // Track highlight score
        this.trackHighlightKill(killEvent);
      }
    }
  }

  private trackHighlightKill(event: KillEvent): void {
    let score = 1;
    let label = "ELIMINIERT";

    if (event.killType === "gravity-well") { score += 3; label = "GRAVITY MASTER"; }
    if (event.killType === "ricochet") { score += 2; label = "RICOCHET!"; }
    if (event.killType === "homing") { score += 1; label = "ZIELSUCHEND"; }
    if (event.killType === "emp") { score += 2; label = "EMP STRIKE"; }

    // Check if this was a multi-kill (combo)
    const recentKills = this.gameState?.killFeed.filter(
      (e) => e.killerId === event.killerId && e.timestamp >= event.timestamp - 120,
    ) || [];
    if (recentKills.length >= 3) { score += 4; label = "MULTI-KILL!"; }
    else if (recentKills.length >= 2) { score += 2; label = "DOPPELKILL!"; }

    this.highlightKills.push({
      killerName: event.killerName,
      victimName: event.victimName,
      killType: event.killType,
      score,
      label,
    });
  }

  private drawKillCamOverlay(): void {
    if (!this.killCamData) return;
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Kill-cam box dimensions
    const boxW = 320;
    const boxH = 200;
    const boxX = w - boxW - 20;
    const boxY = h - boxH - 80;

    // Semi-transparent background
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // "KILL CAM" header
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ff4444";
    ctx.fillText("KILL CAM", boxX + 8, boxY + 16);

    // Replay the recorded frames as mini animation
    const frames = this.killCamData.frames;
    const totalDuration = 2.5;
    const elapsed = totalDuration - this.killCamTimer;
    const progress = Math.min(1, elapsed / totalDuration);
    const frameIndex = Math.floor(progress * (frames.length - 1));
    const frame = frames[Math.min(frameIndex, frames.length - 1)];

    if (frame) {
      // Find bounds of all players in the recording for scaling
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const snap of Object.values(frame)) {
        minX = Math.min(minX, snap.x);
        minY = Math.min(minY, snap.y);
        maxX = Math.max(maxX, snap.x);
        maxY = Math.max(maxY, snap.y);
      }

      // Add padding
      const padding = 100;
      minX -= padding; minY -= padding;
      maxX += padding; maxY += padding;
      const rangeX = Math.max(maxX - minX, 200);
      const rangeY = Math.max(maxY - minY, 200);
      const scaleX = (boxW - 20) / rangeX;
      const scaleY = (boxH - 40) / rangeY;
      const sc = Math.min(scaleX, scaleY);

      const centerX = boxX + boxW / 2;
      const centerY = boxY + boxH / 2 + 10;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      // Draw all players as triangles
      for (const [id, snap] of Object.entries(frame)) {
        if (!snap.alive) continue;
        const sx = centerX + (snap.x - midX) * sc;
        const sy = centerY + (snap.y - midY) * sc;
        const size = 6;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(snap.rot);

        if (id === this.killCamData.killerId) {
          ctx.fillStyle = "#ff4444"; // Killer in red
        } else if (id === this.localPlayerId) {
          ctx.fillStyle = "#4488ff"; // Victim (you) in blue
        } else {
          ctx.fillStyle = COLORS.uiDim; // Others dimmed
        }

        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.6, -size * 0.5);
        ctx.lineTo(-size * 0.6, size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Kill info text
    const killTypeLabels: Record<string, string> = {
      "normal": "", "gravity-well": "Gravity Well", "ricochet": "Ricochet",
      "homing": "Homing", "emp": "EMP", "melee": "Melee",
    };
    const typeText = killTypeLabels[this.killCamData.killType] || "";

    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4444";
    ctx.fillText(`ELIMINIERT VON ${this.killCamData.killerName.toUpperCase()}`, boxX + boxW / 2, boxY + boxH - 22);
    if (typeText) {
      ctx.font = "13px monospace";
      ctx.fillStyle = "#ff888888";
      ctx.fillText(typeText, boxX + boxW / 2, boxY + boxH - 8);
    }
  }

  private drawHighlightReel(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const timer = this.highlightPhaseTimer;

    // Intro (0-1s): "HIGHLIGHTS" title
    if (timer < 1) {
      const alpha = Math.min(1, timer * 2);
      ctx.globalAlpha = alpha;
      ctx.font = "bold 48px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText("HIGHLIGHTS", w / 2, h / 2);
      ctx.globalAlpha = 1;
      return;
    }

    // Show highlight cards (2s each)
    const cardTime = timer - 1;
    const cardIndex = Math.floor(cardTime / 2);
    const cardProgress = (cardTime % 2) / 2;

    if (cardIndex >= this.highlightKills.length) return;

    const kill = this.highlightKills[cardIndex];
    const cardY = h / 2 - 60;

    // Card entrance animation
    const slideIn = Math.min(1, cardProgress * 4); // 0.25s slide
    const offsetX = (1 - slideIn) * 300;

    ctx.save();
    ctx.translate(offsetX, 0);

    // Card number
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffaa0088";
    ctx.fillText(`#${cardIndex + 1}`, w / 2, cardY - 40);

    // Kill label (GRAVITY MASTER, DOPPELKILL, etc.)
    ctx.font = "bold 36px monospace";
    ctx.fillStyle = "#ff44aa";
    ctx.fillText(kill.label, w / 2, cardY);

    // Killer → Victim
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(`${kill.killerName}  →  ${kill.victimName}`, w / 2, cardY + 40);

    // Kill type
    if (kill.killType !== "normal") {
      ctx.font = "14px monospace";
      ctx.fillStyle = "#aa88ff";
      ctx.fillText(kill.killType.replace("-", " ").toUpperCase(), w / 2, cardY + 70);
    }

    ctx.restore();

    // Skip hint
    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.textAlign = "center";
    ctx.fillText("Enter = Skip", w / 2, h - 30);
  }

  // ===== Mutator Roulette =====

  private startMutatorRoulette(): void {
    // Pre-select 2-3 random mutators (excluding mirror-match since it's a separate toggle)
    const pool = MUTATOR_OPTIONS.filter((m) => m !== "mirror-match");
    const count = 2 + Math.floor(Math.random() * 2); // 2 or 3
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    this.rouletteSelected = shuffled.slice(0, count);
    // Keep mirror-match if it was manually enabled
    if (this.selectedMutators.includes("mirror-match")) {
      this.rouletteSelected.push("mirror-match");
    }
    this.rouletteTimer = 0;
    this.rouletteHighlight = 0;
    this.rouletteLockedCount = 0;
    this.screen = "mutator-roulette";
  }

  private drawMutatorRoulette(_dt: number): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#aa88ff";
    ctx.fillText("MUTATOR ROULETTE", w / 2, 80);

    const pool = MUTATOR_OPTIONS.filter((m) => m !== "mirror-match");
    const cols = 3;
    const cardW = 200;
    const cardH = 50;
    const gap = 12;
    const startX = w / 2 - ((cols * (cardW + gap)) - gap) / 2;
    const startY = 140;

    const t = this.rouletteTimer;

    // Phase 1 (0-2s): Rapid scanning highlight
    // Phase 2 (2-3.5s): Lock in mutators one by one
    // Phase 3 (3.5-4.5s): Show "LOS!" and auto-start

    // Update scanning highlight during phase 1
    if (t < 2) {
      this.rouletteHighlight = Math.floor(t * 12) % pool.length;
    }

    // Lock in mutators during phase 2
    const lockInterval = 0.5;
    if (t >= 2) {
      this.rouletteLockedCount = Math.min(
        this.rouletteSelected.filter((m) => m !== "mirror-match").length,
        Math.floor((t - 2) / lockInterval) + 1,
      );
    }

    // Draw mutator cards
    for (let i = 0; i < pool.length; i++) {
      const mut = pool[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);

      const selectedIndex = this.rouletteSelected.filter((m) => m !== "mirror-match").indexOf(mut);
      const isLocked = selectedIndex >= 0 && selectedIndex < this.rouletteLockedCount;
      const isScanning = t < 2 && i === this.rouletteHighlight;

      // Card background
      if (isLocked) {
        ctx.fillStyle = "#2a1144";
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = "#aa88ff";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, cardW, cardH);
        // Glow effect
        ctx.shadowColor = "#aa88ff";
        ctx.shadowBlur = 15;
        ctx.strokeRect(x, y, cardW, cardH);
        ctx.shadowBlur = 0;
      } else if (isScanning) {
        ctx.fillStyle = "#1a1133";
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = "#6644aa";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);
      } else {
        ctx.fillStyle = "#0d0d1a";
        ctx.fillRect(x, y, cardW, cardH);
        ctx.strokeStyle = "#222244";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cardW, cardH);
      }

      // Mutator name
      const config = MUTATOR_CONFIGS[mut];
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = isLocked ? "#cc99ff" : (isScanning ? "#8866cc" : COLORS.uiDim);
      ctx.fillText(config?.name || mut, x + cardW / 2, y + 22);

      // Description for locked
      if (isLocked && config) {
        ctx.font = "13px monospace";
        ctx.fillStyle = "#aa88ff88";
        ctx.fillText(config.description, x + cardW / 2, y + 40);
      }
    }

    // Mirror match indicator (if enabled)
    if (this.rouletteSelected.includes("mirror-match")) {
      const mmY = startY + Math.ceil(pool.length / cols) * (cardH + gap) + 20;
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = "#cc99ff";
      ctx.textAlign = "center";
      ctx.fillText("+ MIRROR MATCH", w / 2, mmY);
    }

    // Phase 3: "LOS!" text and auto-start
    if (t >= 3.5) {
      const flash = Math.sin(t * 8) > 0;
      ctx.font = "bold 48px monospace";
      ctx.fillStyle = flash ? "#ff44aa" : "#aa88ff";
      ctx.textAlign = "center";
      ctx.fillText("LOS!", w / 2, h - 80);
    }

    // Auto-start after 4.5 seconds
    if (t >= 4.5) {
      this.selectedMutators = [...this.rouletteSelected];
      this.startLocalGame();
      return;
    }

    // Skip hint
    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.textAlign = "center";
    ctx.fillText("Enter = Skip", w / 2, h - 30);
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
    ctx.fillText(t("mods.loadout", { name: config.name }), w / 2, 60);

    const weaponMods = [t("mods.weapon.0"), t("mods.weapon.1"), t("mods.weapon.2"), t("mods.weapon.3")];
    const weaponDescs = [
      t("mods.weapon.0.desc"),
      t("mods.weapon.1.desc"),
      t("mods.weapon.2.desc"),
      t("mods.weapon.3.desc"),
    ];
    const shipMods = [t("mods.ship.0"), t("mods.ship.1"), t("mods.ship.2"), t("mods.ship.3")];
    const shipDescs = [
      t("mods.ship.0.desc"),
      t("mods.ship.1.desc"),
      t("mods.ship.2.desc"),
      t("mods.ship.3.desc"),
    ];
    const passiveMods = [t("mods.passive.0"), t("mods.passive.1"), t("mods.passive.2"), t("mods.passive.3")];
    const passiveDescs = [
      t("mods.passive.0.desc"),
      t("mods.passive.1.desc"),
      t("mods.passive.2.desc"),
      t("mods.passive.3.desc"),
    ];

    this.drawModCategory(ctx, w / 2, 120, t("mods.weaponMod"), weaponMods, weaponDescs, this.selectedWeaponMod, "#ff4444", "weapon", mx, my);
    this.drawModCategory(ctx, w / 2, 270, t("mods.shipMod"), shipMods, shipDescs, this.selectedShipMod, "#4488ff", "ship", mx, my);
    this.drawModCategory(ctx, w / 2, 420, t("mods.passiveMod"), passiveMods, passiveDescs, this.selectedPassiveMod, "#44ff88", "passive", mx, my);

    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "#ffaa00";
    ctx.textAlign = "center";
    ctx.fillText(t("mods.controls"), w / 2, 565);

    for (let i = 0; i < 2; i++) {
      const bx = w / 2 - 230 + i * 240;
      const by = 580;
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
      ctx.fillText(getControlModeNames()[i], bx + bw / 2, by + 20);

      ctx.font = "13px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(getControlModeDescs()[i], bx + bw / 2, by + 38);

      this.menuClickRegions.push({ x: bx, y: by, width: bw, height: bh, id: regionId });
    }

    this.drawMenuButton(ctx, w / 2, 665, 220, 44, t("mods.continue"), COLORS.ui, "button-start", mx, my);
    this.drawMenuButton(ctx, w / 2, 720, 150, 36, t("mods.back"), COLORS.uiDim, "button-back", mx, my);

    // Tutorial overlay
    if (this.shouldShowTutorial("mod-select")) {
      this.tutorialActive = "mod-select";
      this.drawTutorialOverlay(ctx, w, h, t("tutorial.overlay.modSelect"));
    }
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
    ctx.fillText(t("settings.title"), w / 2, 60);

    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "#ff4444";
    ctx.fillText(t("settings.difficulty"), w / 2, 110);

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

      ctx.font = "bold 12px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(preset.name, bx + bw / 2, by + 25);

      ctx.font = "13px monospace";
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
    ctx.fillText(t("settings.botCount"), w / 2, 250);

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

    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(t("settings.hint"), w / 2, 360);

    // Mutator selection
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "#aa88ff";
    ctx.fillText(t("settings.mutators"), w / 2, 400);

    const mutatorNames: Record<string, string> = {
      "hypergravity": "Hypergravity", "zero-g": "Zero-G", "big-head": "Big Head",
      "ricochet-arena": "Ricochet", "glass-cannon": "Glass Cannon", "mystery-loadout": "Mystery Loadout",
      "fog-of-war": "Fog of War", "speed-demon": "Speed Demon", "friendly-fire": "Friendly Fire",
      "mirror-match": "Mirror Match",
    };
    const mutatorKeys: Record<string, string> = {
      "hypergravity": "G", "zero-g": "Z", "big-head": "B",
      "ricochet-arena": "R", "glass-cannon": "C", "mystery-loadout": "Y",
      "fog-of-war": "F", "speed-demon": "D", "friendly-fire": "X",
      "mirror-match": "I",
    };

    const selectableMutators = MUTATOR_OPTIONS;
    const cols = 5;
    for (let i = 0; i < selectableMutators.length; i++) {
      const mut = selectableMutators[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = w / 2 - 315 + col * 128;
      const by = 415 + row * 42;
      const bw = 120;
      const bh = 34;
      const isActive = this.selectedMutators.includes(mut);
      const regionId = `mutator-${mut}`;
      const isHovered = this.hitTestLocal(mx, my) === regionId;

      ctx.strokeStyle = isActive ? "#aa88ff" : (isHovered ? COLORS.ui : "#333355");
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isActive) {
        ctx.fillStyle = "#aa88ff20";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      ctx.font = "bold 12px monospace";
      ctx.fillStyle = isActive ? "#cc99ff" : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(`[${mutatorKeys[mut] || ""}] ${mutatorNames[mut] || mut}`, bx + bw / 2, by + 22);

      this.menuClickRegions.push({ x: bx, y: by, width: bw, height: bh, id: regionId });
    }

    // Mutator hover tooltip — show description below the grid
    const hoveredMutRegion = this.hitTestLocal(mx, my);
    if (hoveredMutRegion && hoveredMutRegion.startsWith("mutator-")) {
      const mutId = hoveredMutRegion.replace("mutator-", "");
      const desc = MUTATOR_CONFIGS[mutId]?.description;
      if (desc) {
        ctx.font = "13px monospace";
        ctx.fillStyle = "#aa88ff";
        ctx.textAlign = "center";
        ctx.fillText(desc, w / 2, 510);
      }
    }

    // Roulette toggle
    const rouletteRegion = "btn-roulette-toggle";
    const rouletteHovered = this.hitTestLocal(mx, my) === rouletteRegion;
    const rouletteColor = this.rouletteEnabled ? "#ff44aa" : (rouletteHovered ? COLORS.ui : COLORS.uiDim);
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = rouletteColor;
    ctx.fillText(`[O] Roulette: ${this.rouletteEnabled ? "AN" : "AUS"}`, w / 2, 530);
    this.menuClickRegions.push({ x: w / 2 - 80, y: 518, width: 160, height: 20, id: rouletteRegion });

    // Tutorial toggle
    const tutorialRegion = "button-tutorial-toggle";
    const tutorialHovered = this.hitTestLocal(mx, my) === tutorialRegion;
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = this.tutorialEnabled ? "#44ff88" : (tutorialHovered ? COLORS.ui : COLORS.uiDim);
    ctx.textAlign = "center";
    ctx.fillText(`[H] Tutorial: ${this.tutorialEnabled ? "AN" : "AUS"}`, w / 2, 550);
    this.menuClickRegions.push({ x: w / 2 - 80, y: 538, width: 160, height: 20, id: tutorialRegion });

    this.drawMenuButton(ctx, w / 2 - 130, 585, 220, 44, t("settings.start"), COLORS.ui, "button-start-game", mx, my);
    this.drawMenuButton(ctx, w / 2 + 130, 585, 220, 44, t("tournament.title"), "#aa88ff", "button-start-tournament", mx, my);
    this.drawMenuButton(ctx, w / 2, 645, 150, 36, t("settings.back"), COLORS.uiDim, "button-settings-back", mx, my);

    // Tutorial overlay
    if (this.shouldShowTutorial("settings")) {
      this.tutorialActive = "settings";
      this.drawTutorialOverlay(ctx, w, h, t("tutorial.overlay.settings"));
    }
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
    ctx.fillText(t("lobby.title"), w / 2, 80);

    this.drawMenuButton(ctx, w / 2, 145, 240, 40, t("lobby.createRoom"), COLORS.nova, "button-new-room", mx, my);

    ctx.font = "16px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.textAlign = "center";
    ctx.fillText(t("lobby.enterCode"), w / 2, 220);

    ctx.strokeStyle = COLORS.ui;
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 - 80, 235, 160, 40);
    ctx.font = "bold 24px monospace";
    ctx.fillStyle = COLORS.ui;
    const cursor = Math.sin(performance.now() / 300) > 0 ? "_" : "";
    ctx.fillText(this.roomCodeInput + cursor, w / 2, 262);

    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(t("lobby.joinHint"), w / 2, 298);

    if (this.activeRoomCode) {
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(t("lobby.shareCode"), w / 2, 330);

      ctx.font = "bold 32px monospace";
      ctx.fillStyle = "#ffaa00";
      ctx.fillText(this.activeRoomCode, w / 2, 368);

      const copyLabel = this.copiedFeedbackTimer > 0 ? t("lobby.copied") : t("lobby.copy");
      const copyColor = this.copiedFeedbackTimer > 0 ? "#44ff88" : COLORS.uiDim;
      const copyHovered = this.hitTestLocal(mx, my) === "button-copy-code";
      this.drawMenuButton(ctx, w / 2, 405, 140, 28, copyLabel, copyHovered ? COLORS.ui : copyColor, "button-copy-code", mx, my);
    }

    if (this.lobbyStatus) {
      ctx.font = "16px monospace";
      ctx.fillStyle = COLORS.gravityWell;
      ctx.fillText(this.lobbyStatus, w / 2, 420);
    }

    this.drawMenuButton(ctx, w / 2, h - 50, 200, 36, t("lobby.back"), COLORS.uiDim, "button-lobby-back", mx, my);
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

    const bw = 170;
    const spacing = 180;
    const startX = cx - (names.length * spacing - (spacing - bw)) / 2;

    for (let i = 0; i < names.length; i++) {
      const bx = startX + i * spacing;
      const by = y + 15;
      const bh = 65;
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

      // Word-wrap description into 2 lines
      ctx.font = "13px monospace";
      ctx.fillStyle = COLORS.uiDim;
      const words = descs[i].split(" ");
      let line1 = "";
      let line2 = "";
      for (const word of words) {
        const test = line1 ? `${line1} ${word}` : word;
        if (!line2 && ctx.measureText(test).width <= bw - 14) {
          line1 = test;
        } else {
          line2 = line2 ? `${line2} ${word}` : word;
        }
      }
      ctx.fillText(line1, bx + bw / 2, by + 38);
      if (line2) ctx.fillText(line2, bx + bw / 2, by + 50);

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
