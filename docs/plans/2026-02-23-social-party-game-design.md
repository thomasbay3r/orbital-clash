# Orbital Clash — Social Party Game Design

**Datum**: 2026-02-23
**Vision**: Social Party-Game — schnelle Runden mit Freunden, Custom-Games, Spassmodi, Cosmetics

## Uebersicht

4 Phasen, aufeinander aufbauend:

| Phase | Fokus | Kern-Features |
|-------|-------|---------------|
| 1: Social | Fundament | Guest/Account, Freunde, Party, Chat, Quick-Play, Custom Games, Post-Game, Kill-Feed |
| 2: Varianz | Content | 4 neue Modi, Mutators, 3 neue Maps, Map-Events |
| 3: Progression | Retention | Cosmetics, Daily/Weekly Challenges, Achievements |
| 4: Polish | Juice | Screenshake, Slowmo, Killstreaks, Spectator, Emote-Wheel |

---

## Phase 1: Social-Infrastruktur

### Architektur

```
                    +----------------------+
                    |   Cloudflare Worker   |
                    |  API + Auth + Match   |
                    +----------+-----------+
                               |
              +----------------+----------------+
              v                v                 v
    +--------------+  +--------------+  +--------------+
    |  D1 Database |  |  GameRoom DO |  |   KV Store   |
    | - accounts   |  |  (besteht)   |  | - presence   |
    | - friends    |  |  + Party-    |  | - matchqueue |
    | - unlocks    |  |    Chat      |  +--------------+
    | - challenges |  +--------------+
    +--------------+
```

Free-Tier-optimiert:
- **Presence via KV-Heartbeat** (alle 30s) statt permanenter WebSocket
- Client pollt Freunde-Status alle 15s via REST
- **Party-Chat im bestehenden GameRoom DO** — kein separates PartyRoom DO
- **Matchmaker stateless im Worker** — Queue in KV, Worker bildet Matches

### Guest-System & Accounts

**Guest-Flow:**
1. Erster Besuch: automatische Guest-Session mit zufaelligem Namen ("Komet_7392")
2. UUID als Guest-Token im localStorage
3. Sofort spielbar — kein Login-Screen
4. Guest-Daten werden bei Registrierung zum Account migriert

**Registrierung:**
- E-Mail + Passwort + Unique Public Username
- PBKDF2 Password-Hashing (bestehendes System erweitern)
- Passwort-Vergessen via E-Mail-Reset-Token
- Minimale Felder, kein Overhead

**Gast-Einschraenkungen (Anreiz zur Registrierung):**
- Gaeste koennen spielen, Mods nutzen, alles Gameplay-relevante
- Gaeste koennen KEINE Freunde adden
- Gaeste koennen KEINE Cosmetics freischalten
- Gaeste erscheinen in Bestenlisten als "Gast"

### Freundesliste & Presence

**Freunde hinzufuegen:**
- Suche nach Username (exakter Match + Autocomplete)
- Freundschaftsanfrage senden/annehmen/ablehnen
- "Kuerzlich gespielt mit"-Liste (letzte 20 Mitspieler)

**Presence-Status (KV-Heartbeat):**
- `online-menu` — "Im Menue"
- `online-ingame:roomId` — "Im Spiel" + Beitreten-Button
- `offline` — kein Heartbeat seit >60s

**Einladen & Beitreten:**
- "Einladen" schickt Einladung via KV (`invite:targetId:fromId`)
- Eingeladener sieht Banner mit Annehmen-Button
- "Beitreten" joint direkt den GameRoom (Room-Code automatisch)
- Einladungen verfallen nach 60s

### Party-System

- Party erstellen: Leader laedt Freunde ein (max 4 Spieler)
- Leader waehlt Map/Mode, Members sehen Live-Preview
- Text-Chat in Party-Lobby (laeuft ueber GameRoom-WebSocket)
- In-Game: Chat-Nachrichten als Overlays ueber dem HUD
- Tastenkuerzel: T = Chat oeffnen, Enter = senden, Escape = schliessen
- Queue als Party: Leader startet, alle werden zusammen gematcht

### Quick-Play & Matchmaking

**Quick-Play-Flow:**
1. "Quick Play" im Hauptmenue
2. Worker prueft KV-Queue nach wartenden Spielern
3. Genug Spieler (4-8): GameRoom erstellen, alle reinschicken
4. Zu wenige: Wartescreen "Suche Mitspieler... (2/4)"
5. Nach 30s ohne Match: mit Bots auffuellen und starten

**Custom Games:**
- Alle bestehenden Einstellungen + neue:
  - Gravity-Multiplikator (0.5x, 1x, 2x, 3x)
  - HP-Multiplikator
  - Rundenanzahl (Best of 1/3/5)
  - Mutators an/aus (ab Phase 2)
  - Spectator erlauben ja/nein

### Post-Game-Screen

- Scoreboard: Rang, Name, Kills, Deaths
- Persoenliche Stats: Damage, Accuracy, Gravity-Well-Kills
- XP-Animation (Balken fuellt sich, Level-Up-Effekt)
- "Nochmal!"-Button (Majority-Vote startet neue Runde)
- "Freund +"-Button fuer Mitspieler aus der Runde

### Kill-Feed

- Oben rechts im HUD: "Spieler A -> Spieler B"
- Spezielle Kill-Texte:
  - Gravity-Well: "... hat ... ins Gravitationsfeld gesaugt"
  - Ricochet: "... hat ... mit Querschlaeger erwischt"
  - Nahkampf: "... hat ... im Vorbeifliegen erledigt"
- Multi-Kill-Announcements
- Eigene Kills farblich hervorgehoben

---

## Phase 2: Spielvarianz & Chaos

### Neue Spielmodi

**Asteroid Tag** (4-8 Spieler):
- Ein Spieler ist "It" (rot leuchtend)
- Treffe anderen -> der wird "It"
- "It" nimmt 5 DPS Schaden (tickender Timer)
- Gravity Wells beschleunigen den "It"-Spieler
- Letzter Ueberlebender gewinnt

**Survival Wave** (2-4 Spieler, Koop):
- Wellen von KI-Gegnern: Drohnen, Jaeger, Bomber, Boss (alle 5 Wellen)
- Geteilter Leben-Pool (10 Respawns gesamt)
- Zwischen Wellen: Pause, HP-Regen, Power-Up waehlen
- Highscore = hoechste Welle

**Hot Potato** (4-8 Spieler):
- Zufaelliger Spieler traegt "Bombe" (8s Timer)
- Treffe anderen -> Bombe wechselt
- Gravity Wells beschleunigen Timer
- Bombe explodiert -> Traeger stirbt, alle anderen +1 Punkt

**Capture the Core** (2v2 oder 3v3):
- Jedes Team hat "Core" nahe Gravity Well
- Core aufnehmen = beruehren, tragen = langsamer + groesser
- Treffer auf Traeger -> Core faellt (5s Aufhebe-Sperre)
- Erstes Team mit 3 Captures gewinnt

### Mutators

Mix-Ins fuer jeden Modus (Custom Games waehlbar, Quick-Play zufaellig):

| Mutator | Effekt |
|---------|--------|
| Hypergravity | Gravity Wells 3x staerker |
| Zero-G | Keine Gravity Wells |
| Big Head | Hitboxen 2x groesser |
| Ricochet Arena | Alle Projektile bouncen |
| Glass Cannon | 1 HP, 5x Damage |
| Mystery Loadout | Zufaellige Mods, alle 30s neu |
| Fog of War | Sichtweite 300px |
| Speed Demon | Alle Schiffe 2x schneller |
| Friendly Fire | Eigene Projektile treffen einen selbst |

### Neue Maps

**Black Hole** (1800x1400):
- Massives zentrales Gravity Well (Staerke 3.0, Radius 300)
- Ring von 6 kleinen Wells als "Orbits"
- Power-Ups nahe am Zentrum (Risk/Reward)

**Wormhole Station** (2000x1500):
- 2 Portalpaare (Schiffe + Projektile teleportieren)
- Moderate Gravity Wells an den Ecken
- Portale wechseln alle 30s Position

**Debris Field** (2200x1600):
- 20+ zerstoerbare Asteroiden (3 Treffer -> Fragmente mit Schaden)
- Neuer Asteroid alle 15s an zufaelliger Position
- 1 grosser Gravity Well in der Mitte

### Map-Events (alle 30-60s)

| Event | Effekt | Dauer |
|-------|--------|-------|
| Asteroiden-Regen | Umgebungsschaden bei Treffer | 10s |
| Gravity Surge | Alle Wells doppelte Staerke | 15s |
| Power Core | +50% Damage Power-Up in Mitte | 20s |
| Shield Bubble | Schutzfeld-Zone spawnt | 15s |
| EMP Storm | Alle Specials auf Cooldown | 10s |

---

## Phase 3: Progression & Belohnungen

### Cosmetics

Rein visuell, kein Gameplay-Vorteil.

**Schiff-Skins:**
- 6-8 Skins pro Schiff (Farbschemata, Muster, animierte Texturen)
- Technisch: Skin = Farbpalette + optionale Partikel-Config (Canvas-gerendert)

**Trails:**
- Spur hinter dem Schiff: Flamme, Regenbogen, Rauch, Sterne, Pixel, Blitz
- Trail = Partikel-Config (Farbe, Form, Lifetime, Spread)

**Kill-Effekte:**
- Pixel-Aufloesung, Mini-Schwarzes-Loch, Konfetti, Eissherben, Elektro-Burst
- Kill-Effekt = Partikel-Config + optionaler Sound

**Emotes:**
- Icons + Text ueber dem Schiff (2s)
- "GG", "Wow!", Schiff-spezifische Emotes
- Emote = Icon-ID + Text + optionaler Sound

**Titel & Badges:**
- Titel unter dem Spielernamen
- Badges: kleine Icons neben dem Namen
- Freigeschaltet durch Achievements

### Challenge-System

**Daily Challenges (3/Tag, Reset 00:00 UTC):**
- Leicht: "Spiele 3 Runden" -> 50 XP
- Mittel: "Erziele 10 Kills" -> 100 XP
- Schwer: "Gewinne ohne zu sterben" -> 200 XP + Cosmetic-Token

**Weekly Challenges (3/Woche):**
- "Spiele jeden Modus 1x" -> 500 XP
- "5 Gravity-Well-Kills" -> 500 XP + Rare Token
- "10 Runden gewonnen" -> 1000 XP + Titel

**Tracking:** D1-Table `challenges` (player_id, challenge_id, progress, completed).
Worker generiert via Cron Trigger neue Challenges aus Pool.

### Achievements

Einmalige Meilensteine:

| Achievement | Bedingung | Belohnung |
|-------------|-----------|-----------|
| Erster Kontakt | Erstes Spiel | Titel: "Rekrut" |
| Gravity Surfer | 10 Gravity-Well-Kills | Trail: Gravitationswelle |
| Viper-Meister | 100 Kills mit Viper | Skin: Neon Viper |
| Party-Tier | 50 Spiele mit Freunden | Badge: Party-Krone |
| Unaufhaltsam | 5 Kills ohne Tod | Kill-Effekt: Flammen |
| Kartograph | Jede Map gespielt | Titel: "Weltraumtourist" |
| Mod-Sammler | Jede Mod-Kombo probiert | Badge: Werkzeugkasten |
| Survival-Held | Welle 20 in Survival | Skin: Kampfnarben |
| Hot-Potato-Pro | 10x Hot Potato gewonnen | Emote: Bombe jonglieren |
| Veteran | Level 25 | Titel: "Veteran" + Animated Badge |

---

## Phase 4: Spielgefuehl & Polish

### Juice & Game-Feel

**Screen-Shake:**
- Explosionen in der Naehe: kurzer Shake (3-5 Frames)
- Eigener Treffer: minimaler Shake
- Abschaltbar in Settings
- Technisch: Kamera-Offset mit schnellem Decay

**Slow-Motion bei Last Kill:**
- Letzter Kill der Runde: 0.3s Slowmo + Zoom
- Nur clientseitig (Server-Simulation irrelevant da Runde vorbei)

**Kombo-System & Killstreaks:**
- 2 Kills in 3s = "Doppelkill!" (Text + Sound)
- 3 Kills in 5s = "Triplekill!"
- 3 Kills ohne Tod = "Killstreak!" (leuchtender Effekt)
- 5 Kills ohne Tod = "Unaufhaltsam!" (intensiverer Effekt)
- Counter im HUD

**Kill-Feed Verbesserungen:**
- Kill-Art-spezifische Texte
- Multi-Kill-Announcements
- Eigene Kills farblich hervorgehoben

### Spectator-Modus

- Freunde koennen laufenden Spielen zuschauen
- Freie Kamera (WASD) oder Spieler-Follow (Klick)
- Tab-Overlay: Scoreboard
- Kein Gameplay-Input, nur Kamera + Chat
- Verbindet sich als passiver Client zum GameRoom DO

### Emote-Wheel

- Taste V -> Radial-Menue mit 8 Emotes
- 4 Standard + 4 benutzerdefiniert
- Anzeige: Icon + Text ueber Schiff (2s)
- Cooldown: 3s (Spam-Schutz)
- Standard: "GG", "Wow!", "Nochmal!", "Sorry!"

---

## Explizit ausgeschlossen

- Season/Battle-Pass-System
- Replay-System
- Monetarisierung (kein Premium, alles kostenlos)
- OAuth (nur Email+Passwort)
- Globaler Chat (nur Party/Game-Chat)
- Clan/Guild-System
- Map-Editor
- Custom Ship Builder
