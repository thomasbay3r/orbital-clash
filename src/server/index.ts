import { GameRoom } from "./game-room";

export { GameRoom };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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

    // API routes
    if (url.pathname.startsWith("/api/")) {
      return handleApi(url, request, env);
    }

    // Static assets are served by the assets binding in wrangler.jsonc
    return new Response("Not found", { status: 404 });
  },
};

async function handleApi(url: URL, request: Request, env: Env): Promise<Response> {
  const path = url.pathname.replace("/api", "");

  if (path === "/health") {
    return Response.json({ status: "ok" });
  }

  if (path === "/rooms/create" && request.method === "POST") {
    const roomId = crypto.randomUUID().slice(0, 8);
    return Response.json({ roomId });
  }

  return new Response("Not found", { status: 404 });
}
