import type {
  GameMode, MapId, MutatorId, ChatMessage, PartyMember,
} from "../shared/types";

// ===== Party Messages =====

export type PartyClientMessage =
  | { type: "join"; userId: string; displayName: string; level: number }
  | { type: "ready"; ready: boolean }
  | { type: "chat"; text: string }
  | { type: "settings"; mode?: GameMode; map?: MapId; mutators?: MutatorId[]; roulette?: boolean }
  | { type: "kick"; memberId: string }
  | { type: "start-game" }
  | { type: "game-result"; winnerId: string | null; stats: Record<string, { kills: number; deaths: number; damageDealt: number; shotsFired: number; shotsHit: number }> }
  | { type: "leave" };

export type PartyServerMessage =
  | { type: "party-state"; state: PartyStateSnapshot }
  | { type: "chat"; message: ChatMessage }
  | { type: "game-starting"; roomId: string; mode: GameMode; map: MapId; mutators: MutatorId[] }
  | { type: "member-joined"; member: PartyMember }
  | { type: "member-left"; memberId: string }
  | { type: "error"; message: string }
  | { type: "kicked" };

export interface PartyStateSnapshot {
  partyId: string;
  members: PartyMember[];
  leaderId: string;
  selectedMode: GameMode;
  selectedMap: MapId;
  selectedMutators: MutatorId[];
  rouletteEnabled: boolean;
  sessionStats: Record<string, {
    name: string; kills: number; deaths: number; wins: number;
    damageDealt: number; shotsFired: number; shotsHit: number;
    gamesPlayed: number;
  }>;
  gamesPlayed: number;
}

interface MemberSession {
  ws: WebSocket;
  userId: string;
  displayName: string;
  level: number;
  ready: boolean;
}

export class PartyRoom implements DurableObject {
  private sessions: Map<WebSocket, MemberSession> = new Map();
  private leaderId: string | null = null;
  private selectedMode: GameMode = "deathmatch";
  private selectedMap: MapId = "nebula-station";
  private selectedMutators: MutatorId[] = [];
  private rouletteEnabled = false;
  private chatMessages: ChatMessage[] = [];
  private sessionStats: Record<string, {
    name: string; kills: number; deaths: number; wins: number;
    damageDealt: number; shotsFired: number; shotsHit: number;
    gamesPlayed: number;
  }> = {};
  private gamesPlayed = 0;
  private partyId = "";

  constructor(
    private state: DurableObjectState,
    _env: unknown,
  ) {
    this.partyId = state.id.toString().slice(0, 8);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/info")) {
      return Response.json({
        members: this.sessions.size,
        maxMembers: 8,
        leaderId: this.leaderId,
        mode: this.selectedMode,
        map: this.selectedMap,
      });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    if (this.sessions.size >= 8) {
      return new Response("Party is full", { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const data = JSON.parse(message as string) as PartyClientMessage;

    switch (data.type) {
      case "join":
        this.handleJoin(ws, data.userId, data.displayName, data.level);
        break;
      case "ready":
        this.handleReady(ws, data.ready);
        break;
      case "chat":
        this.handleChat(ws, data.text);
        break;
      case "settings":
        this.handleSettings(ws, data);
        break;
      case "kick":
        this.handleKick(ws, data.memberId);
        break;
      case "start-game":
        this.handleStartGame(ws);
        break;
      case "game-result":
        this.handleGameResult(data.winnerId, data.stats);
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

  private handleJoin(ws: WebSocket, userId: string, displayName: string, level: number): void {
    const session: MemberSession = { ws, userId, displayName, level, ready: false };
    this.sessions.set(ws, session);

    // First member becomes leader
    if (!this.leaderId || !this.findSessionByUserId(this.leaderId)) {
      this.leaderId = userId;
    }

    // Send full state to new member
    ws.send(JSON.stringify({ type: "party-state", state: this.getSnapshot() } as PartyServerMessage));

    // Notify others
    const joinMsg: PartyServerMessage = {
      type: "member-joined",
      member: { id: userId, displayName, level, ready: false, isLeader: userId === this.leaderId },
    };
    this.broadcastExcept(ws, JSON.stringify(joinMsg));
  }

  private handleReady(ws: WebSocket, ready: boolean): void {
    const session = this.sessions.get(ws);
    if (!session) return;
    session.ready = ready;
    this.broadcastState();
  }

  private handleChat(ws: WebSocket, text: string): void {
    const session = this.sessions.get(ws);
    if (!session || !text || text.length > 200) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID().slice(0, 8),
      senderId: session.userId,
      senderName: session.displayName,
      text: text.trim(),
      timestamp: Date.now(),
    };
    this.chatMessages.push(msg);
    if (this.chatMessages.length > 50) this.chatMessages.shift();

    const serverMsg: PartyServerMessage = { type: "chat", message: msg };
    this.broadcast(JSON.stringify(serverMsg));
  }

  private handleSettings(ws: WebSocket, data: PartyClientMessage & { type: "settings" }): void {
    const session = this.sessions.get(ws);
    if (!session || session.userId !== this.leaderId) return;

    if (data.mode !== undefined) this.selectedMode = data.mode;
    if (data.map !== undefined) this.selectedMap = data.map;
    if (data.mutators !== undefined) this.selectedMutators = data.mutators;
    if (data.roulette !== undefined) this.rouletteEnabled = data.roulette;

    this.broadcastState();
  }

  private handleKick(ws: WebSocket, memberId: string): void {
    const session = this.sessions.get(ws);
    if (!session || session.userId !== this.leaderId) return;

    const target = this.findSessionByUserId(memberId);
    if (!target) return;

    const kickMsg: PartyServerMessage = { type: "kicked" };
    target.ws.send(JSON.stringify(kickMsg));
    this.handleLeave(target.ws);
  }

  private handleStartGame(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session || session.userId !== this.leaderId) return;

    // Create a room for the party
    const roomId = crypto.randomUUID().slice(0, 8);

    const startMsg: PartyServerMessage = {
      type: "game-starting",
      roomId,
      mode: this.selectedMode,
      map: this.selectedMap,
      mutators: this.selectedMutators,
    };
    this.broadcast(JSON.stringify(startMsg));

    // Reset ready state
    for (const s of this.sessions.values()) {
      s.ready = false;
    }
  }

  private handleGameResult(
    winnerId: string | null,
    stats: Record<string, { kills: number; deaths: number; damageDealt: number; shotsFired: number; shotsHit: number }>,
  ): void {
    this.gamesPlayed++;

    for (const [playerId, playerStats] of Object.entries(stats)) {
      if (!this.sessionStats[playerId]) {
        const session = this.findSessionByUserId(playerId);
        this.sessionStats[playerId] = {
          name: session?.displayName ?? playerId,
          kills: 0, deaths: 0, wins: 0,
          damageDealt: 0, shotsFired: 0, shotsHit: 0,
          gamesPlayed: 0,
        };
      }
      const s = this.sessionStats[playerId];
      s.kills += playerStats.kills;
      s.deaths += playerStats.deaths;
      s.damageDealt += playerStats.damageDealt;
      s.shotsFired += playerStats.shotsFired;
      s.shotsHit += playerStats.shotsHit;
      s.gamesPlayed++;
      if (winnerId === playerId) s.wins++;
    }

    this.broadcastState();
  }

  private handleLeave(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session) return;

    const leftMsg: PartyServerMessage = { type: "member-left", memberId: session.userId };
    this.sessions.delete(ws);

    // Transfer leadership
    if (session.userId === this.leaderId) {
      const firstMember = this.sessions.values().next().value;
      this.leaderId = firstMember ? firstMember.userId : null;
    }

    if (this.sessions.size > 0) {
      this.broadcast(JSON.stringify(leftMsg));
      this.broadcastState();
    } else {
      // Last member left — reset party
      this.sessionStats = {};
      this.gamesPlayed = 0;
      this.chatMessages = [];
      this.leaderId = null;
    }
  }

  private findSessionByUserId(userId: string): MemberSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) return session;
    }
    return undefined;
  }

  private getSnapshot(): PartyStateSnapshot {
    const members: PartyMember[] = [];
    for (const session of this.sessions.values()) {
      members.push({
        id: session.userId,
        displayName: session.displayName,
        level: session.level,
        ready: session.ready,
        isLeader: session.userId === this.leaderId,
      });
    }

    return {
      partyId: this.partyId,
      members,
      leaderId: this.leaderId ?? "",
      selectedMode: this.selectedMode,
      selectedMap: this.selectedMap,
      selectedMutators: this.selectedMutators,
      rouletteEnabled: this.rouletteEnabled,
      sessionStats: this.sessionStats,
      gamesPlayed: this.gamesPlayed,
    };
  }

  private broadcastState(): void {
    const msg: PartyServerMessage = { type: "party-state", state: this.getSnapshot() };
    this.broadcast(JSON.stringify(msg));
  }

  private broadcast(data: string): void {
    for (const session of this.sessions.values()) {
      try { session.ws.send(data); } catch {}
    }
  }

  private broadcastExcept(ws: WebSocket, data: string): void {
    for (const session of this.sessions.values()) {
      if (session.ws !== ws) {
        try { session.ws.send(data); } catch {}
      }
    }
  }
}
