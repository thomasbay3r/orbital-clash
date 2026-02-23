import type {
  AuthUser, FriendInfo, FriendRequest, Invite, PresenceStatus,
  ShipClass, ModLoadout, ControlMode, MatchResult,
} from "../../shared/types";

const API_BASE = "";

export class ApiClient {
  private token: string | null = null;
  private userType: "guest" | "account" | null = null;

  constructor() {
    this.token = localStorage.getItem("auth_token");
    this.userType = localStorage.getItem("auth_type") as "guest" | "account" | null;
  }

  get isLoggedIn(): boolean { return !!this.token; }
  get isGuest(): boolean { return this.userType === "guest"; }
  get isAccount(): boolean { return this.userType === "account"; }
  get authToken(): string | null { return this.token; }

  private async fetch(path: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || `Serverfehler (${res.status})`);
    }
    return res.json();
  }

  // ===== Auth =====

  async initGuest(): Promise<AuthUser> {
    const data = await this.fetch("/api/auth/guest", { method: "POST" });
    this.token = data.token;
    this.userType = "guest";
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_type", "guest");
    return { type: "guest", id: data.id, displayName: data.displayName, level: data.level, xp: data.xp ?? 0 };
  }

  async register(email: string, username: string, password: string): Promise<AuthUser> {
    const guestToken = this.isGuest ? this.token : undefined;
    const data = await this.fetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password, guestToken }),
    });
    this.token = data.token;
    this.userType = "account";
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_type", "account");
    return { type: "account", id: data.id, displayName: data.username, level: 1, xp: 0 };
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const data = await this.fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.token = data.token;
    this.userType = "account";
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_type", "account");
    return {
      type: "account", id: data.id,
      displayName: data.username, level: data.level, xp: data.xp ?? 0,
    };
  }

  async forgotPassword(email: string): Promise<void> {
    await this.fetch("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.fetch("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });
  }

  async getMe(): Promise<AuthUser> {
    return this.fetch("/api/auth/me");
  }

  logout(): void {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_type");
    this.token = null;
    this.userType = null;
  }

  // ===== Friends =====

  async getFriends(): Promise<FriendInfo[]> {
    return this.fetch("/api/friends");
  }

  async getFriendRequests(): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
    return this.fetch("/api/friends/requests");
  }

  async sendFriendRequest(username: string): Promise<void> {
    await this.fetch("/api/friends/request", {
      method: "POST",
      body: JSON.stringify({ username }),
    });
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    await this.fetch("/api/friends/accept", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
  }

  async rejectFriendRequest(requestId: string): Promise<void> {
    await this.fetch("/api/friends/reject", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
  }

  async removeFriend(friendId: string): Promise<void> {
    await this.fetch(`/api/friends/${friendId}`, { method: "DELETE" });
  }

  async searchUsers(query: string): Promise<{ id: string; username: string; level: number }[]> {
    return this.fetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
  }

  async getRecentPlayers(): Promise<{ id: string; username: string; level: number }[]> {
    return this.fetch("/api/friends/recent");
  }

  // ===== Presence =====

  async heartbeat(status: PresenceStatus, roomId?: string): Promise<void> {
    await this.fetch("/api/presence", {
      method: "POST",
      body: JSON.stringify({ status, roomId }),
    });
  }

  async checkPresence(userIds: string[]): Promise<Record<string, { status: PresenceStatus; roomId?: string }>> {
    return this.fetch("/api/presence/check", {
      method: "POST",
      body: JSON.stringify({ userIds }),
    });
  }

  // ===== Invites =====

  async sendInvite(targetId: string, roomId: string): Promise<void> {
    await this.fetch("/api/invites/send", {
      method: "POST",
      body: JSON.stringify({ targetId, roomId }),
    });
  }

  async getInvites(): Promise<Invite[]> {
    return this.fetch("/api/invites");
  }

  async dismissInvite(inviteId: string): Promise<void> {
    await this.fetch("/api/invites/dismiss", {
      method: "POST",
      body: JSON.stringify({ inviteId }),
    });
  }

  // ===== Matchmaking =====

  async joinQueue(
    shipClass: ShipClass, mods: ModLoadout, controlMode: ControlMode,
  ): Promise<{ status: string; roomId?: string }> {
    return this.fetch("/api/matchmaking/join", {
      method: "POST",
      body: JSON.stringify({ shipClass, mods, controlMode }),
    });
  }

  async leaveQueue(): Promise<void> {
    await this.fetch("/api/matchmaking/leave", { method: "POST" });
  }

  async getQueueStatus(): Promise<{ status: string; roomId?: string; playersInQueue: number }> {
    return this.fetch("/api/matchmaking/status");
  }

  // ===== Match Report =====

  async reportMatch(result: MatchResult): Promise<void> {
    const payload = {
      matchId: result.matchId,
      mode: result.mode,
      map: result.map,
      duration: result.duration,
      players: result.players.map((p) => ({
        ...p,
        won: p.id === result.winnerId,
      })),
    };
    await this.fetch("/api/match/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}
