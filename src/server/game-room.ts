import {
  ClientMessage, ServerMessage, PlayerInput, ShipClass,
  ModLoadout, GameMode, MapId, GameState,
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

  constructor(
    private state: DurableObjectState,
    _env: unknown,
  ) {
    this.broadcastInterval = Math.round(TICK_RATE / SERVER_BROADCAST_RATE);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Room info endpoint (non-WebSocket)
    if (url.pathname.endsWith("/info")) {
      return Response.json({
        players: this.sessions.size,
        maxPlayers: this.config.maxPlayers,
        mode: this.config.mode,
        mapId: this.config.mapId,
        started: this.started,
      });
    }

    // Configure room before start
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
        this.handleJoin(ws, data.name, data.shipClass, data.mods);
        break;
      case "input":
        this.handleInput(ws, data.input);
        break;
      case "leave":
        this.handleLeave(ws);
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
  ): void {
    // Create game state on first join
    if (!this.gameState) {
      this.gameState = createGameState(this.config.mode, this.config.mapId);
    }

    const playerId = crypto.randomUUID().slice(0, 8);
    this.sessions.set(ws, { webSocket: ws, playerId, name, latestInput: null });
    addPlayer(this.gameState, playerId, name, shipClass, mods);

    const joinMsg: ServerMessage = { type: "joined", playerId };
    ws.send(JSON.stringify(joinMsg));

    // Start game loop when we have enough players
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
    }
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

      // Only broadcast at SERVER_BROADCAST_RATE
      if (this.broadcastCounter >= this.broadcastInterval) {
        this.broadcastCounter = 0;
        this.broadcastState();
      }

      // End game handling
      if (this.gameState.gameOver) {
        clearInterval(this.gameLoopInterval!);
        this.gameLoopInterval = null;

        const scores: Record<string, number> = {};
        for (const player of Object.values(this.gameState.players)) {
          scores[player.id] = player.score;
        }
        const gameOverMsg: ServerMessage = {
          type: "game-over",
          scores,
          winnerId: this.gameState.winnerId,
        };
        this.broadcast(JSON.stringify(gameOverMsg));
      }
    }, TICK_DURATION);
  }

  private broadcastState(): void {
    if (!this.gameState) return;

    // Strip particles from broadcast to save bandwidth
    const lightState = {
      ...this.gameState,
      particles: [],
    };

    const msg: ServerMessage = { type: "state", state: lightState as GameState };
    const data = JSON.stringify(msg);
    for (const session of this.sessions.values()) {
      try {
        session.webSocket.send(data);
      } catch {
        // Socket might be closing
      }
    }
  }

  private broadcast(data: string): void {
    for (const session of this.sessions.values()) {
      try {
        session.webSocket.send(data);
      } catch {
        // Socket might be closing
      }
    }
  }
}
