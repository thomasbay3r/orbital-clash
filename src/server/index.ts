import { GameRoom } from "./game-room";
import { sendPasswordResetEmail } from "./email";
import { generateGuestName } from "./guest-names";
import type { AuthUser, FriendInfo, PresenceStatus } from "../shared/types";

export { GameRoom };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  DB: D1Database;
  KV: KVNamespace;
  RESEND_API_KEY: string;
  APP_URL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // WebSocket upgrade for game rooms
    if (url.pathname.startsWith("/ws/room/")) {
      const roomId = url.pathname.split("/ws/room/")[1];
      if (!roomId) return new Response("Missing room ID", { status: 400 });
      const id = env.GAME_ROOM.idFromName(roomId);
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }

    // Room info/configure (forwarded to Durable Object)
    if (url.pathname.startsWith("/api/rooms/") && url.pathname.includes("/")) {
      const parts = url.pathname.replace("/api/rooms/", "").split("/");
      const roomId = parts[0];
      const action = parts[1];
      if (roomId && action) {
        const id = env.GAME_ROOM.idFromName(roomId);
        const room = env.GAME_ROOM.get(id);
        const roomUrl = new URL(request.url);
        roomUrl.pathname = `/${action}`;
        return room.fetch(new Request(roomUrl.toString(), request));
      }
    }

    if (url.pathname.startsWith("/api/")) {
      const response = await handleApi(url, request, env);
      return addCors(response);
    }

    return new Response("Not found", { status: 404 });
  },
};

// ===== API Router =====

async function handleApi(url: URL, request: Request, env: Env): Promise<Response> {
  const path = url.pathname.replace("/api", "");
  const method = request.method;

  try {
    // Health check
    if (path === "/health") return Response.json({ status: "ok" });

    // Create room
    if (path === "/rooms/create" && method === "POST") {
      const roomId = crypto.randomUUID().slice(0, 8);
      return Response.json({ roomId });
    }

    // ===== Guest Auth =====
    if (path === "/auth/guest" && method === "POST") return handleGuestAuth(request, env);
    if (path === "/auth/me" && method === "GET") return handleGetMe(request, env);

    // ===== Account Auth =====
    if (path === "/auth/register" && method === "POST") return handleRegister(request, env);
    if (path === "/auth/login" && method === "POST") return handleLogin(request, env);
    if (path === "/auth/forgot-password" && method === "POST") return handleForgotPassword(request, env);
    if (path === "/auth/reset-password" && method === "POST") return handleResetPassword(request, env);

    // ===== Profile =====
    if (path === "/profile" && method === "GET") return handleGetProfile(request, env);

    // ===== Friends =====
    if (path === "/friends" && method === "GET") return handleGetFriends(request, env);
    if (path === "/friends/requests" && method === "GET") return handleGetFriendRequests(request, env);
    if (path === "/friends/request" && method === "POST") return handleSendFriendRequest(request, env);
    if (path === "/friends/accept" && method === "POST") return handleAcceptFriendRequest(request, env);
    if (path === "/friends/reject" && method === "POST") return handleRejectFriendRequest(request, env);
    if (path.startsWith("/friends/") && method === "DELETE") {
      const friendId = path.replace("/friends/", "");
      return handleRemoveFriend(request, env, friendId);
    }
    if (path === "/friends/search" && method === "GET") return handleSearchUsers(request, env, url);
    if (path === "/friends/recent" && method === "GET") return handleRecentPlayers(request, env);

    // ===== Presence =====
    if (path === "/presence" && method === "POST") return handlePresenceHeartbeat(request, env);
    if (path === "/presence/check" && method === "POST") return handlePresenceCheck(request, env);

    // ===== Invites =====
    if (path === "/invites/send" && method === "POST") return handleSendInvite(request, env);
    if (path === "/invites" && method === "GET") return handleGetInvites(request, env);
    if (path === "/invites/dismiss" && method === "POST") return handleDismissInvite(request, env);

    // ===== Matchmaking =====
    if (path === "/matchmaking/join" && method === "POST") return handleMatchmakingJoin(request, env);
    if (path === "/matchmaking/leave" && method === "POST") return handleMatchmakingLeave(request, env);
    if (path === "/matchmaking/status" && method === "GET") return handleMatchmakingStatus(request, env);

    // ===== Match Results =====
    if (path === "/match/complete" && method === "POST") return handleMatchComplete(request, env);

    // ===== Leaderboard =====
    if (path === "/leaderboard") return handleLeaderboard(env);

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// ===== Guest Auth =====

async function handleGuestAuth(request: Request, env: Env): Promise<Response> {
  // Check for existing guest token
  const existingToken = getToken(request);
  if (existingToken) {
    const guest = await env.DB.prepare(
      "SELECT id, display_name, token, xp, level FROM guest_sessions WHERE token = ?",
    ).bind(existingToken).first();
    if (guest) {
      await env.DB.prepare("UPDATE guest_sessions SET last_seen = datetime('now') WHERE id = ?")
        .bind(guest.id).run();
      return Response.json({
        id: guest.id,
        displayName: guest.display_name,
        token: guest.token,
        xp: guest.xp,
        level: guest.level,
      });
    }
  }

  // Create new guest
  const displayName = generateGuestName();
  const token = crypto.randomUUID();
  const id = crypto.randomUUID().slice(0, 16);

  await env.DB.prepare(
    "INSERT INTO guest_sessions (id, display_name, token) VALUES (?, ?, ?)",
  ).bind(id, displayName, token).run();

  return Response.json({ id, displayName, token, xp: 0, level: 1 });
}

async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(user);
}

// ===== Account Auth =====

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    email?: string; username?: string; password?: string; guestToken?: string;
  };
  const { email, username, password, guestToken } = body;

  if (!email || !username || !password) {
    return Response.json({ error: "E-Mail, Benutzername und Passwort erforderlich" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Ungueltige E-Mail-Adresse" }, { status: 400 });
  }
  if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return Response.json({ error: "Benutzername: 3-20 Zeichen, alphanumerisch + Unterstrich" }, { status: 400 });
  }
  if (password.length < 6) {
    return Response.json({ error: "Passwort muss mindestens 6 Zeichen haben" }, { status: 400 });
  }

  // Check unique email and username
  const existingEmail = await env.DB.prepare("SELECT id FROM accounts WHERE email = ?").bind(email).first();
  if (existingEmail) return Response.json({ error: "E-Mail bereits registriert" }, { status: 409 });

  const existingUsername = await env.DB.prepare("SELECT id FROM accounts WHERE username = ?").bind(username).first();
  if (existingUsername) return Response.json({ error: "Benutzername bereits vergeben" }, { status: 409 });

  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID().slice(0, 16);

  // Migrate guest data if guestToken provided
  let startXp = 0;
  let startLevel = 1;
  if (guestToken) {
    const guest = await env.DB.prepare("SELECT xp, level FROM guest_sessions WHERE token = ?")
      .bind(guestToken).first();
    if (guest) {
      startXp = guest.xp as number;
      startLevel = guest.level as number;
      await env.DB.prepare("DELETE FROM guest_sessions WHERE token = ?").bind(guestToken).run();
    }
  }

  await env.DB.prepare(
    "INSERT INTO accounts (id, username, email, password_hash, xp, level) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id, username, email, passwordHash, startXp, startLevel).run();

  const token = await generateToken(id, "account");
  return Response.json({ id, username, token });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json() as { email?: string; password?: string };
  if (!email || !password) {
    return Response.json({ error: "E-Mail und Passwort erforderlich" }, { status: 400 });
  }

  const account = await env.DB.prepare(
    "SELECT id, username, password_hash, xp, level, rank, wins, losses, eliminations FROM accounts WHERE email = ?",
  ).bind(email).first();

  if (!account) return Response.json({ error: "Ungueltige Anmeldedaten" }, { status: 401 });

  const valid = await verifyPassword(password, account.password_hash as string);
  if (!valid) return Response.json({ error: "Ungueltige Anmeldedaten" }, { status: 401 });

  const token = await generateToken(account.id as string, "account");
  return Response.json({
    id: account.id, username: account.username, token,
    xp: account.xp, level: account.level, rank: account.rank,
    wins: account.wins, losses: account.losses, eliminations: account.eliminations,
  });
}

async function handleForgotPassword(request: Request, env: Env): Promise<Response> {
  const { email } = await request.json() as { email?: string };
  if (!email) return Response.json({ error: "E-Mail erforderlich" }, { status: 400 });

  // Always return success (don't leak whether email exists)
  const account = await env.DB.prepare("SELECT id FROM accounts WHERE email = ?").bind(email).first();
  if (account) {
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    await env.DB.prepare(
      "INSERT INTO password_resets (account_id, token, expires_at) VALUES (?, ?, ?)",
    ).bind(account.id, resetToken, expiresAt).run();

    await sendPasswordResetEmail(env, email, resetToken);
  }

  return Response.json({ ok: true, message: "Falls ein Konto existiert, wurde eine E-Mail gesendet." });
}

async function handleResetPassword(request: Request, env: Env): Promise<Response> {
  const { token, newPassword } = await request.json() as { token?: string; newPassword?: string };
  if (!token || !newPassword) return Response.json({ error: "Token und neues Passwort erforderlich" }, { status: 400 });
  if (newPassword.length < 6) return Response.json({ error: "Passwort muss mindestens 6 Zeichen haben" }, { status: 400 });

  const reset = await env.DB.prepare(
    "SELECT id, account_id, expires_at, used FROM password_resets WHERE token = ?",
  ).bind(token).first();

  if (!reset || reset.used || new Date(reset.expires_at as string) < new Date()) {
    return Response.json({ error: "Ungueltiger oder abgelaufener Reset-Link" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, reset.account_id).run();
  await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(reset.id).run();

  return Response.json({ ok: true });
}

// ===== Profile =====

async function handleGetProfile(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (user.type === "guest") {
    return Response.json({
      type: "guest", id: user.id, displayName: user.displayName, level: user.level,
    });
  }

  const account = await env.DB.prepare(
    `SELECT id, username, xp, level, rank, wins, losses, eliminations, total_games,
     total_damage, total_gravity_kills, equipped_skin, equipped_trail,
     equipped_kill_effect, equipped_title, equipped_badge
     FROM accounts WHERE id = ?`,
  ).bind(user.id).first();

  if (!account) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  return Response.json({ type: "account", ...account });
}

// ===== Friends =====

async function handleGetFriends(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") {
    return Response.json({ error: "Nur fuer registrierte Konten" }, { status: 403 });
  }

  const friendRows = await env.DB.prepare(
    `SELECT a.id, a.username, a.level, a.rank, a.equipped_title, a.equipped_badge
     FROM friends f JOIN accounts a ON f.friend_id = a.id
     WHERE f.account_id = ?`,
  ).bind(user.id).all();

  const friends: FriendInfo[] = [];
  for (const row of friendRows.results) {
    let presence: PresenceStatus = "offline";
    let roomId: string | undefined;

    const kvData = await env.KV.get(`presence:${row.id}`, "json") as
      { status: string; roomId?: string; timestamp: number } | null;
    if (kvData && Date.now() - kvData.timestamp < 60000) {
      presence = kvData.status as PresenceStatus;
      roomId = kvData.roomId;
    }

    friends.push({
      id: row.id as string,
      username: row.username as string,
      level: row.level as number,
      rank: row.rank as string as FriendInfo["rank"],
      presence,
      roomId,
      equippedTitle: row.equipped_title as string,
      equippedBadge: row.equipped_badge as string,
    });
  }

  return Response.json(friends);
}

async function handleGetFriendRequests(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") {
    return Response.json({ error: "Nur fuer registrierte Konten" }, { status: 403 });
  }

  const incoming = await env.DB.prepare(
    `SELECT fr.id, fr.from_id, a.username as from_username, fr.to_id, fr.created_at, fr.status
     FROM friend_requests fr JOIN accounts a ON fr.from_id = a.id
     WHERE fr.to_id = ? AND fr.status = 'pending'`,
  ).bind(user.id).all();

  const outgoing = await env.DB.prepare(
    `SELECT fr.id, fr.to_id, a.username as to_username, fr.from_id, fr.created_at, fr.status
     FROM friend_requests fr JOIN accounts a ON fr.to_id = a.id
     WHERE fr.from_id = ? AND fr.status = 'pending'`,
  ).bind(user.id).all();

  return Response.json({
    incoming: incoming.results.map((r) => ({
      id: r.id, fromId: r.from_id, fromUsername: r.from_username,
      toId: r.to_id, createdAt: r.created_at, status: r.status,
    })),
    outgoing: outgoing.results.map((r) => ({
      id: r.id, fromId: r.from_id, toId: r.to_id,
      toUsername: r.to_username, createdAt: r.created_at, status: r.status,
    })),
  });
}

async function handleSendFriendRequest(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") {
    return Response.json({ error: "Nur fuer registrierte Konten" }, { status: 403 });
  }

  const { username } = await request.json() as { username?: string };
  if (!username) return Response.json({ error: "Benutzername erforderlich" }, { status: 400 });

  const target = await env.DB.prepare("SELECT id FROM accounts WHERE username = ?")
    .bind(username).first();
  if (!target) return Response.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
  if (target.id === user.id) return Response.json({ error: "Kann sich nicht selbst hinzufuegen" }, { status: 400 });

  // Check not already friends
  const existing = await env.DB.prepare(
    "SELECT id FROM friends WHERE account_id = ? AND friend_id = ?",
  ).bind(user.id, target.id).first();
  if (existing) return Response.json({ error: "Bereits befreundet" }, { status: 409 });

  // Check no pending request
  const pendingReq = await env.DB.prepare(
    "SELECT id FROM friend_requests WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND status = 'pending'",
  ).bind(user.id, target.id, target.id, user.id).first();
  if (pendingReq) return Response.json({ error: "Anfrage bereits gesendet" }, { status: 409 });

  await env.DB.prepare(
    "INSERT INTO friend_requests (from_id, to_id) VALUES (?, ?)",
  ).bind(user.id, target.id).run();

  return Response.json({ ok: true });
}

async function handleAcceptFriendRequest(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") {
    return Response.json({ error: "Nur fuer registrierte Konten" }, { status: 403 });
  }

  const { requestId } = await request.json() as { requestId?: string };
  if (!requestId) return Response.json({ error: "Request-ID erforderlich" }, { status: 400 });

  const req = await env.DB.prepare(
    "SELECT id, from_id, to_id FROM friend_requests WHERE id = ? AND to_id = ? AND status = 'pending'",
  ).bind(requestId, user.id).first();
  if (!req) return Response.json({ error: "Anfrage nicht gefunden" }, { status: 404 });

  // Create bidirectional friendship
  await env.DB.batch([
    env.DB.prepare("INSERT INTO friends (account_id, friend_id) VALUES (?, ?)").bind(req.from_id, req.to_id),
    env.DB.prepare("INSERT INTO friends (account_id, friend_id) VALUES (?, ?)").bind(req.to_id, req.from_id),
    env.DB.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").bind(requestId),
  ]);

  return Response.json({ ok: true });
}

async function handleRejectFriendRequest(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") {
    return Response.json({ error: "Nur fuer registrierte Konten" }, { status: 403 });
  }

  const { requestId } = await request.json() as { requestId?: string };
  if (!requestId) return Response.json({ error: "Request-ID erforderlich" }, { status: 400 });

  await env.DB.prepare(
    "UPDATE friend_requests SET status = 'rejected' WHERE id = ? AND to_id = ? AND status = 'pending'",
  ).bind(requestId, user.id).run();

  return Response.json({ ok: true });
}

async function handleRemoveFriend(request: Request, env: Env, friendId: string): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") {
    return Response.json({ error: "Nur fuer registrierte Konten" }, { status: 403 });
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM friends WHERE account_id = ? AND friend_id = ?").bind(user.id, friendId),
    env.DB.prepare("DELETE FROM friends WHERE account_id = ? AND friend_id = ?").bind(friendId, user.id),
  ]);

  return Response.json({ ok: true });
}

async function handleSearchUsers(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") {
    return Response.json({ error: "Nur fuer registrierte Konten" }, { status: 403 });
  }

  const q = url.searchParams.get("q");
  if (!q || q.length < 2) return Response.json([]);

  const results = await env.DB.prepare(
    "SELECT id, username, level, rank FROM accounts WHERE username LIKE ? AND id != ? LIMIT 10",
  ).bind(`${q}%`, user.id).all();

  return Response.json(results.results.map((r) => ({
    id: r.id, username: r.username, level: r.level, rank: r.rank,
  })));
}

async function handleRecentPlayers(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") {
    return Response.json({ error: "Nur fuer registrierte Konten" }, { status: 403 });
  }

  const results = await env.DB.prepare(
    `SELECT a.id, a.username, a.level, a.rank, rp.last_played
     FROM recent_players rp JOIN accounts a ON rp.other_id = a.id
     WHERE rp.account_id = ? ORDER BY rp.last_played DESC LIMIT 20`,
  ).bind(user.id).all();

  return Response.json(results.results);
}

// ===== Presence =====

async function handlePresenceHeartbeat(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { status, roomId } = await request.json() as { status?: string; roomId?: string };
  if (!status) return Response.json({ error: "Status erforderlich" }, { status: 400 });

  await env.KV.put(
    `presence:${user.id}`,
    JSON.stringify({ status, roomId, timestamp: Date.now() }),
    { expirationTtl: 120 },
  );

  return Response.json({ ok: true });
}

async function handlePresenceCheck(request: Request, env: Env): Promise<Response> {
  const { userIds } = await request.json() as { userIds?: string[] };
  if (!userIds || !Array.isArray(userIds)) return Response.json({});

  const result: Record<string, { status: PresenceStatus; roomId?: string }> = {};
  for (const uid of userIds.slice(0, 50)) {
    const data = await env.KV.get(`presence:${uid}`, "json") as
      { status: string; roomId?: string; timestamp: number } | null;
    if (data && Date.now() - data.timestamp < 60000) {
      result[uid] = { status: data.status as PresenceStatus, roomId: data.roomId };
    } else {
      result[uid] = { status: "offline" };
    }
  }

  return Response.json(result);
}

// ===== Invites =====

async function handleSendInvite(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { targetId, roomId } = await request.json() as { targetId?: string; roomId?: string };
  if (!targetId || !roomId) return Response.json({ error: "Target und Room-ID erforderlich" }, { status: 400 });

  await env.KV.put(
    `invite:${targetId}:${user.id}`,
    JSON.stringify({
      fromId: user.id,
      fromName: user.displayName,
      roomId,
      expiresAt: Date.now() + 60000,
    }),
    { expirationTtl: 60 },
  );

  return Response.json({ ok: true });
}

async function handleGetInvites(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const list = await env.KV.list({ prefix: `invite:${user.id}:` });
  const invites = [];

  for (const key of list.keys) {
    const data = await env.KV.get(key.name, "json") as {
      fromId: string; fromName: string; roomId: string; expiresAt: number;
    } | null;
    if (data && data.expiresAt > Date.now()) {
      invites.push({ id: key.name, ...data });
    }
  }

  return Response.json(invites);
}

async function handleDismissInvite(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteId } = await request.json() as { inviteId?: string };
  if (!inviteId) return Response.json({ error: "Invite-ID erforderlich" }, { status: 400 });

  await env.KV.delete(inviteId);
  return Response.json({ ok: true });
}

// ===== Matchmaking =====

async function handleMatchmakingJoin(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { shipClass, mods, controlMode } = await request.json() as {
    shipClass?: string; mods?: object; controlMode?: string;
  };

  // Add to queue
  const entry = {
    playerId: user.id,
    playerName: user.displayName,
    shipClass: shipClass || "viper",
    mods: mods || { weapon: "piercing", ship: "afterburner", passive: "scavenger" },
    controlMode: controlMode || "absolute",
    joinedAt: Date.now(),
  };

  await env.KV.put(
    `queue:${Date.now()}:${user.id}`,
    JSON.stringify(entry),
    { expirationTtl: 120 },
  );

  // Check if we can match
  const matched = await tryMatchPlayers(env);
  if (matched) {
    // Check if current player was matched
    const matchInfo = await env.KV.get(`matched:${user.id}`);
    if (matchInfo) {
      return Response.json({ status: "matched", roomId: matchInfo });
    }
  }

  return Response.json({ status: "queued" });
}

async function handleMatchmakingLeave(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Find and delete queue entry
  const list = await env.KV.list({ prefix: "queue:" });
  for (const key of list.keys) {
    if (key.name.endsWith(`:${user.id}`)) {
      await env.KV.delete(key.name);
    }
  }
  await env.KV.delete(`matched:${user.id}`);

  return Response.json({ ok: true });
}

async function handleMatchmakingStatus(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Check if matched
  const matchedRoom = await env.KV.get(`matched:${user.id}`);
  if (matchedRoom) {
    await env.KV.delete(`matched:${user.id}`);
    return Response.json({ status: "matched", roomId: matchedRoom });
  }

  // Count queue
  const list = await env.KV.list({ prefix: "queue:" });
  const inQueue = list.keys.some((k) => k.name.endsWith(`:${user.id}`));

  if (!inQueue) {
    return Response.json({ status: "not-queued", playersInQueue: list.keys.length });
  }

  // Check queue age — if player waited > 30s, create bot-filled room
  for (const key of list.keys) {
    if (key.name.endsWith(`:${user.id}`)) {
      const data = await env.KV.get(key.name, "json") as { joinedAt: number } | null;
      if (data && Date.now() - data.joinedAt > 30000) {
        const roomId = crypto.randomUUID().slice(0, 8);
        await env.KV.put(`matched:${user.id}`, roomId, { expirationTtl: 30 });
        await env.KV.delete(key.name);
        return Response.json({ status: "matched", roomId, botFilled: true });
      }
    }
  }

  return Response.json({ status: "queued", playersInQueue: list.keys.length });
}

async function tryMatchPlayers(env: Env): Promise<boolean> {
  const list = await env.KV.list({ prefix: "queue:" });
  if (list.keys.length < 4) return false;

  // Take first 4 players
  const matchedKeys = list.keys.slice(0, 4);
  const roomId = crypto.randomUUID().slice(0, 8);

  for (const key of matchedKeys) {
    const data = await env.KV.get(key.name, "json") as { playerId: string } | null;
    if (data) {
      await env.KV.put(`matched:${data.playerId}`, roomId, { expirationTtl: 30 });
    }
    await env.KV.delete(key.name);
  }

  return true;
}

// ===== Match Results =====

async function handleMatchComplete(request: Request, env: Env): Promise<Response> {
  const { matchId, mode, map, duration, players } = await request.json() as {
    matchId: string; mode: string; map: string; duration: number;
    players: Array<{
      id: string; name: string; shipClass: string; score: number;
      eliminations: number; deaths: number; damageDealt: number;
      accuracy: number; gravityKills: number; won: boolean;
    }>;
  };

  const winnerId = players.find((p) => p.won)?.id ?? null;
  await env.DB.prepare(
    "INSERT INTO matches (id, mode, map, duration_seconds, winner_id) VALUES (?, ?, ?, ?, ?)",
  ).bind(matchId, mode, map, duration, winnerId).run();

  for (const p of players) {
    await env.DB.prepare(
      `INSERT INTO match_players (match_id, player_id, player_name, ship_class, score,
       eliminations, deaths, damage_dealt, accuracy, gravity_kills)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(matchId, p.id, p.name, p.shipClass, p.score, p.eliminations, p.deaths,
      p.damageDealt, p.accuracy, p.gravityKills).run();

    // Update account stats (only for registered accounts)
    const xpGain = 50 + p.eliminations * 10 + (p.won ? 20 : 0);
    await env.DB.prepare(
      `UPDATE accounts SET
        xp = xp + ?, level = (xp + ?) / 200 + 1,
        wins = wins + ?, losses = losses + ?,
        eliminations = eliminations + ?, total_games = total_games + 1,
        total_damage = total_damage + ?, total_gravity_kills = total_gravity_kills + ?,
        rank = CASE
          WHEN (xp + ?) / 200 + 1 >= 45 THEN 'diamond'
          WHEN (xp + ?) / 200 + 1 >= 30 THEN 'platinum'
          WHEN (xp + ?) / 200 + 1 >= 15 THEN 'gold'
          WHEN (xp + ?) / 200 + 1 >= 5 THEN 'silver'
          ELSE 'bronze'
        END
      WHERE id = ?`,
    ).bind(xpGain, xpGain, p.won ? 1 : 0, p.won ? 0 : 1, p.eliminations,
      p.damageDealt, p.gravityKills, xpGain, xpGain, xpGain, xpGain, p.id).run();

    // Track recent players
    for (const other of players) {
      if (other.id === p.id) continue;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO recent_players (account_id, other_id, last_played)
         VALUES (?, ?, datetime('now'))`,
      ).bind(p.id, other.id).run();
    }
  }

  return Response.json({ ok: true });
}

// ===== Leaderboard =====

async function handleLeaderboard(env: Env): Promise<Response> {
  const results = await env.DB.prepare(
    "SELECT username, level, rank, wins, eliminations FROM accounts ORDER BY xp DESC LIMIT 20",
  ).all();
  return Response.json(results.results);
}

// ===== Auth Helpers =====

function getToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function authenticateUser(request: Request, env: Env): Promise<AuthUser | null> {
  const token = getToken(request);
  if (!token) return null;

  // Try to decode as account token
  try {
    const [payloadB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64)) as { id: string; type: string; exp: number };
    if (payload.exp < Date.now()) return null;

    if (payload.type === "account") {
      const account = await env.DB.prepare(
        "SELECT id, username, level FROM accounts WHERE id = ?",
      ).bind(payload.id).first();
      if (account) {
        return {
          type: "account",
          id: account.id as string,
          displayName: account.username as string,
          level: account.level as number,
        };
      }
    }
  } catch {
    // Not a structured token — try as guest UUID token
  }

  // Try as guest token (plain UUID)
  const guest = await env.DB.prepare(
    "SELECT id, display_name, level FROM guest_sessions WHERE token = ?",
  ).bind(token).first();
  if (guest) {
    return {
      type: "guest",
      id: guest.id as string,
      displayName: guest.display_name as string,
      level: guest.level as number,
    };
  }

  return null;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256,
  );
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, storedHashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256,
  );
  const hashHex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex === storedHashHex;
}

async function generateToken(userId: string, type: "account" | "guest"): Promise<string> {
  const payload = JSON.stringify({ id: userId, type, exp: Date.now() + 86400000 * 7 }); // 7 days
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return btoa(payload) + "." + hash;
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function addCors(response: Response): Response {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(corsHeaders())) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
}
