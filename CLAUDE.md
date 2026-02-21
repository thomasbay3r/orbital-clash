# Orbital Clash

Top-down multiplayer space arena game with gravity mechanics, running in the browser.

## Tech Stack
- **Frontend**: TypeScript + HTML5 Canvas + Vite
- **Backend**: Cloudflare Workers + Durable Objects (game rooms) + D1 (database)
- **Hosting**: Cloudflare Pages (static) + Workers (API/WebSocket)

## Project Structure
```
src/
  client/           # Browser game client
    main.ts         # Entry point
    game/           # Game loop, input handling
    rendering/      # Canvas rendering
    network/        # WebSocket connection
  server/           # Cloudflare Workers backend
    index.ts        # Worker entry, routing
    game-room.ts    # Durable Object for real-time game rooms
    schema.sql      # D1 database schema
  shared/           # Shared between client and server
    types.ts        # All TypeScript types
    constants.ts    # Game constants (physics, arena, colors)
    physics.ts      # Physics helpers (vectors, gravity)
public/
  index.html        # HTML entry point
```

## Commands
- `npm run dev:client` - Start Vite dev server (client)
- `npm run dev:server` - Start wrangler dev (Workers)
- `npm run build` - Build client for production
- `npm run deploy` - Deploy Workers to Cloudflare
- `npm run typecheck` - Run TypeScript type checking

## Key Design Decisions
- Server-authoritative: physics run on server, client sends inputs only
- All graphics are programmatic (Canvas API) - no external image assets
- Gravity wells are the core mechanic differentiating gameplay
- 4 ship classes: Viper (fast), Titan (tank), Specter (disruptor), Nova (zone control)
- Game design document: `2026-02-21-orbital-clash-design.md`
