# AGENTS.md – Arbeitsregeln fuer dieses Repository

Dieses Dokument richtet sich an Menschen und KI-Agenten, die am Projekt arbeiten.
Es beschreibt den **bevorzugten Workflow**, damit Aenderungen konsistent und reviewbar bleiben.

## Kurzbeschreibung des Projekts

Orbital Clash ist ein Top-Down-Multiplayer-Weltraumspiel mit Schwerkraft-Mechanik im Browser.

## 1) Projektkontext (kurz)

- Stack: **TypeScript + HTML5 Canvas + Vite** (Client), **Cloudflare Workers + Durable Objects + D1 + KV** (Server).
- Persistenz: **Cloudflare D1** (Accounts, Progression, Friends, Matches), **KV** (Presence, Invites, Matchmaking), **Durable Objects** (Game Rooms).
- Ziel: Echtzeit-Multiplayer-Spiel mit Server-autoritativem Gameplay, Social-Features und geteilter Simulation.

## 2) Grundprinzipien

1. **Kleine, klare Aenderungen** statt grosser Umbauten.
2. **Ursache-orientiert fixen** (nicht nur Symptome patchen).
3. **Bestehende Struktur respektieren**:
   - Shared Logic: `src/shared/` (Simulation, Physics, Constants, Types, Maps)
   - Client: `src/client/` (Game, Rendering, Audio, Network/API, Input)
   - Server: `src/server/` (Worker, Game Room, Schema, Email, Guest Names)
4. **Geteilte Simulation**: `game-simulation.ts` wird von Client UND Server genutzt — Aenderungen hier betreffen beides.

## 3) Konkreter Arbeitsablauf pro Aenderung

1. Relevante Dateien lesen (inkl. `README.md`, Tests).
2. Aenderung minimal implementieren.
3. **Bei jeder Aenderung `README.md` auf Aktualitaet pruefen und bei Bedarf aktualisieren.**
4. Immer lokal pruefen:
   - `npx tsc --noEmit`
   - `npm test`
   - `npm run test:e2e`
5. Commit mit aussagekraeftiger Message (imperativ, praezise).

## 4) Code-Konventionen

- **TypeScript** durchgehend — `tsc --noEmit` muss bestehen.
- Shared-Module in `src/shared/` importieren (relative Imports).
- Alle Grafiken/Audio sind programmatisch (Canvas API / Web Audio API) — keine externen Assets.
- UI-Sprache ist Deutsch.
- Kommentare nur dort, wo sie Mehrwert liefern (Warum > Was).

## 5) Tests und Qualitaet — PFLICHT bei jeder Aenderung

**Jede Aenderung an `src/shared/**` MUSS von Unit-Tests begleitet werden.**
Ein Commit ohne passende Tests ist gleichwertig mit einem fehlschlagenden Test.

- Neue Simulation/Physics → neuer Test oder bestehenden Test erweitern.
- Bugfixes → erst reproduzierbaren Test, dann Fix.
- **Framework**: Vitest.
- **Tests**: `src/shared/*.test.ts` (co-located mit Source).
- **E2E**: `e2e/*.spec.ts` (Playwright, Port 4173).
- `npx tsc --noEmit`, `npm test` UND `npm run test:e2e` muessen VOR jedem Commit gruen sein.

### Plattformabhaengige Module (eingeschraenkt testbar)

Folgende Module sind stark an Browser-/Runtime-APIs gebunden und werden primaer ueber E2E-Tests abgedeckt:
- `src/client/rendering/renderer.ts` — Canvas API
- `src/client/audio/audio-manager.ts` — Web Audio API
- `src/client/game/input.ts` — Browser Event API
- `src/client/network/connection.ts` — WebSocket API
- `src/client/network/api.ts` — REST API Client (Auth, Friends, Presence, Matchmaking)
- `src/server/index.ts` — Cloudflare Worker Runtime (API Routes, Auth, Friends, Matchmaking)
- `src/server/game-room.ts` — Durable Objects Runtime (Chat, Kill Feed, Rematch)

Testbare reine Logik:
- `src/shared/physics.ts` — Vektormathe, Gravitation, Kollision
- `src/shared/game-simulation.ts` — Tick-Simulation, Damage, Respawn, Portale, Modi, Mutatoren, Map-Events
- `src/shared/constants.ts` — Config-Validierung (Mods, 8 Modi, 6 Maps, 9 Mutatoren)
- `src/shared/maps.ts` — 6 Map-Definitionen (inkl. Portale und zerstoerbare Asteroiden)
- `src/client/game/bot.ts` — KI-Logik (teilweise testbar)

## 6) Scope fuer groessere Aenderungen

Bei Eingriffen in Architektur, Netzwerk-Protokoll oder Datenmodell:
- Zuerst eine kurze Skizze in PR-Beschreibung.
- Risiken/Kompatibilitaet nennen (insb. D1-Schema, WebSocket-Protokoll).
- Migration/Backward-Compatibility explizit beschreiben.

## 7) PR-/Review-Checkliste

Eine gute Aenderung enthaelt:
- klare Problem-/Zielbeschreibung,
- Uebersicht der geaenderten Dateien,
- `README.md` ist konsistent zum aktuellen Stand,
- Testnachweise (`npx tsc --noEmit`, `npm test`, `npm run test:e2e`),
- Hinweis auf UI-Auswirkungen (ggf. Screenshot),
- offene Punkte/Folgearbeiten.

## 8) Deployment

- `npm run deploy` deployed zu Cloudflare Workers.
- Auto-Deploy Hook: laeuft automatisch nach jedem `git push` (via `.claude/hooks/deploy-after-push.js`).
- Immer deployen nach Aenderungen an Client oder Server.

## 9) Claude Code Automations

### MCP Server: context7 (Live-Dokumentation)

Konfiguriert in `.mcp.json` (Repo-Root). Stellt beim Session-Start Live-Dokumentation bereit.

### Hooks (`.claude/settings.json`)

| Hook | Typ | Wirkung |
|------|-----|---------|
| Deploy after push | PostToolUse (Bash) | Auto-Deploy zu Cloudflare nach `git push` |
| JS Syntax-Check | PostToolUse (Edit/Write) | Fuehrt `node --check` nach JS-Dateiaenderungen aus |
| .env-/Lock-Schutz | PreToolUse (Edit/Write) | Blockiert Aenderungen an `.env*` und `package-lock.json` |
| Commit-Warnung | PreToolUse (Bash) | Warnt bei `git commit` wenn: src/ ohne Tests, kein .md im Commit |

### Subagents (`.claude/agents/`)

| Agent | Datei | Einsatz |
|-------|-------|---------|
| Test Writer | `test-writer.md` | Bei neuen/geaenderten Modulen in `src/shared/` |
| Security Reviewer | `security-reviewer.md` | Bei Aenderungen an Worker, Auth, D1-Queries, WebSocket |

Subagents werden nicht automatisch ausgefuehrt, sondern bei Bedarf via Task-Tool aufgerufen.

### CI (`.github/workflows/tests.yml`)

Laeuft automatisch bei Push auf `main` und bei PRs:
1. **Typecheck** (`npx tsc --noEmit`) — muss bestehen
2. **Unit tests** (`npm test`) — muessen bestehen
3. **E2E tests** (`npm run test:e2e`) — muessen bestehen

## Development Workflow

Dieses Projekt nutzt den folgenden automatisierten Workflow. Schritte NICHT ueberspringen.

### Fuer neue Features / Aenderungen:
1. **Brainstorming** — beschreibe was gebaut werden soll. Der `brainstorming` Skill triggert automatisch.
2. **Planning** — nach Design-Approval erstellt `writing-plans` den Implementierungsplan.
3. **Implementation** — `subagent-driven-development` oder `executing-plans` arbeitet den Plan ab. Automatisch aktiv: `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `verification-before-completion`.
4. **QA Audit** — vor PR laeuft `qa-audit` automatisch.
5. **Branch Completion** — `finishing-a-development-branch` praesentiert Merge/PR-Optionen.

### Fuer kleine Bugfixes:
1. `systematic-debugging` → Root Cause finden
2. `test-driven-development` → Failing Test, dann Fix
3. `qa-audit` → pruefen ob nichts anderes kaputt ging
4. Commit

### Regeln:
- NIEMALS `qa-audit` vor PR ueberspringen.
- NIEMALS Arbeit als fertig bezeichnen ohne Beweis.
- JEDER neue Logic-Code MUSS Tests haben.

Workflow-Guide: `docs/workflow-guide.html`

## 10) Dokumentationspflicht — PFLICHT bei jedem Commit

**Vor JEDEM Commit pruefen und bei Bedarf aktualisieren. Nicht als Batch am Ende, sondern pro Commit.**

| Datei | Aktualisieren wenn ... |
|-------|----------------------|
| `README.md` | sich Projektstruktur, Features, Setup oder Nutzung aendern |
| `CLAUDE.md` | sich Workflows, Konventionen oder Regeln aendern |
| `AGENTS.md` | sich Workflows, Konventionen oder Regeln aendern (synchron mit CLAUDE.md) |

Inkonsistente Dokumentation = Qualitaetsmangel gleichwertig mit fehlschlagendem Test.

## 11) Nicht-Ziele / rote Linien

- Keine Vermischung grosser Refactorings mit Feature-Aenderungen in einem PR.
- Keine breaking Aenderung am Netzwerk-Protokoll ohne Migrationsstrategie.
- Keine breaking Aenderung am D1-Schema ohne SQL-Migration.
