import {
  ClientMessage, ServerMessage, PlayerInput, ShipClass,
  ModLoadout, GameMode, MapId, GameState, ControlMode,
  ChatMessage, PostGameData, MatchPlayerResult,
} from "../shared/types";
import { TICK_DURATION, SERVER_BROADCAST_RATE, TICK_RATE } from "../shared/constants";
import {
  createGameState, addPlayer, removePlayer, simulateTick,
} from "../shared/game-simulation";

interface Session {
  webSocket: WebSocket;
  playerId: string;
  name: string;
  latestInput: PlayerInput | null;
  shipClass: ShipClass;
  mods: ModLoadout;
  controlMode: ControlMode;
  rematchVoted: boolean;
}

interface RoomConfig {
  mode: GameMode;
  mapId: MapId;
  maxPlayers: number;
}

export class GameRoom implements DurableObject {
  private sessions: Map<WebSocket, Session> = new Map();
  private gameState: GameState | null = null;
  private gameLoopInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastCounter = 0;
  private broadcastInterval: number;
  private config: RoomConfig = {
    mode: "deathmatch",
    mapId: "nebula-station",
    maxPlayers: 6,
  };
  private started = false;
  private lastKillFeedIndex = 0;
  private rematchVotes = 0;
  private chatMessages: ChatMessage[] = [];

  constructor(
    private state: DurableObjectState,
    _env: unknown,
  ) {
    this.broadcastInterval = Math.round(TICK_RATE / SERVER_BROADCAST_RATE);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/info")) {
      return Response.json({
        players: this.sessions.size,
        maxPlayers: this.config.maxPlayers,
        mode: this.config.mode,
        mapId: this.config.mapId,
        started: this.started,
      });
    }

    if (url.pathname.endsWith("/configure") && request.method === "POST") {
      if (this.started) {
        return Response.json({ error: "Game already started" }, { status: 400 });
      }
      const body = await request.json() as Partial<RoomConfig>;
      if (body.mode) this.config.mode = body.mode;
      if (body.mapId) this.config.mapId = body.mapId;
      if (body.maxPlayers) this.config.maxPlayers = body.maxPlayers;
      return Response.json({ ok: true, config: this.config });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    if (this.sessions.size >= this.config.maxPlayers) {
      return new Response("Room is full", { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const data = JSON.parse(message as string) as ClientMessage;

    switch (data.type) {
      case "join":
        this.handleJoin(ws, data.name, data.shipClass, data.mods, data.controlMode);
        break;
      case "input":
        this.handleInput(ws, data.input);
        break;
      case "leave":
        this.handleLeave(ws);
        break;
      case "chat":
        this.handleChat(ws, data.text);
        break;
      case "rematch-vote":
        this.handleRematchVote(ws);
        break;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.handleLeave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.handleLeave(ws);
  }

  private handleJoin(
    ws: WebSocket,
    name: string,
    shipClass: ShipClass,
    mods: ModLoadout,
    controlMode?: ControlMode,
  ): void {
    if (!this.gameState) {
      this.gameState = createGameState(this.config.mode, this.config.mapId);
    }

    const playerId = crypto.randomUUID().slice(0, 8);
    const cm = controlMode ?? "absolute";
    this.sessions.set(ws, {
      webSocket: ws, playerId, name, latestInput: null,
      shipClass, mods, controlMode: cm, rematchVoted: false,
    });
    addPlayer(this.gameState, playerId, name, shipClass, mods, cm);

    const joinMsg: ServerMessage = { type: "joined", playerId };
    ws.send(JSON.stringify(joinMsg));

    const minPlayers = this.config.mode === "duel" ? 2 : 1;
    if (!this.gameLoopInterval && this.sessions.size >= minPlayers) {
      this.started = true;
      this.startCountdown();
    }
  }

  private handleInput(ws: WebSocket, input: PlayerInput): void {
    const session = this.sessions.get(ws);
    if (session) {
      session.latestInput = input;
    }
  }

  private handleLeave(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (session) {
      if (this.gameState) {
        removePlayer(this.gameState, session.playerId);
      }
      this.sessions.delete(ws);
    }

    if (this.sessions.size === 0) {
      if (this.gameLoopInterval) {
        clearInterval(this.gameLoopInterval);
        this.gameLoopInterval = null;
      }
      this.gameState = null;
      this.started = false;
      this.lastKillFeedIndex = 0;
      this.rematchVotes = 0;
      this.chatMessages = [];
    }
  }

  private handleChat(ws: WebSocket, text: string): void {
    const session = this.sessions.get(ws);
    if (!session || !text || text.length > 200) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID().slice(0, 8),
      senderId: session.playerId,
      senderName: session.name,
      text: text.trim(),
      timestamp: Date.now(),
    };
    this.chatMessages.push(msg);
    if (this.chatMessages.length > 50) this.chatMessages.shift();

    const serverMsg: ServerMessage = { type: "chat", message: msg };
    this.broadcast(JSON.stringify(serverMsg));
  }

  private handleRematchVote(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session || session.rematchVoted) return;
    if (!this.gameState?.gameOver) return;

    session.rematchVoted = true;
    this.rematchVotes++;

    const needed = Math.ceil(this.sessions.size / 2);
    const rematchMsg: ServerMessage = {
      type: "rematch", votes: this.rematchVotes, needed,
    };
    this.broadcast(JSON.stringify(rematchMsg));

    // Majority wants rematch — restart
    if (this.rematchVotes >= needed) {
      this.restartGame();
    }
  }

  private restartGame(): void {
    this.gameState = createGameState(this.config.mode, this.config.mapId);
    this.lastKillFeedIndex = 0;
    this.rematchVotes = 0;

    // Re-add all players
    for (const session of this.sessions.values()) {
      session.rematchVoted = false;
      session.latestInput = null;
      addPlayer(this.gameState, session.playerId, session.name,
        session.shipClass, session.mods, session.controlMode);
    }

    this.startCountdown();
  }

  private startCountdown(): void {
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      const msg: ServerMessage = { type: "countdown", seconds: countdown };
      this.broadcast(JSON.stringify(msg));
      countdown--;
      if (countdown < 0) {
        clearInterval(countdownInterval);
        this.startGameLoop();
      }
    }, 1000);
  }

  private startGameLoop(): void {
    const dt = TICK_DURATION / 1000;
    this.gameLoopInterval = setInterval(() => {
      if (!this.gameState) return;

      const inputs: Record<string, PlayerInput> = {};
      for (const session of this.sessions.values()) {
        if (session.latestInput) {
          inputs[session.playerId] = session.latestInput;
        }
      }

      simulateTick(this.gameState, inputs, dt);
      this.broadcastCounter++;

      // Broadcast new kill events
      this.broadcastKillEvents();

      if (this.broadcastCounter >= this.broadcastInterval) {
        this.broadcastCounter = 0;
        this.broadcastState();
      }

      if (this.gameState.gameOver) {
        clearInterval(this.gameLoopInterval!);
        this.gameLoopInterval = null;
        this.handleGameOver();
      }
    }, TICK_DURATION);
  }

  private broadcastKillEvents(): void {
    if (!this.gameState) return;
    const feed = this.gameState.killFeed;
    while (this.lastKillFeedIndex < feed.length) {
      const event = feed[this.lastKillFeedIndex];
      const msg: ServerMessage = { type: "kill", event };
      this.broadcast(JSON.stringify(msg));
      this.lastKillFeedIndex++;
    }
  }

  private handleGameOver(): void {
    if (!this.gameState) return;

    const scores: Record<string, number> = {};
    const playerResults: MatchPlayerResult[] = [];

    for (const player of Object.values(this.gameState.players)) {
      scores[player.id] = player.score;
      const stats = this.gameState.playerStats[player.id];
      playerResults.push({
        id: player.id,
        name: player.name,
        shipClass: player.shipClass,
        score: player.score,
        eliminations: player.eliminations,
        deaths: player.deaths,
        damageDealt: stats?.damageDealt ?? 0,
        accuracy: stats && stats.shotsFired > 0
          ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0,
        gravityKills: stats?.gravityKills ?? 0,
      });
    }

    // Sort by score
    playerResults.sort((a, b) => b.score - a.score);

    const gameOverMsg: ServerMessage = {
      type: "game-over", scores, winnerId: this.gameState.winnerId,
    };
    this.broadcast(JSON.stringify(gameOverMsg));

    // Send personalized post-game data to each player
    for (const session of this.sessions.values()) {
      const stats = this.gameState.playerStats[session.playerId];
      const xpGained = 50 + (stats?.shotsHit ?? 0) * 2 +
        (this.gameState.winnerId === session.playerId ? 20 : 0);

      const postGameData: PostGameData = {
        matchResult: {
          matchId: crypto.randomUUID().slice(0, 8),
          mode: this.gameState.gameMode,
          map: this.gameState.mapId,
          duration: Math.round(
            (this.gameState.tick * TICK_DURATION) / 1000,
          ),
          players: playerResults,
          winnerId: this.gameState.winnerId,
        },
        xpGained,
        newLevel: null,
        challengeProgress: [],
      };

      const msg: ServerMessage = { type: "post-game", data: postGameData };
      try { session.webSocket.send(JSON.stringify(msg)); } catch { /* closing */ }
    }
  }

  private broadcastState(): void {
    if (!this.gameState) return;

    const lightState = {
      ...this.gameState,
      particles: [],
    };

    const msg: ServerMessage = { type: "state", state: lightState as GameState };
    const data = JSON.stringify(msg);
    for (const session of this.sessions.values()) {
      try { session.webSocket.send(data); } catch { /* closing */ }
    }
  }

  private broadcast(data: string): void {
    for (const session of this.sessions.values()) {
      try { session.webSocket.send(data); } catch { /* closing */ }
    }
  }
}
