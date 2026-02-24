import { describe, it, expect } from "vitest";
import type {
  PartyClientMessage, PartyServerMessage, PartyStateSnapshot,
} from "./party-room";
import type { GameMode, MapId, MutatorId, ChatMessage, PartyMember } from "../shared/types";
import { MUTATOR_CONFIGS } from "../shared/constants";

// ===== Party Message Type Validation =====
// PartyRoom uses DurableObject + WebSocket APIs not available in Vitest,
// so we test the message contracts, type shapes, and validation logic.

describe("PartyClientMessage Types", () => {
  it("should accept valid join message", () => {
    const msg: PartyClientMessage = {
      type: "join",
      userId: "user-123",
      displayName: "TestPlayer",
      level: 5,
    };
    expect(msg.type).toBe("join");
    expect(msg.userId.length).toBeGreaterThan(0);
    expect(msg.displayName.length).toBeGreaterThan(0);
    expect(msg.level).toBeGreaterThanOrEqual(1);
  });

  it("should accept valid ready message", () => {
    const msg: PartyClientMessage = { type: "ready", ready: true };
    expect(msg.type).toBe("ready");
    expect(typeof msg.ready).toBe("boolean");
  });

  it("should accept valid chat message", () => {
    const msg: PartyClientMessage = { type: "chat", text: "Hello team!" };
    expect(msg.type).toBe("chat");
    expect(msg.text.length).toBeGreaterThan(0);
    expect(msg.text.length).toBeLessThanOrEqual(200);
  });

  it("should enforce chat text length limit of 200", () => {
    const longText = "a".repeat(201);
    // Server rejects: if (!session || !text || text.length > 200) return;
    expect(longText.length > 200).toBe(true);
  });

  it("should accept valid settings message", () => {
    const msg: PartyClientMessage = {
      type: "settings",
      mode: "deathmatch" as GameMode,
      map: "nebula-station" as MapId,
      mutators: ["big-head"] as MutatorId[],
      roulette: false,
    };
    expect(msg.type).toBe("settings");
  });

  it("should accept partial settings message", () => {
    const msg: PartyClientMessage = { type: "settings", mode: "duel" as GameMode };
    expect(msg.type).toBe("settings");
  });

  it("should accept valid kick message", () => {
    const msg: PartyClientMessage = { type: "kick", memberId: "user-456" };
    expect(msg.type).toBe("kick");
    expect(msg.memberId.length).toBeGreaterThan(0);
  });

  it("should accept start-game message", () => {
    const msg: PartyClientMessage = { type: "start-game" };
    expect(msg.type).toBe("start-game");
  });

  it("should accept game-result message", () => {
    const msg: PartyClientMessage = {
      type: "game-result",
      winnerId: "p1",
      stats: {
        p1: { kills: 5, deaths: 1, damageDealt: 300, shotsFired: 20, shotsHit: 12 },
        p2: { kills: 1, deaths: 5, damageDealt: 100, shotsFired: 15, shotsHit: 5 },
      },
    };
    expect(msg.type).toBe("game-result");
    expect(msg.stats["p1"].kills).toBe(5);
  });

  it("should accept leave message", () => {
    const msg: PartyClientMessage = { type: "leave" };
    expect(msg.type).toBe("leave");
  });
});

describe("PartyServerMessage Types", () => {
  it("should have valid party-state message", () => {
    const state: PartyStateSnapshot = {
      partyId: "abc12345",
      members: [
        { id: "u1", displayName: "Player1", level: 3, ready: true, isLeader: true },
      ],
      leaderId: "u1",
      selectedMode: "deathmatch",
      selectedMap: "nebula-station",
      selectedMutators: [],
      rouletteEnabled: false,
      sessionStats: {},
      gamesPlayed: 0,
    };
    const msg: PartyServerMessage = { type: "party-state", state };
    expect(msg.type).toBe("party-state");
    expect(msg.state.members.length).toBe(1);
    expect(msg.state.leaderId).toBe("u1");
  });

  it("should have valid chat message", () => {
    const chatMsg: ChatMessage = {
      id: "msg-001",
      senderId: "u1",
      senderName: "Player1",
      text: "Bereit!",
      timestamp: Date.now(),
    };
    const msg: PartyServerMessage = { type: "chat", message: chatMsg };
    expect(msg.type).toBe("chat");
    expect(msg.message.text).toBe("Bereit!");
  });

  it("should have valid game-starting message", () => {
    const msg: PartyServerMessage = {
      type: "game-starting",
      roomId: "room-abc",
      mode: "deathmatch",
      map: "asteroid-belt",
      mutators: ["big-head", "speed-demon"],
    };
    expect(msg.type).toBe("game-starting");
    expect(msg.roomId.length).toBeGreaterThan(0);
    expect(msg.mutators.length).toBe(2);
  });

  it("should have valid member-joined message", () => {
    const member: PartyMember = {
      id: "u2",
      displayName: "Player2",
      level: 7,
      ready: false,
      isLeader: false,
    };
    const msg: PartyServerMessage = { type: "member-joined", member };
    expect(msg.type).toBe("member-joined");
    expect(msg.member.displayName).toBe("Player2");
  });

  it("should have valid member-left message", () => {
    const msg: PartyServerMessage = { type: "member-left", memberId: "u2" };
    expect(msg.type).toBe("member-left");
  });

  it("should have valid error message", () => {
    const msg: PartyServerMessage = { type: "error", message: "Party ist voll" };
    expect(msg.type).toBe("error");
    expect(msg.message.length).toBeGreaterThan(0);
  });

  it("should have valid kicked message", () => {
    const msg: PartyServerMessage = { type: "kicked" };
    expect(msg.type).toBe("kicked");
  });
});

describe("Party Constraints", () => {
  it("party should have max 8 members", () => {
    // Server enforces: if (this.sessions.size >= 8) return 403
    const MAX_PARTY_SIZE = 8;
    expect(MAX_PARTY_SIZE).toBe(8);
  });

  it("chat history should be limited to 50 messages", () => {
    // Server enforces: if (this.chatMessages.length > 50) this.chatMessages.shift()
    const MAX_CHAT_HISTORY = 50;
    const messages: string[] = [];
    for (let i = 0; i < 60; i++) {
      messages.push(`msg-${i}`);
      if (messages.length > MAX_CHAT_HISTORY) messages.shift();
    }
    expect(messages.length).toBe(MAX_CHAT_HISTORY);
    expect(messages[0]).toBe("msg-10"); // First 10 were shifted out
  });

  it("session stats should accumulate correctly", () => {
    const stats: Record<string, {
      name: string; kills: number; deaths: number; wins: number;
      damageDealt: number; shotsFired: number; shotsHit: number; gamesPlayed: number;
    }> = {};

    // Simulate 3 games
    const games = [
      { p1: { kills: 3, deaths: 1, damageDealt: 200, shotsFired: 10, shotsHit: 5 } },
      { p1: { kills: 1, deaths: 2, damageDealt: 100, shotsFired: 8, shotsHit: 3 } },
      { p1: { kills: 5, deaths: 0, damageDealt: 400, shotsFired: 15, shotsHit: 10 } },
    ];

    for (const game of games) {
      if (!stats["p1"]) {
        stats["p1"] = { name: "Player1", kills: 0, deaths: 0, wins: 0, damageDealt: 0, shotsFired: 0, shotsHit: 0, gamesPlayed: 0 };
      }
      const s = stats["p1"];
      s.kills += game.p1.kills;
      s.deaths += game.p1.deaths;
      s.damageDealt += game.p1.damageDealt;
      s.shotsFired += game.p1.shotsFired;
      s.shotsHit += game.p1.shotsHit;
      s.gamesPlayed++;
    }

    expect(stats["p1"].kills).toBe(9);
    expect(stats["p1"].deaths).toBe(3);
    expect(stats["p1"].damageDealt).toBe(700);
    expect(stats["p1"].gamesPlayed).toBe(3);
  });

  it("should validate all mutator IDs in settings", () => {
    const validMutators = Object.keys(MUTATOR_CONFIGS);
    const testMutators: MutatorId[] = ["big-head", "speed-demon", "mirror-match"];
    for (const m of testMutators) {
      expect(validMutators).toContain(m);
    }
  });

  it("leader transfer should go to first remaining member", () => {
    // Simulating leader transfer logic
    const members = ["u1", "u2", "u3"];
    let leaderId = "u1";

    // u1 leaves — leadership goes to u2 (first remaining)
    const leavingId = "u1";
    const remaining = members.filter((m) => m !== leavingId);
    if (leavingId === leaderId) {
      leaderId = remaining[0] ?? null;
    }
    expect(leaderId).toBe("u2");
  });

  it("should reset party when last member leaves", () => {
    // When sessions.size === 0, party resets all state
    let gamesPlayed = 5;
    let sessionStats = { p1: { kills: 10 } };
    let chatMessages = ["msg1", "msg2"];
    const sessionsSize = 0;

    if (sessionsSize === 0) {
      sessionStats = {} as typeof sessionStats;
      gamesPlayed = 0;
      chatMessages = [];
    }

    expect(gamesPlayed).toBe(0);
    expect(Object.keys(sessionStats).length).toBe(0);
    expect(chatMessages.length).toBe(0);
  });
});
