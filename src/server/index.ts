import { GameRoom } from "./game-room";

export { GameRoom };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for API
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // WebSocket upgrade for game rooms
    if (url.pathname.startsWith("/ws/room/")) {
      const roomId = url.pathname.split("/ws/room/")[1];
      if (!roomId) {
        return new Response("Missing room ID", { status: 400 });
      }
      const id = env.GAME_ROOM.idFromName(roomId);
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }

    // Room info/configure (forwarded to Durable Object)
    if (url.pathname.startsWith("/api/rooms/") && url.pathname.includes("/")) {
      const parts = url.pathname.replace("/api/rooms/", "").split("/");
      const roomId = parts[0];
      const action = parts[1]; // "info" or "configure"
      if (roomId && action) {
        const id = env.GAME_ROOM.idFromName(roomId);
        const room = env.GAME_ROOM.get(id);
        const roomUrl = new URL(request.url);
        roomUrl.pathname = `/${action}`;
        return room.fetch(new Request(roomUrl.toString(), request));
      }
    }

    // API routes
    if (url.pathname.startsWith("/api/")) {
      const response = await handleApi(url, request, env);
      return addCors(response);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleApi(url: URL, request: Request, env: Env): Promise<Response> {
  const path = url.pathname.replace("/api", "");

  // Health check
  if (path === "/health") {
    return Response.json({ status: "ok" });
  }

  // Create room
  if (path === "/rooms/create" && request.method === "POST") {
    const roomId = crypto.randomUUID().slice(0, 8);
    return Response.json({ roomId });
  }

  // ===== Auth =====

  if (path === "/auth/register" && request.method === "POST") {
    const { username, password } = await request.json() as { username: string; password: string };

    if (!username || !password || username.length < 3 || password.length < 4) {
      return Response.json({ error: "Username (3+ chars) and password (4+ chars) required" }, { status: 400 });
    }

    if (username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
      return Response.json({ error: "Username: 3-20 alphanumeric characters" }, { status: 400 });
    }

    // Check if username exists
    const existing = await env.DB.prepare("SELECT id FROM players WHERE username = ?").bind(username).first();
    if (existing) {
      return Response.json({ error: "Username taken" }, { status: 409 });
    }

    // Hash password (using simple PBKDF2 for Workers compatibility)
    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();

    await env.DB.prepare(
      "INSERT INTO players (id, username, password_hash) VALUES (?, ?, ?)",
    ).bind(id, username, passwordHash).run();

    const token = await generateToken(id);
    return Response.json({ id, username, token });
  }

  if (path === "/auth/login" && request.method === "POST") {
    const { username, password } = await request.json() as { username: string; password: string };

    const player = await env.DB.prepare(
      "SELECT id, username, password_hash, xp, level, rank, wins, losses, eliminations FROM players WHERE username = ?",
    ).bind(username).first();

    if (!player) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, player.password_hash as string);
    if (!valid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await generateToken(player.id as string);
    return Response.json({
      id: player.id,
      username: player.username,
      token,
      xp: player.xp,
      level: player.level,
      rank: player.rank,
      wins: player.wins,
      losses: player.losses,
      eliminations: player.eliminations,
    });
  }

  // ===== Player Profile =====

  if (path === "/profile" && request.method === "GET") {
    const playerId = await authenticate(request);
    if (!playerId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const player = await env.DB.prepare(
      "SELECT id, username, xp, level, rank, wins, losses, eliminations FROM players WHERE id = ?",
    ).bind(playerId).first();

    if (!player) {
      return Response.json({ error: "Player not found" }, { status: 404 });
    }

    // Get unlocked mods
    const mods = await env.DB.prepare(
      "SELECT mod_id FROM player_mods WHERE player_id = ?",
    ).bind(playerId).all();

    // Get unlocked cosmetics
    const cosmetics = await env.DB.prepare(
      "SELECT cosmetic_id, cosmetic_type FROM player_cosmetics WHERE player_id = ?",
    ).bind(playerId).all();

    return Response.json({
      ...player,
      unlockedMods: mods.results.map((m) => m.mod_id),
      unlockedCosmetics: cosmetics.results,
    });
  }

  // ===== Match Results =====

  if (path === "/match/complete" && request.method === "POST") {
    const { matchId, mode, map, duration, players } = await request.json() as {
      matchId: string;
      mode: string;
      map: string;
      duration: number;
      players: Array<{
        id: string;
        shipClass: string;
        score: number;
        eliminations: number;
        deaths: number;
        won: boolean;
      }>;
    };

    // Record match
    const winnerId = players.find((p) => p.won)?.id ?? null;
    await env.DB.prepare(
      "INSERT INTO matches (id, mode, map, duration_seconds, winner_id) VALUES (?, ?, ?, ?, ?)",
    ).bind(matchId, mode, map, duration, winnerId).run();

    // Update each player
    for (const p of players) {
      // Record match participation
      await env.DB.prepare(
        "INSERT INTO match_players (match_id, player_id, ship_class, score, eliminations, deaths) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(matchId, p.id, p.shipClass, p.score, p.eliminations, p.deaths).run();

      // Update player stats
      const xpGain = 25 + p.eliminations * 50 + (p.won ? 100 : 0);
      await env.DB.prepare(
        `UPDATE players SET
          xp = xp + ?,
          level = (xp + ?) / 200 + 1,
          wins = wins + ?,
          losses = losses + ?,
          eliminations = eliminations + ?,
          rank = CASE
            WHEN (xp + ?) / 200 + 1 >= 45 THEN 'diamond'
            WHEN (xp + ?) / 200 + 1 >= 30 THEN 'platinum'
            WHEN (xp + ?) / 200 + 1 >= 15 THEN 'gold'
            WHEN (xp + ?) / 200 + 1 >= 5 THEN 'silver'
            ELSE 'bronze'
          END
        WHERE id = ?`,
      ).bind(xpGain, xpGain, p.won ? 1 : 0, p.won ? 0 : 1, p.eliminations,
        xpGain, xpGain, xpGain, xpGain, p.id).run();
    }

    return Response.json({ ok: true });
  }

  // ===== Leaderboard =====

  if (path === "/leaderboard") {
    const results = await env.DB.prepare(
      "SELECT username, level, rank, wins, eliminations FROM players ORDER BY xp DESC LIMIT 20",
    ).all();
    return Response.json(results.results);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

// ===== Auth Helpers =====

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

async function generateToken(playerId: string): Promise<string> {
  const payload = JSON.stringify({ id: playerId, exp: Date.now() + 86400000 });
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return btoa(payload) + "." + hash;
}

async function authenticate(request: Request): Promise<string | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  const [payloadB64] = token.split(".");
  try {
    const payload = JSON.parse(atob(payloadB64)) as { id: string; exp: number };
    if (payload.exp < Date.now()) return null;
    return payload.id;
  } catch {
    return null;
  }
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
