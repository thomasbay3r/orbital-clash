import { ClientMessage, ServerMessage, PlayerInput, ShipClass, ModLoadout } from "../shared/types";
import { TICK_DURATION } from "../shared/constants";
import {
  createGameState, addPlayer, removePlayer, simulateTick,
} from "../shared/game-simulation";

interface Session {
  webSocket: WebSocket;
  playerId: string;
  name: string;
  latestInput: PlayerInput | null;
}

export class GameRoom implements DurableObject {
  private sessions: Map<WebSocket, Session> = new Map();
  private gameState = createGameState("deathmatch", "nebula-station");
  private gameLoopInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private state: DurableObjectState,
    _env: unknown,
  ) {}

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
    const playerId = crypto.randomUUID().slice(0, 8);

    this.sessions.set(ws, { webSocket: ws, playerId, name, latestInput: null });

    addPlayer(this.gameState, playerId, name, shipClass, mods);

    const joinMsg: ServerMessage = { type: "joined", playerId };
    ws.send(JSON.stringify(joinMsg));

    if (!this.gameLoopInterval && this.sessions.size >= 1) {
      this.startGameLoop();
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
      removePlayer(this.gameState, session.playerId);
      this.sessions.delete(ws);
    }

    if (this.sessions.size === 0 && this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }
  }

  private startGameLoop(): void {
    const dt = TICK_DURATION / 1000;
    this.gameLoopInterval = setInterval(() => {
      // Collect inputs from all sessions
      const inputs: Record<string, PlayerInput> = {};
      for (const session of this.sessions.values()) {
        if (session.latestInput) {
          inputs[session.playerId] = session.latestInput;
        }
      }

      simulateTick(this.gameState, inputs, dt);
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
}
