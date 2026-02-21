import { ClientMessage, ServerMessage, GameState, PlayerState, GravityWell } from "../shared/types";
import { ARENA_WIDTH, ARENA_HEIGHT, TICK_RATE, TICK_DURATION } from "../shared/constants";

interface Session {
  webSocket: WebSocket;
  playerId: string;
  name: string;
}

export class GameRoom implements DurableObject {
  private sessions: Map<WebSocket, Session> = new Map();
  private gameState: GameState;
  private gameLoopInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private state: DurableObjectState,
    private env: unknown,
  ) {
    this.gameState = this.createInitialState();
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
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
        this.handleJoin(ws, data.name, data.shipClass);
        break;
      case "input":
        // TODO: Process player input
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

  private handleJoin(ws: WebSocket, name: string, shipClass: string): void {
    const playerId = crypto.randomUUID().slice(0, 8);

    this.sessions.set(ws, { webSocket: ws, playerId, name });

    const player: PlayerState = {
      id: playerId,
      name,
      shipClass: shipClass as PlayerState["shipClass"],
      position: {
        x: Math.random() * ARENA_WIDTH,
        y: Math.random() * ARENA_HEIGHT,
      },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      hp: 100,
      maxHp: 100,
      energy: 100,
      score: 0,
      alive: true,
    };

    this.gameState.players[playerId] = player;

    const joinMsg: ServerMessage = { type: "joined", playerId };
    ws.send(JSON.stringify(joinMsg));

    if (!this.gameLoopInterval && this.sessions.size >= 1) {
      this.startGameLoop();
    }
  }

  private handleLeave(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (session) {
      delete this.gameState.players[session.playerId];
      this.sessions.delete(ws);
    }

    if (this.sessions.size === 0 && this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }
  }

  private startGameLoop(): void {
    this.gameLoopInterval = setInterval(() => {
      this.gameState.tick++;
      // TODO: Physics update, collision detection, etc.
      this.broadcastState();
    }, TICK_DURATION);
  }

  private broadcastState(): void {
    const msg: ServerMessage = { type: "state", state: this.gameState };
    const data = JSON.stringify(msg);
    for (const session of this.sessions.values()) {
      session.webSocket.send(data);
    }
  }

  private createInitialState(): GameState {
    const gravityWells: GravityWell[] = [
      { id: "gw1", position: { x: ARENA_WIDTH * 0.3, y: ARENA_HEIGHT * 0.5 }, strength: 1, radius: 150 },
      { id: "gw2", position: { x: ARENA_WIDTH * 0.7, y: ARENA_HEIGHT * 0.5 }, strength: 1, radius: 150 },
    ];

    return {
      tick: 0,
      players: {},
      projectiles: [],
      gravityWells,
      timeRemaining: 120,
    };
  }
}
